/**
 * 运营仪表盘 Controller（只读统计，供首页运营总览）
 */
const dashboardModel = require('../models/dashboardModel');
const saleModel = require('../models/saleModel');
const { ok } = require('../utils/result');
const { maskDashboardProfit } = require('../utils/finance');
const { toInt, round2 } = require('../utils/validate');
const {
  formatDate, formatDateTime, formatMonthDay, addDays, dayStart, dayEnd, eachDate,
} = require('../utils/date');

/** 环比：((当前 - 对比) / 对比) × 100，保留 1 位小数；对比为 0 时返回 0 */
function compareRate(current, previous) {
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * 把一串数值等间隔压缩成 count 个采样点（每个点取所在区间的和）
 * 用于迷你趋势线序列。
 */
function sampleBuckets(values, count = 8) {
  if (!values.length) return new Array(count).fill(0);
  if (values.length <= count) {
    return values.concat(new Array(count - values.length).fill(0));
  }

  const result = new Array(count).fill(0);
  const size = values.length / count;
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor(i * size);
    const to = Math.floor((i + 1) * size);
    let sum = 0;
    for (let j = from; j < to; j += 1) sum += values[j];
    result[i] = round2(sum);
  }
  return result;
}

/** 月份偏移，自动处理月末天数差异 */
function shiftMonth(d, delta) {
  const copy = new Date(d.getTime());
  const day = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + delta);
  const lastDay = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(day, lastDay));
  return copy;
}

/* ------------------------------------------------------------------ */
/* 4.7.1 运营总览指标                                                    */
/* ------------------------------------------------------------------ */
async function overview(req, res) {
  const now = new Date();

  // ---------- 今日 / 昨日同期 ----------
  const todayStart = formatDateTime(dayStart(now));
  const todayEnd = formatDateTime(now);

  const yesterday = addDays(now, -1);
  const yesterdayStart = formatDateTime(dayStart(yesterday));
  const yesterdayEnd = formatDateTime(new Date(yesterday.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0)));

  // ---------- 本月 / 上月同期 ----------
  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStart = formatDateTime(dayStart(monthStartDate));
  const monthEnd = formatDateTime(now);

  const prevMonthSameDay = shiftMonth(now, -1);
  const prevMonthStartDate = new Date(prevMonthSameDay.getFullYear(), prevMonthSameDay.getMonth(), 1);
  const prevMonthStart = formatDateTime(dayStart(prevMonthStartDate));
  const prevMonthEnd = formatDateTime(prevMonthSameDay);

  // ---------- 并发取数 ----------
  const [
    todayStat, yesterdayStat,
    monthStat, prevMonthStat,
    todayHourly, monthDaily,
    monthInbound, prevMonthInbound,
    kindCount, warnCounts,
  ] = await Promise.all([
    saleModel.amountBetween(todayStart, todayEnd),
    saleModel.amountBetween(yesterdayStart, yesterdayEnd),
    saleModel.amountBetween(monthStart, monthEnd),
    saleModel.amountBetween(prevMonthStart, prevMonthEnd),
    dashboardModel.hourlyAmounts(formatDate(now)),
    dashboardModel.dailyAmounts(monthStart, monthEnd),
    dashboardModel.inboundQuantity(monthStart, monthEnd),
    dashboardModel.inboundQuantity(prevMonthStart, prevMonthEnd),
    dashboardModel.productKindCount(),
    dashboardModel.warnCounts(),
  ]);

  // ---------- 组装 ----------
  const todaySaleTrend = sampleBuckets(todayHourly.map((h) => h.amount), 8);
  const todayProfitTrend = sampleBuckets(
    todayHourly.map((h) => round2(h.amount - h.cost)),
    8
  );

  // 本月每日补齐后按 8 段采样
  const monthDates = eachDate(monthStartDate, dayStart(now));
  const monthDailyMap = new Map(monthDaily.map((d) => [d.date, d]));
  const monthSaleSeries = monthDates.map((d) => {
    const hit = monthDailyMap.get(d);
    return hit ? round2(hit.amount) : 0;
  });
  const monthProfitSeries = monthDates.map((d) => {
    const hit = monthDailyMap.get(d);
    return hit ? round2(hit.amount - hit.cost) : 0;
  });

  const data = {
    todaySaleAmount: round2(todayStat.amount),
    todayCompareRate: compareRate(todayStat.amount, yesterdayStat.amount),
    todayTrend: todaySaleTrend,

    todayProfitAmount: round2(todayStat.profit),
    todayProfitRate: compareRate(todayStat.profit, yesterdayStat.profit),
    todayProfitTrend,

    monthSaleAmount: round2(monthStat.amount),
    monthSaleRate: compareRate(monthStat.amount, prevMonthStat.amount),
    monthSaleTrend: sampleBuckets(monthSaleSeries, 8),

    monthProfitAmount: round2(monthStat.profit),
    monthProfitRate: compareRate(monthStat.profit, prevMonthStat.profit),
    monthTrend: sampleBuckets(monthProfitSeries, 8),

    monthInboundQuantity: monthInbound,
    inboundCompareRate: compareRate(monthInbound, prevMonthInbound),

    productKindCount: kindCount,
    warnProductCount: warnCounts.warnProductCount,
    pendingStockCount: warnCounts.pendingStockCount,
  };

  return ok(res, maskDashboardProfit(data, req.user));
}

