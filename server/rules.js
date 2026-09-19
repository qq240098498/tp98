const crypto = require('crypto');
const { load, save, LEVELS, STATUSES, FILE_TYPES, MAX_CODE_LENGTH, MAX_RULE_NAME_LENGTH, MAX_PATTERN_LENGTH, MAX_NOTE_LENGTH } = require('./store');
const { ApiError, pickText } = require('./errors');

// 规则编码固定成大写字母加分段的数字，方便在命中清单里引用
const CODE_PATTERN = /^[A-Z]{2,6}-\d{2,4}$/;

function validateCode(value, data, selfId) {
  const code = pickText(value);
  if (!code) throw new ApiError(400, 'CODE_REQUIRED', '请填写规则编码', 'code');
  if (code.length > MAX_CODE_LENGTH) {
    throw new ApiError(400, 'CODE_TOO_LONG', `规则编码不能超过 ${MAX_CODE_LENGTH} 个字符`, 'code');
  }
  if (!CODE_PATTERN.test(code)) {
    throw new ApiError(400, 'CODE_INVALID', '规则编码要写成大写字母加短横线加数字，例如 CODE-001', 'code');
  }
  const hit = data.rules.find((item) => item.id !== selfId && item.code.toLowerCase() === code.toLowerCase());
  if (hit) throw new ApiError(409, 'CODE_DUPLICATED', `编码 ${hit.code} 已经被 ${hit.name} 用了`, 'code');
  return code;
}

function validateName(value) {
  const name = pickText(value);
  if (!name) throw new ApiError(400, 'NAME_REQUIRED', '请填写规则名称', 'name');
  if (name.length > MAX_RULE_NAME_LENGTH) {
    throw new ApiError(400, 'NAME_TOO_LONG', `规则名称不能超过 ${MAX_RULE_NAME_LENGTH} 个字符`, 'name');
  }
  return name;
}

function validatePattern(value) {
  const pattern = typeof value === 'string' ? value : '';
  if (!pattern.trim()) throw new ApiError(400, 'PATTERN_REQUIRED', '请填写要匹配的写法', 'pattern');
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new ApiError(400, 'PATTERN_TOO_LONG', `匹配写法不能超过 ${MAX_PATTERN_LENGTH} 个字符`, 'pattern');
  }
  return pattern;
}

function validateLevel(value) {
  const level = pickText(value);
  if (!level) return LEVELS[0];
  if (!LEVELS.includes(level)) {
    throw new ApiError(400, 'LEVEL_INVALID', `级别只能是 ${LEVELS.join('、')} 其中之一`, 'level');
  }
  return level;
}

function validateStatus(value) {
  const status = pickText(value);
  if (!status) return STATUSES[0];
  if (!STATUSES.includes(status)) {
    throw new ApiError(400, 'STATUS_INVALID', `状态只能是 ${STATUSES.join('、')} 其中之一`, 'status');
  }
  return status;
}

function validateFileType(value) {
  const fileType = pickText(value);
  if (!fileType) return FILE_TYPES[0];
  if (!FILE_TYPES.includes(fileType)) {
    throw new ApiError(400, 'FILE_TYPE_INVALID', `适用文件类型只能是 ${FILE_TYPES.join('、')} 其中之一`, 'fileType');
  }
  return fileType;
}

function validateNote(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ApiError(400, 'NOTE_INVALID', '说明需要是文本', 'note');
  if (value.length > MAX_NOTE_LENGTH) {
    throw new ApiError(400, 'NOTE_TOO_LONG', `说明不能超过 ${MAX_NOTE_LENGTH} 个字符`, 'note');
  }
  return value.trim();
}

