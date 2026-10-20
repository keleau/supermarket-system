/**
 * 系统用户 · 临时演示数据
 * 【临时】后端接口未就绪前用于页面效果演示；
 * 后端完成后改为调用 src/api/modules/system.js 的接口，删除本文件。
 */

import { ROLE_ADMIN, ROLE_KEEPER, POSITIONS } from '@/store/user'

const STORAGE_KEY = 'market_sys_users'
const STORAGE_VERSION = 2

/** Element Plus 默认头像（内置 6 张，个人中心 / 用户管理共用） */
export const AVATAR_OPTIONS = [
  'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png',
  'https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png',
  'https://cube.elemecdn.com/9/c2/f0c0e84c06b6a0a8d9a4c4d5c9a1e0png.png',
  'https://cube.elemecdn.com/e/fd/0fc7d20532fdaf769a25683617711png.png',
  'https://cube.elemecdn.com/2/2e/06b3f3c2c2f4e4e4d5a6b7c8d9e0fpng.png',
  'https://cube.elemecdn.com/5/8f/2c8c3a3c3d4e5f6a7b8c9d0e1f2apng.png',
]

/**
 * 默认系统用户（覆盖多职位：管理员 / 仓管 / 收银员 / 后勤 / 采购 / 会计）
 * 头像统一用 Element Plus 默认头像（索引循环分配）
 */
const defaultUsers = [
  { id: 1, username: 'admin', realName: '系统管理员', roleName: ROLE_ADMIN, position: ROLE_ADMIN, avatar: AVATAR_OPTIONS[0], idCard: '330100199001011234', phone: '13900000001', address: '浙江省杭州市西湖区', gender: '男', birthday: '1990-01-01', joinDate: '2023-06-01', salary: 15000, remark: '系统最高权限', status: 1, createTime: '2026-09-01 09:00:00' },
  { id: 2, username: 'keeper', realName: '仓库管理员', roleName: ROLE_KEEPER, position: ROLE_KEEPER, avatar: AVATAR_OPTIONS[1], idCard: '330100199102022345', phone: '13900000002', address: '浙江省杭州市拱墅区', gender: '男', birthday: '1991-02-02', joinDate: '2023-07-01', salary: 8000, remark: '', status: 1, createTime: '2026-09-01 09:00:00' },
  { id: 3, username: 'zhaomin', realName: '赵敏', roleName: '收银员', position: '收银员', avatar: AVATAR_OPTIONS[2], idCard: '330100199303034567', phone: '13900000003', address: '浙江省杭州市滨江区', gender: '女', birthday: '1993-03-03', joinDate: '2024-03-01', salary: 5500, remark: '', status: 1, createTime: '2026-09-02 10:00:00' },
  { id: 4, username: 'lijin', realName: '李静', roleName: '后勤', position: '后勤', avatar: AVATAR_OPTIONS[3], idCard: '330100199404046789', phone: '13900000004', address: '浙江省杭州市萧山区', gender: '女', birthday: '1994-04-04', joinDate: '2024-05-01', salary: 5200, remark: '', status: 1, createTime: '2026-09-03 11:00:00' },
  { id: 5, username: 'wangqiang', realName: '王强', roleName: '采购', position: '采购', avatar: AVATAR_OPTIONS[4], idCard: '330100199505058901', phone: '13900000005', address: '浙江省杭州市余杭区', gender: '男', birthday: '1995-05-05', joinDate: '2024-07-01', salary: 6500, remark: '', status: 0, createTime: '2026-09-04 14:00:00' },
  { id: 6, username: 'liuyang', realName: '刘洋', roleName: '会计', position: '会计', avatar: AVATAR_OPTIONS[5], idCard: '330100199606060123', phone: '13900000006', address: '浙江省杭州市临平区', gender: '女', birthday: '1996-06-06', joinDate: '2024-09-01', salary: 7000, remark: '', status: 1, createTime: '2026-09-05 15:00:00' },
]

