/**
 * 库存流水业务类型
 *
 * change_type 只区分「入 / 出」，无法说明这笔库存为什么变。
 * biz_type 用于区分采购、销售、退货、盘点、期初和手工调整。
 */
const STOCK_BIZ = Object.freeze({
  PURCHASE_IN: 1,
  SALE_OUT: 2,
  SALE_RETURN: 3,
  STOCKTAKE_GAIN: 4,
  STOCKTAKE_LOSS: 5,
  OPENING: 6,
  MANUAL_ADJUST: 7,
});

const STOCK_BIZ_LABELS = Object.freeze({
  1: '采购入库',
  2: '销售出库',
  3: '销售退货',
  4: '盘点盘盈',
  5: '盘点盘亏',
  6: '期初入库',
  7: '手工调整',
});

const STOCK_BIZ_VALUES = Object.freeze(Object.keys(STOCK_BIZ_LABELS).map(Number));

module.exports = { STOCK_BIZ, STOCK_BIZ_LABELS, STOCK_BIZ_VALUES };
