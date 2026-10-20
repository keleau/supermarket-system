/**
 * axios 统一封装
 * - baseURL 统一为 /api（经 vite 代理转发到 Node 后端）
 * - 请求拦截器：自动在请求头携带 token
 * - 响应拦截器：统一解包响应体；业务失败 / 网络异常统一弹出后端返回的错误信息
 *
 * 【统一响应体规范】（Node 后端需遵守）
 * { code: number, msg: string, data: any }
 * code === 200 表示成功；401 表示登录失效；其余非 200 直接弹窗展示后端 msg
 */
import axios from 'axios'
import { ElMessage } from 'element-plus'

/** localStorage 中 token 的存储键 */
export const TOKEN_KEY = 'market_token'

/** localStorage 中登录用户资料的存储键（与 store/user.js 共用） */
export const PROFILE_KEY = 'market_profile'

/** 登录页路径（避免在登录页重复跳转） */
const LOGIN_PATH = '/login'

const service = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json;charset=utf-8',
  },
})

/* -------------------- 请求拦截器：携带 token -------------------- */
service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

/* -------------------- 响应拦截器：统一错误处理 -------------------- */
service.interceptors.response.use(
  (response) => {
    const res = response.data
    // 调用方可通过 config.silent 关闭自动弹窗（如登录页的后端连通性探测）
    const silent = response.config?.silent === true

    // 非标准结构（如直接返回文件流），原样抛出由调用方处理
    if (res === null || typeof res.code === 'undefined') {
      return response
    }

    // 业务成功：直接把 data 返回给调用方
    if (res.code === 200) {
      return res.data
    }

    // 401：登录态失效，清理令牌并跳转登录页
    if (res.code === 401) {
      handleTokenExpired()
      return Promise.reject(new Error(res.msg || '登录已失效，请重新登录'))
    }

    // 其他业务失败：用后端返回的 msg 提示（如"出库数量大于库存数量"）
    if (!silent) {
      ElMessage({
        message: res.msg || '请求失败，请稍后重试',
        type: 'error',
        grouping: true,
        duration: 2600,
      })
    }
    return Promise.reject(new Error(res.msg || '请求失败'))
  },
  (error) => {
    // HTTP 层错误（网络断开 / 后端未启动 / 500 等）
    const silent = error?.config?.silent === true
    const status = error?.response?.status
    if (status === 401) {
      handleTokenExpired()
    } else if (silent) {
      // 静默模式：交回调用方自行处理
    } else if (error?.code === 'ECONNABORTED') {
      ElMessage.error('请求超时，请检查网络后重试')
    } else if (!error?.response) {
      ElMessage.error('网络异常，无法连接到服务器')
    } else {
      ElMessage.error(error.response?.data?.msg || `服务异常（${status}）`)
    }
    return Promise.reject(error)
  },
)

/** 登录失效统一处理：清除本地登录态并跳转登录页 */
function handleTokenExpired() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(PROFILE_KEY)
  ElMessage.error('登录已失效，请重新登录')
  if (window.location.pathname !== LOGIN_PATH) {
    window.location.href = `${LOGIN_PATH}?redirect=${encodeURIComponent(window.location.pathname)}`
  }
}

/* -------------- 对外暴露的请求方法（响应拦截器已解包，直接返回 data） -------------- */

export function get(url, params, config) {
  return service.get(url, { params, ...config })
}

export function post(url, data, config) {
  return service.post(url, data, config)
}

export function put(url, data, config) {
  return service.put(url, data, config)
}

export function patch(url, data, config) {
  return service.patch(url, data, config)
}

export function del(url, config) {
  return service.delete(url, config)
}

export default service
