<script setup>
/**
 * 出入库流水页（库存管理）
 * 结构：筛选卡片 → 统计小卡片 → 流水表格（服务端分页）
 * 业务：流水由出入库/销售结账时后端自动生成，页面只查询展示，不可编辑删除
 * 权限：所有职位只读；导出仅管理员可见
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Download } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { getStockLogList } from '@/api/modules/stock'
import { downloadCsv } from '@/utils/csv.js'
import { formatInt } from '@/utils/format.js'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)

/** 流水类型标签（1 入库 2 出库，与后端 changeType 契约一致） */
const CHANGE_TYPES = {
  1: { label: '入库', tag: 'success' },
  2: { label: '出库', tag: 'warning' },
}

function changeMeta(changeType) {
  return CHANGE_TYPES[changeType] || { label: '未知', tag: 'info' }
}

/** 业务类型标签（与后端 bizType 契约一致） */
const BIZ_TYPES = {
  1: { label: '采购入库', tag: 'success' },
  2: { label: '销售出库', tag: 'warning' },
  3: { label: '销售退货', tag: 'info' },
  4: { label: '盘点盘盈', tag: 'success' },
  5: { label: '盘点盘亏', tag: 'danger' },
  6: { label: '期初入库', tag: 'success' },
  7: { label: '手工调整', tag: 'info' },
}

const BIZ_OPTIONS = Object.entries(BIZ_TYPES).map(([value, meta]) => ({
  value: Number(value),
  label: meta.label,
}))

function bizMeta(bizType) {
  return BIZ_TYPES[bizType] || { label: '其他', tag: 'info' }
}

/* ---------------- 列表（服务端分页） ---------------- */

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10 })

const filterForm = reactive({
  productName: '',
  changeType: '',
  bizType: '',
  dateRange: [],
})

const appliedFilters = reactive({
  productName: '',
  changeType: '',
  bizType: '',
  startTime: '',
  endTime: '',
})

