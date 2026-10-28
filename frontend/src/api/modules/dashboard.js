/**
 * 运营总览（首页仪表盘）接口契约
 * 所有统计口径、金额/利润计算均由 Node 后端完成，前端只做展示。
 */
import { get } from '../request'

/* ---------------- 顶部核心指标 ---------------- */

/**
 * 顶部指标聚合（一次返回，减少首屏请求）
 * 返回 DashboardOverview：今日销售额及环比、本月利润及环比、
 * 本月收货总数量、商品总种类、库存预警数量、待盘点数量，以及两个迷你趋势线序列
 */
export function getDashboardOverview() {
  return get('/dashboard/overview')
}

/* ---------------- 图表区 ---------------- */

/** 近 N 日销售金额趋势（面积图），入参：{ days?: number } 默认 7，返回 [{ date, amount }] */
export function getSaleTrend(params) {
  return get('/dashboard/sale-trend', params)
}

/** 库存余量 TOP5（柱状图），返回 [{ productName, stockNum }] */
export function getStockTop() {
  return get('/dashboard/stock-top')
}

/** 各商品分类库存占比（环形图），返回 [{ categoryName, stockNum }] */
export function getCategoryStock() {
  return get('/dashboard/category-stock')
}

/** 热销商品 TOP5（横向条形图），返回 [{ productName, saleAmount, saleQuantity }] */
export function getHotProducts() {
  return get('/dashboard/hot-products')
}

/** 供应商进货金额排行（仅管理员），入参 { days?, limit? } */
export function getSupplierRanking(params) {
  return get('/dashboard/supplier-ranking', params)
}
