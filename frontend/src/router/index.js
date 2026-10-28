/**
 * 路由配置 + 全局前置守卫 + 角色权限控制
 *
 * 权限规则：
 * - 未登录（无 token）访问任何业务页 → 跳转登录页
 * - 管理员（role === 'admin'）可访问全部路由
 * - 其他职位不可访问 meta.roles 中不含其 role 的路由（如用户管理）
 * - meta.hidden 的路由不出现在侧边菜单（如登录页、兜底路由）
 */
import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import Layout from '@/layout/Layout.vue'
import ParentView from '@/layout/ParentView.vue'
import { ROLE_ADMIN, useUserStore } from '@/store/user'

/** 路由清单：登录页 + Layout 主布局（全部业务菜单挂载在 Layout 下） */
export const constantRoutes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/LoginPage.vue'),
    meta: { title: '登录', hidden: true },
  },
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/DashboardPage.vue'),
        meta: { title: '运营总览', icon: 'Odometer', permissions: ['dashboard:read'] },
      },
      {
        path: 'sale',
        name: 'Sale',
        component: ParentView,
        redirect: '/sale/record',
        meta: { title: '销售管理', icon: 'ShoppingCart' },
        children: [
          {
            path: 'record',
            name: 'SaleRecord',
            component: () => import('@/views/sale/SaleRecordPage.vue'),
            meta: { title: '销售记录', permissions: ['sale:read'] },
          },
          {
            path: 'checkout',
            name: 'SaleCheckout',
            component: () => import('@/views/sale/CheckoutPage.vue'),
            meta: { title: '收银开单', permissions: ['sale:create'] },
          },
          {
            path: 'statistics',
            name: 'SaleStatistics',
            component: () => import('@/views/sale/SaleStatsPage.vue'),
            meta: { title: '销售统计', roles: [ROLE_ADMIN] },
          },
        ],
      },
      {
        path: 'product',
        name: 'Product',
        component: ParentView,
        redirect: '/product/list',
        meta: { title: '商品管理', icon: 'Goods' },
        children: [
          {
            path: 'list',
            name: 'ProductList',
            component: () => import('@/views/product/ProductListPage.vue'),
            meta: { title: '商品档案', permissions: ['product:read'] },
          },
          {
            path: 'category',
            name: 'ProductCategory',
            component: () => import('@/views/product/ProductCategoryPage.vue'),
            meta: { title: '商品分类', permissions: ['category:read'] },
          },
        ],
      },
      {
        path: 'stock',
        name: 'Stock',
        component: ParentView,
        redirect: '/stock/inbound',
        meta: { title: '库存管理', icon: 'Box' },
        children: [
          {
            path: 'inbound',
            name: 'StockInbound',
            component: () => import('@/views/stock/InboundPage.vue'),
            meta: { title: '入库明细', permissions: ['stock:read'] },
          },
          {
            path: 'outbound',
            name: 'StockOutbound',
            component: () => import('@/views/stock/InboundPage.vue'),
            meta: { title: '出库明细', permissions: ['stock:read'] },
          },
          {
            path: 'log',
            name: 'StockLog',
            component: () => import('@/views/stock/LogPage.vue'),
            meta: { title: '出入库流水', permissions: ['stock:read'] },
          },
          {
            path: 'statistics',
            name: 'StockStatistics',
            component: () => import('@/views/stock/StatisticsPage.vue'),
            meta: { title: '库存统计', permissions: ['stock:read'] },
          },
          {
            path: 'stocktake',
            name: 'StockStocktake',
            component: () => import('@/views/stock/StocktakePage.vue'),
            meta: { title: '库存盘点', permissions: ['stocktake:read'] },
          },
        ],
      },
      {
        path: 'supplier',
        name: 'Supplier',
        component: () => import('@/views/supplier/SupplierPage.vue'),
        meta: { title: '供应商管理', icon: 'Connection', permissions: ['supplier:read'] },
      },
      {
        path: 'system',
        name: 'System',
        component: ParentView,
        redirect: '/system/profile',
        meta: { title: '系统管理', icon: 'Setting' },
        children: [
          {
            path: 'user',
            name: 'SystemUser',
            component: () => import('@/views/system/UserManagePage.vue'),
            meta: { title: '用户管理', roles: [ROLE_ADMIN] },
          },
          {
            path: 'log',
            name: 'SystemOperationLog',
            component: () => import('@/views/system/OperationLogPage.vue'),
            meta: { title: '操作日志', roles: [ROLE_ADMIN] },
          },
          {
            path: 'profile',
            name: 'SystemProfile',
            component: () => import('@/views/system/ProfilePage.vue'),
            meta: { title: '个人中心' },
          },
        ],
      },
      // 兜底：未知路径回到首页
      {
        path: ':pathMatch(.*)*',
        redirect: '/dashboard',
        meta: { hidden: true },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes: constantRoutes,
  // 切换路由后滚动位置回到顶部
  scrollBehavior: () => ({ top: 0 }),
})

/** 登录页白名单 */
const WHITE_LIST = ['/login']

router.beforeEach(async (to, _from, next) => {
  const userStore = useUserStore()
  const hasToken = !!userStore.token

  // 设置浏览器标签页标题
  document.title = to.meta.title ? `${to.meta.title} - 超市商品管理系统` : '超市商品管理系统'

  if (!hasToken) {
    // 未登录：只允许进入白名单页面，其余重定向到登录页并携带回跳地址
    if (WHITE_LIST.includes(to.path)) {
      next()
    } else {
      next(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
    }
    return
  }

  // 已登录访问登录页：直接进入首页
  if (to.path === '/login') {
    next('/dashboard')
    return
  }

  // 刷新页面后 token 仍在，但内存中的用户资料已丢失：
  // 旧版本的本地缓存可能没有 permissions，也要重新拉一次
  if (!userStore.role || userStore.permissions.length === 0) {
    try {
      await userStore.fetchUserInfo()
    } catch {
      // token 失效等情况由 request 拦截器统一处理（清 token + 跳登录页）
      next(false)
      return
    }
  }

  // 角色鉴权：目标路由限定了角色，而当前用户不在允许范围内
  const allowRoles = to.meta.roles
  if (allowRoles && allowRoles.length > 0 && !allowRoles.includes(userStore.role)) {
    ElMessage.error('抱歉，您没有访问该页面的权限')
    next('/dashboard')
    return
  }

  // 岗位权限鉴权：后端按职位下发的权限码
  const allowPermissions = to.meta.permissions
  if (allowPermissions && allowPermissions.length > 0 && !userStore.canAny(allowPermissions)) {
    ElMessage.error('抱歉，您没有访问该页面的权限')
    next('/dashboard')
    return
  }

  next()
})

export default router