async function loadList() {
  loading.value = true
  try {
    const res = await getStockLogList({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      productName: appliedFilters.productName || undefined,
      changeType: appliedFilters.changeType === '' ? undefined : appliedFilters.changeType,
      bizType: appliedFilters.bizType === '' ? undefined : appliedFilters.bizType,
      startTime: appliedFilters.startTime || undefined,
      endTime: appliedFilters.endTime || undefined,
    })
    list.value = res?.list || []
    total.value = res?.total || 0
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  appliedFilters.productName = filterForm.productName.trim()
  appliedFilters.changeType = filterForm.changeType
  appliedFilters.bizType = filterForm.bizType
  appliedFilters.startTime = filterForm.dateRange?.[0] || ''
  appliedFilters.endTime = filterForm.dateRange?.[1] || ''
  pagination.pageNum = 1
  loadList()
}

function handleReset() {
  filterForm.productName = ''
  filterForm.changeType = ''
  filterForm.bizType = ''
  filterForm.dateRange = []
  handleQuery()
}

function handlePageChange(pageNum) {
  pagination.pageNum = pageNum
  loadList()
}

function handleSizeChange(pageSize) {
  pagination.pageSize = pageSize
  pagination.pageNum = 1
  loadList()
}

onMounted(loadList)

/* ---------------- 统计小卡片（按当前页数据汇总） ---------------- */

const summary = computed(() => {
  const rows = list.value
  const isIn = (l) => l.changeType === 1
  return {
    inCount: rows.filter(isIn).length,
    outCount: rows.filter((l) => !isIn(l)).length,
    inQuantity: rows.filter(isIn).reduce((s, l) => s + Number(l.quantity || 0), 0),
    outQuantity: rows.filter((l) => !isIn(l)).reduce((s, l) => s + Number(l.quantity || 0), 0),
  }
})

/* ---------------- 导出（仅管理员，导出当前页） ---------------- */

function exportLogs() {
  const today = new Date().toISOString().slice(0, 10)
  downloadCsv(
    `出入库流水_${today}.csv`,
    ['流水时间', '商品名称', '类型', '业务类型', '变动数量', '变动前', '变动后', '操作人', '备注'],
    list.value.map((l) => [
      l.createTime,
      l.productName,
      CHANGE_TYPES[l.changeType]?.label || '未知',
      l.bizTypeName || bizMeta(l.bizType).label,
      l.quantity,
      l.beforeNum,
      l.afterNum,
      l.operator,
      l.remark || '',
    ]),
  )
  ElMessage.success(`已导出当前页 ${list.value.length} 条流水记录`)
}
</script>

<template>
  <div class="log-page">
    <!-- ============ 筛选卡片 ============ -->
    <section class="page-card filter-card">
      <el-form :model="filterForm" inline class="filter-form" @submit.prevent>
        <el-form-item label="商品名称">
          <el-input
            v-model="filterForm.productName"
            placeholder="如 农夫山泉"
            clearable
            :prefix-icon="Search"
            style="width: 180px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="流水类型">
          <el-select v-model="filterForm.changeType" placeholder="全部" clearable style="width: 120px">
            <el-option label="入库" :value="1" />
            <el-option label="出库" :value="2" />
          </el-select>
        </el-form-item>
        <el-form-item label="业务类型">
          <el-select v-model="filterForm.bizType" placeholder="全部" clearable style="width: 130px">
            <el-option v-for="opt in BIZ_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="filterForm.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
          <el-button v-if="isAdmin" :icon="Download" @click="exportLogs">导出流水</el-button>
        </el-form-item>
      </el-form>
    </section>

    <!-- ============ 统计小卡片（当前页汇总） ============ -->
    <section class="stat-grid">
      <div class="page-card stat-card">
        <span class="stat-label">本页入库笔数</span>
        <span class="stat-value num">{{ formatInt(summary.inCount) }}<em>笔</em></span>
      </div>
      <div class="page-card stat-card">
        <span class="stat-label">本页入库总量</span>
        <span class="stat-value num">{{ formatInt(summary.inQuantity) }}<em>件</em></span>
      </div>
      <div class="page-card stat-card">
        <span class="stat-label">本页出库笔数</span>
        <span class="stat-value num">{{ formatInt(summary.outCount) }}<em>笔</em></span>
      </div>
      <div class="page-card stat-card">
        <span class="stat-label">本页出库总量</span>
        <span class="stat-value num">{{ formatInt(summary.outQuantity) }}<em>件</em></span>
      </div>
    </section>

    <!-- ============ 流水表格卡片 ============ -->
    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">出入库流水</h3>
        <span class="table-sub">共 {{ total }} 条流水记录</span>
      </header>

      <el-table v-loading="loading" :data="list" class="log-table">
        <el-table-column prop="createTime" label="时间" min-width="160" />
        <el-table-column prop="productName" label="商品名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="changeMeta(row.changeType).tag" effect="light" round size="small">
              {{ changeMeta(row.changeType).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="业务类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="bizMeta(row.bizType).tag" effect="plain" round size="small">
              {{ row.bizTypeName || bizMeta(row.bizType).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="变动数量" align="right" width="120">
          <template #default="{ row }">
            <span class="num" :class="row.changeType === 1 ? 'is-in' : 'is-out'">
              {{ row.changeType === 1 ? '+' : '-' }}{{ formatInt(row.quantity) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="库存变化" align="right" width="140">
          <template #default="{ row }">
            <span class="num">{{ formatInt(row.beforeNum) }} → <b>{{ formatInt(row.afterNum) }}</b></span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="100" />
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.remark || '—' }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty">
            <el-icon :size="32" class="empty-icon"><Tickets /></el-icon>
            <p>暂无出入库流水</p>
          </div>
        </template>
      </el-table>

      <div class="table-foot">
        <el-pagination
          :current-page="pagination.pageNum"
          :page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.log-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ==================== 筛选卡片 ==================== */
.filter-card {
  padding: 18px 20px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 20px;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 0;
  margin-right: 0;
}

.filter-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--text-regular);
}

.filter-actions {
  margin-left: auto !important;
}

/* ==================== 统计小卡片 ==================== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 26px;
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

/* ==================== 表格卡片 ==================== */
.table-card {
  padding: 20px;
}

.table-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
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

.log-table :deep(.el-table th.el-table__cell) {
  background: var(--bg-muted);
  color: var(--text-regular);
  font-weight: 500;
}

.log-table :deep(.el-table__row:hover > td) {
  background: var(--bg-muted) !important;
}

.num {
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 13px;
  font-weight: 600;
}

.is-in {
  color: var(--color-success);
}

.is-out {
  color: var(--color-warning);
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
@media (max-width: 1280px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 991px) {
  .filter-form {
    gap: 8px 12px;
  }
}

@media (max-width: 767px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }
  .filter-card {
    padding: 12px;
  }
  .filter-form {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .filter-form :deep(.el-form-item) {
    width: 100%;
    margin: 0;
  }
  .filter-form :deep(.el-input),
  .filter-form :deep(.el-select),
  .filter-form :deep(.el-date-editor) {
    width: 100% !important;
  }
  .filter-actions {
    width: 100%;
    margin-left: 0 !important;
    justify-content: flex-end;
  }
  .table-card {
    padding: 12px;
  }
}
</style>
