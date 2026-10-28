/**
 * 库存盘点接口
 *
 * - GET  /api/stocktake/list        盘点单分页
 * - GET  /api/stocktake/:id         盘点单详情（含明细）
 * - POST /api/stocktake             生成盘点任务 { categoryId?, remark? }
 * - PUT  /api/stocktake/:id/items   保存实盘 { items: [{ id, actualQty, reason }] }
 * - POST /api/stocktake/:id/submit  提交
 * - POST /api/stocktake/:id/audit   审核（仅管理员）
 * - POST /api/stocktake/:id/cancel  取消
 */
import { get, post, put } from '../request'

export function getStocktakeList(params) {
  return get('/stocktake/list', params)
}

export function getStocktakeDetail(id) {
  return get(`/stocktake/${id}`)
}

export function createStocktake(data) {
  return post('/stocktake', data)
}

export function updateStocktakeItems(id, data) {
  return put(`/stocktake/${id}/items`, data)
}

export function submitStocktake(id) {
  return post(`/stocktake/${id}/submit`)
}

export function auditStocktake(id) {
  return post(`/stocktake/${id}/audit`)
}

export function cancelStocktake(id) {
  return post(`/stocktake/${id}/cancel`)
}
