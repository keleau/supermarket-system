<script setup>
/**
 * 销售统计页（销售管理）
 * 结构：筛选卡片（日期区间快捷选择 + 商品分类/商品名称）→ 4 个统计卡片（含毛利率）
 *      → 每日销售额与毛利趋势柱状图 + 商品分类销售额占比饼图 → 商品销售统计表格（分页）
 * 数据来源：GET /api/sale/statistics（区间汇总 / 每日趋势 / 分类占比 / 商品明细一次拿全）
 * 口径说明：仅统计 status = 1 的正常单据；每日趋势由后端补齐，无销售日为 0
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Box, Money, TrendCharts, Wallet } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import ChartCard from '@/views/dashboard/components/ChartCard.vue'
import { axisTextStyle, baseTooltip, cssVar, useEchart } from '@/composables/useEchart.js'
import { getCategoryList } from '@/api/modules/product'
import { getSaleItemList, getSaleStatistics } from '@/api/modules/sale'
import { downloadCsv } from '@/utils/csv.js'
import { formatInt, money, rateText, round2 } from '@/utils/format.js'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)

/* ---------------- 筛选（与销售记录页一致的"查询后生效"模式） ---------------- */

function fmtDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayOffset(n) {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return date
}

/** 默认筛选近 7 天（与后端缺省口径一致） */
const defaultRange = () => [fmtDate(dayOffset(6)), fmtDate(new Date())]

const filterForm = reactive({
  dateRange: defaultRange(),
  categoryId: '',
  productName: '',
})

const appliedFilters = reactive({
  startDate: defaultRange()[0],
  endDate: defaultRange()[1],
  categoryId: '',
  productName: '',
})

/** 日期快捷选择（el-date-picker 弹窗左侧栏） */
const dateShortcuts = [
  { text: '今天', value: () => [new Date(), new Date()] },
  { text: '昨天', value: () => [dayOffset(1), dayOffset(1)] },
  { text: '近7天', value: () => [dayOffset(6), new Date()] },
  { text: '近30天', value: () => [dayOffset(29), new Date()] },
  { text: '本月', value: () => [new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date()] },
  { text: '自定义区间', value: () => (filterForm.dateRange?.[0] ? filterForm.dateRange.map((d) => new Date(d)) : [dayOffset(6), new Date()]) },
]

/** 分类下拉（来自分类接口） */
const categoryOptions = ref([])

/** 商品名称下拉：取自统计结果里的商品列表 */
const productStats = ref([])
const productNameOptions = computed(() => productStats.value.map((p) => p.productName))

/* ---------------- 统计数据 ---------------- */

const loading = ref(false)
const stats = ref({ summary: {}, dailyTrend: [], categoryStats: [], productStats: [] })

