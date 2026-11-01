/**
 * 销售退货单（独立整单退货 / 红字）接口
 *
 * - GET  /api/sale/return/list        退货单分页
 * - GET  /api/sale/return/:id         退货单详情（含明细）
 * - POST /api/sale/return             发起整单退货申请 { saleNo, remark? }
 * - POST /api/sale/return/:id/confirm 确认退货（仅管理员）
 * - POST /api/sale/return/:id/reject  拒绝退货（仅管理员）
 * - POST /api/sale/return/:id/cancel  取消申请（申请人或管理员）
 */
import { get, post } from '../request'

export function getSaleReturnList(params) {
  return get('/sale/return/list', params)
}

export function getSaleReturnDetail(id) {
  return get(`/sale/return/${id}`)
}

export function createSaleReturn(data) {
  return post('/sale/return', data)
}

export function confirmSaleReturn(id) {
  return post(`/sale/return/${id}/confirm`)
}

export function rejectSaleReturn(id) {
  return post(`/sale/return/${id}/reject`)
}

export function cancelSaleReturn(id) {
  return post(`/sale/return/${id}/cancel`)
}
