/**
 * 销售退货单（整单退货 / 红字冲销）纯函数工具
 *
 * 状态流转：0 待确认 → 1 已确认（回补库存 + 冲减营收）/ 2 已拒绝 / 3 已取消
 * 只有「待确认」状态可以被确认、拒绝或取消。
 */
const { round2 } = require('./validate');

const RETURN_STATUS = Object.freeze({
  PENDING: 0,
  CONFIRMED: 1,
  REJECTED: 2,
  CANCELLED: 3,
});

const RETURN_STATUS_LABELS = Object.freeze({
  0: '待确认',
  1: '已确认',
  2: '已拒绝',
  3: '已取消',
});

const RETURN_STATUS_VALUES = Object.freeze(
  Object.keys(RETURN_STATUS_LABELS).map(Number)
);

/** 待确认的退货单才能被确认 */
function canConfirm(status) {
  return Number(status) === RETURN_STATUS.PENDING;
}

/** 待确认的退货单才能被拒绝 */
function canReject(status) {
  return Number(status) === RETURN_STATUS.PENDING;
}

/**
 * 待确认的退货单才能取消：
 * 申请人可取消自己的申请，管理员可取消任意申请。
 */
function canCancel(status, { isAdmin = false, isOwner = false } = {}) {
  if (Number(status) !== RETURN_STATUS.PENDING) return false;
  return Boolean(isAdmin || isOwner);
}

/**
 * 由销售明细生成退货明细快照。
 * 金额优先取原销售行的成交金额，避免二次计算产生尾差；
 * 缺失时退回「售价 × 数量」。
 */
function buildReturnItems(saleItems) {
  return (saleItems || []).map((it) => {
    const quantity = Number(it.quantity) || 0;
    const salePrice = round2(it.salePrice);
    const amount = it.amount === null || it.amount === undefined
      ? round2(salePrice * quantity)
      : round2(it.amount);

    return {
      productId: it.productId,
      productName: it.productName || '',
      categoryName: it.categoryName || '',
      quantity,
      salePrice,
      costPrice: it.costPrice === null || it.costPrice === undefined ? 0 : it.costPrice,
      amount,
    };
  });
}

/** 汇总退货单总件数与冲减营收金额 */
function calcReturnTotals(items) {
  const list = items || [];
  return {
    totalQuantity: list.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
    totalAmount: round2(
      list.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
    ),
  };
}

module.exports = {
  RETURN_STATUS,
  RETURN_STATUS_LABELS,
  RETURN_STATUS_VALUES,
  canConfirm,
  canReject,
  canCancel,
  buildReturnItems,
  calcReturnTotals,
};
