// 页面交互：规则、文件与扫描三块都从服务端拉取，任何一步失败都把说明显示在顶部并标到对应输入项上

const state = {
  rules: [],
  files: [],
  levels: [],
  statuses: [],
  fileTypes: [],
  ruleLevels: [],
  ruleStatuses: [],
  ruleFileTypes: [],
  editingRuleId: '',
  editingFileId: '',
  lastScan: null,
};

const el = (id) => document.getElementById(id);

// 统一的请求入口：出错时把服务端给的错误码、说明与出错位置一起抛出去
async function request(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch (err) {
    payload = null;
  }
  if (!res.ok) {
    const error = (payload && payload.error) || {};
    const failure = new Error(error.message || `请求失败（状态码 ${res.status}）`);
    failure.code = error.code || '';
    failure.field = error.field || '';
    throw failure;
  }
  return payload;
}

function notify(message, kind) {
  const box = el('notice');
  box.textContent = message;
  box.className = `notice ${kind === 'ok' ? 'ok' : 'error'}`;
}

function clearNotice() {
  const box = el('notice');
  box.className = 'notice hidden';
  box.textContent = '';
}

function clearFieldMarks() {
  document.querySelectorAll('.invalid').forEach((node) => node.classList.remove('invalid'));
}

// 把出错位置标到具体输入项上：规则区与文件区共用一套标记
function markField(field) {
  if (!field) return;
  const target = document.querySelector(`[data-field="${field}"]`);
  if (!target) return;
  target.classList.add('invalid');
  const input = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA'
    ? target
    : target.querySelector('input, select, textarea');
  if (input) input.focus();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function levelClass(level) {
  if (level === '错误') return 'lv-error';
  if (level === '警告') return 'lv-warn';
  return 'lv-hint';
}

const OPERATOR_KEY = 'check-hits-operator';

function currentOperator() {
  return el('operator').value.trim();
}

function restoreOperator() {
  el('operator').value = window.localStorage.getItem(OPERATOR_KEY) || '';
}

async function loadHealth() {
  try {
    await request('/api/health');
    el('health').textContent = '服务正常';
    el('health').className = 'health ok';
  } catch (err) {
    el('health').textContent = '服务连不上';
    el('health').className = 'health bad';
  }
}

async function loadRules() {
  const params = new URLSearchParams();
  const level = el('rule-filter-level').value;
  const status = el('rule-filter-status').value;
  const fileType = el('rule-filter-type').value;
  const keyword = el('rule-filter-keyword').value.trim();
  if (level) params.set('level', level);
  if (status) params.set('status', status);
  if (fileType) params.set('fileType', fileType);
  if (keyword) params.set('keyword', keyword);
  const query = params.toString();
  const payload = await request(`/api/rules${query ? `?${query}` : ''}`);
  state.rules = payload.rules || [];
  state.levels = payload.levels || [];
  state.statuses = payload.statuses || [];
  state.fileTypes = payload.fileTypes || [];
  renderRuleFilters();
  renderRules();
  renderScanRuleOptions();
}

async function loadFiles() {
  const params = new URLSearchParams();
  const type = el('file-filter-type').value;
  const keyword = el('file-filter-keyword').value.trim();
  if (type) params.set('type', type);
  if (keyword) params.set('keyword', keyword);
  const query = params.toString();
  const payload = await request(`/api/files${query ? `?${query}` : ''}`);
  state.files = payload.files || [];
  state.ruleFileTypes = payload.fileTypes || [];
  renderFileFilters();
  renderFiles();
  renderScanFileOptions();
}

function renderRuleFilters() {
  const levelSelect = el('rule-filter-level');
  const levelCurrent = levelSelect.value;
  levelSelect.innerHTML = '<option value="">全部级别</option>'
    + state.levels.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.levels.includes(levelCurrent)) levelSelect.value = levelCurrent;

  const statusSelect = el('rule-filter-status');
  const statusCurrent = statusSelect.value;
  statusSelect.innerHTML = '<option value="">全部状态</option>'
    + state.statuses.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.statuses.includes(statusCurrent)) statusSelect.value = statusCurrent;

  const typeSelect = el('rule-filter-type');
  const typeCurrent = typeSelect.value;
  typeSelect.innerHTML = '<option value="">全部适用文件类型</option>'
    + state.fileTypes.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.fileTypes.includes(typeCurrent)) typeSelect.value = typeCurrent;

  const formLevel = el('rule-level');
  const formLevelCurrent = formLevel.value;
  formLevel.innerHTML = state.levels.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.levels.includes(formLevelCurrent)) formLevel.value = formLevelCurrent;

  const formStatus = el('rule-status');
  const formStatusCurrent = formStatus.value;
  formStatus.innerHTML = state.statuses.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.statuses.includes(formStatusCurrent)) formStatus.value = formStatusCurrent;

  const formType = el('rule-file-type');
  const formTypeCurrent = formType.value;
  formType.innerHTML = state.fileTypes.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.fileTypes.includes(formTypeCurrent)) formType.value = formTypeCurrent;

  const scanLevel = el('scan-level');
  const scanLevelCurrent = scanLevel.value;
  scanLevel.innerHTML = '<option value="">全部级别</option>'
    + state.levels.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.levels.includes(scanLevelCurrent)) scanLevel.value = scanLevelCurrent;
}

