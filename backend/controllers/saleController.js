/**
 * 销售管理 Controller
 * 结账 / 退货 / 作废 均在单个 MySQL 事务内完成，保证「单据 + 库存 + 流水」一致。
 */
const saleModel = require('../models/saleModel');
const productModel = require('../models/productModel');
const stockModel = require('../models/stockModel');
const { transaction } = require('../db/pool');
const { BizError, ok, page } = require('../utils/result');
const {
  toStr, toInt, toNum, round2, paging, assert, startOfDay, endOfDay,
} = require('../utils/validate');
const {
  formatDate, formatCompact, addDays, dayStart, dayEnd, eachDate,
} = require('../utils/date');

/** 操作人一律从 token 解析 */
function operatorName(req) {
  return req.user.realName || req.user.username || '';
}

/* ------------------------------------------------------------------ */
/* 4.6.1 销售记录分页列表                                                */
/* ------------------------------------------------------------------ */
async function recordList(req, res) {
  const { pageNum, pageSize, offset } = paging(req.query);
  const payType = toInt(req.query.payType, null);
  if (payType !== null) assert([1, 2, 3, 4].includes(payType), '支付方式取值不合法');

  const result = await saleModel.recordList({
    pageNum,
    pageSize,
    offset,
    saleNo: toStr(req.query.saleNo) || null,
    operator: toStr(req.query.operator) || null,
    payType,
    startTime: startOfDay(req.query.startTime),
    endTime: endOfDay(req.query.endTime),
  });

  return ok(res, page(result.list, result.total, pageNum, pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.6.2 销售记录详情                                                    */
/* ------------------------------------------------------------------ */
async function recordDetail(req, res) {
  const id = toInt(req.params.id);
  assert(id !== null, '缺少销售单 id');

  const record = await saleModel.findRecordById(id);
  assert(record, '销售单据不存在');

  return ok(res, record);
}

/* ------------------------------------------------------------------ */
/* 4.6.3 提交销售（收银结账）                                            */
/* ------------------------------------------------------------------ */
async function submit(req, res) {
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  assert(rawItems.length > 0, '销售商品不能为空');

  const payType = toInt(req.body.payType, 1);
  assert([1, 2, 3, 4].includes(payType), '支付方式取值不合法');

  const remark = toStr(req.body.remark);
  const operator = operatorName(req);

  // 归一化入参，顺带做基础校验
  const items = rawItems.map((it) => {
    const productId = toInt(it.productId, null);
    assert(productId !== null, '销售商品不能为空');

    const quantity = toInt(it.quantity, null);
    assert(quantity !== null && quantity > 0, '销售数量必须大于 0');

    const salePrice = it.salePrice === undefined || it.salePrice === null || it.salePrice === ''
      ? null
      : round2(toNum(it.salePrice, 0));
    if (salePrice !== null) assert(salePrice >= 0, '销售单价不能为负');

    return { productId, quantity, salePrice };
  });

  // 并发下当日单号可能撞车，靠唯一索引兜底并重试
  const MAX_RETRY = 3;

  for (let attempt = 1; attempt <= MAX_RETRY; attempt += 1) {
    try {
      const result = await transaction(async (conn) => {
        /* ---------- 1. 前置校验：全部通过才动库存 ---------- */
        const prepared = [];

        for (const it of items) {
          // 行锁：防止并发结账导致超卖
          const product = await productModel.findByIdForUpdate(conn, it.productId);
          if (!product) throw new BizError('商品不存在');
          if (product.status !== 1) throw new BizError(`商品 ${product.productName} 已下架`);
          if (it.quantity > product.stock_num) {
            throw new BizError(`商品 ${product.productName} 库存不足`);
          }

          // 未传售价则取商品当前售价；成本价取商品当前进价
          const salePrice = it.salePrice === null ? round2(product.sale_price) : it.salePrice;
          const amount = round2(salePrice * it.quantity);

          prepared.push({
            productId: product.id,
            productName: product.product_name,
            categoryId: product.category_id,
            quantity: it.quantity,
            salePrice,
            costPrice: round2(product.cost_price),
            amount,
            stockNum: product.stock_num,
          });
        }

        /* ---------- 2. 生成单号 ---------- */
        const now = new Date();
        const saleNo = await saleModel.generateSaleNo(conn, formatCompact(now));

        /* ---------- 3. 汇总 ---------- */
        const totalQuantity = prepared.reduce((s, p) => s + p.quantity, 0);
        const totalAmount = round2(prepared.reduce((s, p) => s + p.amount, 0));

        /* ---------- 4. 写主单 + 明细（含冗余快照） ---------- */
        const record = await saleModel.createRecord(conn, {
          saleNo, totalQuantity, totalAmount, payType, operator, remark,
        });

        // 分类名快照：一次查回，避免逐条查库
        const categoryIds = [...new Set(prepared.map((p) => p.categoryId).filter(Boolean))];
        const categoryNameMap = new Map();
        if (categoryIds.length) {
          const placeholders = categoryIds.map(() => '?').join(', ');
          const rows = await productModel.run(
            conn,
            `SELECT id, name FROM category WHERE id IN (${placeholders})`,
            categoryIds
          );
          rows.forEach((r) => categoryNameMap.set(r.id, r.name));
        }

        const itemRows = prepared.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          categoryName: categoryNameMap.get(p.categoryId) || '',
          quantity: p.quantity,
          salePrice: p.salePrice,
          costPrice: p.costPrice,
          amount: p.amount,
        }));
        await saleModel.createItems(conn, record.id, itemRows);

        /* ---------- 5. 扣库存 + 写流水 ---------- */
        for (const p of prepared) {
          await productModel.changeStock(conn, p.productId, -p.quantity);
          await stockModel.insertLog(conn, {
            productId: p.productId,
            changeType: 2,
            quantity: p.quantity,
            beforeNum: p.stockNum,
            afterNum: p.stockNum - p.quantity,
            operator,
            remark: `销售出库 ${saleNo}`,
          });
        }

        return { id: record.id, saleNo, totalQuantity, totalAmount };
      });

      return ok(res, result);
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY' && attempt < MAX_RETRY) {
        continue; // 单号冲突，重试
      }
      throw err;
    }
  }

  throw new BizError('销售单号生成冲突，请重试');
}

