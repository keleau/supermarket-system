/**
 * 操作日志接口（仅管理员）
 */
import { get } from '../request'

export function getOperationLogList(params) {
  return get('/operation-log/list', params)
}
