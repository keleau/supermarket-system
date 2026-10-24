/**
 * 系统用户 Controller —— 业务逻辑、参数校验
 */
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const { signToken, revokeToken } = require('../middleware/auth');
const { BizError, ok, page } = require('../utils/result');
const {
  isBlank, toInt, toStr, paging, assert, isPhone, isIdCard, isUsername,
} = require('../utils/validate');
const { roleFromPosition, normalizePosition } = require('../utils/role');
const config = require('../config');

// 默认头像：前端内置的本地扁平头像（public/avatars/a1.svg），避免外网 CDN 依赖
const DEFAULT_AVATAR = '/avatars/a1.svg';

/* ------------------------------------------------------------------ */
/* 4.1.1 登录                                                          */
/* ------------------------------------------------------------------ */
async function login(req, res) {
  const username = toStr(req.body.username);
  const password = toStr(req.body.password);

  assert(!isBlank(username) && !isBlank(password), '请输入账号和密码');

  const user = await userModel.findByUsernameWithPassword(username);
  if (!user) throw new BizError('账号或密码错误');

  const matched = bcrypt.compareSync(password, user.password);
  if (!matched) throw new BizError('账号或密码错误');

  assert(user.status === 1, '该账号已被禁用');

  const token = signToken(user);
  return ok(res, {
    token,
    role: user.role,
    position: user.position,
    username: user.username,
    avatar: user.avatar,
    realName: user.realName,
  });
}