async function loadStats() {
  loading.value = true
  try {
    const res = await getSaleStatistics({
      startTime: appliedFilters.startDate || undefined,
      endTime: appliedFilters.endDate || undefined,
      categoryId: appliedFilters.categoryId === '' ? undefined : appliedFilters.categoryId,
      productName: appliedFilters.productName || undefined,
    })
    stats.value = {
      summary: res?.summary || {},
      dailyTrend: res?.dailyTrend || [],
      categoryStats: res?.categoryStats || [],
      productStats: res?.productStats || [],
    }
    productStats.value = res?.productStats || []
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  const list = await getCategoryList()
  categoryOptions.value = Array.isArray(list) ? list : []
}

onMounted(() => {
  loadCategories()
  loadStats()
})

function handleQuery() {
  appliedFilters.startDate = filterForm.dateRange?.[0] || ''
  appliedFilters.endDate = filterForm.dateRange?.[1] || ''
  appliedFilters.categoryId = filterForm.categoryId
  appliedFilters.productName = filterForm.productName
  pagination.pageNum = 1
  loadStats()
}

function handleReset() {
  // 恢复默认近 7 天，而不是清空日期（清空后后端仍按近 7 天统计，选择器却显示为空，口径不一致）
  filterForm.dateRange = defaultRange()
  filterForm.categoryId = ''
  filterForm.productName = ''
  handleQuery()
}

/* ---------------- 统计卡片 ---------------- */

const summary = computed(() => {
  const s = stats.value.summary
  return {
    totalQuantity: Number(s.totalQuantity || 0),
    totalAmount: Number(s.totalAmount || 0),
    totalCost: Number(s.totalCost || 0),
    totalProfit: Number(s.totalProfit || 0),
  }
})

const hasData = computed(() => productStats.value.length > 0)

/* ---------------- 每日趋势（后端已按区间补齐，无销售日为 0） ---------------- */

const dailyList = computed(() =>
  stats.value.dailyTrend.map((d) => ({
    date: d.date,
    sale: Number(d.sale || 0),
    cost: Number(d.cost || 0),
    profit: Number(d.profit || 0),
  })),
)

/* ---------------- 分类占比 ---------------- */

/** 分类 → 图表色令牌（design.md 图表色板映射，超出 5 色按序循环） */
const CATEGORY_TOKENS = {
  饮料乳品: '--chart-1',
  休闲零食: '--chart-2',
  粮油调味: '--chart-3',
  日用百货: '--chart-4',
  生鲜果蔬: '--chart-5',
}

const FALLBACK_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5']

const categoryList = computed(() =>
  stats.value.categoryStats.map((c) => ({ name: c.categoryName, amount: Number(c.amount || 0) })),
)

/* ---------------- 商品销售统计表 ---------------- */

const productList = computed(() =>
  productStats.value.map((row) => ({
    productId: row.productId,
    productName: row.productName,
    categoryName: row.categoryName,
    salePrice: Number(row.salePrice || 0),
    quantity: Number(row.quantity || 0),
    amount: Number(row.amount || 0),
    cost: Number(row.cost || 0),
    profit: Number(row.profit || 0),
    rate: Number(row.rate || 0),
  })),
)

/* ---------------- 表格排序（跨页排序，默认毛利降序） ---------------- */
const sortState = reactive({ prop: 'profit', order: 'descending' })

const sortedProducts = computed(() => {
  const list = [...productList.value]
  if (!sortState.prop || !sortState.order) return list
  const dir = sortState.order === 'ascending' ? 1 : -1
  return list.sort((a, b) => (a[sortState.prop] > b[sortState.prop] ? dir : a[sortState.prop] < b[sortState.prop] ? -dir : 0))
})

function onSortChange({ prop, order }) {
  sortState.prop = order ? prop : null
  sortState.order = order
  pagination.pageNum = 1
}

const pagination = reactive({ pageNum: 1, pageSize: 10 })

const pagedProducts = computed(() => {
  const start = (pagination.pageNum - 1) * pagination.pageSize
  return sortedProducts.value.slice(start, start + pagination.pageSize)
})

/* ---------------- 明细弹窗（该商品的逐笔销售明细） ---------------- */

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailProduct = ref(null)
const detailItems = ref([])

const detailSummary = computed(() => {
  const list = detailItems.value
  const amount = round2(list.reduce((sum, item) => sum + Number(item.amount || 0), 0))
  const quantity = list.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  return { orderCount: new Set(list.map((item) => item.saleNo)).size, quantity, amount }
})

async function openDetail(row) {
  detailProduct.value = row
  detailVisible.value = true
  detailItems.value = []
  detailLoading.value = true
  try {
    // 明细接口按商品查询（不分区间），取最近 20 条
    const res = await getSaleItemList({ productId: row.productId, pageNum: 1, pageSize: 20 })
    detailItems.value = res?.list || []
  } finally {
    detailLoading.value = false
  }
}

/* ---------------- 导出统计报表（仅管理员） ---------------- */

function exportStats() {
  const today = new Date().toISOString().slice(0, 10)
  downloadCsv(
    `销售统计_${today}.csv`,
    ['商品名称', '商品分类', '销售数量', '销售单价(元)', '销售总金额(元)', '总成本(元)', '毛利(元)', '毛利率'],
    productList.value.map((row) => [
      row.productName,
      row.categoryName,
      row.quantity,
      row.salePrice,
      row.amount,
      row.cost,
      row.profit,
      rateText(row.profit, row.amount),
    ]),
  )
  ElMessage.success(`已导出 ${productList.value.length} 个商品的销售统计`)
}

/* ---------------- 图表配置（配色全部走设计令牌） ---------------- */

const trendOption = computed(() => {
  const list = dailyList.value
  return {
    tooltip: baseTooltip({
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        // x 轴标签是 MM-DD（供展示），不能用 axisValue 反查完整日期；
        // 用 dataIndex 直接按位置取当天数据，才能拿到正确的成本 / 毛利
        const day = list[params[0]?.dataIndex] || { cost: 0, sale: 0, profit: 0 }
        const lines = params.map((p) => `${p.marker}${p.seriesName}　¥${money(p.value)}`)
        return [
          `<b>${day.date}</b>`,
          ...lines,
          `当日总成本　¥${money(day.cost)}`,
          `当日毛利率　${rateText(day.profit, day.sale)}`,
        ].join('<br/>')
      },
    }),
    legend: {
      top: 0,
      right: 0,
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 16,
      textStyle: { color: cssVar('--text-secondary'), fontSize: 12 },
    },
    grid: { left: 8, right: 8, top: 36, bottom: 0, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: {
      type: 'category',
      data: list.map((d) => d.date.slice(5)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: cssVar('--border-color') } },
      axisLabel: axisTextStyle(),
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: cssVar('--border-light') } },
      axisLabel: axisTextStyle(),
    },
    series: [
      {
        name: '销售额',
        type: 'bar',
        data: list.map((d) => d.sale),
        itemStyle: { color: cssVar('--chart-1'), borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 14,
      },
      {
        name: '毛利',
        type: 'bar',
        data: list.map((d) => d.profit),
        itemStyle: { color: cssVar('--chart-2'), borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 14,
      },
    ],
  }
})

