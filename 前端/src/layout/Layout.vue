<script setup>
/**
 * 主布局容器
 * 左侧：深色可折叠侧边菜单（按角色动态渲染，折叠带过渡动画）
 * 顶部：折叠按钮 + 面包屑 + 用户下拉菜单（个人中心 / 退出登录）
 * 内容：路由出口，切换页面带淡入下沉过渡
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { constantRoutes } from '@/router'
import { useUserStore } from '@/store/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

/** 侧边栏折叠状态 */
const isCollapsed = ref(false)

/** 响应式：跨越 991px 断点时双向自动适配——放大自动展开、缩小自动折叠 */
const MQ_COLLAPSE = window.matchMedia('(max-width: 991px)')
function syncCollapseByViewport(e = MQ_COLLAPSE) {
  isCollapsed.value = e.matches
}
onMounted(() => {
  syncCollapseByViewport()
  MQ_COLLAPSE.addEventListener('change', syncCollapseByViewport)
})
onBeforeUnmount(() => MQ_COLLAPSE.removeEventListener('change', syncCollapseByViewport))

/** 判断当前角色是否有权限访问路由 */
function canAccess(record) {
  const roles = record?.meta?.roles
  if (!roles || roles.length === 0) return true
  return roles.includes(userStore.role)
}

/** 路由是否需要在菜单中隐藏 */
function isHidden(record) {
  return !!record.meta?.hidden
}

/** 取分组下可见且有权限的子路由 */
function visibleChildren(record) {
  return (record.children || []).filter((child) => !isHidden(child) && canAccess(child))
}

function hasVisibleChildren(record) {
  return visibleChildren(record).length > 0
}

/** 拼接父子路由路径（父 'product' + 子 'list' => '/product/list'） */
function resolvePath(parentPath, childPath) {
  if (!childPath) return `/${parentPath}`.replace('//', '/')
  return `/${parentPath}/${childPath}`
}

/**
 * 侧边菜单数据：从路由表派生
 * 非管理员角色下，系统管理因无可见子菜单而整体隐藏
 */
const menuRoutes = computed(() => {
  const layoutRoute = constantRoutes.find((item) => item.path === '/')
  return (layoutRoute?.children || []).filter((item) => {
    if (isHidden(item)) return false
    // 含子路由的分组：至少存在一个可见子项时才展示
    if (item.children && item.children.length > 0) return hasVisibleChildren(item)
    return canAccess(item)
  })
})

/** 面包屑数据：读取当前路由匹配链 */
const breadcrumbs = computed(() =>
  route.matched.filter((item) => item.meta?.title && item.meta?.title !== '登录'),
)

/** 顶部用户头像：优先真实头像，其次姓名首字 */
const avatarText = computed(() => (userStore.realName || userStore.username || '用').charAt(0))

/** 跳转个人中心 */
function goProfile() {
  router.push('/system/profile')
}

/** 退出登录：二次确认 → 清登录态 → 回登录页 */
async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出当前账号吗？', '退出提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return // 用户取消
  }
  await userStore.logout()
  ElMessage.success('已安全退出')
  router.push('/login')
}
</script>

