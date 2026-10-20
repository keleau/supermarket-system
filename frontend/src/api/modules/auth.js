/**
 * 认证 / 个人资料接口
 * - POST /api/user/login     入参 { username, password }
 *                            返回 { token, role, position, username, avatar, realName }
 * - POST /api/user/logout    使当前 token 立即失效
 * - GET  /api/user/info      当前登录用户信息（刷新页面后恢复登录态）
 * - POST /api/user/password  修改本人密码，入参 { oldPassword, newPassword }
 * - PUT  /api/user/profile   更新本人资料（白名单字段，salary/position/role 后端忽略）
 */
import { get, post, put, patch } from '../request'

/** 用户登录 */
export function login(data) {
  return post('/user/login', data)
}

/** 退出登录 */
export function logout() {
  return post('/user/logout')
}

/** 获取当前登录用户信息 */
export function getUserInfo() {
  return get('/user/info')
}

/** 修改本人密码 */
export function changePassword(data) {
  return post('/user/password', data)
}

/** 更新本人资料 */
export function updateProfile(data) {
  return put('/user/profile', data)
}

/** 更换头像（点选即保存，独立于资料整体保存） */
export function updateAvatar(avatar) {
  return patch('/user/avatar', { avatar })
}

/** 后端连通性检测（登录页使用，无需登录；silent 关闭自动弹窗，由页面自行提示） */
export function checkHealth() {
  return get('/health', undefined, { silent: true })
}