function renderFileFilters() {
  const typeSelect = el('file-filter-type');
  const current = typeSelect.value;
  typeSelect.innerHTML = '<option value="">全部类型</option>'
    + state.ruleFileTypes.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.ruleFileTypes.includes(current)) typeSelect.value = current;
}

function renderScanRuleOptions() {
  const select = el('scan-rule');
  const current = select.value;
  select.innerHTML = '<option value="">全部规则</option>'
    + state.rules.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} ${escapeHtml(item.name)}</option>`).join('');
  if (state.rules.some((item) => item.id === current)) select.value = current;
}

function renderScanFileOptions() {
  const select = el('scan-file');
  const current = select.value;
  select.innerHTML = '<option value="">全部文件</option>'
    + state.files.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.path)}</option>`).join('');
  if (state.files.some((item) => item.id === current)) select.value = current;
}

function renderRules() {
  const body = el('rule-body');
  body.innerHTML = state.rules.map((item) => `<tr>
      <td class="mono">${escapeHtml(item.code)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td><span class="tag ${levelClass(item.level)}">${escapeHtml(item.level)}</span></td>
      <td>${escapeHtml(item.status)}</td>
      <td>${escapeHtml(item.fileType)}</td>
      <td class="mono">${escapeHtml(item.pattern)}</td>
      <td class="note-cell">${escapeHtml(item.note)}</td>
      <td class="mono">${escapeHtml(formatTime(item.updatedAt))}</td>
      <td class="actions">
        <button type="button" class="link" data-rule-edit="${escapeHtml(item.id)}">编辑</button>
        <button type="button" class="link danger" data-rule-delete="${escapeHtml(item.id)}">删除</button>
      </td>
    </tr>`).join('');
  el('rule-empty').classList.toggle('hidden', state.rules.length > 0);
}

function renderFiles() {
  const body = el('file-body');
  body.innerHTML = state.files.map((item) => `<tr>
      <td class="mono">${escapeHtml(item.path)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${item.lineCount} 行</td>
      <td class="note-cell">${escapeHtml(item.note)}</td>
      <td class="mono">${escapeHtml(formatTime(item.updatedAt))}</td>
      <td class="actions">
        <button type="button" class="link" data-file-view="${escapeHtml(item.id)}">看内容</button>
        <button type="button" class="link" data-file-edit="${escapeHtml(item.id)}">编辑</button>
        <button type="button" class="link danger" data-file-delete="${escapeHtml(item.id)}">删除</button>
      </td>
    </tr>`).join('');
  el('file-empty').classList.toggle('hidden', state.files.length > 0);
}