/* ------------------------------------------------------------------ */
/* 4.1.2 退出登录                                                       */
/* ------------------------------------------------------------------ */
async function logout(req, res) {
  if (req.token) revokeToken(req.token);
  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.1.3 获取当前用户信息                                                */
/* ------------------------------------------------------------------ */
async function info(req, res) {
  const user = await userModel.findById(req.user.id);
  if (!user) throw new BizError('登录已失效，请重新登录', 401);

  return ok(res, {
    id: user.id,
    username: user.username,
    realName: user.realName,
    role: user.role,
    position: user.position,
    avatar: user.avatar,
    phone: user.phone,
  });
}

/* ------------------------------------------------------------------ */
/* 4.1.4 修改密码（本人）                                                */
/* ------------------------------------------------------------------ */
async function changePassword(req, res) {
  const oldPassword = toStr(req.body.oldPassword);
  const newPassword = toStr(req.body.newPassword);

  assert(!isBlank(oldPassword), '请输入当前密码');
  assert(!isBlank(newPassword), '请输入新密码');
  assert(newPassword.length >= 6, '新密码长度至少 6 位');
  assert(newPassword !== oldPassword, '新密码不能与当前密码相同');

  const user = await userModel.findByUsernameWithPassword(req.user.username);
  if (!user) throw new BizError('登录已失效，请重新登录', 401);

  assert(bcrypt.compareSync(oldPassword, user.password), '当前密码错误');

  await userModel.updatePassword(user.id, bcrypt.hashSync(newPassword, 10));
  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.1.5 更新个人资料                                                   */
/* 敏感字段 salary / joinDate / position / role 一律忽略                 */
/* ------------------------------------------------------------------ */
async function updateProfile(req, res) {
  const b = req.body || {};

  const phone = toStr(b.phone);
  if (phone) assert(isPhone(phone), '手机号格式不正确');

  const idCard = toStr(b.idCard);
  if (idCard) assert(isIdCard(idCard), '身份证号格式不正确');

  const gender = toStr(b.gender);
  if (gender) assert(['男', '女'].includes(gender), '性别取值不正确');

  // 白名单：只允许更新以下字段
  const data = {
    avatar: toStr(b.avatar, DEFAULT_AVATAR),
    realName: toStr(b.realName),
    gender,
    birthday: toStr(b.birthday) || null,
    phone,
    idCard,
    address: toStr(b.address),
    remark: toStr(b.remark),
  };

  const updated = await userModel.update(req.user.id, data);
  if (!updated) throw new BizError('登录已失效，请重新登录', 401);

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.1.5b 更换头像（点选即保存，独立于资料整体保存）                      */
/* ------------------------------------------------------------------ */
async function updateAvatar(req, res) {
  const avatar = toStr(req.body.avatar);
  assert(/^\/avatars\//.test(avatar) || /^https?:\/\//.test(avatar), '头像地址不合法');

  const updated = await userModel.update(req.user.id, { avatar });
  if (!updated) throw new BizError('登录已失效，请重新登录', 401);

  return ok(res, { avatar });
}

/* ------------------------------------------------------------------ */
/* 4.1.6 用户分页列表（仅管理员）                                        */
/* ------------------------------------------------------------------ */
async function list(req, res) {
  const { pageNum, pageSize, offset } = paging(req.query);
  const result = await userModel.list({
    pageNum,
    pageSize,
    offset,
    username: toStr(req.query.username) || null,
    position: toStr(req.query.position) || null,
    status: toInt(req.query.status, null),
  });
  return ok(res, page(result.list, result.total, pageNum, pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.1.7 新增用户（仅管理员）                                            */
/* ------------------------------------------------------------------ */
function buildUserPayload(body) {
  const b = body || {};

  const phone = toStr(b.phone);
  if (phone) assert(isPhone(phone), '手机号格式不正确');

  const idCard = toStr(b.idCard);
  if (idCard) assert(isIdCard(idCard), '身份证号格式不正确');

  const gender = toStr(b.gender);
  if (gender) assert(['男', '女'].includes(gender), '性别取值不正确');

  const salary = b.salary === undefined || b.salary === null || b.salary === ''
    ? 0
    : Number(b.salary);
  assert(Number.isFinite(salary) && salary >= 0, '工资不能为负');

  return {
    realName: toStr(b.realName),
    avatar: toStr(b.avatar, DEFAULT_AVATAR),
    idCard,
    phone,
    address: toStr(b.address),
    gender,
    birthday: toStr(b.birthday) || null,
    joinDate: toStr(b.joinDate) || null,
    salary,
    remark: toStr(b.remark),
    status: toInt(b.status, 1) === 0 ? 0 : 1,
  };
}

async function create(req, res) {
  const username = toStr(req.body.username);
  assert(isUsername(username), '账号格式不正确（3-20 位字母/数字/下划线）');
  assert(!(await userModel.existsUsername(username)), '登录账号已存在');

  // 职位 → 角色自动映射，role 不由前端传
  const position = normalizePosition(req.body.position);
  const payload = buildUserPayload(req.body);

  const user = await userModel.create({
    ...payload,
    username,
    position,
    role: roleFromPosition(position),
    password: bcrypt.hashSync(config.defaultPassword, 10), // 初始密码 123456
  });

  return ok(res, { id: user.id });
}

/* ------------------------------------------------------------------ */
/* 4.1.8 编辑用户（仅管理员）                                            */
/* ------------------------------------------------------------------ */
async function update(req, res) {
  const id = toInt(req.body.id);
  assert(id !== null, '缺少用户 id');

  const exist = await userModel.findById(id);
  assert(exist, '用户不存在');

  // username 不可修改，忽略传入值
  const position = normalizePosition(req.body.position);
  const payload = buildUserPayload(req.body);

  // 内置管理员必须保持 admin 角色，防止误操作把自己降权锁死
  const isBuiltinAdmin = exist.username === config.builtinAdminUsername;
  assert(!isBuiltinAdmin || payload.status === 1, '系统管理员不可禁用');
  const role = isBuiltinAdmin ? 'admin' : roleFromPosition(position);
  const finalPosition = isBuiltinAdmin ? '管理员' : position;

  await userModel.update(id, { ...payload, position: finalPosition, role });

  // 禁用/启用或权限变化后，该用户已登录的旧 token 立即失效，需重新登录
  const statusChanged = payload.status !== exist.status;
  const permissionChanged = role !== exist.role || finalPosition !== exist.position;
  if (statusChanged || permissionChanged) {
    await userModel.bumpTokenVersion(id);
  }

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.1.9 删除用户（仅管理员）                                            */
/* ------------------------------------------------------------------ */
async function remove(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少用户 id');

  const exist = await userModel.findById(id);
  assert(exist, '用户不存在');
  assert(id !== req.user.id, '不能删除当前登录账号');
  assert(exist.username !== config.builtinAdminUsername, '系统管理员不可删除');

  await userModel.remove(id);
  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.1.10 重置用户密码（仅管理员）                                       */
/* ------------------------------------------------------------------ */
async function resetPassword(req, res) {
  const id = toInt(req.body.id);
  assert(id !== null, '缺少用户 id');

  const newPassword = toStr(req.body.newPassword) || config.defaultPassword;
  assert(newPassword.length >= 6, '新密码长度至少 6 位');

  const exist = await userModel.findById(id);
  assert(exist, '用户不存在');

  await userModel.updatePassword(id, bcrypt.hashSync(newPassword, 10));
  return ok(res, null);
}

module.exports = {
  login, logout, info, changePassword, updateProfile, updateAvatar,
  list, create, update, remove, resetPassword,
};
