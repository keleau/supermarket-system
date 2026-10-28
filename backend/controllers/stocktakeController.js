/**
 * 库存盘点 Controller
 *
 * 单据状态：0 草稿 → 1 已提交 → 2 已审核 / 3 已取消
 * - 只有草稿可保存实盘数量
 * - 提交前必须给所有盈亏行填写原因
 * - 审核时按「审核时库存」与实盘数计算差额，写 stock_log（盘盈/盘亏），修正库存
 */
const stocktakeModel = require('../models/stocktakeModel');
const productModel = require('../models/productModel');
const stockModel = require('../models/stockModel');
const { transaction } = require('../db/pool');
const { BizError, ok, page } = require('../utils/result');
const {
  toStr, toInt, paging, assert, assertDateRange, startOfDay, endOfDay,
} = require('../utils/validate');
const { formatCompact } = require('../utils/date');
const { maskStocktakeFinance } = require('../utils/finance');
const { calcDiff } = require('../utils/stocktake');
const { STOCK_BIZ } = require('../utils/stockBiz');
const { writeLog } = require('../utils/operationLog');

const STATUS_VALUES = [0, 1, 2, 3];
const MAX_RETRY = 3;

function operatorName(req) {
  return req.user.realName || req.user.username || '';
}

/* ------------------------------------------------------------------ */
/* 4.8.1 盘点单分页列表                                                  */
/* ------------------------------------------------------------------ */
async function list(req, res) {
  const { pageNum, pageSize, offset } = paging(req.query);
  const status = toInt(req.query.status, null);
  if (status !== null) assert(STATUS_VALUES.includes(status), '盘点状态取值不合法');

  const startDate = toStr(req.query.startTime);
  const endDate = toStr(req.query.endTime);
  assertDateRange(startDate, endDate);

  const result = await stocktakeModel.list({
    pageNum,
    pageSize,
    offset,
    takeNo: toStr(req.query.takeNo) || null,
    status,
    startTime: startOfDay(startDate),
    endTime: endOfDay(endDate),
  });

  return ok(res, page(maskStocktakeFinance(result.list, req.user), result.total, pageNum, pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.8.2 盘点单详情                                                      */
/* ------------------------------------------------------------------ */
async function detail(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少盘点单 id');

  const order = await stocktakeModel.findById(id);
  assert(order, '盘点单不存在');

  return ok(res, maskStocktakeFinance(order, req.user));
}

/* ------------------------------------------------------------------ */
/* 4.8.3 生成盘点任务                                                    */
/* ------------------------------------------------------------------ */
async function create(req, res) {
  const categoryId = toInt(req.body.categoryId, null);
  const remark = toStr(req.body.remark).slice(0, 200);
  const operator = operatorName(req);

  for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1) {
    try {
      const created = await transaction(async (conn) => {
        const products = await stocktakeModel.findSnapshotProducts(conn, categoryId);
        if (!products.length) throw new BizError('该范围内没有可盘点的商品');

        const takeNo = await stocktakeModel.generateTakeNo(conn, formatCompact(new Date()));
        const orderId = await stocktakeModel.createOrder(conn, { takeNo, operator, remark });

        await stocktakeModel.createItems(
          conn,
          orderId,
          products.map((p) => {
            const bookQty = Number(p.stockNum) || 0;
            return {
              productId: p.id,
              productName: p.productName,
              unit: p.unit || '个',
              bookQty,
              actualQty: bookQty,
              costPrice: Number(p.costPrice) || 0,
            };
          })
        );

        await writeLog(conn, req, {
          module: 'stocktake',
          action: 'create',
          bizNo: takeNo,
          afterStatus: 0,
          detail: `创建盘点任务，商品 ${products.length} 个`,
        });

        return { id: orderId, takeNo };
      });

      return ok(res, created);
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY' && attempt < MAX_RETRY) continue;
      throw err;
    }
  }

  throw new BizError('盘点单号生成冲突，请重试');
}

/* ------------------------------------------------------------------ */
/* 4.8.4 保存实盘数量                                                    */
/* ------------------------------------------------------------------ */
async function updateItems(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少盘点单 id');

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  assert(items.length > 0, '请提交盘点明细');

  await transaction(async (conn) => {
    const order = await stocktakeModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('盘点单不存在');
    if (order.status !== 0) throw new BizError('只有草稿状态的盘点单可以修改');
    if (order.operator !== operatorName(req) && req.user.role !== 'admin') {
      throw new BizError('只能修改自己创建的盘点单', 403);
    }

    for (const it of items) {
      const itemId = toInt(it.id);
      assert(itemId !== null, '盘点明细 id 不合法');

      const actualQty = Number(it.actualQty);
      assert(Number.isInteger(actualQty) && actualQty >= 0, '实盘数量必须是非负整数');

      const reason = toStr(it.reason).slice(0, 20);
      const result = await stocktakeModel.updateItem(conn, id, itemId, { actualQty, reason });
      if (!result || result.affectedRows !== 1) throw new BizError('盘点明细不存在');
    }

    await stocktakeModel.recomputeTotals(conn, id);

    await writeLog(conn, req, {
      module: 'stocktake',
      action: 'update',
      bizNo: order.take_no,
      beforeStatus: 0,
      afterStatus: 0,
      detail: `保存实盘数量，${items.length} 条明细`,
    });
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.8.5 提交盘点单                                                      */
/* ------------------------------------------------------------------ */
async function submit(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少盘点单 id');

  await transaction(async (conn) => {
    const order = await stocktakeModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('盘点单不存在');
    if (order.status !== 0) throw new BizError('只有草稿状态的盘点单可以提交');
    if (order.operator !== operatorName(req) && req.user.role !== 'admin') {
      throw new BizError('只能提交自己创建的盘点单', 403);
    }

    const items = await stocktakeModel.findItems(conn, id);
    if (!items.length) throw new BizError('盘点单没有明细');

    const missing = items.find((it) => Number(it.diffQty) !== 0 && !it.reason);
    if (missing) throw new BizError(`商品「${missing.productName}」有盈亏，请填写盈亏原因`);

    await stocktakeModel.updateStatus(conn, id, 1);

    await writeLog(conn, req, {
      module: 'stocktake',
      action: 'submit',
      bizNo: order.take_no,
      beforeStatus: 0,
      afterStatus: 1,
      detail: '提交盘点单',
    });
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.8.6 审核盘点单（仅管理员）                                          */
/* ------------------------------------------------------------------ */
async function audit(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少盘点单 id');
  const auditor = operatorName(req);

  await transaction(async (conn) => {
    const order = await stocktakeModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('盘点单不存在');
    if (order.status !== 1) throw new BizError('只有已提交的盘点单可以审核');

    const items = await stocktakeModel.findItems(conn, id);
    if (!items.length) throw new BizError('盘点单没有明细');

    let gainQty = 0;
    let lossQty = 0;

    for (const it of items) {
      const product = await productModel.findByIdForUpdate(conn, it.productId);
      if (!product) throw new BizError(`商品「${it.productName}」不存在`);

      const currentStock = Number(product.stock_num) || 0;
      const actualQty = Number(it.actualQty) || 0;
      const { diffQty, diffAmount } = calcDiff(actualQty, currentStock, product.cost_price);

      await stocktakeModel.updateItemAtAudit(
        conn, it.id, currentStock, diffQty, product.cost_price, diffAmount
      );

      if (diffQty === 0) continue;

      await productModel.changeStock(conn, it.productId, diffQty);
      if (diffQty > 0 && product.status === 0) {
        await productModel.updateStatus(conn, it.productId, 1);
      }

      await stockModel.insertLog(conn, {
        productId: it.productId,
        changeType: diffQty > 0 ? 1 : 2,
        bizType: diffQty > 0 ? STOCK_BIZ.STOCKTAKE_GAIN : STOCK_BIZ.STOCKTAKE_LOSS,
        quantity: Math.abs(diffQty),
        beforeNum: currentStock,
        afterNum: actualQty,
        operator: auditor,
        remark: `盘点${order.take_no} ${diffQty > 0 ? '盘盈' : '盘亏'}`,
      });

      if (diffQty > 0) gainQty += diffQty;
      else lossQty += -diffQty;
    }

    await stocktakeModel.recomputeTotals(conn, id);
    await stocktakeModel.auditOrder(conn, id, auditor);

    await writeLog(conn, req, {
      module: 'stocktake',
      action: 'audit',
      bizNo: order.take_no,
      beforeStatus: 1,
      afterStatus: 2,
      detail: `审核盘点单，盘盈 ${gainQty} 件，盘亏 ${lossQty} 件`,
    });
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.8.7 取消盘点单                                                      */
/* ------------------------------------------------------------------ */
async function cancel(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少盘点单 id');

  await transaction(async (conn) => {
    const order = await stocktakeModel.findByIdForUpdate(conn, id);
    if (!order) throw new BizError('盘点单不存在');
    if (order.status === 2 || order.status === 3) throw new BizError('该盘点单不能取消');

    const isAdmin = req.user.role === 'admin';
    if (order.status === 1 && !isAdmin) {
      throw new BizError('已提交的盘点单只能由管理员取消', 403);
    }
    if (order.status === 0 && order.operator !== operatorName(req) && !isAdmin) {
      throw new BizError('只能取消自己创建的盘点单', 403);
    }

    await stocktakeModel.updateStatus(conn, id, 3);

    await writeLog(conn, req, {
      module: 'stocktake',
      action: 'cancel',
      bizNo: order.take_no,
      beforeStatus: order.status,
      afterStatus: 3,
      detail: '取消盘点单',
    });
  });

  return ok(res, null);
}

module.exports = { list, detail, create, updateItems, submit, audit, cancel };
