/**
 * 库存模块 · 临时演示数据
 * 【临时】后端接口未就绪前用于页面效果演示；
 * 后端完成后改为调用 src/api/modules/stock.js 的接口，删除本文件。
 *
 * 数据关系：
 * - 商品池复用销售模块 checkoutMock（同一套商品体系），出入库直接调用其 addStock / deductStock 联动库存
 * - 出入库流水为本文件维护的模块级单例 + localStorage 持久化
 */

import { checkoutProducts, addStock, deductStock } from '../sale/checkoutMock.js'

/* ---------------- 出入库流水 ---------------- */

/** 流水类型（与 types.js StockLogVO.changeType 契约一致：1 入库 2 出库） */
export const CHANGE_TYPES = {
  1: { label: '入库', tag: 'success' },
  2: { label: '出库', tag: 'warning' },
}

const LOG_KEY = 'market_stock_log'

function pad(n) {
  return String(n).padStart(2, '0')
}

function nowStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 演示流水模板（近 7 天，与商品池联动的基础数据） */
function buildSeedLogs() {
  const seed = [
    { productId: 1, changeType: 1, quantity: 120, day: 6, time: '09:30' },
    { productId: 2, changeType: 1, quantity: 60, day: 6, time: '10:05' },
    { productId: 3, changeType: 2, quantity: 40, day: 5, time: '14:20' },
    { productId: 4, changeType: 1, quantity: 80, day: 5, time: '11:15' },
    { productId: 5, changeType: 2, quantity: 35, day: 4, time: '16:40' },
    { productId: 6, changeType: 2, quantity: 52, day: 4, time: '17:10' },
    { productId: 7, changeType: 1, quantity: 100, day: 3, time: '08:50' },
    { productId: 8, changeType: 2, quantity: 30, day: 3, time: '15:25' },
    { productId: 9, changeType: 1, quantity: 45, day: 2, time: '10:40' },
    { productId: 10, changeType: 2, quantity: 28, day: 2, time: '18:05' },
    { productId: 11, changeType: 1, quantity: 36, day: 1, time: '09:15' },
    { productId: 12, changeType: 2, quantity: 12, day: 1, time: '13:50' },
    { productId: 13, changeType: 1, quantity: 55, day: 0, time: '08:35' },
    { productId: 14, changeType: 2, quantity: 22, day: 0, time: '16:10' },
    { productId: 15, changeType: 2, quantity: 18, day: 0, time: '19:20' },
  ]

  return seed.map((item, i) => {
    const product = checkoutProducts.find((p) => p.productId === item.productId)
    return {
      id: 2000 + i,
      productId: item.productId,
      productName: product?.productName || '未知商品',
      changeType: item.changeType,
      quantity: item.quantity,
      operator: 'admin',
      remark: '',
      createTime: `${daysAgo(item.day)} ${item.time}`,
    }
  })
}

function loadLogs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY) || 'null')
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* 数据损坏按种子数据处理 */
  }
  return buildSeedLogs()
}

let logs = loadLogs()

function saveLogs() {
  localStorage.setItem(LOG_KEY, JSON.stringify(logs))
}

/** 取全部流水（按时间倒序，最新在前） */
export function getAllLogs() {
  return [...logs].sort((a, b) => (a.createTime < b.createTime ? 1 : -1))
}

/** 操作人下拉选项（含当前登录用户名，去重） */
export function getOperatorOptions() {
  return [...new Set(logs.map((l) => l.operator))]
}

/** 添加一条流水记录（内部使用，同时更新商品库存） */
export function addLog(record) {
  logs.push(record)
  saveLogs()
}

/** 重置为演示数据（答辩前可重置） */
export function resetLogs() {
  logs = buildSeedLogs()
  saveLogs()
}

/* ---------------- 入库 ---------------- */

/**
 * 提交入库
 * @param {{ productId: number, quantity: number, supplierName?: string, inboundPrice?: number, remark?: string }} draft
 */
export function createInbound(draft) {
  const product = checkoutProducts.find((p) => p.productId === draft.productId)
  if (!product) throw new Error('商品不存在')

  const id = Math.max(0, ...logs.map((l) => l.id)) + 1
  const record = {
    id,
    productId: draft.productId,
    productName: product.productName,
    changeType: 1,
    quantity: draft.quantity,
    operator: draft.operator || 'admin',
    supplierName: draft.supplierName || '',
    inboundPrice: Number(draft.inboundPrice) || product.costPrice,
    remark: draft.remark || '',
    createTime: nowStr(),
  }

  addLog(record)
  addStock(draft.productId, draft.quantity)
  return record
}

/* ---------------- 出库 ---------------- */

/**
 * 提交出库
 * 库存不足时抛错（页面层 catch 后弹窗），成功则扣减库存并生成流水
 * @param {{ productId: number, quantity: number, remark?: string }} draft
 */
export function createOutbound(draft) {
  const product = checkoutProducts.find((p) => p.productId === draft.productId)
  if (!product) throw new Error('商品不存在')
  if (draft.quantity > product.stockNum) {
    throw new Error(`出库数量大于当前库存（${product.stockNum}）`)
  }

  const id = Math.max(0, ...logs.map((l) => l.id)) + 1
  const record = {
    id,
    productId: draft.productId,
    productName: product.productName,
    changeType: 2,
    quantity: draft.quantity,
    operator: draft.operator || 'admin',
    remark: draft.remark || '',
    createTime: nowStr(),
  }

  addLog(record)
  deductStock(draft.productId, draft.quantity)
  return record
}

/* ---------------- 库存统计 ---------------- */

/** 盘点状态（与 types.js StockWarnVO.warnStatus 契约一致：1 低于预警值 2 已缺货） */
export const WARN_STATUS = {
  1: { label: '低于预警值', tag: 'warning' },
  2: { label: '已缺货', tag: 'danger' },
}

/**
 * 库存统计（页面顶部概览指标 + 图表）
 * 全部指标按当前商品池实时库存聚合，出入库后联动刷新
 */
export function getStockStatistics() {
  const products = checkoutProducts
  const totalStock = products.reduce((sum, p) => sum + p.stockNum, 0)
  const warnProducts = products.filter((p) => p.stockNum > 0 && p.stockNum < 10)
  const outProducts = products.filter((p) => p.stockNum <= 0)
  const pendingProducts = products.filter((p) => p.stockNum < 10)
  const totalValue = products.reduce((sum, p) => sum + p.costPrice * p.stockNum, 0)
  return {
    totalStock,
    warnProductCount: warnProducts.length,
    outProductCount: outProducts.length,
    pendingProductCount: pendingProducts.length,
    totalStockValue: totalValue,
  }
}
