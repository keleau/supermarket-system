/**
 * 采购 Controller（简单版）
 *
 * 状态：0 草稿 → 1 已提交 → 2 已入库 / 3 已取消
 * - 草稿可改、可提交、可取消；提交后不可改
 * - 仓管/管理员确认入库：事务内加库存、更新加权成本、写采购流水、生成应付
 * - 应付金额挂在采购单上，支持登记付款（不做独立付款流水）
 */
const purchaseModel = require('../models/purchaseModel');
const supplierModel = require('../models/supplierModel');
const productModel = require('../models/productModel');
const { transaction } = require('../db/pool');
const { BizError, ok, page } = require('../utils/result');
const {
  toStr, toInt, toNum, round2, paging, assert, assertDateRange, startOfDay, endOfDay,
} = require('../utils/validate');
const { formatCompact } = require('../utils/date');
const { calcItemAmount, calcTotal } = require('../utils/purchase');
const { maskPurchaseFinance } = require('../utils/finance');
const { STOCK_BIZ } = require('../utils/stockBiz');
const { applyInbound } = require('../services/inventoryService');
const { writeLog } = require('../utils/operationLog');

const STATUS_VALUES = [0, 1, 2, 3];
const MAX_RETRY = 3;

function operatorName(req) {
  return req.user.realName || req.user.username || '';
}

function assertOwner(order, req) {
  if (order.operator !== operatorName(req) && req.user.role !== 'admin') {
    throw new BizError('只能操作自己的采购单', 403);
  }
}

async function buildPayload(body) {
  const b = body || {};

  const supplierId = toInt(b.supplierId);
  assert(supplierId !== null, '请选择供应商');
  const supplier = await supplierModel.findById(supplierId);
  assert(supplier, '供应商不存在');

  const rawItems = Array.isArray(b.items) ? b.items : [];
  assert(rawItems.length > 0, '请添加采购明细');
  assert(rawItems.length <= 100, '单张采购单最多 100 条明细');

  const items = [];
  const productIds = new Set();

  for (const raw of rawItems) {
    const productId = toInt(raw.productId);
    assert(productId !== null, '采购明细缺少商品');
    assert(!productIds.has(productId), '同一商品不能重复添加');
    productIds.add(productId);

    const quantity = toInt(raw.quantity);
    assert(quantity !== null && quantity > 0, '采购数量必须是大于 0 的整数');

    const price = round2(toNum(raw.price, 0));
    assert(price >= 0, '采购单价不能为负');

    const product = await productModel.findById(productId);
    assert(product, `商品 id ${productId} 不存在`);

    items.push({
      productId,
      productName: product.productName,
      unit: product.unit || '个',
      quantity,
      price,
      amount: calcItemAmount(quantity, price),
    });
  }

  return {
    supplierId,
    supplierName: supplier.supplierName,
    items,
    totalAmount: calcTotal(items),
    remark: toStr(b.remark).slice(0, 200),
  };
}