function pad(n) {
  return String(n).padStart(2, '0')
}

function nowStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function loadUsers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    // 仅接受当前版本结构；旧结构（无职位/头像等字段）按默认重建
    if (parsed && parsed.__v === STORAGE_VERSION && Array.isArray(parsed.list)) return parsed.list
  } catch {
    /* 数据损坏按默认处理 */
  }
  return defaultUsers.map((u) => ({ ...u }))
}

let users = loadUsers()

function saveUsers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: STORAGE_VERSION, list: users }))
}

/** 取全部用户 */
export function getAllUsers() {
  return [...users]
}

/** 取职位下拉选项 */
export function getPositionOptions() {
  return [...POSITIONS]
}

/** 根据用户名查找用户（个人中心展示完整资料用） */
export function getUserByUsername(username) {
  return users.find((u) => u.username === username) || null
}

/** 检查用户名唯一性（编辑时排除自身 id） */
export function checkUsernameUnique(username, excludeId = null) {
  const trimmed = username.trim()
  return !users.some((u) => u.username === trimmed && u.id !== excludeId)
}

/** 新增用户 */
export function addUser(draft) {
  const id = Math.max(0, ...users.map((u) => u.id)) + 1
  const record = {
    id,
    username: draft.username.trim(),
    realName: draft.realName?.trim() || '',
    roleName: draft.position || draft.roleName, // 职位即权限角色
    position: draft.position || draft.roleName,
    avatar: draft.avatar || AVATAR_OPTIONS[0],
    idCard: draft.idCard?.trim() || '',
    phone: draft.phone?.trim() || '',
    address: draft.address?.trim() || '',
    gender: draft.gender || '',
    birthday: draft.birthday || '',
    joinDate: draft.joinDate || '',
    salary: Number(draft.salary) || 0,
    remark: draft.remark?.trim() || '',
    status: Number(draft.status) ?? 1,
    createTime: nowStr(),
  }
  users.unshift(record)
  saveUsers()
  return record
}

/** 编辑用户（用户名只读，更新其余资料字段） */
export function updateUser(id, draft) {
  const idx = users.findIndex((u) => u.id === id)
  if (idx === -1) return null
  users[idx] = {
    ...users[idx],
    realName: draft.realName?.trim() || '',
    roleName: draft.position || draft.roleName,
    position: draft.position || draft.roleName,
    avatar: draft.avatar || users[idx].avatar,
    idCard: draft.idCard?.trim() || '',
    phone: draft.phone?.trim() || '',
    address: draft.address?.trim() || '',
    gender: draft.gender || '',
    birthday: draft.birthday || '',
    joinDate: draft.joinDate || '',
    salary: Number(draft.salary) || 0,
    remark: draft.remark?.trim() || '',
    status: Number(draft.status) ?? 1,
  }
  saveUsers()
  return users[idx]
}

/**
 * 个人中心自助更新资料（用户本人更新自己的资料）
 * 说明：demo 版允许直接改；密码校验由页面层在提交前完成
 */
export function updateProfileByUsername(username, draft) {
  const idx = users.findIndex((u) => u.username === username)
  if (idx === -1) return null
  users[idx] = {
    ...users[idx],
    avatar: draft.avatar || users[idx].avatar,
    realName: draft.realName?.trim() || users[idx].realName,
    phone: draft.phone?.trim() || '',
    address: draft.address?.trim() || '',
    idCard: draft.idCard?.trim() || '',
    gender: draft.gender || '',
    birthday: draft.birthday || '',
    remark: draft.remark?.trim() || '',
  }
  saveUsers()
  return users[idx]
}

/** 删除用户 */
export function deleteUser(id) {
  users = users.filter((u) => u.id !== id)
  saveUsers()
}

/** 重置用户密码 */
export function resetUserPassword(id, newPassword) {
  const user = users.find((u) => u.id === id)
  if (!user) return false
  // 【临时】演示仅校验非空，实际重置由后端完成
  return newPassword && newPassword.length >= 6
}
