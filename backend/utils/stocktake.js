/**
 * 盘点差异计算（纯函数，便于单测）
 * diffQty = 实盘数 - 账面数
 * diffAmount = diffQty × 成本价（保留两位）
 */
const { round2 } = require('./validate');

function calcDiff(actualQty, bookQty, costPrice) {
  const actual = Number(actualQty) || 0;
  const book = Number(bookQty) || 0;
  const cost = Number(costPrice) || 0;
  const diffQty = actual - book;
  return { diffQty, diffAmount: round2(diffQty * cost) };
}

module.exports = { calcDiff };