const { chartEl: trendChartEl } = useEchart(trendOption)

const pieOption = computed(() => {
  const list = categoryList.value
  const total = round2(list.reduce((sum, d) => sum + d.amount, 0))
  return {
    tooltip: baseTooltip({
      trigger: 'item',
      formatter: (p) => `${p.marker}${p.name}<br/>销售额　¥${money(p.value)}<br/>占比　${p.percent}%`,
    }),
    legend: {
      orient: 'vertical',
      right: 4,
      top: 'center',
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 12,
      textStyle: { color: cssVar('--text-secondary'), fontSize: 12 },
      formatter: (name) => {
        const row = list.find((d) => d.name === name)
        return row ? `${name}　${rateText(row.amount, total)}` : name
      },
    },
    title: {
      text: `¥${money(total)}`,
      subtext: '销售总额',
      left: '33%',
      top: '38%',
      textAlign: 'center',
      textStyle: { fontSize: 20, fontWeight: 700, color: cssVar('--text-primary') },
      subtextStyle: { fontSize: 12, color: cssVar('--text-secondary') },
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '72%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: cssVar('--bg-card'), borderWidth: 2 },
        label: { show: false },
        data: list.map((d, index) => ({
          name: d.name,
          value: d.amount,
          itemStyle: {
            color: cssVar(CATEGORY_TOKENS[d.name] || FALLBACK_TOKENS[index % FALLBACK_TOKENS.length]),
          },
        })),
      },
    ],
  }
})

const { chartEl: pieChartEl } = useEchart(pieOption)
</script>

