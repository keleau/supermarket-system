/**
 * 库存流水字典
 * 与后端 utils/stockBiz.js 的 change_type / biz_type 契约保持一致。
 */

export const STOCK_CHANGE_TYPES = {
  1: { label: '入库', tag: 'success' },
  2: { label: '出库', tag: 'warning' },
}

export const STOCK_BIZ_TYPES = {
  1: { label: '采购入库', tag: 'success' },
  2: { label: '销售出库', tag: 'warning' },
  3: { label: '销售退货', tag: 'info' },
  4: { label: '盘点盘盈', tag: 'success' },
  5: { label: '盘点盘亏', tag: 'danger' },
  6: { label: '期初入库', tag: 'success' },
  7: { label: '手工调整', tag: 'info' },
  8: { label: '作废回补', tag: 'danger' },
}

/** 下拉筛选项：按业务类型编号升序 */
export const STOCK_BIZ_OPTIONS = Object.entries(STOCK_BIZ_TYPES).map(([value, meta]) => ({
  value: Number(value),
  label: meta.label,
}))

export function changeMeta(changeType) {
  return STOCK_CHANGE_TYPES[changeType] || { label: '未知', tag: 'info' }
}

export function bizMeta(bizType) {
  return STOCK_BIZ_TYPES[bizType] || { label: '其他', tag: 'info' }
}