/* ------------------------------------------------------------------ */
/* 4.11.1 采购单分页列表                                                 */
/* ------------------------------------------------------------------ */
async function list(req, res) {
  const { pageNum, pageSize, offset } = paging(req.query);
  const status = toInt(req.query.status, null);
  if (status !== null) assert(STATUS_VALUES.includes(status), '采购状态取值不合法');

  const startDate = toStr(req.query.startTime);
  const endDate = toStr(req.query.endTime);
  assertDateRange(startDate, endDate);

  const result = await purchaseModel.list({
    pageNum,
    pageSize,
    offset,
    orderNo: toStr(req.query.orderNo) || null,
    supplierId: toInt(req.query.supplierId, null),
    status,
    startTime: startOfDay(startDate),
    endTime: endOfDay(endDate),
  });

  return ok(res, page(maskPurchaseFinance(result.list, req.user), result.total, pageNum, pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.11.2 采购单详情                                                     */
/* ------------------------------------------------------------------ */
async function detail(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少采购单 id');

  const order = await purchaseModel.findById(id);
  assert(order, '采购单不存在');

  return ok(res, maskPurchaseFinance(order, req.user));
}

/* ------------------------------------------------------------------ */
/* 4.11.3 新建采购草稿                                                   */
/* ------------------------------------------------------------------ */
async function create(req, res) {
  const payload = await buildPayload(req.body);
  const operator = operatorName(req);

  for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1) {
    try {
      const created = await transaction(async (conn) => {
        const orderNo = await purchaseModel.generateOrderNo(conn, formatCompact(new Date()));
        const orderId = await purchaseModel.createOrder(conn, {
          orderNo,
          supplierId: payload.supplierId,
          supplierName: payload.supplierName,
          totalAmount: payload.totalAmount,
          operator,
          remark: payload.remark,
        });
        await purchaseModel.createItems(conn, orderId, payload.items);

        await writeLog(conn, req, {
          module: 'purchase',
          action: 'create',
          bizNo: orderNo,
          afterStatus: 0,
          detail: `创建采购单，供应商「${payload.supplierName}」，${payload.items.length} 个商品，金额 ${payload.totalAmount}`,
        });

        return { id: orderId, orderNo };
      });

      return ok(res, created);
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY' && attempt < MAX_RETRY) continue;
      throw err;
    }
  }

  throw new BizError('采购单号生成冲突，请重试');
}

/* ------------------------------------------------------------------ */
/* 4.11.4 编辑采购草稿                                                   */
/* ------------------------------------------------------------------ */
async function update(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少采购单 id');

  const payload = await buildPayload(req.body);

  await transaction(async (conn) => {
    const order = await purchaseModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('采购单不存在');
    if (order.status !== 0) throw new BizError('只有草稿状态的采购单可以修改');
    assertOwner(order, req);

    await purchaseModel.updateOrder(conn, id, payload);
    await purchaseModel.replaceItems(conn, id, payload.items);

    await writeLog(conn, req, {
      module: 'purchase',
      action: 'update',
      bizNo: order.order_no,
      beforeStatus: 0,
      afterStatus: 0,
      detail: `编辑采购草稿，${payload.items.length} 个商品，金额 ${payload.totalAmount}`,
    });
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.11.5 提交采购单                                                     */
/* ------------------------------------------------------------------ */
async function submit(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少采购单 id');

  await transaction(async (conn) => {
    const order = await purchaseModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('采购单不存在');
    if (order.status !== 0) throw new BizError('只有草稿状态的采购单可以提交');
    assertOwner(order, req);

    const items = await purchaseModel.findItems(conn, id);
    if (!items.length) throw new BizError('采购单没有明细');

    await purchaseModel.submitOrder(conn, id);

    await writeLog(conn, req, {
      module: 'purchase',
      action: 'submit',
      bizNo: order.order_no,
      beforeStatus: 0,
      afterStatus: 1,
      detail: '提交采购单',
    });
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.11.6 确认入库（仓管/管理员）                                        */
/* ------------------------------------------------------------------ */
async function receive(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少采购单 id');
  const receiver = operatorName(req);

  await transaction(async (conn) => {
    const order = await purchaseModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('采购单不存在');
    if (order.status !== 1) throw new BizError('只有已提交的采购单可以入库');

    const items = await purchaseModel.findItems(conn, id);
    if (!items.length) throw new BizError('采购单没有明细');

    // 按商品 id 升序加锁，和销售/退货的锁顺序保持一致，降低并发死锁概率
    items.sort((a, b) => a.productId - b.productId);

    for (const item of items) {
      const product = await productModel.findByIdForUpdate(conn, item.productId);
      if (!product) throw new BizError(`商品「${item.productName}」不存在`);

      await applyInbound(conn, {
        product,
        quantity: item.quantity,
        inboundPrice: item.price,
        bizType: STOCK_BIZ.PURCHASE_IN,
        supplierName: order.supplier_name,
        operator: receiver,
        remark: `采购入库 ${order.order_no}`,
      });
    }

    await purchaseModel.receiveOrder(conn, id, receiver);

    await writeLog(conn, req, {
      module: 'purchase',
      action: 'receive',
      bizNo: order.order_no,
      beforeStatus: 1,
      afterStatus: 2,
      detail: `采购收货入库，${items.length} 个商品，应付 ${order.total_amount}`,
    });
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.11.7 取消采购单                                                     */
/* ------------------------------------------------------------------ */
async function cancel(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少采购单 id');

  await transaction(async (conn) => {
    const order = await purchaseModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('采购单不存在');
    if (order.status === 2 || order.status === 3) throw new BizError('该采购单不能取消');
    assertOwner(order, req);

    await purchaseModel.cancelOrder(conn, id);

    await writeLog(conn, req, {
      module: 'purchase',
      action: 'cancel',
      bizNo: order.order_no,
      beforeStatus: order.status,
      afterStatus: 3,
      detail: '取消采购单',
    });
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.11.8 登记付款（仅管理员）                                           */
/* ------------------------------------------------------------------ */
async function pay(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少采购单 id');

  const amount = round2(toNum(req.body.amount, 0));
  assert(amount > 0, '付款金额必须大于 0');

  const data = await transaction(async (conn) => {
    const order = await purchaseModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('采购单不存在');
    if (order.status !== 2) throw new BizError('只有已入库的采购单可以登记付款');

    const payable = Number(order.payable_amount) || 0;
    const paid = Number(order.paid_amount) || 0;
    const remaining = round2(payable - paid);
    assert(remaining > 0, '该采购单已付清');
    assert(amount <= remaining, '付款金额不能超过未付金额');

    const result = await purchaseModel.registerPayment(conn, id, amount);
    if (!result || result.affectedRows !== 1) {
      throw new BizError('付款失败，请刷新后重试');
    }

    await writeLog(conn, req, {
      module: 'purchase',
      action: 'pay',
      bizNo: order.order_no,
      beforeStatus: 2,
      afterStatus: 2,
      detail: `登记付款 ${amount}，已付 ${round2(paid + amount)} / 应付 ${payable}`,
    });

    return {
      paidAmount: round2(paid + amount),
      unpaidAmount: round2(remaining - amount),
    };
  });

  return ok(res, data);
}

module.exports = { list, detail, create, update, submit, receive, cancel, pay };