/* ------------------------------------------------------------------ */
/* 4.7.2 近 N 日销售趋势                                                 */
/* ------------------------------------------------------------------ */
async function saleTrend(req, res) {
  const days = Math.min(Math.max(toInt(req.query.days, 7) || 7, 1), 90);

  const now = new Date();
  const start = addDays(now, -(days - 1));

  const startTime = formatDateTime(dayStart(start));
  const endTime = formatDateTime(dayEnd(now));

  const rows = await saleModel.dailyAmountsBetween(startTime, endTime);
  const map = new Map(rows.map((r) => [r.date, r.amount]));

  const list = eachDate(start, now).map((date) => ({
    date: formatMonthDay(new Date(`${date}T00:00:00`)),
    amount: round2(map.get(date) || 0),
  }));

  return ok(res, list);
}

/* ------------------------------------------------------------------ */
/* 4.7.3 库存余量 TOP5                                                   */
/* ------------------------------------------------------------------ */
async function stockTop(req, res) {
  return ok(res, await dashboardModel.stockTop(5));
}

/* ------------------------------------------------------------------ */
/* 4.7.4 各分类库存占比                                                  */
/* ------------------------------------------------------------------ */
async function categoryStock(req, res) {
  const list = await dashboardModel.categoryStock();
  return ok(res, list.map((r) => ({ ...r, stockNum: Number(r.stockNum) || 0 })));
}

/* ------------------------------------------------------------------ */
/* 4.7.5 热销商品 TOP5（近 30 天）                                        */
/* ------------------------------------------------------------------ */
async function hotProducts(req, res) {
  const now = new Date();
  const startTime = formatDateTime(dayStart(addDays(now, -29)));
  const endTime = formatDateTime(dayEnd(now));

  return ok(res, await saleModel.hotProducts(startTime, endTime, 5));
}

/* ------------------------------------------------------------------ */
/* 扩展：供应商进货金额排行（仅管理员）                                  */
/* ------------------------------------------------------------------ */
async function supplierRanking(req, res) {
  const days = Math.min(Math.max(toInt(req.query.days, 30) || 30, 1), 365);
  const limit = Math.min(Math.max(toInt(req.query.limit, 10) || 10, 1), 50);
  return ok(res, await dashboardModel.supplierRanking(days, limit));
}

module.exports = { overview, saleTrend, stockTop, categoryStock, hotProducts, supplierRanking };
