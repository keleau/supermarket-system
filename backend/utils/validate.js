/**
 * 参数校验与类型转换工具
 * 后端必须做最终校验，不信任前端传值。
 */
const { BizError } = require('./result');

/** 空值判定：undefined / null / 空字符串 / 纯空白 */
function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** 转整数；非法或空返回 fallback */
function toInt(v, fallback = null) {
  if (isBlank(v)) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** 转数字（保留小数）；非法或空返回 fallback */
function toNum(v, fallback = null) {
  if (isBlank(v)) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 去除首尾空白的字符串；非字符串一律转字符串 */
function toStr(v, fallback = '') {
  if (isBlank(v)) return fallback;
  return String(v).trim();
}

/** 金额保留两位小数，规避浮点误差 */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** 加权成本保留四位小数，减少多次入库后的精度损失 */
function round4(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

/** 手机号：1 开头 11 位数字 */
function isPhone(v) {
  return /^1[3-9]\d{9}$/.test(String(v));
}

/** 身份证：18 位（末位可为 X/x） */
function isIdCard(v) {
  return /^\d{17}[\dXx]$/.test(String(v));
}

/** 登录账号：3-20 位字母/数字/下划线 */
function isUsername(v) {
  return /^\w{3,20}$/.test(String(v));
}

/** 日期：YYYY-MM-DD（且必须是真实存在的日期，2 月 30 日这类会被拒绝） */
function isDate(v) {
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  const [year, month, day] = s.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day;
}

/** 日期区间校验：格式 + 开始不晚于结束（空值视为不限） */
function assertDateRange(start, end) {
  if (!isBlank(start)) assert(isDate(start), '开始日期格式不正确（YYYY-MM-DD）');
  if (!isBlank(end)) assert(isDate(end), '结束日期格式不正确（YYYY-MM-DD）');
  if (!isBlank(start) && !isBlank(end)) {
    assert(String(start) <= String(end), '开始日期不能晚于结束日期');
  }
}

/**
 * 解析分页参数（pageNum / pageSize），带默认值与上限保护
 */
function paging(query) {
  const pageNum = Math.max(toInt(query.pageNum, 1) || 1, 1);
  const rawSize = toInt(query.pageSize, 10) || 10;
  const pageSize = Math.min(Math.max(rawSize, 1), 200);
  return { pageNum, pageSize, offset: (pageNum - 1) * pageSize };
}

/** 条件断言：不满足则抛业务异常 */
function assert(condition, msg, code = 400) {
  if (!condition) throw new BizError(msg, code);
}

/** 解析路由参数 id（统一「缺少 xx id」文案） */
function idParam(req, label = '记录') {
  const id = toInt(req.params.id);
  assert(id !== null, `缺少${label} id`);
  return id;
}

/** 解析列表日期区间：空值不限，结束日自动补到 23:59:59 */
function parseDateRange(query = {}) {
  const startDate = toStr(query.startTime);
  const endDate = toStr(query.endTime);
  assertDateRange(startDate, endDate);
  return { startTime: startOfDay(startDate), endTime: endOfDay(endDate) };
}

/**
 * 把 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm:ss' 转成可直接拼进 SQL 的字符串
 * 结束时间若只给日期，自动补到当天 23:59:59
 */
function startOfDay(v) {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  return s.length === 10 ? `${s} 00:00:00` : s;
}

function endOfDay(v) {
  if (isBlank(v)) return null;
  const s = String(v).trim();
  return s.length === 10 ? `${s} 23:59:59` : s;
}

module.exports = {
  isBlank, toInt, toNum, toStr, round2, round4,
  isPhone, isIdCard, isUsername, isDate, assertDateRange,
  paging, assert, idParam, parseDateRange, startOfDay, endOfDay,
};
