<script setup>
/**
 * 运营总览（首页仪表盘）
 * 布局：顶部左核心指标大面板 + 右 4 个紧凑小指标；
 * 下方非均分网格：左侧近 7 日销售面积图 / 库存 TOP5 柱状图，右侧通高环形图 + 热销横向条形图。
 * 数据来源：@/api/modules/dashboard.js 的 5 个统计接口（并发请求，一次拿全）。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { graphic } from 'echarts/core'
import { useUserStore } from '@/store/user'
import ChartCard from './components/ChartCard.vue'
import MetricHero from './components/MetricHero.vue'
import {
  axisTextStyle,
  baseTooltip,
  cssVar,
  hexToRgba,
  preferReducedMotion,
  useEchart,
} from '@/composables/useEchart'
import {
  getCategoryStock,
  getDashboardOverview,
  getHotProducts,
  getSaleTrend,
  getStockTop,
} from '@/api/modules/dashboard'

const router = useRouter()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
/** 支持字符串路径或 { path, query } 对象形式的跳转 */
function go(target) {
  router.push(target)
}

/* ---------------- 数据拉取 ---------------- */

const loading = ref(false)
const overview = ref({})
const saleTrend = ref([])
const stockTop = ref([])
const categoryStock = ref([])
const hotProducts = ref([])

/** 并发拉取首页全部数据 */
async function loadDashboard() {
  loading.value = true
  try {
    const [ov, trend, top, category, hot] = await Promise.all([
      getDashboardOverview(),
      getSaleTrend({ days: 7 }),
      getStockTop(),
      getCategoryStock(),
      getHotProducts(),
    ])
    overview.value = ov || {}
    saleTrend.value = Array.isArray(trend) ? trend : []
    stockTop.value = Array.isArray(top) ? top : []
    categoryStock.value = Array.isArray(category) ? category : []
    hotProducts.value = Array.isArray(hot) ? hot : []
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)

/* ---------------- 顶部指标数据 ---------------- */

/** 今日组：销售额 + 利润（深色面板右上角可切换 今日/本月） */
const todayMetric = computed(() => ({
  sale: {
    amount: overview.value.todaySaleAmount || 0,
    rate: overview.value.todayCompareRate || 0,
    trend: overview.value.todayTrend || [],
  },
  profit: {
    amount: overview.value.todayProfitAmount || 0,
    rate: overview.value.todayProfitRate || 0,
    trend: overview.value.todayProfitTrend || [],
  },
}))

/** 本月组：销售额 + 利润 */
const monthMetric = computed(() => ({
  sale: {
    amount: overview.value.monthSaleAmount || 0,
    rate: overview.value.monthSaleRate || 0,
    trend: overview.value.monthSaleTrend || [],
  },
  profit: {
    amount: overview.value.monthProfitAmount || 0,
    rate: overview.value.monthProfitRate || 0,
    trend: overview.value.monthTrend || [],
  },
}))

/** 右侧 4 个紧凑小指标（点击跳转对应页面） */
const miniMetrics = computed(() => [
  {
    key: 'inbound',
    label: '本月收货总数量',
    value: overview.value.monthInboundQuantity || 0,
    unit: '件',
    icon: 'Van',
    tone: 'success',
    rate: overview.value.inboundCompareRate ?? null,
    to: userStore.can('stock:read') ? '/stock/inbound' : null,
  },
  {
    key: 'kind',
    label: '商品总种类',
    value: overview.value.productKindCount || 0,
    unit: '种',
    icon: 'Goods',
    tone: 'brand',
    to: '/product/list',
  },
  {
    key: 'warn',
    label: '库存预警商品',
    value: overview.value.warnProductCount || 0,
    unit: '种',
    icon: 'Warning',
    tone: 'warning',
    // 跳库存统计并自动筛选预警商品（库存统计页读取 query.filter）
    to: userStore.can('stock:read')
      ? { path: '/stock/statistics', query: { filter: 'warn' } }
      : null,
  },
  {
    key: 'pending',
    label: '待补货商品',
    value: overview.value.pendingStockCount || 0,
    unit: '种',
    icon: 'DocumentChecked',
    tone: 'info',
    // 跳库存统计并自动筛选待补货商品
    to: userStore.can('stock:read')
      ? { path: '/stock/statistics', query: { filter: 'pending' } }
      : null,
  },
])

function formatInt(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

/* ---------------- 卡片摘要小字（与图表数据同一口径，动态计算） ---------------- */

/** 库存 TOP5 合计 */
const stockTopSum = computed(() => stockTop.value.reduce((sum, item) => sum + Number(item.stockNum || 0), 0))
/** 热销 TOP5 周期总销量 */
const hotQuantitySum = computed(() =>
  hotProducts.value.reduce((sum, item) => sum + Number(item.saleQuantity || 0), 0),
)

/* ---------------- 图表 1：近 7 日销售金额面积图 ---------------- */

const saleAreaOption = computed(() => {
  const brand = cssVar('--brand-primary')
  const card = cssVar('--bg-card')
  const borderLight = cssVar('--border-light')
  return {
    animation: !preferReducedMotion(),
    animationDuration: 800,
    animationEasing: 'cubicOut',
    tooltip: baseTooltip({
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: cssVar('--brand-primary-light-7'), type: 'dashed' },
      },
      valueFormatter: (value) => `¥${formatInt(value)}`,
    }),
    grid: { left: 10, right: 14, top: 22, bottom: 6, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: saleTrend.value.map((item) => item.date),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: borderLight } },
      axisLabel: { ...axisTextStyle(), margin: 12 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: borderLight } },
      axisLabel: {
        ...axisTextStyle(),
        formatter: (value) => (value >= 1000 ? `${value / 1000}k` : value),
      },
    },
    series: [
      {
        type: 'line',
        data: saleTrend.value.map((item) => item.amount),
        smooth: 0.4,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2.5, color: brand },
        itemStyle: { color: brand, borderColor: card, borderWidth: 2 },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: hexToRgba(brand, 0.16) },
            { offset: 1, color: hexToRgba(brand, 0.01) },
          ]),
        },
      },
    ],
  }
})