function openRuleForm(rule) {
  state.editingRuleId = rule ? rule.id : '';
  el('rule-form-title').textContent = rule ? `编辑规则：${rule.code}` : '新建规则';
  el('rule-code').value = rule ? rule.code : '';
  el('rule-name').value = rule ? rule.name : '';
  el('rule-level').value = rule ? rule.level : (state.levels[0] || '提示');
  el('rule-status').value = rule ? rule.status : (state.statuses[0] || '启用');
  el('rule-file-type').value = rule ? rule.fileType : (state.fileTypes[0] || '全部');
  el('rule-pattern').value = rule ? rule.pattern : '';
  el('rule-note').value = rule ? rule.note : '';
  el('rule-form').classList.remove('hidden');
  el('rule-code').focus();
}

function closeRuleForm() {
  state.editingRuleId = '';
  el('rule-form').classList.add('hidden');
  clearFieldMarks();
}

function openFileForm(file) {
  state.editingFileId = file ? file.id : '';
  el('file-form-title').textContent = file ? `编辑文件：${file.path}` : '收录新文件';
  el('file-path').value = file ? file.path : '';
  el('file-content').value = file ? file.content : '';
  el('file-note').value = file ? file.note : '';
  el('file-form').classList.remove('hidden');
  el('file-path').focus();
}

function closeFileForm() {
  state.editingFileId = '';
  el('file-form').classList.add('hidden');
  clearFieldMarks();
}

