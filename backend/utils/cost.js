/**
 * 移动加权平均成本
 *
 * 新均价 = (入库前库存 × 原均价 + 入库数量 × 入库单价) / (入库前库存 + 入库数量)
 *
 * 口径约定：
 * - 首次入库 / 入库前库存为 0：新均价直接取本次入库价
 * - 未提供入库价：维持原均价
 * - 销售、销售退货、盘盈盘亏不改变均价（销售按当时的均价快照成本）
 */
const { round4 } = require('./validate');
const { BizError } = require('./result');

function movingAverageCost({ stockNum, currentCost, inboundQty, inboundPrice }) {
  const stock = Number(stockNum) || 0;
  const current = Number(currentCost) || 0;
  const qty = Number(inboundQty) || 0;
  const price = inboundPrice === null || inboundPrice === undefined ? null : Number(inboundPrice);

  if (price === null || !Number.isFinite(price) || qty <= 0) return round4(current);
  if (stock <= 0) return round4(price);

  return round4((stock * current + qty * price) / (stock + qty));
}

/**
 * 商品编辑接口不允许手工修改成本。
 * 旧版前端提交时可能带上未修改的 costPrice，这里允许“原值”通过，只拦截真正的改动。
 */
function assertCostUnchanged(inputCost, currentCost) {
  if (inputCost === null || inputCost === undefined) return;
  if (round4(inputCost) !== round4(currentCost)) {
    throw new BizError('成本价由入库自动计算，不能手工修改');
  }
}

module.exports = { movingAverageCost, assertCostUnchanged };
