/**
 * 入库公共逻辑
 *
 * 手工入库和采购收货必须走同一套库存 + 加权成本 + 流水逻辑，
 * 否则两边的成本口径迟早会分叉。
 *
 * 调用前提：product 必须是当前事务内 SELECT ... FOR UPDATE 锁定的商品行。
 */
const productModel = require('../models/productModel');
const stockModel = require('../models/stockModel');
const { movingAverageCost } = require('../utils/cost');

async function applyInbound(conn, {
  product,
  quantity,
  inboundPrice = null,
  bizType,
  supplierName = '',
  operator = '',
  remark = '',
}) {
  const beforeNum = Number(product.stock_num) || 0;
  const afterNum = beforeNum + quantity;

  await productModel.changeStock(conn, product.id, quantity);

  let nextCost = Number(product.cost_price) || 0;
  if (inboundPrice !== null && inboundPrice !== undefined) {
    nextCost = movingAverageCost({
      stockNum: beforeNum,
      currentCost: product.cost_price,
      inboundQty: quantity,
      inboundPrice,
    });
    await productModel.updateCostPrice(conn, product.id, nextCost);
  }

  // 原为缺货下架的商品，入库后自动上架
  if (beforeNum <= 0 && product.status === 0) {
    await productModel.updateStatus(conn, product.id, 1);
  }

  const log = await stockModel.insertLog(conn, {
    productId: product.id,
    changeType: 1,
    bizType,
    quantity,
    beforeNum,
    afterNum,
    supplierName,
    inboundPrice,
    operator,
    remark,
  });

  return { logId: log.id, beforeNum, afterNum, nextCost };
}

module.exports = { applyInbound };
