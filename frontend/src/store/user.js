/**
 * 用户登录态管理（Pinia）
 *
 * 后端权限模型：
 * - role         'admin' | 'operator' —— 管理员兜底判断
 * - position     中文职位（管理员/仓管/收银员/后勤/采购/会计）
 * - permissions  后端按职位下发的权限码数组（'*' 表示全部），
 *                路由守卫、菜单和按钮统一用它判断
 *
 * 登录态持久化到 localStorage，刷新页面不丢失。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/modules/auth'
import { PROFILE_KEY, TOKEN_KEY } from '@/api/request'

/** 管理员角色标识（与后端 role 字段一致） */
export const ROLE_ADMIN = 'admin'

/** 职位字典（用户管理 / 个人中心共用的下拉选项） */
export const POSITIONS = ['管理员', '仓管', '收银员', '后勤', '采购', '会计']

/** 从 localStorage 恢复上次登录的用户资料 */
function loadProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    /* 数据损坏时按未登录处理 */
  }
  return {}
}

export const useUserStore = defineStore('user', () => {
  const saved = loadProfile()

  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const role = ref(saved.role || '')
  const position = ref(saved.position || '')
  const permissions = ref(Array.isArray(saved.permissions) ? saved.permissions : [])
  /** 本次页面加载是否已从后端刷新过用户信息（避免沿用旧权限缓存） */
  const hydrated = ref(false)
  const username = ref(saved.username || '')
  const realName = ref(saved.realName || '')
  const avatar = ref(saved.avatar || '')
  const phone = ref(saved.phone || '')

  /** 是否为管理员（决定管理员专属菜单与按钮的显隐） */
  const isAdmin = computed(() => role.value === ROLE_ADMIN)

  /** 是否拥有某个权限码（'*' 视为全部权限） */
  function can(permission) {
    return permissions.value.includes('*') || permissions.value.includes(permission)
  }

  /** 是否拥有任意一个权限码 */
  function canAny(list = []) {
    if (!list || list.length === 0) return true
    return permissions.value.includes('*') || list.some((p) => permissions.value.includes(p))
  }

  /** 顶部展示名：优先姓名，其次账号 */
  const displayName = computed(() => realName.value || username.value || '未命名用户')

  /** 持久化当前用户资料 */
  function persistProfile() {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        role: role.value,
        position: position.value,
        permissions: permissions.value,
        username: username.value,
        realName: realName.value,
        avatar: avatar.value,
        phone: phone.value,
      }),
    )
  }

  /** 用接口返回的用户字段刷新本地状态 */
  function applyUser(data) {
    if (data.role !== undefined) role.value = data.role
    if (data.position !== undefined) position.value = data.position
    if (Array.isArray(data.permissions)) permissions.value = data.permissions
    if (data.username !== undefined) username.value = data.username
    if (data.realName !== undefined) realName.value = data.realName
    if (data.avatar !== undefined) avatar.value = data.avatar || ''
    if (data.phone !== undefined) phone.value = data.phone || ''
    hydrated.value = true
    persistProfile()
  }

  /**
   * 登录：POST /api/user/login
   * 成功后写入 token 与用户资料
   */
  async function login(payload) {
    const data = await authApi.login(payload)
    token.value = data.token
    localStorage.setItem(TOKEN_KEY, data.token)
    applyUser(data)
    return data
  }

  /** 拉取当前用户信息（刷新页面后用 token 恢复/校正登录态） */
  async function fetchUserInfo() {
    const info = await authApi.getUserInfo()
    applyUser(info)
    return info
  }

  /** 退出登录：通知后端使 token 失效，并清空本地登录态 */
  async function logout() {
    try {
      await authApi.logout()
    } finally {
      // 即使接口异常也要保证本地状态被清理
      resetLocalState()
    }
  }

  /** 仅清理本地登录态（登录失效 401 时使用） */
  function resetLocalState() {
    token.value = ''
    role.value = ''
    position.value = ''
    permissions.value = []
    hydrated.value = false
    username.value = ''
    realName.value = ''
    avatar.value = ''
    phone.value = ''
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PROFILE_KEY)
  }

  return {
    token,
    role,
    position,
    permissions,
    hydrated,
    username,
    realName,
    avatar,
    phone,
    isAdmin,
    can,
    canAny,
    displayName,
    login,
    fetchUserInfo,
    applyUser,
    logout,
    resetLocalState,
  }
})
