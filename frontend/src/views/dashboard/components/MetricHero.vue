<script setup>
/**
 * 顶部左侧核心指标大面板（深墨青底，与侧边栏同一视觉语言）
 * 右上角【今日 / 本月】分段切换：
 * - 今日：今日销售额 + 今日利润，趋势线为当日趋势，环比文字"较昨日"
 * - 本月：本月销售额 + 本月利润，趋势线为本月趋势，环比文字"较上月"
 * 切换时金额滚动补间、趋势线 merge 模式平滑形变；底部"查看销售明细"携带当前周期跳转。
 * 非管理员只展示销售额，利润块由父组件通过 showProfit=false 隐藏（后端已同步脱敏）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { graphic } from 'echarts/core'
import { useRouter } from 'vue-router'
import { cssVar, hexToRgba, lighten, preferReducedMotion, useEchart } from '@/composables/useEchart'
import { money } from '@/utils/format.js'

const props = defineProps({
  /** 结构：{ sale: {amount, rate, trend}, profit: {amount, rate, trend} } */
  today: { type: Object, required: true },
  month: { type: Object, required: true },
  /** 是否展示利润块；非管理员为 false */
  showProfit: { type: Boolean, default: true },
  /** 是否能查看销售明细；无 sale:read 权限时只展示金额，不提供跳转 */
  canViewSales: { type: Boolean, default: true },
})

const router = useRouter()

/* ---------------- 周期切换 ---------------- */
const period = ref('today')
const isToday = computed(() => period.value === 'today')
const activeGroup = computed(() => (isToday.value ? props.today : props.month))
const mainData = computed(() => activeGroup.value.sale)
const subData = computed(() => activeGroup.value.profit)

const mainLabel = computed(() => (isToday.value ? '今日销售额' : '本月销售额'))
const subLabel = computed(() => (isToday.value ? '今日利润' : '本月利润'))
const rateDesc = computed(() => (isToday.value ? '较昨日' : '较上月'))
const ariaLabel = computed(() => (isToday.value ? '查看今日销售明细' : '查看本月销售明细'))

function switchPeriod(next) {
  if (next !== period.value) period.value = next
}

/** 底部跳转链接与当前周期联动，销售记录页后续开发时读取 query.range */
function goSale() {
  if (!props.canViewSales) return
  router.push({ path: '/sale/record', query: { range: period.value } })
}

/* ---------------- 数字滚动补间：切换周期时金额平滑过渡 ---------------- */

/**
 * 创建一个针对单个数值 ref 的补间器（easeOutCubic）
 * @returns {{ run: (targetValue: number) => void, cancel: () => void }}
 */
function createTweener(targetRef) {
  let rafId = 0
  function run(targetValue) {
    const startValue = Number(targetRef.value) || 0
    const endValue = Number(targetValue) || 0
    cancelAnimationFrame(rafId)
    // 系统要求减少动态效果时直接落值，不播放动画
    if (preferReducedMotion() || Math.abs(endValue - startValue) < 0.005) {
      targetRef.value = endValue
      return
    }
    const duration = 480
    const startTime = performance.now()
    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      targetRef.value = startValue + (endValue - startValue) * eased
      if (progress < 1) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
  }
  function cancel() {
    cancelAnimationFrame(rafId)
  }
  return { run, cancel }
}

const displayMain = ref(props.today.sale.amount)
const displaySub = ref(props.today.profit.amount)
const tweenMain = createTweener(displayMain)
const tweenSub = createTweener(displaySub)

watch([mainData, subData], () => {
  tweenMain.run(mainData.value.amount)
  tweenSub.run(subData.value.amount)
})

onBeforeUnmount(() => {
  tweenMain.cancel()
  tweenSub.cancel()
})

/**
 * 迷你趋势线：无坐标轴、无 tooltip，仅线条 + 底部渐变面积
 * @param lineColor 线条颜色
 * @param areaFrom 渐变顶部颜色（rgba）
 */
