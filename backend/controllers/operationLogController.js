/**
 * 操作日志 Controller（仅管理员查询）
 */
const operationLogModel = require('../models/operationLogModel');
const { ok, page } = require('../utils/result');
const {
  toStr, paging, parseDateRange,
} = require('../utils/validate');

async function list(req, res) {
  const { pageNum, pageSize, offset } = paging(req.query);
  const { startTime, endTime } = parseDateRange(req.query);

  const result = await operationLogModel.list({
    pageNum,
    pageSize,
    offset,
    module: toStr(req.query.module) || null,
    action: toStr(req.query.action) || null,
    username: toStr(req.query.username) || null,
    startTime,
    endTime,
  });

  return ok(res, page(result.list, result.total, pageNum, pageSize));
}

module.exports = { list };