/* ---------------- 图表 2：库存余量 TOP5 柱状图 ---------------- */

const stockBarOption = computed(() => {
  const borderLight = cssVar('--border-light')
  return {
    animation: !preferReducedMotion(),
    animationDuration: 700,
    animationEasing: 'cubicOut',
    tooltip: baseTooltip({
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: hexToRgba(cssVar('--color-info'), 0.06) } },
      valueFormatter: (value) => `${formatInt(value)} 件`,
    }),
    grid: { left: 10, right: 14, top: 20, bottom: 6, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: stockTop.value.map((item) => item.productName),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: borderLight } },
      axisLabel: { ...axisTextStyle(), interval: 0, rotate: 24, width: 84, overflow: 'truncate' },
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitLine: { lineStyle: { color: borderLight } },
      axisLabel: axisTextStyle(),
    },
    series: [
      {
        type: 'bar',
        data: stockTop.value.map((item) => item.stockNum),
        barWidth: 26,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: cssVar('--brand-primary-hover') },
            { offset: 1, color: cssVar('--brand-primary-light-3') },
          ]),
        },
      },
    ],
  }
})

/* ---------------- 图表 3：商品分类库存环形图 ---------------- */

/**
 * 环形图分类色板：低饱和水果色系，仅用于图表分类
 * （design.md 已登记 --chart-* 令牌，定义于 src/styles/index.css，禁止硬编码色值）
 */
const donutColors = [
  cssVar('--chart-1'),
  cssVar('--chart-2'),
  cssVar('--chart-3'),
  cssVar('--chart-4'),
  cssVar('--chart-5'),
]

/** 分类数超过 5 个时按序循环色板，避免第 6 个起颜色 / 图例圆点丢失 */
function donutColorAt(index) {
  return donutColors[index % donutColors.length]
}

const categoryTotal = computed(() =>
  categoryStock.value.reduce((sum, item) => sum + Number(item.stockNum || 0), 0),
)

const donutOption = computed(() => ({
  animation: !preferReducedMotion(),
  animationDuration: 700,
  animationEasing: 'cubicOut',
  color: donutColors,
  tooltip: baseTooltip({
    trigger: 'item',
    formatter: (params) => `${params.name}：${formatInt(params.value)} 件（${params.percent}%）`,
  }),
  series: [
    {
      type: 'pie',
      radius: ['62%', '84%'],
      center: ['50%', '50%'],
      padAngle: 2,
      itemStyle: {
        borderRadius: 5,
        borderColor: cssVar('--bg-card'),
        borderWidth: 2,
      },
      label: { show: false },
      labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data: categoryStock.value.map((item, index) => ({
        name: item.categoryName,
        value: item.stockNum,
        itemStyle: { color: donutColorAt(index) },
      })),
    },
  ],
}))

/* ---------------- 图表 4：热销 TOP5 横向条形图（业务口径：按售出数量统计） ---------------- */

