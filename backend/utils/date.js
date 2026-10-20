/**
 * 日期工具
 */

/** 补零 */
const pad = (n) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD' */
function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date → 'YYYY-MM-DD HH:mm:ss' */
function formatDateTime(d) {
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Date → 'YYYYMMDD'（销售单号用） */
function formatCompact(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** Date → 'MM-DD'（趋势图用） */
function formatMonthDay(d) {
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 偏移天数，返回新 Date */
function addDays(d, days) {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** 当天 00:00:00 */
function dayStart(d) {
  const copy = new Date(d.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** 当天 23:59:59 */
function dayEnd(d) {
  const copy = new Date(d.getTime());
  copy.setHours(23, 59, 59, 0);
  return copy;
}

/** 生成 [start, end] 之间的每一天（含首尾），返回 'YYYY-MM-DD' 数组 */
function eachDate(startDate, endDate) {
  const result = [];
  let cur = dayStart(startDate);
  const last = dayStart(endDate);
  // 上限保护，避免非法区间产生超大循环
  let guard = 0;
  while (cur <= last && guard < 1000) {
    result.push(formatDate(cur));
    cur = addDays(cur, 1);
    guard += 1;
  }
  return result;
}

module.exports = {
  formatDate, formatDateTime, formatCompact, formatMonthDay,
  addDays, dayStart, dayEnd, eachDate,
};
