<script setup>
/**
 * 空页面占位组件（骨架阶段统一使用）
 * 后续开发具体业务页面时，直接替换各 views 下的页面内容即可
 */
defineProps({
  /** 页面名称 */
  title: { type: String, required: true },
  /** Element Plus 图标组件名 */
  icon: { type: String, default: 'Document' },
})
</script>

<template>
  <div class="page-placeholder page-card">
    <div class="placeholder-inner">
      <div class="placeholder-icon">
        <el-icon :size="26"><component :is="icon" /></el-icon>
      </div>
      <div class="placeholder-title">{{ title }}</div>
      <el-tag type="success" round effect="light" class="placeholder-tag">待开发</el-tag>
      <p class="placeholder-desc">该页面为骨架占位页，后续将在此开发「{{ title }}」相关业务功能。</p>
      <p class="placeholder-code">【{{ title }}页面，待开发】</p>
    </div>
  </div>
</template>

<style scoped>
.page-placeholder {
  min-height: calc(100vh - var(--header-height) - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px;
  animation: placeholder-rise 0.4s var(--ease-decel) both;
}

.placeholder-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  color: var(--brand-primary);
  background: var(--brand-primary-light-9);
  box-shadow: 0 6px 16px -6px rgba(10, 133, 94, 0.35);
}

.placeholder-title {
  margin-top: 18px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.placeholder-tag {
  margin-top: 10px;
}

.placeholder-desc {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.placeholder-code {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-disabled);
  letter-spacing: 0.02em;
}

@keyframes placeholder-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
