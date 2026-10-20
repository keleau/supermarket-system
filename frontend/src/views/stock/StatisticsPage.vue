<script setup>
/**
 * 库存统计页（库存管理）
 * 结构：顶部统计卡片 → 图表行（库存余量 TOP5 柱状图 + 分类库存占比环形图）→ 预警商品表格
 * 数据来源：
 * - GET /api/stock/statistics  顶部统计卡片
 * - GET /api/dashboard/stock-top       库存余量 TOP5
 * - GET /api/dashboard/category-stock  各分类库存占比
 * - GET /api/stock/warn/list            预警商品（无分页，前端做表格分页）
 * 支持从首页跳转携带 query.filter（warn=仅库存偏低 / pending=全部预警项）自动筛选
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Box, Warning, Goods, Money, DocumentChecked } from '@element-plus/icons-vue'
import ChartCard from '@/views/dashboard/components/ChartCard.vue'
import { axisTextStyle, baseTooltip, cssVar, useEchart } from '@/composables/useEchart.js'
import { getStockStatistics, getWarnList } from '@/api/modules/stock'
import { getProductList } from '@/api/modules/product'
import { getCategoryStock, getStockTop } from '@/api/modules/dashboard'
import { formatInt, money } from '@/utils/format.js'

const route = useRoute()

/* ---------------- 数据加载 ---------------- */

const loading = ref(false)
const stats = ref({})
const warnProducts = ref([])
const stockTop = ref([])
const categoryStock = ref([])
/** 商品总种类（SKU 数） */
const productKindCount = ref(0)

async function loadData() {
  loading.value = true
  try {
    const [statistics, warns, top, categories, products] = await Promise.all([
      getStockStatistics(),
      getWarnList(),
      getStockTop(),
      getCategoryStock(),
      // 只取总数：pageSize 给 1，用返回的 total 作为商品种类数
      getProductList({ pageNum: 1, pageSize: 1 }),
    ])
    stats.value = statistics || {}
    warnProducts.value = Array.isArray(warns) ? warns : []
    stockTop.value = Array.isArray(top) ? top : []
    categoryStock.value = Array.isArray(categories) ? categories : []
    productKindCount.value = products?.total || 0
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

/* ---------------- 顶部统计指标 ---------------- */

const statCards = computed(() => [
  { key: 'totalStock', label: '库存总量', value: stats.value.totalStock || 0, unit: '件', icon: Box, tone: 'brand' },
  { key: 'kind', label: '商品总种类', value: productKindCount.value, unit: '种', icon: Goods, tone: 'info' },
  { key: 'warn', label: '库存预警商品', value: stats.value.warnProductCount || 0, unit: '种', icon: Warning, tone: 'warning' },
  { key: 'pending', label: '待盘点商品', value: stats.value.pendingProductCount || 0, unit: '种', icon: DocumentChecked, tone: 'danger' },
  { key: 'value', label: '库存总价值', value: stats.value.totalStockValue || 0, unit: '元', icon: Money, tone: 'success', isMoney: true },
])

/* ---------------- 预警商品表 ---------------- */

const filterForm = reactive({ status: '' })

const filteredWarnProducts = computed(() =>
  warnProducts.value.filter((p) => {
    if (filterForm.status !== '' && p.warnStatus !== filterForm.status) return false
    return true
  }),
)

const pagination = reactive({ pageNum: 1, pageSize: 10 })

const pagedWarnProducts = computed(() => {
  const start = (pagination.pageNum - 1) * pagination.pageSize
  return filteredWarnProducts.value.slice(start, start + pagination.pageSize)
})

/** 预警状态标签（1 低于预警值 2 已缺货，与后端契约一致） */
const WARN_STATUS = {
  1: { label: '低于预警值', tag: 'warning' },
  2: { label: '已缺货', tag: 'danger' },
}

function warnMeta(warnStatus) {
  return WARN_STATUS[warnStatus] || { label: '未知', tag: 'info' }
}

/* ---------------- 图表 1：库存余量 TOP5 柱状图 ---------------- */

const stockBarOption = computed(() => {
  const borderLight = cssVar('--border-light')
  return {
    animation: false,
    tooltip: baseTooltip({
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value) => `${formatInt(value)} 件`,
    }),
    grid: { left: 10, right: 14, top: 30, bottom: 6, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: stockTop.value.map((p) => p.productName),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: borderLight } },
      axisLabel: { ...axisTextStyle(), interval: 0, rotate: 24, width: 84, overflow: 'truncate' },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: borderLight } },
      axisLabel: axisTextStyle(),
    },
    series: [
      {
        type: 'bar',
        data: stockTop.value.map((p) => p.stockNum),
        barWidth: 24,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: cssVar('--brand-primary'),
        },
      },
    ],
  }
})