function buildSpark(data, lineColor, areaFrom) {
  return {
    animation: !preferReducedMotion(),
    animationDuration: 800,
    animationEasing: 'cubicOut',
    grid: { left: 0, right: 0, top: 5, bottom: 0 },
    xAxis: {
      type: 'category',
      show: false,
      boundaryGap: false,
      data: data.map((_, index) => index),
    },
    yAxis: {
      type: 'value',
      show: false,
      scale: true,
    },
    series: [
      {
        type: 'line',
        data,
        smooth: 0.45,
        symbol: 'none',
        lineStyle: { width: 2, color: lineColor },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: areaFrom },
            { offset: 1, color: 'rgba(255,255,255,0)' },
          ]),
        },
      },
    ],
  }
}

// 配色语义按"块位置"锚定：上块（销售额）翡翠绿提亮，下块（利润）冷灰蓝；切换周期仅数据平滑形变
const mainLine = computed(() => lighten(cssVar('--brand-primary-hover'), 14))
const mainArea = computed(() => hexToRgba(cssVar('--brand-primary-hover'), 0.24))
const mainSpark = computed(() => buildSpark(mainData.value.trend, mainLine.value, mainArea.value))
// notMerge: false → merge 模式，切换周期时 ECharts 对曲线做平滑形变而非整图重绘
const { chartEl: mainSparkEl } = useEchart(mainSpark, { notMerge: false })

const subLine = computed(() => cssVar('--sidebar-text'))
const subArea = computed(() => hexToRgba(cssVar('--sidebar-text'), 0.16))
const subSpark = computed(() => buildSpark(subData.value.trend, subLine.value, subArea.value))
const { chartEl: subSparkEl } = useEchart(subSpark, { notMerge: false })
</script>

<template>
  <section
    class="metric-hero"
    :class="{ 'is-static': !canViewSales }"
    :role="canViewSales ? 'link' : null"
    :tabindex="canViewSales ? 0 : null"
    :aria-label="canViewSales ? ariaLabel : null"
    @click="canViewSales && goSale()"
    @keyup.enter="canViewSales && goSale()"
  >
    <div class="hero-glow" aria-hidden="true"></div>

    <!-- 右上角：统计周期分段切换（stop 防止触发面板整体跳转） -->
    <div
      class="period-switch"
      role="tablist"
      aria-label="统计周期切换"
      @click.stop
      @keyup.stop
    >
      <span class="period-slider" :class="{ 'is-month': !isToday }" aria-hidden="true"></span>
      <button
        type="button"
        role="tab"
        class="period-btn"
        :class="{ 'is-active': isToday }"
        :aria-selected="isToday"
        @click="switchPeriod('today')"
      >
        今日
      </button>
      <button
        type="button"
        role="tab"
        class="period-btn"
        :class="{ 'is-active': !isToday }"
        :aria-selected="!isToday"
        @click="switchPeriod('month')"
      >
        本月
      </button>
    </div>

    <!-- 主指标：销售额 -->
    <div class="hero-block">
      <div class="hero-label">{{ mainLabel }}<span class="hero-unit">元</span></div>
      <div class="hero-value num">¥{{ money(displayMain) }}</div>
      <div class="hero-trend">
        <span class="rate-tag" :class="mainData.rate >= 0 ? 'is-up' : 'is-down'">
          <el-icon class="rate-icon">
            <CaretTop v-if="mainData.rate >= 0" />
            <CaretBottom v-else />
          </el-icon>
          {{ Math.abs(mainData.rate) }}%
        </span>
        <span class="rate-desc">{{ rateDesc }}</span>
      </div>
      <div class="hero-spark">
        <div ref="mainSparkEl" class="spark-canvas"></div>
        <span v-if="!mainData.trend || mainData.trend.length === 0" class="spark-empty">暂无趋势数据</span>
      </div>
    </div>

    <div v-if="showProfit" class="hero-divider" aria-hidden="true"></div>

    <!-- 副指标：利润（非管理员隐藏） -->
    <div v-if="showProfit" class="hero-block">
      <div class="hero-label">{{ subLabel }}<span class="hero-unit">元</span></div>
      <div class="hero-value num">¥{{ money(displaySub) }}</div>
      <div class="hero-trend">
        <span class="rate-tag" :class="subData.rate >= 0 ? 'is-up' : 'is-down'">
          <el-icon class="rate-icon">
            <CaretTop v-if="subData.rate >= 0" />
            <CaretBottom v-else />
          </el-icon>
          {{ Math.abs(subData.rate) }}%
        </span>
        <span class="rate-desc">{{ rateDesc }}</span>
      </div>
      <div class="hero-spark">
        <div ref="subSparkEl" class="spark-canvas"></div>
        <span v-if="!subData.trend || subData.trend.length === 0" class="spark-empty">暂无趋势数据</span>
      </div>
    </div>

    <div v-if="canViewSales" class="hero-foot">
      查看销售明细
      <el-icon class="foot-arrow"><ArrowRight /></el-icon>
    </div>
  </section>
