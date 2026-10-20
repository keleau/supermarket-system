/**
 * 鉴权中间件
 *  - authenticate：校验 Authorization: Bearer <token>，解析出 req.user
 *  - requireAdmin：仅管理员可访问
 *
 * 退出登录采用「内存黑名单」使 token 立即失效（单机部署足够；
 * 多实例部署可替换为 Redis）。
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { BizError } = require('../utils/result');

/** token 黑名单：token -> 过期时间戳(ms) */
const blacklist = new Map();

/** 定期清理已自然过期的黑名单项，避免内存泄漏 */
setInterval(() => {
  const now = Date.now();
  for (const [token, exp] of blacklist) {
    if (exp <= now) blacklist.delete(token);
  }
}, 30 * 60 * 1000).unref();

/** 把 token 加入黑名单 */
function revokeToken(token) {
  try {
    const payload = jwt.decode(token);
    const exp = payload && payload.exp ? payload.exp * 1000 : Date.now() + 24 * 3600 * 1000;
    blacklist.set(token, exp);
  } catch {
    blacklist.set(token, Date.now() + 24 * 3600 * 1000);
  }
}

/** 从请求头中提取 token */
function extractToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return '';
}

/** 登录态校验 */
function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return next(new BizError('登录已失效，请重新登录', 401));
  if (blacklist.has(token)) return next(new BizError('登录已失效，请重新登录', 401));

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: payload.userId,
      username: payload.username,
      role: payload.role,
      position: payload.position,
      realName: payload.realName || payload.username,
    };
    req.token = token;
    next();
  } catch {
    next(new BizError('登录已失效，请重新登录', 401));
  }
}

/** 管理员专属接口鉴权 */
function requireAdmin(req, res, next) {
  if (!req.user) return next(new BizError('登录已失效，请重新登录', 401));
  if (req.user.role !== 'admin') return next(new BizError('无权限执行该操作', 403));
  next();
}

/** 签发 token */
function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      position: user.position,
      realName: user.real_name || user.realName || '',
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = { authenticate, requireAdmin, signToken, revokeToken };
