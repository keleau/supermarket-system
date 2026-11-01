/**
 * 采购单纯逻辑：金额计算与状态判断
 */
const { round2 } = require('./validate');

const PURCHASE_STATUS = Object.freeze({
  DRAFT: 0,
  SUBMITTED: 1,
  RECEIVED: 2,
  CANCELLED: 3,
});

function calcItemAmount(quantity, price) {
  return round2((Number(quantity) || 0) * (Number(price) || 0));
}

function calcTotal(items = []) {
  return round2(items.reduce((sum, item) => sum + calcItemAmount(item.quantity, item.price), 0));
}

function canEdit(status) {
  return status === PURCHASE_STATUS.DRAFT;
}

function canSubmit(status) {
  return status === PURCHASE_STATUS.DRAFT;
}

function canReceive(status) {
  return status === PURCHASE_STATUS.SUBMITTED;
}

function canCancel(status) {
  return status === PURCHASE_STATUS.DRAFT || status === PURCHASE_STATUS.SUBMITTED;
}

/** 0 未付款 / 1 部分付款 / 2 已付清（应付为 0 时返回 0） */
function payStatus(payableAmount, paidAmount) {
  const payable = Number(payableAmount) || 0;
  const paid = Number(paidAmount) || 0;
  if (payable <= 0 || paid <= 0) return 0;
  return paid < payable ? 1 : 2;
}

module.exports = {
  PURCHASE_STATUS,
  calcItemAmount,
  calcTotal,
  canEdit,
  canSubmit,
  canReceive,
  canCancel,
  payStatus,
};
