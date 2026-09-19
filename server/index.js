const path = require('path');
const express = require('express');
const api = require('./api');

const app = express();
const PORT = process.env.PORT || 5098;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 健康检查：页面右上角据此显示服务连接状态
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port: PORT });
});

app.get('/api/rules', (req, res) => {
  res.json(api.listRules({
    level: api.readQuery(req.query, 'level'),
    status: api.readQuery(req.query, 'status'),
    fileType: api.readQuery(req.query, 'fileType'),
    keyword: api.readQuery(req.query, 'keyword'),
  }));
});

app.post('/api/rules', (req, res) => {
  try {
    res.status(201).json(api.createRule(req.body));
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/rules/:id', (req, res) => {
  try {
    res.json(api.getRule(req.params.id));
  } catch (err) {
    sendError(res, err);
  }
});

app.patch('/api/rules/:id', (req, res) => {
  try {
    res.json(api.updateRule(req.params.id, req.body));
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/rules/:id', (req, res) => {
  try {
    res.json(api.deleteRule(req.params.id));
  } catch (err) {
    sendError(res, err);
  }
});

// 导出：可以按规则集、级别或具体勾选的条目挑，导出内容直接能拿走
app.post('/api/rules/export', (req, res) => {
  try {
    res.json(api.exportRules(req.body));
  } catch (err) {
    sendError(res, err);
  }
});

// 导入分两步：先预演看清新增、撞上已有与不成立的条目，确认后再真正写进清单
app.post('/api/rules/import/preview', (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    res.json(api.previewImport(body.content));
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/rules/import', (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    res.json(api.importRules(body.content));
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/files', (req, res) => {
  res.json(api.listFiles({
    type: api.readQuery(req.query, 'type'),
    keyword: api.readQuery(req.query, 'keyword'),
  }));
});

app.post('/api/files', (req, res) => {
  try {
    res.status(201).json(api.createFile(req.body));
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/files/:id', (req, res) => {
  try {
    res.json(api.getFile(req.params.id));
  } catch (err) {
    sendError(res, err);
  }
});

app.patch('/api/files/:id', (req, res) => {
  try {
    res.json(api.updateFile(req.params.id, req.body));
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/files/:id', (req, res) => {
  try {
    res.json(api.deleteFile(req.params.id));
  } catch (err) {
    sendError(res, err);
  }
});

// 扫一遍：可以只扫某一条规则、某一个文件，也可以只留某个级别
app.post('/api/scan', (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    res.json(api.scan({
      level: body.level,
      fileId: body.fileId,
      ruleId: body.ruleId,
    }));
  } catch (err) {
    sendError(res, err);
  }
});

// 未匹配到的接口路径统一返回说明，避免前端拿到一串页面内容
app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'API_NOT_FOUND', message: '接口不存在', field: '' } });
});

// 统一错误出口：业务异常按状态码与错误码返回，其余按服务异常处理
function sendError(res, err) {
  if (err instanceof api.ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, field: err.field },
    });
  }
  console.error('[tp98] 处理请求时出现未预期的问题：', err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务内部异常，请稍后重试', field: '' },
  });
}

// 请求体解析失败时给出明确说明
app.use((err, _req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'BODY_INVALID_JSON', message: '提交的内容不是合法的 JSON', field: '' },
    });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'BODY_TOO_LARGE', message: '提交的内容太大了，请分批导入', field: '' },
    });
  }
  if (err) return sendError(res, err);
  return next();
});

app.listen(PORT, () => {
  console.log(`检查规则与命中清单工作台已启动：http://localhost:${PORT}`);
});
