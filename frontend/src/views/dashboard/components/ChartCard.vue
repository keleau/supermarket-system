<script setup>
/**
 * 仪表盘图表卡片：统一标题区 + 内容插槽（图表画布）+ 空状态
 * - clickable 时整卡可点击跳转，hover 仅做描边/阴影的轻微反馈（不做上浮发光）
 */
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  /** 副标题下方的摘要小字（如"当前库存总量：12,680 件"） */
  summary: { type: String, default: '' },
  /** 无数据时展示友好空状态，且不渲染默认插槽（不初始化图表） */
  empty: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无统计数据' },
  clickable: { type: Boolean, default: false },
})
</script>

<template>
  <section class="chart-card page-card" :class="{ 'is-clickable': clickable }">
    <header class="chart-head">
      <div class="chart-heading">
        <h3 class="chart-title">{{ title }}</h3>
        <p v-if="subtitle" class="chart-subtitle">{{ subtitle }}</p>
        <p v-if="summary" class="chart-summary">{{ summary }}</p>
      </div>
      <div class="chart-extra">
        <slot name="extra" />
        <el-icon v-if="clickable" class="chart-arrow"><ArrowRight /></el-icon>
      </div>
    </header>

    <div class="chart-body">
      <el-empty
        v-if="empty"
        :description="emptyText"
        :image-size="72"
        class="chart-empty"
      />
      <slot v-else />
    </div>
  </section>
</template>

<style scoped>
.chart-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 18px 20px 16px;
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard);
}

.chart-card.is-clickable {
  cursor: pointer;
}

.chart-card.is-clickable:hover {
  border-color: var(--brand-primary-light-7);
  box-shadow: var(--shadow-sm);
}

.chart-card.is-clickable:active {
  transform: translateY(1px);
}

.chart-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.chart-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.chart-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.chart-summary {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.chart-extra {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chart-arrow {
  font-size: 14px;
  color: var(--text-disabled);
  transition:
    color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.chart-card.is-clickable:hover .chart-arrow {
  color: var(--brand-primary);
  transform: translateX(2px);
}

.chart-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

.chart-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-empty :deep(.el-empty__description p) {
  font-size: 12.5px;
  color: var(--text-secondary);
}
</style>
