/**
 * 库存管理 Controller
 * 入库 / 出库 均在 MySQL 事务内完成「更新库存 + 写流水」，二者原子一致。
 */
const stockModel = require('../models/stockModel');
const productModel = require('../models/productModel');
const supplierModel = require('../models/supplierModel');
const { transaction } = require('../db/pool');
const { BizError, ok, page } = require('../utils/result');
const {
  toStr, toInt, toNum, round2, paging, assert, assertDateRange, startOfDay, endOfDay,
} = require('../utils/validate');
const { movingAverageCost } = require('../utils/cost');
const { maskStockLogPrice, maskStockStatistics } = require('../utils/finance');
const { STOCK_BIZ, STOCK_BIZ_VALUES } = require('../utils/stockBiz');
const { writeLog } = require('../utils/operationLog');

/** 操作人一律从 token 解析，不接受前端传值（防伪造） */
function operatorName(req) {
  return req.user.realName || req.user.username || '';
}

/** 解析流水列表的公共查询条件 */
function logQuery(req, forcedChangeType = null) {
  const { pageNum, pageSize, offset } = paging(req.query);
  const startDate = toStr(req.query.startTime);
  const endDate = toStr(req.query.endTime);
  assertDateRange(startDate, endDate);

  const bizType = toInt(req.query.bizType, null);
  if (bizType !== null) assert(STOCK_BIZ_VALUES.includes(bizType), '业务类型取值不合法');

  return {
    pageNum,
    pageSize,
    offset,
    productName: toStr(req.query.productName) || null,
    productId: toInt(req.query.productId, null),
    changeType: forcedChangeType !== null ? forcedChangeType : toInt(req.query.changeType, null),
    bizType,
    startTime: startOfDay(startDate),
    endTime: endOfDay(endDate),
  };
}