<template>
  <div class="layout-wrapper" :class="{ 'is-collapsed': isCollapsed }">
    <!-- ============ 深色侧边栏 ============ -->
    <aside class="sidebar">
      <!-- 装饰性微光层（不响应鼠标，纯质感点缀） -->
      <div class="sidebar-glow" aria-hidden="true"></div>

      <!-- 品牌 Logo 区 -->
      <div class="sidebar-logo">
        <div class="logo-mark">
          <el-icon><Goods /></el-icon>
        </div>
        <transition name="logo-fade">
          <div v-show="!isCollapsed" class="logo-text">
            <span class="logo-name">超市管家</span>
            <span class="logo-sub">商品管理系统</span>
          </div>
        </transition>
      </div>

      <!-- 菜单区 -->
      <el-scrollbar class="sidebar-scroll">
        <el-menu
          :default-active="route.path"
          :collapse="isCollapsed"
          :collapse-transition="false"
          router
          class="sidebar-menu"
          background-color="#0f1623"
          text-color="#93a0b7"
          active-text-color="#ffffff"
        >
          <template v-for="item in menuRoutes" :key="item.path">
            <!-- 多子项分组 -->
            <el-sub-menu
              v-if="hasVisibleChildren(item)"
              :index="resolvePath(item.path)"
            >
              <template #title>
                <el-icon class="menu-icon"><component :is="item.meta?.icon" /></el-icon>
                <span>{{ item.meta?.title }}</span>
              </template>
              <el-menu-item
                v-for="child in visibleChildren(item)"
                :key="child.path"
                :index="resolvePath(item.path, child.path)"
              >
                <i class="sub-menu-bar" aria-hidden="true"></i>
                <template #title>{{ child.meta?.title }}</template>
              </el-menu-item>
            </el-sub-menu>

            <!-- 单层菜单项 -->
            <el-menu-item v-else :index="resolvePath(item.path)">
              <el-icon class="menu-icon"><component :is="item.meta?.icon" /></el-icon>
              <template #title>{{ item.meta?.title }}</template>
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>
    </aside>

    <!-- ============ 右侧主体 ============ -->
    <div class="main-section">
      <!-- 顶部导航栏 -->
      <header class="app-header">
        <div class="header-left">
          <!-- 折叠 / 展开按钮 -->
          <button
            class="collapse-btn tactile"
            :title="isCollapsed ? '展开菜单' : '收起菜单'"
            @click="isCollapsed = !isCollapsed"
          >
            <el-icon class="collapse-icon" :class="{ 'is-collapsed': isCollapsed }">
              <Fold />
            </el-icon>
          </button>

          <!-- 面包屑（自动读取路由） -->
          <el-breadcrumb :separator-icon="undefined" class="app-breadcrumb">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">
              <el-icon class="breadcrumb-home"><HomeFilled /></el-icon>
              <span>首页</span>
            </el-breadcrumb-item>
            <el-breadcrumb-item
              v-for="crumb in breadcrumbs"
              :key="crumb.path"
              :to="crumb.path === route.path ? undefined : { path: crumb.path }"
            >
              {{ crumb.meta.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
          <!-- 用户信息下拉 -->
          <el-dropdown trigger="click" placement="bottom-end">
            <div class="user-box tactile">
              <el-avatar :size="32" class="user-avatar" :src="userStore.avatar || undefined">
                {{ avatarText }}
              </el-avatar>
              <div class="user-meta">
                <span class="user-name">{{ userStore.displayName }}</span>
                <span class="user-role" :class="{ 'is-admin': userStore.isAdmin }">
                  {{ userStore.position || userStore.username }}
                </span>
              </div>
              <el-icon class="user-arrow"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :icon="'UserFilled'" @click="goProfile">个人中心</el-dropdown-item>
                <el-dropdown-item :icon="'SwitchButton'" divided @click="handleLogout">
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <!-- 内容容器：路由出口 + 页面切换过渡 -->
      <main class="app-main">
        <router-view v-slot="{ Component, route: currentRoute }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" :key="currentRoute.path" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 整体布局 ==================== */
.layout-wrapper {
  display: flex;
  height: 100%;
  min-height: 100vh;
}

/* ==================== 深色侧边栏 ==================== */
.sidebar {
  position: relative;
  width: var(--sidebar-width);
  flex-shrink: 0;
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--sidebar-bg);
  transition: width var(--motion-slow) var(--ease-standard);
  overflow: hidden;
}

.layout-wrapper.is-collapsed .sidebar {
  width: var(--sidebar-width-collapsed);
}

/* 顶部翡翠微光 + 细网格，营造深色质感（克制、无发光滥用） */
.sidebar-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 42% at 50% -8%, rgba(10, 133, 94, 0.16), transparent 70%),
    linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px);
  background-size:
    100% 100%,
    100% 28px;
}

/* ---- Logo ---- */
.sidebar-logo {
  position: relative;
  z-index: 1;
  height: var(--header-height);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  border-bottom: 1px solid var(--sidebar-border);
  flex-shrink: 0;
}

.logo-mark {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
  color: #fff;
  font-size: 18px;
  background: linear-gradient(145deg, #0f9c6d, #086a4b);
  box-shadow: 0 4px 10px -2px rgba(10, 133, 94, 0.5);
}

.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  white-space: nowrap;
}

.logo-name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #f4f7fb;
}

.logo-sub {
  font-size: 11px;
  color: #6b7890;
  letter-spacing: 0.06em;
}

/* 折叠时 Logo 文字淡出 / 展开时淡入 */
.logo-fade-enter-active,
.logo-fade-leave-active {
  transition:
    opacity var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}
.logo-fade-enter-from,
.logo-fade-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

/* ---- 菜单 ---- */
.sidebar-scroll {
  position: relative;
  z-index: 1;
  flex: 1;
}

.sidebar-menu {
  border-right: none;
  padding: 10px 10px 16px;
}

/* 菜单项：圆角胶囊化，留出间距便于悬浮块反馈 */
.sidebar-menu :deep(.el-menu-item),
.sidebar-menu :deep(.el-sub-menu__title) {
  height: 44px;
  line-height: 44px;
  margin: 3px 0;
  border-radius: var(--radius-control);
  color: var(--sidebar-text);
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}

.sidebar-menu :deep(.el-menu-item:hover),
.sidebar-menu :deep(.el-sub-menu__title:hover) {
  background-color: var(--sidebar-hover-bg) !important;
  color: var(--sidebar-text-hover);
}