/* ------------------------------------------------------------------ */
/* 4.6.4 销售退货（整单退款，仅管理员）                                   */
/* ------------------------------------------------------------------ */
async function returnSale(req, res) {
  const saleNo = toStr(req.body.saleNo);
  assert(saleNo, '请提供销售单号');

  const operator = operatorName(req);

  await transaction(async (conn) => {
    // 行锁：防止同一单据被并发重复退货
    const record = await saleModel.findRecordBySaleNoForUpdate(conn, saleNo);
    if (!record) throw new BizError('销售单据不存在');
    if (record.status === 2) throw new BizError('该单据已退货');
    if (record.status === 3) throw new BizError('该单据已作废，无法退货');

    // 锁定各商品行，回补库存
    const items = await saleModel.findItemsByRecordId(record.id, conn);

    for (const it of items) {
      const product = await productModel.findByIdForUpdate(conn, it.productId);
      const beforeNum = product ? product.stock_num : 0;
      const afterNum = beforeNum + it.quantity;

      if (product) {
        await productModel.changeStock(conn, it.productId, it.quantity);
        // 退货后库存恢复，若原为缺货下架则自动上架
        if (product.status === 0 && afterNum > 0) {
          await productModel.updateStatus(conn, it.productId, 1);
        }
      }

      await stockModel.insertLog(conn, {
        productId: it.productId,
        changeType: 1,
        quantity: it.quantity,
        beforeNum,
        afterNum,
        operator,
        remark: `销售退货 ${record.saleNo}`,
      });
    }

    await saleModel.updateStatus(conn, record.id, 2);
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.6.5 销售作废（仅管理员，不恢复库存）                                 */
/* ------------------------------------------------------------------ */
async function voidSale(req, res) {
  const saleNo = toStr(req.body.saleNo);
  assert(saleNo, '请提供销售单号');

  await transaction(async (conn) => {
    // 行锁：防止同一单据被并发重复作废
    const record = await saleModel.findRecordBySaleNoForUpdate(conn, saleNo);
    if (!record) throw new BizError('销售单据不存在');
    if (record.status === 2 || record.status === 3) {
      throw new BizError('该单据状态异常，无法作废');
    }

    // 作废不恢复库存（用于误录冲正），也不生成流水
    await saleModel.updateStatus(conn, record.id, 3);
  });

  return ok(res, null);
}

/* ------------------------------------------------------------------ */
/* 4.6.6 销售明细按商品查询                                              */
/* ------------------------------------------------------------------ */
async function itemList(req, res) {
  const productId = toInt(req.query.productId);
  assert(productId !== null, '缺少商品 id');

  const { pageNum, pageSize, offset } = paging(req.query);
  const result = await saleModel.itemListByProduct({ productId, pageNum, pageSize, offset });

  return ok(res, page(result.list, result.total, pageNum, pageSize));
}

/* ------------------------------------------------------------------ */
/* 4.6.7 销售统计（聚合）                                                */
/* ------------------------------------------------------------------ */
async function statistics(req, res) {
  // 日期区间缺省为近 7 天
  const today = new Date();
  const defaultStart = addDays(today, -6);

  const startStr = toStr(req.query.startTime) || formatDate(defaultStart);
  const endStr = toStr(req.query.endTime) || formatDate(today);

  const startTime = `${startStr} 00:00:00`;
  const endTime = `${endStr} 23:59:59`;

  // categoryId 在明细表中只有冗余的分类名快照，因此先换算成分类名
  const categoryId = toInt(req.query.categoryId, null);
  let categoryName = null;
  if (categoryId !== null) {
    const categoryModel = require('../models/categoryModel');
    const category = await categoryModel.findById(categoryId);
    if (category) categoryName = category.name;
    else categoryName = '__不存在的分类__'; // 查不到分类则返回空结果，而不是全量
  }

  const filters = saleModel.statsWhere({
    startTime,
    endTime,
    categoryName,
    productName: toStr(req.query.productName) || null,
  });

  const [summary, dailyRows, categoryStats, productStats] = await Promise.all([
    saleModel.statsSummary(filters),
    saleModel.statsDaily(filters),
    saleModel.statsByCategory(filters),
    saleModel.statsByProduct(filters),
  ]);

  // 区间内每天补齐，无销售日为 0
  const dailyMap = new Map(dailyRows.map((d) => [d.date, d]));
  const dailyTrend = eachDate(dayStart(new Date(`${startStr}T00:00:00`)), dayStart(new Date(`${endStr}T00:00:00`)))
    .map((date) => dailyMap.get(date) || { date, sale: 0, cost: 0, profit: 0 });

  return ok(res, { summary, dailyTrend, categoryStats, productStats });
}

module.exports = {
  recordList, recordDetail, submit, returnSale, voidSale, itemList, statistics,
};
