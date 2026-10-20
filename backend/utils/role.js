/**
 * 角色 / 职位映射
 * 双字段设计：position（中文，前端展示与权限判断） ↔ role（英文，后端鉴权）
 */
const { BizError } = require('./result');

/** 允许的职位取值 */
const POSITIONS = ['管理员', '仓管', '收银员', '后勤', '采购', '会计'];

/**
 * 由中文职位推导英文角色
 * 管理员 → admin，其余 → operator
 */
function roleFromPosition(position) {
  return position === '管理员' ? 'admin' : 'operator';
}

/** 校验职位合法性，返回规范化后的职位名 */
function normalizePosition(position) {
  const p = position === undefined || position === null ? '' : String(position).trim();
  if (!p) return '仓管'; // 默认职位
  if (!POSITIONS.includes(p)) {
    throw new BizError(`职位取值不合法，应为：${POSITIONS.join(' / ')}`);
  }
  return p;
}

module.exports = { POSITIONS, roleFromPosition, normalizePosition };