<template>
  <div class="sale-stats">
    <!-- ============ 筛选卡片 ============ -->
    <section class="page-card filter-card">
      <el-form inline class="filter-form" @submit.prevent>
        <el-form-item label="销售日期">
          <el-date-picker
            v-model="filterForm.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :shortcuts="dateShortcuts"
            :clearable="true"
            class="date-picker"
          />
        </el-form-item>
        <el-form-item label="商品分类">
          <el-select v-model="filterForm.categoryId" placeholder="全部" clearable class="category-select">
            <el-option v-for="c in categoryOptions" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="商品名称">
          <el-select
            v-model="filterForm.productName"
            placeholder="全部"
            clearable
            filterable
            class="product-select"
          >
            <el-option v-for="name in productNameOptions" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" @click="handleQuery">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button v-if="isAdmin" text type="primary" @click="exportStats">导出统计报表</el-button>
        </el-form-item>
      </el-form>
    </section>

    <!-- ============ 统计卡片 ============ -->
    <section class="stat-grid">
      <div class="page-card stat-card">
        <span class="stat-icon"><el-icon :size="20"><Box /></el-icon></span>
        <div class="stat-info">
          <span class="stat-label">销售总件数</span>
          <span class="stat-value num">{{ formatInt(summary.totalQuantity) }}<em>件</em></span>
        </div>
      </div>
      <div class="page-card stat-card">
        <span class="stat-icon"><el-icon :size="20"><Wallet /></el-icon></span>
        <div class="stat-info">
          <span class="stat-label">销售总金额</span>
          <span class="stat-value num">¥{{ money(summary.totalAmount) }}<em>元</em></span>
        </div>
      </div>
      <div class="page-card stat-card">
        <span class="stat-icon"><el-icon :size="20"><Money /></el-icon></span>
        <div class="stat-info">
          <span class="stat-label">总成本</span>
          <span class="stat-value num">¥{{ money(summary.totalCost) }}<em>元</em></span>
        </div>
      </div>
      <div class="page-card stat-card">
        <span class="stat-icon"><el-icon :size="20"><TrendCharts /></el-icon></span>
        <div class="stat-info">
          <span class="stat-label">总毛利</span>
          <span class="stat-value num" :class="{ 'is-loss': summary.totalProfit < 0 }">
            ¥{{ money(summary.totalProfit) }}<em>元</em>
          </span>
          <span class="stat-rate">毛利率 {{ rateText(summary.totalProfit, summary.totalAmount) }}</span>
        </div>
      </div>
    </section>

    <!-- ============ 图表行 ============ -->
    <section class="chart-grid">
      <ChartCard
        title="每日销售额与毛利趋势"
        subtitle="单位：元"
        :empty="!hasData"
        empty-text="筛选范围内暂无销售数据"
      >
        <div ref="trendChartEl" class="chart-canvas" />
      </ChartCard>
      <ChartCard
        title="商品分类销售额占比"
        subtitle="按筛选范围内销售额统计"
        :empty="!hasData"
        empty-text="筛选范围内暂无销售数据"
      >
        <div ref="pieChartEl" class="chart-canvas" />
      </ChartCard>
    </section>

    <!-- ============ 商品销售统计表 ============ -->
    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">商品销售统计</h3>
        <span class="table-sub">共 {{ productList.length }} 个商品</span>
      </header>

      <el-table
        v-loading="loading"
        :data="pagedProducts"
        class="stats-table"
        :default-sort="{ prop: 'profit', order: 'descending' }"
        @sort-change="onSortChange"
      >
        <el-table-column prop="productName" label="商品名称" min-width="170" show-overflow-tooltip />
        <el-table-column prop="categoryName" label="商品分类" width="110" />
        <el-table-column prop="quantity" label="销售数量" align="right" width="120" sortable="custom">
          <template #default="{ row }">
            <span class="num">{{ formatInt(row.quantity) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="salePrice" label="销售单价" align="right" width="120" sortable="custom">
          <template #default="{ row }">
            <span class="num">¥{{ money(row.salePrice) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="销售总金额" align="right" min-width="120" sortable="custom">
          <template #default="{ row }">
            <span class="num amount">¥{{ money(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="cost" label="总成本" align="right" min-width="110" sortable="custom">
          <template #default="{ row }">
            <span class="num">¥{{ money(row.cost) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="profit" label="毛利" align="right" min-width="110" sortable="custom">
          <template #default="{ row }">
            <span class="num" :class="row.profit < 0 ? 'is-loss' : 'amount'">¥{{ money(row.profit) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="rate" label="毛利率" align="right" width="96" sortable="custom">
          <template #default="{ row }">
            <span class="num" :class="{ 'is-loss': row.profit < 0 }">{{ rateText(row.profit, row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="96">
          <template #default="{ row }">
            <el-button text type="primary" @click="openDetail(row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="table-foot">
        <el-pagination
          v-model:current-page="pagination.pageNum"
          v-model:page-size="pagination.pageSize"
          :total="productList.length"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="pagination.pageNum = 1"
        />
      </div>
    </section>

    <!-- ============ 商品销售明细弹窗 ============ -->
    <el-dialog
      v-model="detailVisible"
      :title="`商品销售明细 - ${detailProduct?.productName || ''}`"
      width="62%"
      class="detail-dialog"
      :close-on-click-modal="false"
    >
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detailProduct">
          <el-descriptions :column="4" border class="detail-desc">
            <el-descriptions-item label="商品分类">{{ detailProduct.categoryName }}</el-descriptions-item>
            <el-descriptions-item label="订单笔数">
              <span class="num">{{ formatInt(detailSummary.orderCount) }} 笔</span>
            </el-descriptions-item>
            <el-descriptions-item label="销售总数量">
              <span class="num">{{ formatInt(detailSummary.quantity) }} 件</span>
            </el-descriptions-item>
            <el-descriptions-item label="销售总金额">
              <span class="num amount">¥{{ money(detailSummary.amount) }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <el-table :data="detailItems" max-height="380" class="detail-table">
            <el-table-column prop="saleNo" label="单据编号" min-width="170" show-overflow-tooltip />
            <el-table-column prop="createTime" label="销售时间" min-width="150" />
            <el-table-column label="销售数量" align="right" width="100">
              <template #default="{ row }">
                <span class="num">{{ formatInt(row.quantity) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="销售单价" align="right" width="100">
              <template #default="{ row }">
                <span class="num">¥{{ money(row.salePrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="小计金额" align="right" min-width="110">
              <template #default="{ row }">
                <span class="num amount">¥{{ money(row.amount) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sale-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ==================== 筛选卡片 ==================== */
.filter-card {
  padding: 20px 20px 0;
}

.filter-form :deep(.el-form-item) {
  margin-right: 16px;
  margin-bottom: 20px;
}

.filter-actions {
  float: right;
}

.date-picker {
  width: 280px;
}

.category-select,
.product-select {
  width: 150px;
}

/* ==================== 统计卡片 ==================== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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
  background: var(--brand-primary-light-9);
  color: var(--brand-primary);
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
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
}

.stat-value.is-loss {
  color: var(--color-danger);
}

.stat-value em {
  margin-left: 4px;
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
  color: var(--text-secondary);
}

.stat-rate {
  font-size: 12px;
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

/* ==================== 表格卡片 ==================== */
.table-card {
  padding: 18px 20px 16px;
}

.table-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
}

.table-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.table-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

.stats-table {
  width: 100%;
}

/* sortable 列头：文字 + 排序图标强制并排，避免列宽不足时图标换行 */
.stats-table :deep(.el-table__header .cell) {
  white-space: nowrap;
}

.amount {
  font-weight: 600;
}

.is-loss {
  color: var(--color-danger);
}

.table-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

/* ==================== 明细弹窗 ==================== */
.detail-dialog :deep(.el-dialog) {
  border-radius: var(--radius-card);
}

/* v-loading 必须挂在元素根节点上，不能直接挂 el-dialog */
.detail-body {
  min-height: 240px;
}

.detail-desc {
  margin-bottom: 16px;
}

.detail-table {
  width: 100%;
}

/* ==================== 响应式 ==================== */
/* 统计卡片：大屏 4 列 → 中屏 3 列 → 小屏 2 列 → 超小屏 1 列 */
.stat-grid {
  grid-template-columns: repeat(4, 1fr);
}

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
}
</style>