const hotBarOption = computed(() => {
  // 低饱和橙（复用图表分类色板 --chart-2 橙子橙，避免与品牌绿重复强调）
  const orange = cssVar('--chart-2')
  // 接口已按售出数量降序返回，这里再排一次以防口径变化
  const hotList = [...hotProducts.value].sort((a, b) => b.saleQuantity - a.saleQuantity)
  return {
    animation: !preferReducedMotion(),
    animationDuration: 700,
    animationEasing: 'cubicOut',
    tooltip: baseTooltip({
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: hexToRgba(cssVar('--color-info'), 0.06) } },
      valueFormatter: (value) => `${formatInt(value)} 件`,
    }),
    grid: { left: 8, right: 60, top: 8, bottom: 4, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      data: hotList.map((item) => item.productName),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { ...axisTextStyle(), fontSize: 12.5, width: 118, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: hotList.map((item) => item.saleQuantity),
        barWidth: 12,
        showBackground: true,
        backgroundStyle: {
          color: cssVar('--bg-muted'),
          borderRadius: [0, 6, 6, 0],
        },
        itemStyle: { color: orange, borderRadius: [0, 6, 6, 0] },
        label: {
          show: true,
          position: 'right',
          distance: 8,
          fontSize: 12,
          color: cssVar('--text-secondary'),
          formatter: (params) => `${formatInt(params.value)} 件`,
        },
      },
    ],
  }
})

const { chartEl: saleAreaEl } = useEchart(saleAreaOption)
const { chartEl: stockBarEl } = useEchart(stockBarOption)
const { chartEl: donutEl } = useEchart(donutOption)
const { chartEl: hotBarEl } = useEchart(hotBarOption)
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <!-- ============ 顶部：左核心大面板 + 右 4 小指标 ============ -->
    <section class="metric-row">
      <MetricHero
        class="dash-rise"
        style="--i: 0"
        :today="todayMetric"
        :month="monthMetric"
        :show-profit="isAdmin"
        :can-view-sales="userStore.can('sale:read')"
      />

      <div class="mini-grid">
        <section
          v-for="(item, index) in miniMetrics"
          :key="item.key"
          class="mini-card page-card dash-rise tactile"
          :class="{ 'is-static': !item.to }"
          :style="{ '--i': index + 1 }"
          @click="item.to && go(item.to)"
        >
          <div class="mini-top">
            <span class="mini-icon" :class="`tone-${item.tone}`">
              <el-icon><component :is="item.icon" /></el-icon>
            </span>
            <span v-if="item.rate != null" class="mini-rate" :class="item.rate >= 0 ? 'is-up' : 'is-down'">
              <el-icon><CaretTop v-if="item.rate >= 0" /><CaretBottom v-else /></el-icon>
              {{ Math.abs(item.rate) }}%
            </span>
          </div>
          <div class="mini-value num">
            {{ formatInt(item.value) }}
            <em class="mini-unit">{{ item.unit }}</em>
          </div>
          <div class="mini-label">{{ item.label }}</div>
        </section>
      </div>
    </section>

    <!-- ============ 下方图表区：非均分网格 ============ -->
    <section class="chart-row">
      <!-- 左上：近 7 日销售金额面积图 -->
      <ChartCard
        title="近 7 日销售金额"
        subtitle="单位：元"
        :clickable="userStore.can('sale:read')"
        class="area-card dash-rise"
        style="--i: 5"
        :empty="saleTrend.length === 0"
        @click="userStore.can('sale:read') && go('/sale/record')"
      >
        <div ref="saleAreaEl" class="chart-canvas"></div>
      </ChartCard>

      <!-- 左下：库存余量 TOP5 -->
      <ChartCard
        title="库存余量 TOP5"
        subtitle="按当前库存数量排序"
        :summary="`当前库存总量：${formatInt(stockTopSum)} 件`"
        :clickable="userStore.can('stock:read')"
        class="stock-card dash-rise"
        style="--i: 6"
        :empty="stockTop.length === 0"
        @click="userStore.can('stock:read') && go('/stock/statistics')"
      >
        <div ref="stockBarEl" class="chart-canvas"></div>
      </ChartCard>

      <!-- 右侧通高：分类库存环形 + 热销 TOP5 -->
      <div class="side-col">
        <ChartCard
          title="商品分类库存"
          subtitle="各分类库存数量占比"
          clickable
          class="dash-rise"
          style="--i: 7"
          :empty="categoryStock.length === 0"
          @click="go('/product/category')"
        >
          <div class="donut-wrap">
            <div class="donut-chart">
              <div ref="donutEl" class="chart-canvas"></div>
              <div class="donut-center">
                <span class="donut-total num">{{ formatInt(categoryTotal) }}<em class="donut-unit">件</em></span>
                <span class="donut-total-label">库存总量</span>
              </div>
            </div>
            <ul class="donut-legend">
              <li v-for="(item, index) in categoryStock" :key="item.categoryName">
                <i class="legend-dot" :style="{ backgroundColor: donutColorAt(index) }" aria-hidden="true"></i>
                <span class="legend-name">{{ item.categoryName }}</span>
                <b class="legend-value num">{{ formatInt(item.stockNum) }}</b>
              </li>
            </ul>
          </div>
        </ChartCard>

        <ChartCard
          title="热销 TOP5"
          subtitle="按售出数量排序，单位：件"
          :summary="`周期总销量：${formatInt(hotQuantitySum)} 件`"
          clickable
          class="dash-rise"
          style="--i: 8"
          :empty="hotProducts.length === 0"
          empty-text="暂无销售数据"
          @click="go('/sale/record')"
        >
          <div ref="hotBarEl" class="chart-canvas"></div>
        </ChartCard>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 卡片级联入场：仅透明度 + 位移；fill 用 backwards，动画结束即交还样式控制权，
   保证 hover 的 transform 位移不被动画填充值覆盖。系统开启"减少动态效果"时由全局规则降级 */
