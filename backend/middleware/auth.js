/**
 * 鉴权中间件
 *  - authenticate：校验 Authorization: Bearer <token>，解析出 req.user
 *  - requireAdmin：仅管理员可访问
 *
 * 每个受保护请求都会回库校验一次：
 *  - 账号被删除或禁用 → 401
 *  - token_version 与库中不一致（改密码/重置密码/改角色/禁用时 +1）→ 401
 * 因此旧 token 不必等到过期就立即失效；角色/职位以数据库当前值为准。
 *
 * 「内存黑名单」只是退出登录的快速失效手段（单机部署足够；
 * 多实例部署可替换为 Redis）。
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { BizError } = require('../utils/result');
const userModel = require('../models/userModel');

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
async function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return next(new BizError('登录已失效，请重新登录', 401));
  if (blacklist.has(token)) return next(new BizError('登录已失效，请重新登录', 401));

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    return next(new BizError('登录已失效，请重新登录', 401));
  }

  const user = await userModel.findAuthById(payload.userId);
  if (!user || user.status !== 1) {
    return next(new BizError('登录已失效，请重新登录', 401));
  }
  // 老 token 没有 tokenVersion 字段时按 0 处理，避免升级后所有人被迫重新登录
  if (Number(payload.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
    return next(new BizError('登录已失效，请重新登录', 401));
  }

  req.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    position: user.position,
    realName: user.realName || user.username,
  };
  req.token = token;
  next();
}

/** 管理员专属接口鉴权 */
function requireAdmin(req, res, next) {
  if (!req.user) return next(new BizError('登录已失效，请重新登录', 401));
  if (req.user.role !== 'admin') return next(new BizError('无权限执行该操作', 403));
  next();
}

/** 签发 token（版本号写入载荷，改密码/改权限后旧 token 自动失效） */
function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      position: user.position,
      realName: user.real_name || user.realName || '',
      tokenVersion: Number(user.tokenVersion || 0),
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = { authenticate, requireAdmin, signToken, revokeToken };
