/**
 * 销售退货单领域服务
 *
 * 把「发起整单退货申请」和「管理员确认」抽成可复用函数，
 * 供独立退货单接口与兼容接口 /api/sale/record/return 共用。
 *
 * 锁顺序约定（避免确认与作废互相死锁）：
 *   先锁 sale_record 行，再锁 sale_return_order 行，最后按明细顺序锁 product 行。
 */
const saleReturnModel = require('../models/saleReturnModel');
const saleModel = require('../models/saleModel');
const productModel = require('../models/productModel');
const stockModel = require('../models/stockModel');
const { BizError } = require('../utils/result');
const { STOCK_BIZ } = require('../utils/stockBiz');
const { hasPermission } = require('../utils/permissions');
const { writeLog } = require('../utils/operationLog');
const { operatorName } = require('../utils/operator');
const { formatCompact } = require('../utils/date');
const {
  RETURN_STATUS,
  buildReturnItems,
  calcReturnTotals,
} = require('../utils/saleReturn');

/**
 * 回补库存并写流水（退货确认 / 销售作废共用）
 * @param {object} opts
 * @param {Array<{productId:number, quantity:number}>} opts.items
 * @param {number} opts.bizType STOCK_BIZ.SALE_RETURN / STOCK_BIZ.VOID_RESTORE
 * @param {string} opts.operator
 * @param {string} opts.remark
 */
async function restoreStock(conn, { items, bizType, operator, remark }) {
  // 统一按商品 id 升序加锁，和销售结账 / 采购收货保持一致的锁顺序
  const sortedItems = [...(items || [])].sort(
    (a, b) => Number(a.productId) - Number(b.productId)
  );

  for (const it of sortedItems) {
    const quantity = Number(it.quantity) || 0;
    if (quantity <= 0) continue;

    const product = await productModel.findByIdForUpdate(conn, it.productId);
    const beforeNum = product ? Number(product.stock_num) || 0 : 0;
    const afterNum = beforeNum + quantity;

    if (product) {
      await productModel.changeStock(conn, it.productId, quantity);
      // 退货 / 作废回补后库存恢复，原先因缺货下架的商品自动上架
      if (product.status === 0 && afterNum > 0) {
        await productModel.updateStatus(conn, it.productId, 1);
      }
    }

    await stockModel.insertLog(conn, {
      productId: it.productId,
      changeType: 1,
      bizType,
      quantity,
      beforeNum,
      afterNum,
      operator,
      remark,
    });
  }
}

/**
 * 发起整单退货申请（事务内调用）
 * 校验原销售单可退、没有进行中的退货单，并复制销售明细作为退货明细快照。
 * 此时不动库存、不改原单状态，需管理员确认后才生效。
 */
async function createReturnOrder(conn, req, { saleNo, remark = '' }) {
  // 锁原销售单：串行化同一单据的退货申请 / 作废操作
  const sale = await saleModel.findRecordBySaleNoForUpdate(conn, saleNo);
  if (!sale) throw new BizError('销售单据不存在');
  // 收银员只能为自己的销售单发起退货；管理员 / 会计等可看全部的角色不受限
  if (!hasPermission(req.user, 'sale:read:all') && sale.operator !== operatorName(req)) {
    throw new BizError('只能为自己的销售单发起退货', 403);
  }
  if (Number(sale.status) === 2) throw new BizError('该单据已退货');
  if (Number(sale.status) === 3) throw new BizError('该单据已作废，无法退货');

  const active = await saleReturnModel.findActiveBySaleRecordId(conn, sale.id);
  if (active) {
    throw new BizError(
      Number(active.status) === RETURN_STATUS.PENDING
        ? '该单据已有待确认的退货单'
        : '该单据已退货'
    );
  }

  const saleItems = await saleModel.findItemsByRecordId(sale.id, conn);
  if (!saleItems.length) throw new BizError('销售单据没有明细');

  const items = buildReturnItems(saleItems);
  const { totalQuantity, totalAmount } = calcReturnTotals(items);

  const returnNo = await saleReturnModel.generateReturnNo(conn, formatCompact(new Date()));
  const returnId = await saleReturnModel.createOrder(conn, {
    returnNo,
    saleRecordId: sale.id,
    saleNo: sale.sale_no,
    totalQuantity,
    totalAmount,
    operator: operatorName(req),
    remark,
  });
  await saleReturnModel.createItems(conn, returnId, items);

  await writeLog(conn, req, {
    module: 'sale',
    action: 'return_apply',
    bizNo: returnNo,
    afterStatus: RETURN_STATUS.PENDING,
    detail: `发起整单退货申请，原单 ${sale.sale_no}，${totalQuantity} 件，金额 ${totalAmount}`,
  });

  return { id: returnId, returnNo, saleNo: sale.sale_no, totalQuantity, totalAmount };
}

/**
 * 管理员确认退货（事务内调用）
 * 回补库存 → 原销售单置为已退货（统计口径自动剔除，即冲减营收）→ 退货单置为已确认。
 */
async function confirmReturnOrder(conn, req, returnId) {
  // 先读取单据拿到销售单 id，再按「销售单 → 退货单」的固定顺序加锁
  const preview = await saleReturnModel.findRawById(conn, returnId);
  if (!preview) throw new BizError('退货单不存在');

  const sale = await saleModel.findRecordByIdForUpdate(conn, preview.sale_record_id);
  if (!sale) throw new BizError('原销售单据不存在');

  const order = await saleReturnModel.findByIdForUpdate(conn, returnId);
  if (!order) throw new BizError('退货单不存在');
  if (Number(order.status) === RETURN_STATUS.CONFIRMED) throw new BizError('该退货单已确认');
  if (Number(order.status) !== RETURN_STATUS.PENDING) {
    throw new BizError('该退货单状态异常，无法确认');
  }
  if (Number(sale.status) === 2) throw new BizError('该销售单已退货');
  if (Number(sale.status) !== 1) throw new BizError('该销售单已作废，无法退货');

  const items = await saleReturnModel.findItems(conn, returnId);
  if (!items.length) throw new BizError('退货单没有明细');

  const operator = operatorName(req);
  await restoreStock(conn, {
    items,
    bizType: STOCK_BIZ.SALE_RETURN,
    operator,
    remark: `销售退货 ${order.return_no}（原单 ${order.sale_no}）`,
  });

  // 整单退货：原单退出一切营收统计，等同于按原金额冲减营收
  await saleModel.updateStatus(conn, sale.id, 2);

  const result = await saleReturnModel.confirmOrder(conn, returnId, operator);
  if (!result || result.affectedRows !== 1) {
    throw new BizError('退货确认失败，请刷新后重试');
  }

  await writeLog(conn, req, {
    module: 'sale',
    action: 'return_confirm',
    bizNo: order.return_no,
    beforeStatus: RETURN_STATUS.PENDING,
    afterStatus: RETURN_STATUS.CONFIRMED,
    detail: `确认整单退货，原单 ${order.sale_no}，${order.total_quantity} 件，冲减营收 ${order.total_amount}`,
  });

  return {
    id: returnId,
    returnNo: order.return_no,
    saleNo: order.sale_no,
    totalQuantity: order.total_quantity,
    totalAmount: order.total_amount,
  };
}

module.exports = {
  restoreStock,
  createReturnOrder,
  confirmReturnOrder,
};