function sortRules(list) {
  return list.slice().sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

// 规则清单：按级别、状态、适用文件类型筛选，再按编码、名称或匹配写法搜索
function listRules(options) {
  const input = options && typeof options === 'object' ? options : {};
  const level = pickText(input.level);
  const status = pickText(input.status);
  const fileType = pickText(input.fileType);
  const keyword = pickText(input.keyword).toLowerCase();
  const data = load();

  let list = data.rules;
  if (level) list = list.filter((item) => item.level === level);
  if (status) list = list.filter((item) => item.status === status);
  if (fileType) list = list.filter((item) => item.fileType === fileType || item.fileType === '全部');
  if (keyword) {
    list = list.filter((item) => item.code.toLowerCase().includes(keyword)
      || item.name.toLowerCase().includes(keyword)
      || item.pattern.toLowerCase().includes(keyword));
  }

  const usedFileTypes = Array.from(new Set(data.rules.map((item) => item.fileType)));
  return {
    rules: sortRules(list),
    levels: LEVELS.slice(),
    statuses: STATUSES.slice(),
    fileTypes: FILE_TYPES.slice(),
    usedFileTypes,
  };
}

function getRule(id) {
  const data = load();
  const found = data.rules.find((item) => item.id === id);
  if (!found) throw new ApiError(404, 'RULE_NOT_FOUND', '这条规则不存在或已被删除', '');
  return found;
}

function createRule(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const data = load();
  const now = new Date().toISOString();
  const created = {
    id: crypto.randomUUID(),
    code: validateCode(input.code, data, ''),
    name: validateName(input.name),
    level: validateLevel(input.level),
    status: validateStatus(input.status),
    fileType: validateFileType(input.fileType),
    pattern: validatePattern(input.pattern),
    note: validateNote(input.note),
    createdAt: now,
    updatedAt: now,
  };
  data.rules.push(created);
  save(data);
  return created;
}

function updateRule(id, payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const data = load();
  const found = data.rules.find((item) => item.id === id);
  if (!found) throw new ApiError(404, 'RULE_NOT_FOUND', '这条规则不存在或已被删除', '');

  found.code = input.code === undefined ? found.code : validateCode(input.code, data, found.id);
  found.name = input.name === undefined ? found.name : validateName(input.name);
  found.level = input.level === undefined ? found.level : validateLevel(input.level);
  found.status = input.status === undefined ? found.status : validateStatus(input.status);
  found.fileType = input.fileType === undefined ? found.fileType : validateFileType(input.fileType);
  found.pattern = input.pattern === undefined ? found.pattern : validatePattern(input.pattern);
  found.note = input.note === undefined ? found.note : validateNote(input.note);
  found.updatedAt = new Date().toISOString();
  save(data);
  return found;
}

function deleteRule(id) {
  const data = load();
  const index = data.rules.findIndex((item) => item.id === id);
  if (index === -1) throw new ApiError(404, 'RULE_NOT_FOUND', '这条规则不存在或已被删除', '');
  const [removed] = data.rules.splice(index, 1);
  save(data);
  return { id: removed.id, code: removed.code, name: removed.name };
}

// 团队之间共享规则用的导出格式：只带规则本身的字段，不带各环境自己的编号与时间
const EXPORT_FORMAT = 'check-rules';
const EXPORT_VERSION = 1;

function pickExportRule(rule) {
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

// 按页面勾好的编号导出；不传编号就把清单里的规则全部导出
function exportRules(ids) {
  const data = load();
  let list = sortRules(data.rules);
  if (Array.isArray(ids) && ids.length) {
    const wanted = new Set(ids.filter((id) => typeof id === 'string'));
    list = list.filter((item) => wanted.has(item.id));
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    count: list.length,
    rules: list.map(pickExportRule),
  };
}

// 导入内容认两种形状：{"rules": [...]} 或者直接一个规则数组
function readImportRules(content) {
  if (Array.isArray(content)) return content;
  if (content && typeof content === 'object' && Array.isArray(content.rules)) return content.rules;
  throw new ApiError(400, 'IMPORT_SHAPE_INVALID', '导入内容需要是 {"rules": [...]} 这样的 JSON，或者直接给一个规则数组', '');
}

// 逐条检查一条外来规则本身成不成立，问题全收集起来，不抛异常
function inspectImportEntry(source) {
  const reasons = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { reasons: ['这一条不是规则对象，可能缺了花括号'], fields: null };
  }

  const code = pickText(source.code);
  const name = pickText(source.name);
  const level = pickText(source.level);
  const status = pickText(source.status);
  const fileType = pickText(source.fileType);
  const pattern = typeof source.pattern === 'string' ? source.pattern : '';
  const note = source.note === undefined || source.note === null ? '' : source.note;

  if (!code) reasons.push('编码为空：请填写规则编码');
  else if (code.length > MAX_CODE_LENGTH) reasons.push(`编码写法不合规：不能超过 ${MAX_CODE_LENGTH} 个字符`);
  else if (!CODE_PATTERN.test(code)) reasons.push('编码写法不合规：要写成大写字母加短横线加数字，例如 CODE-001');

  if (!name) reasons.push('规则名称为空：请填写规则名称');
  else if (name.length > MAX_RULE_NAME_LENGTH) reasons.push(`规则名称不能超过 ${MAX_RULE_NAME_LENGTH} 个字符`);

  if (!pattern.trim()) reasons.push('匹配写法为空：请填写要匹配的写法');
  else if (pattern.length > MAX_PATTERN_LENGTH) reasons.push(`匹配写法不能超过 ${MAX_PATTERN_LENGTH} 个字符`);

  if (!level) reasons.push(`级别取值不认识：只能是 ${LEVELS.join('、')} 其中之一`);
  else if (!LEVELS.includes(level)) reasons.push(`级别取值不认识：只能是 ${LEVELS.join('、')} 其中之一`);

  if (!status) reasons.push(`状态取值不认识：只能是 ${STATUSES.join('、')} 其中之一`);
  else if (!STATUSES.includes(status)) reasons.push(`状态取值不认识：只能是 ${STATUSES.join('、')} 其中之一`);

  if (!fileType) reasons.push(`适用文件类型不在允许范围内：只能是 ${FILE_TYPES.join('、')} 其中之一`);
  else if (!FILE_TYPES.includes(fileType)) reasons.push(`适用文件类型不在允许范围内：只能是 ${FILE_TYPES.join('、')} 其中之一`);

  if (typeof note !== 'string') reasons.push('说明需要是文本');
  else if (note.length > MAX_NOTE_LENGTH) reasons.push(`说明不能超过 ${MAX_NOTE_LENGTH} 个字符`);

  return {
    reasons,
    fields: { code, name, level, status, fileType, pattern, note: typeof note === 'string' ? note.trim() : '' },
  };
}

// 把外来内容分成新增、同编码冲突、本身不成立三类；预演与确认共用这一份判断
function classifyImport(content) {
  const rawList = readImportRules(content);
  const data = load();
  const seenCodes = new Map();
  const added = [];
  const conflicts = [];
  const invalid = [];

  rawList.forEach((source, index) => {
    const { reasons, fields } = inspectImportEntry(source);
    const codeText = fields ? fields.code : (source && typeof source === 'object' && !Array.isArray(source) && typeof source.code === 'string' ? source.code.trim() : '');

    if (fields && fields.code) {
      const lower = fields.code.toLowerCase();
      if (seenCodes.has(lower)) {
        reasons.push(`同一份内容里编码 ${fields.code} 出现了多次（第一次出现在第 ${seenCodes.get(lower) + 1} 条）`);
      } else {
        seenCodes.set(lower, index);
      }
    }

    if (reasons.length) {
      invalid.push({
        index: index + 1,
        code: codeText,
        name: fields ? fields.name : '',
        reasons,
      });
      return;
    }

    const existing = data.rules.find((item) => item.code.toLowerCase() === fields.code.toLowerCase());
    const entry = { ...fields };
    if (existing) {
      conflicts.push({
        ...entry,
        existing: { id: existing.id, code: existing.code, name: existing.name, level: existing.level, status: existing.status },
      });
    } else {
      added.push(entry);
    }
  });

  return {
    total: rawList.length,
    added,
    conflicts,
    invalid,
    addedCount: added.length,
    conflictCount: conflicts.length,
    invalidCount: invalid.length,
  };
}

function previewImport(content) {
  return classifyImport(content);
}

// 确认导入：冲突可以跳过或覆盖，不成立的条目一律不动清单
function commitImport(content, conflictMode) {
  const mode = conflictMode === 'overwrite' ? 'overwrite' : 'skip';
  const result = classifyImport(content);
  const data = load();
  const now = new Date().toISOString();
  const added = [];
  const overwritten = [];
  const skipped = [];

  result.added.forEach((entry) => {
    const created = { id: crypto.randomUUID(), ...entry, createdAt: now, updatedAt: now };
    data.rules.push(created);
    added.push(pickExportRule(created));
  });

  result.conflicts.forEach((entry) => {
    const found = data.rules.find((item) => item.code.toLowerCase() === entry.code.toLowerCase());
    if (!found) return;
    if (mode === 'overwrite') {
      found.code = entry.code;
      found.name = entry.name;
      found.level = entry.level;
      found.status = entry.status;
      found.fileType = entry.fileType;
      found.pattern = entry.pattern;
      found.note = entry.note;
      found.updatedAt = now;
      overwritten.push(pickExportRule(found));
    } else {
      skipped.push(pickExportRule(found));
    }
  });

  save(data);
  return {
    mode,
    total: result.total,
    addedCount: added.length,
    overwrittenCount: overwritten.length,
    skippedCount: skipped.length,
    invalidCount: result.invalidCount,
    added,
    overwritten,
    skipped,
    invalid: result.invalid,
  };
}

module.exports = {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  exportRules,
  previewImport,
  commitImport,
};
