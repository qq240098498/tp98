const crypto = require('crypto');
const {
  load,
  save,
  LEVELS,
  STATUSES,
  FILE_TYPES,
  CODE_PATTERN,
  MAX_CODE_LENGTH,
  MAX_RULE_NAME_LENGTH,
  MAX_PATTERN_LENGTH,
  MAX_NOTE_LENGTH,
} = require('./store');
const { ApiError, pickText } = require('./errors');

const EXPORT_KIND = 'tp98-rules';
const EXPORT_VERSION = 1;
// 一次导入的条数设个上限，贴错一大段内容时不至于把清单撑爆
const MAX_IMPORT_RULES = 500;

// 导出只带走业务字段，编号与时间是各个环境自己的
function toExportEntry(rule) {
  return {
    code: rule.code,
    name: rule.name,
    level: rule.level,
    status: rule.status,
    fileType: rule.fileType,
    pattern: rule.pattern,
    note: rule.note,
  };
}

function sortByCode(list) {
  return list.slice().sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return 0;
  });
}

// 导出：给了具体编号就按编号挑，否则按级别、状态、适用文件类型与关键字筛一遍
function exportRules(options) {
  const input = options && typeof options === 'object' ? options : {};
  const data = load();
  let list = data.rules;

  if (Array.isArray(input.ids)) {
    const wanted = new Set(input.ids.filter((id) => typeof id === 'string'));
    list = list.filter((item) => wanted.has(item.id));
  } else {
    const level = pickText(input.level);
    const status = pickText(input.status);
    const fileType = pickText(input.fileType);
    const keyword = pickText(input.keyword).toLowerCase();
    if (level) list = list.filter((item) => item.level === level);
    if (status) list = list.filter((item) => item.status === status);
    if (fileType) list = list.filter((item) => item.fileType === fileType || item.fileType === '全部');
    if (keyword) {
      list = list.filter((item) => item.code.toLowerCase().includes(keyword)
        || item.name.toLowerCase().includes(keyword)
        || item.pattern.toLowerCase().includes(keyword));
    }
  }

  const rules = sortByCode(list).map(toExportEntry);
  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    count: rules.length,
    rules,
  };
}

// 把导入内容解析成条目清单：整份导出文件与直接的规则数组都认
function parseImportContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new ApiError(400, 'IMPORT_EMPTY', '请先选择文件或粘贴要导入的内容', 'importContent');
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new ApiError(400, 'IMPORT_JSON_INVALID', '内容不是合法的 JSON，请检查后再试', 'importContent');
  }
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray(parsed.rules) ? parsed.rules : null);
  if (!list) {
    throw new ApiError(400, 'IMPORT_SHAPE_INVALID', '内容里找不到规则清单，要写成导出文件那样的 { "rules": [...] } 或直接的规则数组', 'importContent');
  }
  if (list.length === 0) {
    throw new ApiError(400, 'IMPORT_LIST_EMPTY', '规则清单是空的，没有可导入的内容', 'importContent');
  }
  if (list.length > MAX_IMPORT_RULES) {
    throw new ApiError(400, 'IMPORT_TOO_MANY', `一次最多导入 ${MAX_IMPORT_RULES} 条规则`, 'importContent');
  }
  return list;
}

