/**
 * 销售接口
 * - GET  /api/sale/record/list   分页，入参 { pageNum, pageSize, saleNo?, operator?, payType?, startTime?, endTime? }
 * - GET  /api/sale/record/:id    详情（含 items 明细，明细为下单时的快照）
 * - POST /api/sale/record        收银结账，入参 { items:[{ productId, quantity, salePrice? }], payType?, remark? }
 *                                后端在同一事务内完成：写单 + 明细 + 扣库存 + 写出库流水
 * - POST /api/sale/record/return 整单退货（仅管理员，回补库存）
 * - POST /api/sale/record/void   单据作废（仅管理员，不恢复库存）
 * - GET  /api/sale/item/list     按商品查销售明细，入参 { productId, pageNum?, pageSize? }
 * - GET  /api/sale/statistics    聚合统计，入参 { startTime?, endTime?, categoryId?, productName? }
 */
import { get, post } from '../request'

/* ---------------- 销售记录 ---------------- */

/** 销售记录分页列表 */
export function getSaleRecordList(params) {
  return get('/sale/record/list', params)
}

/** 销售记录详情（含商品明细） */
export function getSaleRecordDetail(id) {
  return get(`/sale/record/${id}`)
}

/** 提交销售（收银结账） */
export function createSaleRecord(data) {
  return post('/sale/record', data)
}

/** 销售退货（整单，仅管理员） */
export function returnSaleRecord(saleNo) {
  return post('/sale/record/return', { saleNo })
}

/** 销售作废（仅管理员，不恢复库存） */
export function voidSaleRecord(saleNo) {
  return post('/sale/record/void', { saleNo })
}

/* ---------------- 明细与统计 ---------------- */

/** 按商品查销售明细（商品详情「销售历史」） */
export function getSaleItemList(params) {
  return get('/sale/item/list', params)
}

/** 销售统计（区间汇总 / 每日趋势 / 分类占比 / 商品明细） */
export function getSaleStatistics(params) {
  return get('/sale/statistics', params)
}