const { chartEl: stockBarEl } = useEchart(stockBarOption)

/* ---------------- 图表 2：分类库存占比环形图 ---------------- */

/** 分类 → 图表色令牌（与 design.md 图表色板一致，超出 5 色时按序循环） */
const CATEGORY_TOKENS = {
  饮料乳品: '--chart-1',
  休闲零食: '--chart-2',
  粮油调味: '--chart-3',
  日用百货: '--chart-4',
  生鲜果蔬: '--chart-5',
}

const FALLBACK_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5']

const donutColors = FALLBACK_TOKENS.map((token) => cssVar(token))

const categoryTotal = computed(() =>
  categoryStock.value.reduce((sum, c) => sum + Number(c.stockNum || 0), 0),
)

const donutOption = computed(() => ({
  animation: false,
  color: donutColors,
  tooltip: baseTooltip({
    trigger: 'item',
    formatter: (p) => `${p.name}：${formatInt(p.value)} 件（${p.percent}%）`,
  }),
  series: [
    {
      type: 'pie',
      radius: ['56%', '80%'],
      center: ['50%', '50%'],
      padAngle: 2,
      itemStyle: { borderRadius: 5, borderColor: cssVar('--bg-card'), borderWidth: 2 },
      label: { show: false },
      labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data: categoryStock.value.map((c, index) => ({
        name: c.categoryName,
        value: c.stockNum,
        itemStyle: {
          color: cssVar(CATEGORY_TOKENS[c.categoryName] || FALLBACK_TOKENS[index % FALLBACK_TOKENS.length]),
        },
      })),
    },
  ],
}))

const { chartEl: donutEl } = useEchart(donutOption)

/* ---------------- 首页跳转 query.filter 联动 ---------------- */

onMounted(() => {
  const filter = route.query.filter
  if (filter === 'warn') filterForm.status = 1
  else if (filter === 'pending') filterForm.status = '' // 待盘点 = 全部预警项
})
</script>