/* ------------------------------------------------------------------ */
/* 4.5.1 入库明细分页列表                                                */
/* ------------------------------------------------------------------ */
async function inboundList(req, res) {
  const q = logQuery(req, 1);
  const result = await stockModel.logList(q);
  return ok(res, page(maskStockLogPrice(result.list, req.user), result.total, q.pageNum, q.pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.5.2 提交入库                                                        */
/* ------------------------------------------------------------------ */
async function inbound(req, res) {
  const productId = toInt(req.body.productId);
  assert(productId !== null, '请选择商品');

  const quantity = toInt(req.body.quantity);
  assert(quantity !== null && quantity > 0, '入库数量必须大于 0');

  const inboundPrice = req.body.inboundPrice === undefined || req.body.inboundPrice === null || req.body.inboundPrice === ''
    ? null
    : round2(toNum(req.body.inboundPrice, 0));
  if (inboundPrice !== null) assert(inboundPrice >= 0, '入库单价不能为负');

  const supplierId = toInt(req.body.supplierId, null);
  const remark = toStr(req.body.remark);
  const operator = operatorName(req);

  const result = await transaction(async (conn) => {
    // 加行锁，防止并发入库覆盖
    const product = await productModel.findByIdForUpdate(conn, productId);
    if (!product) throw new BizError('商品不存在');

    // 供应商名称回填（冗余到流水，避免供应商改名影响历史）
    let supplierName = '';
    if (supplierId !== null) {
      const supplier = await supplierModel.findById(supplierId);
      if (!supplier) throw new BizError('供应商不存在');
      supplierName = supplier.supplierName;
    }

    const beforeNum = product.stock_num;
    const afterNum = beforeNum + quantity;
    // 该商品第一次入库视为期初入库；之后都按采购入库记录
    const bizType = (await stockModel.hasInbound(conn, productId))
      ? STOCK_BIZ.PURCHASE_IN
      : STOCK_BIZ.OPENING;

    await productModel.changeStock(conn, productId, quantity);

    // 入库价参与移动加权平均；未填价格时维持原均价。
    // 商品行已加锁，beforeNum / cost_price 与本次入库是同一事务快照。
    if (inboundPrice !== null) {
      const nextCostPrice = movingAverageCost({
        stockNum: beforeNum,
        currentCost: product.cost_price,
        inboundQty: quantity,
        inboundPrice,
      });
      await productModel.updateCostPrice(conn, productId, nextCostPrice);
    }

    // 原为缺货下架的商品，入库后自动上架
    if (beforeNum <= 0 && product.status === 0) {
      await productModel.updateStatus(conn, productId, 1);
    }

    const result = await stockModel.insertLog(conn, {
      productId,
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

    await writeLog(conn, req, {
      module: 'stock',
      action: 'inbound',
      bizNo: result.id,
      detail: `商品「${product.product_name}」入库 ${quantity}${product.unit || ''}，单价 ${inboundPrice ?? '—'}`,
    });

    return result;
  });

  return ok(res, { id: result.id });
}

/* ------------------------------------------------------------------ */
/* 4.5.3 出库明细分页列表                                                */
/* ------------------------------------------------------------------ */
async function outboundList(req, res) {
  const q = logQuery(req, 2);
  const result = await stockModel.logList(q);
  return ok(res, page(maskStockLogPrice(result.list, req.user), result.total, q.pageNum, q.pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.5.4 提交出库                                                        */
/* ------------------------------------------------------------------ */
async function outbound(req, res) {
  const productId = toInt(req.body.productId);
  assert(productId !== null, '请选择商品');

  const quantity = toInt(req.body.quantity);
  assert(quantity !== null && quantity > 0, '出库数量必须大于 0');

  const remark = toStr(req.body.remark);
  const operator = operatorName(req);

  const result = await transaction(async (conn) => {
    const product = await productModel.findByIdForUpdate(conn, productId);
    if (!product) throw new BizError('商品不存在');

    // 库存不足 → 抛错触发回滚，不产生任何数据变更
    if (quantity > product.stock_num) {
      throw new BizError('出库数量大于当前库存');
    }

    const beforeNum = product.stock_num;
    const afterNum = beforeNum - quantity;

    await productModel.changeStock(conn, productId, -quantity);

    const result = await stockModel.insertLog(conn, {
      productId,
      changeType: 2,
      bizType: STOCK_BIZ.MANUAL_ADJUST,
      quantity,
      beforeNum,
      afterNum,
      operator,
      remark,
    });

    await writeLog(conn, req, {
      module: 'stock',
      action: 'outbound',
      bizNo: result.id,
      detail: `商品「${product.product_name}」出库 ${quantity}${product.unit || ''}`,
    });

    return result;
  });

  return ok(res, { id: result.id });
}

/* ------------------------------------------------------------------ */
/* 4.5.5 预警商品列表                                                    */
/* ------------------------------------------------------------------ */
async function warnList(req, res) {
  const warnStatus = toInt(req.query.warnStatus, null);
  if (warnStatus !== null) assert([1, 2].includes(warnStatus), '预警状态取值不合法');

  const list = await stockModel.warnList({
    productName: toStr(req.query.productName) || null,
    warnStatus,
  });
  return ok(res, list);
}

/* ------------------------------------------------------------------ */
/* 4.5.6 出入库流水分页列表                                              */
/* ------------------------------------------------------------------ */
async function logList(req, res) {
  const q = logQuery(req, null);
  const result = await stockModel.logList(q);
  return ok(res, page(maskStockLogPrice(result.list, req.user), result.total, q.pageNum, q.pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.5.7 库存统计                                                        */
/* ------------------------------------------------------------------ */
async function statistics(req, res) {
  const data = await stockModel.statistics();
  return ok(res, maskStockStatistics(data, req.user));
}

/* ------------------------------------------------------------------ */
/* 扩展：积压商品（有库存、近 N 天没有销售）                              */
/* ------------------------------------------------------------------ */
async function slowMoving(req, res) {
  const days = Math.min(Math.max(toInt(req.query.days, 30) || 30, 1), 365);
  const limit = Math.min(Math.max(toInt(req.query.limit, 10) || 10, 1), 50);
  return ok(res, await stockModel.slowMoving(days, limit));
}

module.exports = {
  inboundList, inbound, outboundList, outbound, warnList, logList, statistics, slowMoving,
};
