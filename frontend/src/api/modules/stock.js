/**
 * 库存接口
 * 库存增减、库存是否充足、流水生成等核心逻辑全部由后端在事务内完成，
 * 前端只负责提交与展示，失败时由 request 拦截器统一弹出后端 msg。
 *
 * - GET  /api/stock/inbound/list   入库明细分页（已固定 changeType=1）
 * - POST /api/stock/inbound        提交入库 { productId, quantity, inboundPrice?, supplierId?, remark? }
 * - GET  /api/stock/outbound/list  出库明细分页（已固定 changeType=2）
 * - POST /api/stock/outbound       提交出库 { productId, quantity, remark? }
 * - GET  /api/stock/warn/list      预警商品（无分页）{ productName?, warnStatus? }
 * - GET  /api/stock/log/list       全部出入库流水（分页）{ changeType?, productId?, ... }
 * - GET  /api/stock/statistics     库存统计（无参数，实时聚合）
 */
import { get, post } from '../request'

/* ---------------- 入库 ---------------- */

/** 入库明细分页列表 */
export function getInboundList(params) {
  return get('/stock/inbound/list', params)
}

/** 提交入库（后端增加库存、必要时自动上架，并生成流水） */
export function createInbound(data) {
  return post('/stock/inbound', data)
}

/* ---------------- 出库 ---------------- */

/** 出库明细分页列表 */
export function getOutboundList(params) {
  return get('/stock/outbound/list', params)
}

/** 提交出库（库存不足时后端返回错误 msg，整个操作回滚） */
export function createOutbound(data) {
  return post('/stock/outbound', data)
}

/* ---------------- 预警 / 流水 / 统计 ---------------- */

/** 库存预警商品列表（无分页，按库存升序） */
export function getWarnList(params) {
  return get('/stock/warn/list', params)
}

/** 出入库流水分页列表 */
export function getStockLogList(params) {
  return get('/stock/log/list', params)
}

/** 库存统计概览（库存总量 / 预警数 / 缺货数 / 待处理数 / 库存货值） */
export function getStockStatistics() {
  return get('/stock/statistics')
}

/** 积压商品：当前有库存、近 N 天没有正常销售 */
export function getSlowMoving(params) {
  return get('/stock/slow-moving', params)
}