.sidebar-menu :deep(.el-menu-item .menu-icon),
.sidebar-menu :deep(.el-sub-menu__title .menu-icon) {
  font-size: 17px;
  color: inherit;
  transition: color var(--motion-fast) var(--ease-standard);
}

/* 选中项：浅色块 + 翡翠绿左侧指示条 */
.sidebar-menu :deep(.el-menu-item.is-active) {
  position: relative;
  background-color: var(--sidebar-active-bg) !important;
  color: #fff;
  font-weight: 500;
}

.sidebar-menu :deep(.el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: var(--radius-pill);
  background-color: var(--brand-primary-hover);
}

.sidebar-menu :deep(.el-menu-item.is-active .menu-icon) {
  color: #3dbd93;
}

/* 子菜单展开后的标题保持高亮 */
.sidebar-menu :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: #fff;
}

/* 子菜单项左侧小竖条 */
.sub-menu-bar {
  display: inline-block;
  width: 4px;
  height: 4px;
  margin-right: 10px;
  border-radius: 50%;
  background-color: currentColor;
  opacity: 0.5;
}

/* 折叠状态下弹出菜单同样为深色 */
:deep(.el-menu--popup) {
  background-color: var(--sidebar-bg) !important;
  border-radius: var(--radius-control);
  padding: 6px;
}
:deep(.el-menu--popup .el-menu-item) {
  border-radius: var(--radius-control);
  color: var(--sidebar-text);
}
:deep(.el-menu--popup .el-menu-item:hover) {
  background-color: var(--sidebar-hover-bg) !important;
  color: #fff;
}

/* ==================== 右侧主体 ==================== */
.main-section {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* ---- 顶部导航 ---- */
.app-header {
  height: var(--header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background-color: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  box-shadow: var(--shadow-xs);
  z-index: var(--z-header);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

/* 折叠按钮 */
.collapse-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-control);
  background-color: transparent;
  color: var(--text-regular);
  cursor: pointer;
  transition:
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard);
}

.collapse-btn:hover {
  background-color: var(--bg-muted);
  color: var(--brand-primary);
}

.collapse-icon {
  font-size: 19px;
  transition: transform var(--motion-slow) var(--ease-spring);
}

.collapse-icon.is-collapsed {
  transform: rotate(180deg);
}

/* 面包屑 */
.app-breadcrumb {
  font-size: 13.5px;
}

.breadcrumb-home {
  margin-right: 4px;
  vertical-align: -1.5px;
  font-size: 14px;
}

.app-breadcrumb :deep(.el-breadcrumb__inner) {
  color: var(--text-secondary);
  font-weight: 400;
  transition: color var(--motion-fast) var(--ease-standard);
}

.app-breadcrumb :deep(.el-breadcrumb__inner:hover),
.app-breadcrumb :deep(.el-breadcrumb__inner.is-link:hover) {
  color: var(--brand-primary);
}

.app-breadcrumb :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: var(--text-primary);
  font-weight: 500;
}

/* ---- 用户区 ---- */
.header-right {
  display: flex;
  align-items: center;
}

.user-box {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 10px 5px 6px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-standard);
  outline: none;
}

.user-box:hover {
  background-color: var(--bg-muted);
}

.user-avatar {
  background: linear-gradient(145deg, #0f9c6d, #086a4b);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.25;
}

.user-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-role {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-secondary);
}

.user-role.is-admin {
  color: var(--brand-primary);
}

.user-arrow {
  font-size: 12px;
  color: var(--text-secondary);
  transition: transform var(--motion-fast) var(--ease-standard);
}

.user-box:hover .user-arrow {
  transform: translateY(1px);
}

/* ---- 内容区 ---- */
.app-main {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

/* ==================== 响应式断点 ==================== */

/* 中屏：内容区内边距收窄 */
@media (max-width: 1199px) {
  .app-main {
    padding: 16px;
  }
}

/* 小屏：侧边栏已由 JS 自动折叠，面包屑/用户区收窄 */
@media (max-width: 991px) {
  .app-main {
    padding: 12px;
  }
  .app-header {
    padding: 0 12px;
  }
  .header-left {
    gap: 10px;
  }
  /* 用户区只保留头像，隐藏文字，节省空间 */
  .user-meta {
    display: none;
  }
  .user-arrow {
    display: none;
  }
  .app-breadcrumb {
    font-size: 13px;
  }
}

/* 超小屏：折叠按钮缩小，面包屑精简 */
@media (max-width: 767px) {
  .app-main {
    padding: 8px;
  }
  .app-breadcrumb :deep(.el-breadcrumb__inner) {
    font-size: 12px;
  }
}
</style>