</template>

<style scoped>
.metric-hero {
  position: relative;
  height: 100%;
  min-height: 268px;
  padding: 22px 24px 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-card);
  background-color: var(--sidebar-bg);
  cursor: pointer;
  outline: none;
  transition: box-shadow var(--motion-base) var(--ease-standard);
}

.metric-hero:hover {
  box-shadow: var(--shadow-md);
}

.metric-hero.is-static,
.metric-hero.is-static:hover {
  cursor: default;
  box-shadow: none;
}

.metric-hero:active {
  transform: translateY(1px);
}

.metric-hero:focus-visible {
  box-shadow: 0 0 0 2px var(--brand-primary-light-5);
}

/* 顶部翡翠微光，沿用侧边栏 / 登录品牌区语言 */
.hero-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 70% at 8% -20%, rgba(10, 133, 94, 0.22), transparent 62%);
}

/* ==================== 周期分段切换（深色底适配） ==================== */
.period-switch {
  position: absolute;
  top: 18px;
  right: 20px;
  z-index: 2;
  display: flex;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--sidebar-border);
}

/* 滑动指示块：两枚等宽按钮之间平滑滑移 */
.period-slider {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc(50% - 3px);
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.16);
  transition: transform var(--motion-base) var(--ease-standard);
}

.period-slider.is-month {
  transform: translateX(100%);
}

.period-btn {
  position: relative;
  z-index: 1;
  min-width: 50px;
  padding: 3px 10px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  color: var(--sidebar-text); /* 未选中：浅灰 */
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease-standard);
}

.period-btn:hover {
  color: var(--sidebar-text-hover);
}

/* 选中：白色文字 + 半透明浅色滑块衬底 */
.period-btn.is-active {
  color: #fff;
  font-weight: 600;
}

.period-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--brand-primary-light-5);
}

/* ==================== 指标块 ==================== */
.hero-block {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.hero-label {
  font-size: 13px;
  color: var(--sidebar-text);
  letter-spacing: 0.02em;
  /* 预留右上角切换按钮的宽度，避免窄面板时文字与其重叠 */
  padding-right: 150px;
}

.hero-unit {
  margin-left: 6px;
  font-size: 12px;
  color: #6b7890;
}

.hero-value {
  margin-top: 8px;
  font-size: 30px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #fff;
}

.hero-trend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.rate-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.rate-tag.is-up {
  color: color-mix(in srgb, var(--brand-primary-hover) 62%, white);
  background: color-mix(in srgb, var(--brand-primary) 24%, transparent);
}

.rate-tag.is-down {
  color: color-mix(in srgb, var(--color-danger) 68%, white);
  background: color-mix(in srgb, var(--color-danger) 24%, transparent);
}

.rate-icon {
  font-size: 12px;
}

.rate-desc {
  font-size: 12px;
  color: #6b7890;
}

.hero-spark {
  position: relative;
  flex: 1;
  min-height: 48px;
  margin-top: 6px;
}

/* 画布绝对定位铺满，保证空数据占位与图表互不干扰（ref 始终存在，无需条件挂载） */
.spark-canvas {
  position: absolute;
  inset: 0;
}

/* 空数据兜底：趋势线无数据时给出轻量提示，避免直接空白 */
.spark-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #6b7890;
}

.hero-divider {
  position: relative;
  z-index: 1;
  height: 1px;
  margin: 14px 0;
  background: var(--sidebar-border);
}

.hero-foot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 12.5px;
  color: var(--sidebar-text);
  transition: color var(--motion-fast) var(--ease-standard);
}

.metric-hero:hover .hero-foot {
  color: #fff;
}

.foot-arrow {
  font-size: 13px;
  transition: transform var(--motion-fast) var(--ease-standard);
}

.metric-hero:hover .foot-arrow {
  transform: translateX(3px);
}
</style>