<template>
  <div class="stock-stats">
    <!-- ============ 顶部统计卡片 ============ -->
    <section class="stat-grid">
      <div v-for="card in statCards" :key="card.key" class="page-card stat-card">
        <span class="stat-icon" :class="`tone-${card.tone}`">
          <el-icon :size="20"><component :is="card.icon" /></el-icon>
        </span>
        <div class="stat-info">
          <span class="stat-label">{{ card.label }}</span>
          <span class="stat-value num">
            <template v-if="card.isMoney">¥{{ money(card.value) }}</template>
            <template v-else>{{ formatInt(card.value) }}</template>
            <em>{{ card.unit }}</em>
          </span>
        </div>
      </div>
    </section>

    <!-- ============ 图表行 ============ -->
    <section class="chart-grid">
      <ChartCard title="库存余量 TOP5" subtitle="按当前库存数量排序">
        <div ref="stockBarEl" class="chart-canvas" />
      </ChartCard>
      <ChartCard title="分类库存占比" subtitle="各分类库存数量占比">
        <div class="donut-wrap">
          <div ref="donutEl" class="chart-canvas donut-canvas" />
          <div class="donut-center">
            <span class="donut-total num">{{ formatInt(categoryTotal) }}<em class="donut-unit">件</em></span>
            <span class="donut-total-label">库存总量</span>
          </div>
        </div>
      </ChartCard>
    </section>

    <!-- ============ 预警商品表格 ============ -->
    <section class="page-card table-card">
      <header class="table-head">
        <div class="table-heading">
          <h3 class="table-title">库存预警商品</h3>
          <span class="table-sub">库存低于各自预警阈值、或已缺货的商品</span>
        </div>
        <el-radio-group v-model="filterForm.status" size="small" @change="pagination.pageNum = 1">
          <el-radio-button :value="''">全部</el-radio-button>
          <el-radio-button :value="1">低于预警值</el-radio-button>
          <el-radio-button :value="2">已缺货</el-radio-button>
        </el-radio-group>
      </header>

      <el-table v-loading="loading" :data="pagedWarnProducts" class="warn-table">
        <el-table-column prop="productName" label="商品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="productCode" label="条码" min-width="150">
          <template #default="{ row }">
            <span class="code">{{ row.productCode }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="stockNum" label="当前库存" align="right" width="110">
          <template #default="{ row }">
            <span class="num" :class="{ 'is-out': row.warnStatus === 2 }">{{ formatInt(row.stockNum) }}{{ row.unit }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="warnNum" label="预警阈值" align="right" width="110">
          <template #default="{ row }">
            <span class="num">{{ formatInt(row.warnNum) }}{{ row.unit }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="warnMeta(row.warnStatus).tag" effect="light" round size="small">
              {{ warnMeta(row.warnStatus).label }}
            </el-tag>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty">
            <el-icon :size="32" class="empty-icon"><Warning /></el-icon>
            <p>暂无预警商品</p>
          </div>
        </template>
      </el-table>

      <div class="table-foot">
        <el-pagination
          v-model:current-page="pagination.pageNum"
          v-model:page-size="pagination.pageSize"
          :total="filteredWarnProducts.length"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="pagination.pageNum = 1"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.stock-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ==================== 顶部统计卡片 ==================== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius-control);
}

.stat-icon.tone-brand {
  color: var(--brand-primary);
  background-color: var(--brand-primary-light-9);
}

.stat-icon.tone-info {
  color: var(--color-info);
  background-color: color-mix(in srgb, var(--color-info) 12%, white);
}

.stat-icon.tone-warning {
  color: var(--color-warning);
  background-color: color-mix(in srgb, var(--color-warning) 12%, white);
}

.stat-icon.tone-danger {
  color: var(--color-danger);
  background-color: color-mix(in srgb, var(--color-danger) 12%, white);
}

.stat-icon.tone-success {
  color: var(--color-success);
  background-color: color-mix(in srgb, var(--color-success) 12%, white);
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
}

.stat-value em {
  margin-left: 4px;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  color: var(--text-secondary);
}

/* ==================== 图表行 ==================== */
.chart-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
}

.chart-canvas {
  flex: 1;
  width: 100%;
  height: 300px;
}

.donut-wrap {
  position: relative;
  flex: 1;
  width: 100%;
  height: 300px;
}

.donut-canvas {
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
  font-size: 22px;
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

/* ==================== 预警商品表格 ==================== */
.table-card {
  padding: 20px;
}

.table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.table-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.table-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.table-sub {
  font-size: 13px;
  color: var(--text-secondary);
}

.warn-table :deep(.el-table th.el-table__cell) {
  background: var(--bg-muted);
  color: var(--text-regular);
  font-weight: 500;
}

.warn-table :deep(.el-table__row:hover > td) {
  background: var(--bg-muted) !important;
}

.code {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.num {
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 13px;
  color: var(--text-regular);
}

.num.is-out {
  color: var(--color-danger);
  font-weight: 600;
}

.table-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.empty-icon {
  color: var(--text-disabled);
}

/* ==================== 响应式 ==================== */
@media (max-width: 1199px) {
  .stat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 991px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .chart-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }
  .stat-card {
    padding: 14px 16px;
  }
  .table-card {
    padding: 12px;
  }
  .table-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
