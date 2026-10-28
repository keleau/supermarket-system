/**
 * 岗位权限矩阵
 *
 * 权限码按「资源:动作」命名：
 * - product:read / product:write
 * - category:read / category:write
 * - supplier:read / supplier:write
 * - stock:read / stock:in / stock:out
 * - stocktake:read / stocktake:create / stocktake:audit
 * - sale:read / sale:read:all / sale:create / sale:return / sale:stats
 * - dashboard:read
 * - user:manage
 *
 * 管理员（role=admin 或 position=管理员）拥有全部权限（*）。
 * 采购/盘点等独立模块后续加入时，只需在矩阵里补权限码，不动路由写法。
 */
const ALL = '*';

const POSITION_PERMISSIONS = {
  管理员: [ALL],

  // 仓管：库存单据 + 商品/供应商只读，不碰销售
  仓管: [
    'dashboard:read',
    'product:read', 'category:read', 'supplier:read',
    'stock:read', 'stock:in', 'stock:out',
    'stocktake:read', 'stocktake:create',
  ],

  // 收银员：只能销售开单 + 查看自己的销售单
  收银员: [
    'dashboard:read',
    'product:read', 'category:read', 'supplier:read',
    'sale:read', 'sale:create',
  ],

  // 采购：可以收货入库，不能出库、不能销售
  采购: [
    'dashboard:read',
    'product:read', 'category:read', 'supplier:read',
    'stock:read', 'stock:in',
  ],

  // 后勤：库存只读，不能操作单据
  后勤: [
    'dashboard:read',
    'product:read', 'category:read', 'supplier:read',
    'stock:read',
  ],

  // 会计：可看全部销售单和库存，但不能开单；成本/毛利仍保持管理员专属
  会计: [
    'dashboard:read',
    'product:read', 'category:read', 'supplier:read',
    'stock:read',
    'stocktake:read',
    'sale:read', 'sale:read:all',
  ],
};

/** 未知职位的最小权限：至少能进首页，避免登录后白屏 */
const FALLBACK_PERMISSIONS = ['dashboard:read'];

function permissionsFor(user) {
  if (!user) return [];
  if (user.role === 'admin' || user.position === '管理员') return [ALL];
  return POSITION_PERMISSIONS[user.position] || FALLBACK_PERMISSIONS;
}

function permissionList(user) {
  if (user && Array.isArray(user.permissions)) return user.permissions;
  return permissionsFor(user);
}

function hasPermission(user, permission) {
  const list = permissionList(user);
  return list.includes(ALL) || list.includes(permission);
}

function hasAnyPermission(user, permissions = []) {
  if (!permissions.length) return true;
  const list = permissionList(user);
  return list.includes(ALL) || permissions.some((p) => list.includes(p));
}

module.exports = {
  ALL,
  POSITION_PERMISSIONS,
  FALLBACK_PERMISSIONS,
  permissionsFor,
  hasPermission,
  hasAnyPermission,
};