async function showFileContent(id) {
  clearNotice();
  try {
    const file = await request(`/api/files/${encodeURIComponent(id)}`);
    const preview = el('file-preview');
    preview.textContent = `${file.path}（${file.lineCount} 行）\n${'─'.repeat(40)}\n${file.content}`;
    preview.classList.remove('hidden');
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function submitRule(event) {
  event.preventDefault();
  clearNotice();
  clearFieldMarks();
  const payload = {
    code: el('rule-code').value,
    name: el('rule-name').value,
    level: el('rule-level').value,
    status: el('rule-status').value,
    fileType: el('rule-file-type').value,
    pattern: el('rule-pattern').value,
    note: el('rule-note').value,
  };
  const editing = state.editingRuleId;
  try {
    if (editing) {
      await request(`/api/rules/${encodeURIComponent(editing)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      notify('规则已保存', 'ok');
    } else {
      await request('/api/rules', { method: 'POST', body: JSON.stringify(payload) });
      notify('规则已新增', 'ok');
    }
    closeRuleForm();
    await loadRules();
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

async function submitFile(event) {
  event.preventDefault();
  clearNotice();
  clearFieldMarks();
  const payload = {
    path: el('file-path').value,
    content: el('file-content').value,
    note: el('file-note').value,
  };
  const editing = state.editingFileId;
  try {
    if (editing) {
      await request(`/api/files/${encodeURIComponent(editing)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      notify('文件已保存', 'ok');
    } else {
      await request('/api/files', { method: 'POST', body: JSON.stringify(payload) });
      notify('文件已收录', 'ok');
    }
    closeFileForm();
    await loadFiles();
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

// 扫一遍，把概要与命中清单都画出来
async function runScan() {
  clearNotice();
  const body = {
    ruleId: el('scan-rule').value,
    fileId: el('scan-file').value,
    level: el('scan-level').value,
  };
  try {
    const result = await request('/api/scan', { method: 'POST', body: JSON.stringify(body) });
    state.lastScan = result;
    renderScan(result);
  } catch (err) {
    notify(err.message, 'error');
  }
}

function renderScan(result) {
  el('scan-meta').textContent = `扫描时刻 ${formatTime(result.scannedAt)}　参与比对的规则 ${result.rulesUsed} 条（启用共 ${result.enabledRules} 条）　范围里的文件 ${result.filesInScope} 个（清单共 ${result.filesTotal} 个）`;

  const warningBox = el('scan-warning');
  if (result.warning) {
    warningBox.textContent = result.warning;
    warningBox.classList.remove('hidden');
  } else {
    warningBox.classList.add('hidden');
    warningBox.textContent = '';
  }

  const summaryBox = el('scan-summary');
  const levelText = Object.keys(result.summary.byLevel)
    .map((key) => `${key} ${result.summary.byLevel[key]} 条`)
    .join('　');
  const ruleText = result.summary.byRule
    .map((item) => `${item.code} ${item.count} 条`)
    .join('　') || '没有规则命中';
  const fileText = result.summary.byFile
    .map((item) => `${item.path} ${item.count} 条`)
    .join('　') || '没有文件命中';
  summaryBox.innerHTML = `
    <div class="summary-line"><strong>一共命中 ${result.summary.total} 条</strong>　${escapeHtml(levelText)}</div>
    <div class="summary-line">按规则：${escapeHtml(ruleText)}</div>
    <div class="summary-line">按文件：${escapeHtml(fileText)}</div>`;
  summaryBox.classList.remove('hidden');

  const body = el('hit-body');
  body.innerHTML = result.hits.map((hit) => `<tr>
      <td class="mono">${escapeHtml(hit.code)}</td>
      <td><span class="tag ${levelClass(hit.level)}">${escapeHtml(hit.level)}</span></td>
      <td>${escapeHtml(hit.ruleName)}</td>
      <td class="mono">${escapeHtml(hit.path)}</td>
      <td class="mono">${hit.lineNo}</td>
      <td class="mono line-cell">${escapeHtml(hit.lineText)}</td>
    </tr>`).join('');
  el('hit-empty').classList.toggle('hidden', result.hits.length > 0);
}

// 列表上的操作用事件委托统一处理，列表重绘之后不需要重新绑定
document.addEventListener('click', async (event) => {
  const node = event.target.closest('button');
  if (!node) return;

  if (node.dataset.ruleEdit) {
    clearNotice();
    const found = state.rules.find((item) => item.id === node.dataset.ruleEdit);
    if (found) openRuleForm(found);
    return;
  }

  if (node.dataset.ruleDelete) {
    clearNotice();
    const found = state.rules.find((item) => item.id === node.dataset.ruleDelete);
    if (!window.confirm(`确定删除规则 ${found ? found.code : ''} 吗？`)) return;
    try {
      await request(`/api/rules/${encodeURIComponent(node.dataset.ruleDelete)}`, { method: 'DELETE' });
      if (state.editingRuleId === node.dataset.ruleDelete) closeRuleForm();
      notify('规则已删除', 'ok');
      await loadRules();
    } catch (err) {
      notify(err.message, 'error');
    }
    return;
  }

  if (node.dataset.fileView) {
    await showFileContent(node.dataset.fileView);
    return;
  }

  if (node.dataset.fileEdit) {
    clearNotice();
    try {
      const file = await request(`/api/files/${encodeURIComponent(node.dataset.fileEdit)}`);
      openFileForm(file);
    } catch (err) {
      notify(err.message, 'error');
    }
    return;
  }

  if (node.dataset.fileDelete) {
    clearNotice();
    const found = state.files.find((item) => item.id === node.dataset.fileDelete);
    if (!window.confirm(`确定把 ${found ? found.path : ''} 移出清单吗？`)) return;
    try {
      await request(`/api/files/${encodeURIComponent(node.dataset.fileDelete)}`, { method: 'DELETE' });
      if (state.editingFileId === node.dataset.fileDelete) closeFileForm();
      el('file-preview').classList.add('hidden');
      notify('文件已移出清单', 'ok');
      await loadFiles();
    } catch (err) {
      notify(err.message, 'error');
    }
  }
});

el('rule-form').addEventListener('submit', submitRule);
el('file-form').addEventListener('submit', submitFile);
el('rule-new').addEventListener('click', () => {
  clearNotice();
  openRuleForm(null);
});
el('rule-cancel').addEventListener('click', closeRuleForm);
el('file-new').addEventListener('click', () => {
  clearNotice();
  openFileForm(null);
});
el('file-cancel').addEventListener('click', closeFileForm);
el('rule-filter-apply').addEventListener('click', () => {
  clearNotice();
  loadRules().catch((err) => notify(err.message, 'error'));
});
el('rule-filter-reset').addEventListener('click', () => {
  el('rule-filter-level').value = '';
  el('rule-filter-status').value = '';
  el('rule-filter-type').value = '';
  el('rule-filter-keyword').value = '';
  loadRules().catch((err) => notify(err.message, 'error'));
});
el('rule-refresh').addEventListener('click', () => {
  clearNotice();
  loadRules()
    .then(loadFiles)
    .catch((err) => notify(err.message, 'error'));
});
el('file-filter-apply').addEventListener('click', () => {
  clearNotice();
  loadFiles().catch((err) => notify(err.message, 'error'));
});
el('file-filter-reset').addEventListener('click', () => {
  el('file-filter-type').value = '';
  el('file-filter-keyword').value = '';
  loadFiles().catch((err) => notify(err.message, 'error'));
});
el('scan-run').addEventListener('click', runScan);
el('rule-filter-level').addEventListener('change', () => {
  loadRules().catch((err) => notify(err.message, 'error'));
});
el('rule-filter-status').addEventListener('change', () => {
  loadRules().catch((err) => notify(err.message, 'error'));
});
el('operator').addEventListener('change', () => {
  window.localStorage.setItem(OPERATOR_KEY, currentOperator());
});

// ===== 规则的导入导出：团队之间共享规则，不用再一条条重录 =====
const exportState = {
  allRules: [],
  selected: new Set(),
  prevCandidateIds: new Set(),
};
let importParsed = null;

function openModal(id) {
  el(id).classList.remove('hidden');
}

function closeModal(id) {
  el(id).classList.add('hidden');
}

// ---- 导出 ----
async function openExport() {
  clearNotice();
  try {
    // “全部规则”要绕开页面上的筛选条件，单独拉一份完整清单
    const payload = await request('/api/rules');
    exportState.allRules = payload.rules || [];
    renderExportLevels();
    el('export-content').value = '';
    openModal('export-modal');
    exportState.prevCandidateIds = new Set();
    await refreshExport();
  } catch (err) {
    notify(err.message, 'error');
  }
}

function renderExportLevels() {
  const box = el('export-levels');
  box.innerHTML = state.levels
    .map((level) => `<label class="inline"><input type="checkbox" class="export-level" value="${escapeHtml(level)}" checked>${escapeHtml(level)}</label>`)
    .join('');
}

function checkedExportLevels() {
  return Array.from(document.querySelectorAll('.export-level:checked')).map((node) => node.value);
}

function exportScope() {
  const checked = document.querySelector('input[name="export-scope"]:checked');
  return checked ? checked.value : 'all';
}

function exportCandidates() {
  const base = exportScope() === 'filtered' ? state.rules : exportState.allRules;
  const levels = new Set(checkedExportLevels());
  return base.filter((rule) => levels.has(rule.level));
}

function currentExportIds() {
  return exportCandidates().filter((rule) => exportState.selected.has(rule.id)).map((rule) => rule.id);
}

// 级别或规则集变化后重算勾选：新进入候选范围的默认勾上，离开范围的剔除，其余保留本人的选择
function syncExportSelection() {
  const candidates = exportCandidates();
  const next = new Set();
  candidates.forEach((rule) => {
    if (exportState.selected.has(rule.id) || !exportState.prevCandidateIds.has(rule.id)) next.add(rule.id);
  });
  exportState.selected = next;
  exportState.prevCandidateIds = new Set(candidates.map((rule) => rule.id));
}

function renderExportRuleList() {
  const box = el('export-rule-list');
  const candidates = exportCandidates();
  if (!candidates.length) {
    box.innerHTML = '<span class="import-hint">当前规则集与级别下没有规则</span>';
  } else {
    box.innerHTML = candidates.map((rule) => `<label class="inline">
        <input type="checkbox" class="export-rule-check" value="${escapeHtml(rule.id)}"${exportState.selected.has(rule.id) ? ' checked' : ''}>
        <span class="mono">${escapeHtml(rule.code)}</span>
        <span>${escapeHtml(rule.name)}</span>
        <span class="pick-meta">${escapeHtml(rule.level)} · ${escapeHtml(rule.status)} · ${escapeHtml(rule.fileType)}</span>
      </label>`).join('');
  }
  el('export-count').textContent = currentExportIds().length;
}

async function loadExportContent() {
  const ids = currentExportIds();
  if (!ids.length) {
    el('export-content').value = '';
    el('export-count').textContent = '0';
    return;
  }
  try {
    const query = `?ids=${ids.map(encodeURIComponent).join(',')}`;
    const payload = await request(`/api/rules/export${query}`);
    el('export-content').value = JSON.stringify(payload, null, 2);
    el('export-count').textContent = payload.count;
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function refreshExport() {
  syncExportSelection();
  renderExportRuleList();
  await loadExportContent();
}

function downloadExport() {
  const ids = currentExportIds();
  if (!ids.length) {
    notify('还没有勾选任何规则', 'error');
    return;
  }
  const query = `?ids=${ids.map(encodeURIComponent).join(',')}`;
  const link = document.createElement('a');
  link.href = `/api/rules/export${query}`;
  link.download = 'rules-export.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function copyExport() {
  const text = el('export-content').value;
  if (!text) {
    notify('还没有可复制的内容', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    notify('导出内容已复制', 'ok');
  } catch (err) {
    // 老浏览器或非安全上下文没有剪贴板接口，退回选中后执行复制
    const area = el('export-content');
    area.select();
    document.execCommand('copy');
    notify('导出内容已复制', 'ok');
  }
}

// ---- 导入 ----
function resetImport() {
  el('import-content').value = '';
  el('import-file').value = '';
  el('import-parse-error').textContent = '';
  el('import-result').classList.add('hidden');
  el('import-confirm').disabled = true;
  importParsed = null;
}

function openImport() {
  clearNotice();
  resetImport();
  openModal('import-modal');
}

function ruleMetaLine(rule) {
  return `${rule.level} · ${rule.status} · ${rule.fileType} · 匹配 ${rule.pattern}`;
}

function renderImportPreview(result) {
  el('import-result').classList.remove('hidden');
  el('import-summary').innerHTML = `一共 <strong>${result.total}</strong> 条：将新增 <strong>${result.addedCount}</strong> 条，与已有规则同编码 <strong>${result.conflictCount}</strong> 条，本身不成立 <strong>${result.invalidCount}</strong> 条。`;

  el('import-added-count').textContent = result.addedCount;
  el('import-added-list').innerHTML = result.added.length
    ? result.added.map((rule) => `<li>
        <span class="mono">${escapeHtml(rule.code)}</span> ${escapeHtml(rule.name)}
        <div class="conflict-detail">${escapeHtml(ruleMetaLine(rule))}</div>
      </li>`).join('')
    : '<li class="import-hint">没有新增项</li>';

  el('import-conflict-count').textContent = result.conflictCount;
  el('import-conflict-list').innerHTML = result.conflicts.length
    ? result.conflicts.map((rule) => `<li>
        <span class="mono">${escapeHtml(rule.code)}</span> ${escapeHtml(rule.name)}
        <div class="conflict-detail">清单里已有：${escapeHtml(rule.existing.code)} ${escapeHtml(rule.existing.name)}（${escapeHtml(rule.existing.level)} · ${escapeHtml(rule.existing.status)}）</div>
        <div class="conflict-detail">导入内容：${escapeHtml(ruleMetaLine(rule))}</div>
      </li>`).join('')
    : '<li class="import-hint">没有同编码冲突</li>';

  el('import-invalid-count').textContent = result.invalidCount;
  el('import-invalid-list').innerHTML = result.invalid.length
    ? result.invalid.map((item) => `<li>
        第 ${item.index} 条${item.code ? ` <span class="mono">${escapeHtml(item.code)}</span>` : ''}${item.name ? ` ${escapeHtml(item.name)}` : ''}
        <p class="reasons">${item.reasons.map((reason) => `· ${escapeHtml(reason)}`).join('<br>')}</p>
      </li>`).join('')
    : '<li class="import-hint">没有不成立的条目</li>';

  updateImportConfirmState();
}

function conflictMode() {
  const checked = document.querySelector('input[name="conflict-mode"]:checked');
  return checked ? checked.value : 'skip';
}

// 跳过模式下至少要有新增项才值得提交；覆盖模式下有冲突也可以提交
function updateImportConfirmState() {
  const hasPreview = !el('import-result').classList.contains('hidden');
  const added = Number(el('import-added-count').textContent) || 0;
  const conflicts = Number(el('import-conflict-count').textContent) || 0;
  el('import-confirm').disabled = !hasPreview || !(added > 0 || (conflictMode() === 'overwrite' && conflicts > 0));
}

async function runImportPreview() {
  clearNotice();
  const raw = el('import-content').value.trim();
  el('import-parse-error').textContent = '';
  if (!raw) {
    el('import-parse-error').textContent = '请先选择文件或粘贴 JSON 内容';
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    el('import-parse-error').textContent = '内容不是合法的 JSON，请检查括号、引号与逗号';
    return;
  }
  try {
    const result = await request('/api/rules/import/preview', {
      method: 'POST',
      body: JSON.stringify(parsed),
    });
    importParsed = parsed;
    renderImportPreview(result);
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function confirmImport() {
  if (!importParsed) return;
  try {
    const result = await request('/api/rules/import', {
      method: 'POST',
      body: JSON.stringify({ content: importParsed, conflictMode: conflictMode() }),
    });
    const parts = [`新增 ${result.addedCount} 条`];
    if (result.overwrittenCount) parts.push(`覆盖 ${result.overwrittenCount} 条`);
    if (result.skippedCount) parts.push(`跳过冲突 ${result.skippedCount} 条`);
    if (result.invalidCount) parts.push(`${result.invalidCount} 条不成立未导入`);
    notify(`导入完成：${parts.join('，')}`, 'ok');
    closeModal('import-modal');
    await loadRules();
  } catch (err) {
    notify(err.message, 'error');
  }
}

el('rule-export').addEventListener('click', openExport);
el('rule-import').addEventListener('click', openImport);
el('export-close').addEventListener('click', () => closeModal('export-modal'));
el('import-close').addEventListener('click', () => closeModal('import-modal'));
el('export-download').addEventListener('click', downloadExport);
el('export-copy').addEventListener('click', () => {
  copyExport().catch((err) => notify(err.message, 'error'));
});
el('export-select-all').addEventListener('click', async () => {
  exportCandidates().forEach((rule) => exportState.selected.add(rule.id));
  renderExportRuleList();
  await loadExportContent();
});
el('export-select-none').addEventListener('click', async () => {
  exportCandidates().forEach((rule) => exportState.selected.delete(rule.id));
  renderExportRuleList();
  await loadExportContent();
});
document.querySelectorAll('input[name="export-scope"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    refreshExport().catch((err) => notify(err.message, 'error'));
  });
});
el('export-levels').addEventListener('change', (event) => {
  if (event.target.classList.contains('export-level')) {
    refreshExport().catch((err) => notify(err.message, 'error'));
  }
});
el('export-rule-list').addEventListener('change', async (event) => {
  if (!event.target.classList.contains('export-rule-check')) return;
  const id = event.target.value;
  if (event.target.checked) exportState.selected.add(id);
  else exportState.selected.delete(id);
  el('export-count').textContent = currentExportIds().length;
  await loadExportContent();
});
el('import-file').addEventListener('change', () => {
  const file = el('import-file').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    el('import-content').value = String(reader.result || '');
  };
  reader.onerror = () => notify('文件读不出来，请换一个文件或直接粘贴内容', 'error');
  reader.readAsText(file);
});
el('import-preview').addEventListener('click', runImportPreview);
el('import-confirm').addEventListener('click', confirmImport);
document.querySelectorAll('input[name="conflict-mode"]').forEach((radio) => {
  radio.addEventListener('change', updateImportConfirmState);
});
// 点遮罩空白处关掉弹层
document.querySelectorAll('.modal-mask').forEach((mask) => {
  mask.addEventListener('click', (event) => {
    if (event.target === mask) mask.classList.add('hidden');
  });
});

// 页面打开时先把规则与文件都拉一遍，扫描的范围下拉依赖这两份清单
restoreOperator();
loadHealth();
loadRules()
  .then(loadFiles)
  .catch((err) => notify(err.message, 'error'));
