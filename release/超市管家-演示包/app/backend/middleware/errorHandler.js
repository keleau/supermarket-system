/**
 * 全局错误处理与 404 处理
 *
 * 契约要求：任何情况下都返回 { code, msg, data }，绝不把堆栈泄露给前端。
 *
 * HTTP 状态码统一为 200，业务结果一律由 body 中的 code 表达
 * —— 因为前端 Axios 响应拦截器按 body.code 解包 / 弹错，
 *    若返回 4xx/5xx 会落入 axios 的 error 分支而拿不到 msg。
 */
const { BizError } = require('../utils/result');

/** 404：接口不存在 */
function notFound(req, res) {
  res.json({ code: 404, msg: `接口不存在：${req.method} ${req.originalUrl}`, data: null });
}

/** 全局错误处理（4 个参数，Express 据此识别为错误中间件） */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // 业务异常：直接把文案返回给前端弹窗
  if (err instanceof BizError) {
    return res.json({ code: err.code, msg: err.message, data: null });
  }

  // JSON 解析失败（body 非法）
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.json({ code: 400, msg: '请求数据格式错误', data: null });
  }

  // MySQL 唯一索引冲突兜底（并发场景下防重复单号/条码）
  if (err.code === 'ER_DUP_ENTRY') {
    const msg = String(err.message).includes('uk_sale_no')
      ? '销售单号重复，请重试'
      : '数据已存在，请勿重复提交';
    return res.json({ code: 400, msg, data: null });
  }

  // 其余按服务异常处理
  console.error('[error]', req.method, req.originalUrl, err);
  return res.json({ code: 500, msg: '服务异常', data: null });
}

module.exports = { notFound, errorHandler };
