/**
 * 采购管理接口
 *
 * - GET  /api/purchase/list        采购单分页
 * - GET  /api/purchase/:id         采购单详情（含明细）
 * - POST /api/purchase             新建草稿 { supplierId, items: [{ productId, quantity, price }], remark? }
 * - PUT  /api/purchase/:id         编辑草稿
 * - POST /api/purchase/:id/submit  提交
 * - POST /api/purchase/:id/receive 确认收货入库（仓管/管理员）
 * - POST /api/purchase/:id/cancel  取消
 * - POST /api/purchase/:id/pay     登记付款（仅管理员）
 */
import { get, post, put } from '../request'

export function getPurchaseList(params) {
  return get('/purchase/list', params)
}

export function getPurchaseDetail(id) {
  return get(`/purchase/${id}`)
}

export function createPurchase(data) {
  return post('/purchase', data)
}

export function updatePurchase(id, data) {
  return put(`/purchase/${id}`, data)
}

export function submitPurchase(id) {
  return post(`/purchase/${id}/submit`)
}

export function receivePurchase(id) {
  return post(`/purchase/${id}/receive`)
}

export function cancelPurchase(id) {
  return post(`/purchase/${id}/cancel`)
}

export function payPurchase(id, data) {
  return post(`/purchase/${id}/pay`, data)
}
