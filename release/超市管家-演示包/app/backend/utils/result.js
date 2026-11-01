/**
 * 统一响应体与业务异常
 *
 * 成功：{ code: 200, msg: 'success', data }
 * 失败：{ code: 400/401/403/500, msg: '可直接展示给用户的文案', data: null }
 */

/** 业务异常：Controller 里 throw new BizError('出库数量大于当前库存') 即可 */
class BizError extends Error {
  constructor(msg, code = 400) {
    super(msg);
    this.name = 'BizError';
    this.code = code;
  }
}

/** 成功响应 */
function ok(res, data = null, msg = 'success') {
  return res.json({ code: 200, msg, data });
}

/** 失败响应（一般由全局错误中间件统一处理，此处供特殊场景直接调用） */
function fail(res, msg = '操作失败', code = 400) {
  return res.json({ code, msg, data: null });
}

/** 分页响应结构 */
function page(list, total, pageNum, pageSize) {
  return { list, total, pageNum, pageSize };
}

module.exports = { BizError, ok, fail, page };