// 逐条检查：把发现的问题都记下来，不像单条保存那样遇到第一个就停；
// 级别、状态、适用文件类型留空的按单条保存的口径落到默认值，有值但不认识才算不成立
function checkEntry(entry) {
  const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
  if (!source) {
    return { problems: ['这一条不是规则对象'], cleaned: {} };
  }
  const problems = [];

  const code = pickText(source.code);
  if (!code) {
    problems.push('缺少规则编码');
  } else if (code.length > MAX_CODE_LENGTH) {
    problems.push(`规则编码超过 ${MAX_CODE_LENGTH} 个字符`);
  } else if (!CODE_PATTERN.test(code)) {
    problems.push('编码写法不合规（要是大写字母加短横线加数字，例如 CODE-001）');
  }

  const name = pickText(source.name);
  if (!name) {
    problems.push('缺少规则名称');
  } else if (name.length > MAX_RULE_NAME_LENGTH) {
    problems.push(`规则名称超过 ${MAX_RULE_NAME_LENGTH} 个字符`);
  }

  const pattern = typeof source.pattern === 'string' ? source.pattern : '';
  if (!pattern.trim()) {
    problems.push('匹配写法为空');
  } else if (pattern.length > MAX_PATTERN_LENGTH) {
    problems.push(`匹配写法超过 ${MAX_PATTERN_LENGTH} 个字符`);
  }

  const level = pickText(source.level);
  if (level && !LEVELS.includes(level)) {
    problems.push(`级别「${level}」不认识（只能是 ${LEVELS.join('、')}）`);
  }

  const status = pickText(source.status);
  if (status && !STATUSES.includes(status)) {
    problems.push(`状态「${status}」不认识（只能是 ${STATUSES.join('、')}）`);
  }

  const fileType = pickText(source.fileType);
  if (fileType && !FILE_TYPES.includes(fileType)) {
    problems.push(`适用文件类型「${fileType}」不在允许范围（只能是 ${FILE_TYPES.join('、')}）`);
  }

  const note = typeof source.note === 'string' ? source.note.trim() : '';
  if (note.length > MAX_NOTE_LENGTH) {
    problems.push(`说明超过 ${MAX_NOTE_LENGTH} 个字符`);
  }

  return {
    problems,
    cleaned: {
      code,
      name,
      pattern,
      level: level || LEVELS[0],
      status: status || STATUSES[0],
      fileType: fileType || FILE_TYPES[0],
      note,
    },
  };
}

// 预演：逐条检查，再跟现有清单对一遍编码，分出会新增、撞上已有与不成立三组；
// 同一份内容里同编码的条目，第一条照常参与判断，后面的记为不成立
function previewImport(content, data) {
  const entries = parseImportContent(content);
  const store = data || load();
  const existingByCode = new Map(store.rules.map((item) => [item.code.toLowerCase(), item]));

  const add = [];
  const conflict = [];
  const invalid = [];
  const seenCodes = new Set();

  entries.forEach((entry, index) => {
    const { problems, cleaned } = checkEntry(entry);
    const codeKey = cleaned.code ? cleaned.code.toLowerCase() : '';

    if (problems.length === 0 && seenCodes.has(codeKey)) {
      problems.push(`同一份内容里编码 ${cleaned.code} 出现了不止一次`);
    }
    if (problems.length > 0) {
      invalid.push({
        index: index + 1,
        code: cleaned.code || '',
        name: cleaned.name || '',
        problems,
      });
      return;
    }

    seenCodes.add(codeKey);
    const hit = existingByCode.get(codeKey);
    if (hit) {
      conflict.push({
        index: index + 1,
        code: cleaned.code,
        name: cleaned.name,
        existingId: hit.id,
        existingName: hit.name,
      });
      return;
    }

    add.push({ index: index + 1, ...cleaned });
  });

  return { total: entries.length, add, conflict, invalid };
}

// 确认导入：基于同一份数据重新预演一遍，把"会新增"的那组真正写进清单，
// 撞上已有的与不成立的一律不进库
function importRules(content) {
  const data = load();
  const preview = previewImport(content, data);
  if (preview.add.length === 0) {
    return { ...preview, added: 0, rules: [] };
  }
  const now = new Date().toISOString();
  const created = preview.add.map((item) => ({
    id: crypto.randomUUID(),
    code: item.code,
    name: item.name,
    level: item.level,
    status: item.status,
    fileType: item.fileType,
    pattern: item.pattern,
    note: item.note,
    createdAt: now,
    updatedAt: now,
  }));
  data.rules.push(...created);
  save(data);
  return { ...preview, added: created.length, rules: created };
}

module.exports = {
  exportRules,
  previewImport,
  importRules,
  EXPORT_KIND,
  EXPORT_VERSION,
};
