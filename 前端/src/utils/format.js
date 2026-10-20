/**
 * 通用格式化工具（销售模块页面共用，避免重复定义）
 */

/** 保留两位小数（金额计算防浮点误差） */
export function round2(value) {
  return Math.round(value * 100) / 100
}

/** 金额格式化：千分位 + 固定两位小数 */
export function money(value) {
  return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 整数千分位格式化 */
export function formatInt(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

/** 毛利率（0-1 小数 → "38.6%"；销售额为 0 时返回 "0.0%"） */
export function rateText(profit, saleAmount) {
  if (!saleAmount) return '0.0%'
  return `${((profit / saleAmount) * 100).toFixed(1)}%`
}
