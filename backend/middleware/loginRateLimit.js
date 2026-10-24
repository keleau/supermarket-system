/**
 * 登录接口限流：同一 IP 每分钟最多 5 次尝试。
 * 超限仍返回统一响应体（HTTP 200 + code 429），前端拦截器会按普通业务错误弹窗。
 */
const rateLimit = require('express-rate-limit');

const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler(req, res) {
    res.json({ code: 429, msg: '登录尝试过于频繁，请 1 分钟后再试', data: null });
  },
});

module.exports = loginRateLimit;
