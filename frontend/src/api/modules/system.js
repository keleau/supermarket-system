/**
 * 系统用户管理接口（全部仅管理员，后端已做角色鉴权）
 * - GET    /api/user/list            分页，入参 { pageNum, pageSize, username?, position?, status? }
 * - POST   /api/user                 新增（初始密码固定 123456，role 由 position 自动推导）
 * - PUT    /api/user                 编辑（id 在 body，username 不可改）
 * - DELETE /api/user/:id             删除
 * - POST   /api/user/reset-password  重置密码 { id, newPassword? }
 */
import { del, get, post, put } from '../request'

/** 用户分页列表 */
export function getUserList(params) {
  return get('/user/list', params)
}

/** 新增用户 */
export function addUser(data) {
  return post('/user', data)
}

/** 编辑用户 */
export function updateUser(data) {
  return put('/user', data)
}

/** 删除用户 */
export function deleteUser(id) {
  return del(`/user/${id}`)
}

/** 重置用户密码（不传 newPassword 时后端重置为默认密码） */
export function resetUserPassword(id, newPassword) {
  return post('/user/reset-password', { id, newPassword })
}