.dash-rise {
  animation: dash-rise 0.42s var(--ease-decel) backwards;
  animation-delay: calc(var(--i, 0) * 55ms);
}

@keyframes dash-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

/* ==================== 顶部指标区 ==================== */
.metric-row {
  display: grid;
  grid-template-columns: 1.72fr 1fr;
  gap: 16px;
  align-items: stretch;
}

.mini-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 16px;
}

.mini-card {
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

/* hover 轻微上浮 + 阴影加深；tactile 提供 :active 下沉 1px 的按压反馈 */
.mini-card:hover {
  border-color: var(--brand-primary-light-7);
  box-shadow: var(--shadow-sm);
  transform: translateY(-2px);
}

/* 无权限跳转的指标卡：保留数据展示，但不表现成可点击 */
.mini-card.is-static,
.mini-card.is-static:hover {
  cursor: default;
  transform: none;
}

.mini-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mini-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
  font-size: 18px;
}

.mini-icon.tone-brand {
  color: var(--brand-primary);
  background-color: var(--brand-primary-light-9);
}

.mini-icon.tone-success {
  color: var(--color-success);
  background-color: color-mix(in srgb, var(--color-success) 12%, white);
}

.mini-icon.tone-warning {
  color: var(--color-warning);
  background-color: color-mix(in srgb, var(--color-warning) 12%, white);
}

.mini-icon.tone-info {
  color: var(--color-info);
  background-color: color-mix(in srgb, var(--color-info) 12%, white);
}

.mini-rate {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.mini-rate.is-up {
  color: var(--color-success);
  background-color: color-mix(in srgb, var(--color-success) 10%, white);
}

.mini-rate.is-down {
  color: var(--color-danger);
  background-color: color-mix(in srgb, var(--color-danger) 10%, white);
}

.mini-value {
  margin-top: 14px;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
}

.mini-unit {
  margin-left: 5px;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  color: var(--text-secondary);
}

.mini-label {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ==================== 图表区 ==================== */
.chart-row {
  display: grid;
  grid-template-columns: 1.85fr 1fr;
  grid-template-rows: 252px 242px;
  gap: 16px;
}

.area-card {
  grid-column: 1;
  grid-row: 1;
}

.stock-card {
  grid-column: 1;
  grid-row: 2;
}

.side-col {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 16px;
  min-height: 0;
}

/* 图表画布：给 ECharts 稳定的尺寸来源 */
.chart-canvas {
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
}

/* ==================== 环形图卡片 ==================== */
.donut-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  min-height: 0;
}

.donut-chart {
  position: relative;
  flex: 0 0 47%;
  height: 100%;
  max-height: 178px;
}

.donut-chart .chart-canvas {
  height: 100%;
}

.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
}

.donut-total {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.donut-unit {
  margin-left: 3px;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  color: var(--text-secondary);
}

.donut-total-label {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.donut-legend {
  flex: 1;
  margin: 0;
  padding: 0 0 0 14px;
  list-style: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 9px;
  min-width: 0;
}

.donut-legend li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
}

.legend-name {
  flex: 1;
  color: var(--text-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-value {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

/* ==================== 响应式 ==================== */
@media (max-width: 1280px) {
  .chart-row {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }

  .area-card,
  .stock-card {
    grid-column: 1;
    grid-row: auto;
    min-height: 252px;
  }

  .stock-card {
    min-height: 242px;
  }

  .side-col {
    grid-column: 1;
    grid-row: auto;
  }
}

@media (max-width: 960px) {
  .metric-row {
    grid-template-columns: 1fr;
  }

  .metric-hero {
    min-height: 248px;
  }
}
</style>
