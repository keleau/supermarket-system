<script setup>
/**
 * 操作日志页（仅管理员）
 * 记录关键单据动作：商品变更、入库/出库、销售开单/退货/作废、盘点提交/审核。
 * 日志只读，不提供修改/删除入口。
 */
import { onMounted, reactive, ref } from 'vue'
import { Search, Refresh } from '@element-plus/icons-vue'
import PagePagination from '@/components/PagePagination.vue'
import { usePagination } from '@/composables/usePagination'
import { getOperationLogList } from '@/api/modules/operationLog'

const MODULES = {
  product: '商品',
  stock: '库存',
  sale: '销售',
  stocktake: '盘点',
}

const ACTIONS = {
  create: '新增',
  update: '修改',
  delete: '删除',
  inbound: '入库',
  outbound: '出库',
  return: '退货',
  void: '作废',
  submit: '提交',
  audit: '审核',
  cancel: '取消',
}

const MODULE_OPTIONS = Object.entries(MODULES).map(([value, label]) => ({ value, label }))
const ACTION_OPTIONS = Object.entries(ACTIONS).map(([value, label]) => ({ value, label }))

const loading = ref(false)
const list = ref([])
const total = ref(0)
const { pagination, handlePageChange, handleSizeChange } = usePagination(loadList, { pageSize: 20 })

const filterForm = reactive({
  module: '',
  action: '',
  username: '',
  dateRange: [],
})
const applied = reactive({ module: '', action: '', username: '', startTime: '', endTime: '' })

async function loadList() {
  loading.value = true
  try {
    const res = await getOperationLogList({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      module: applied.module || undefined,
      action: applied.action || undefined,
      username: applied.username || undefined,
      startTime: applied.startTime || undefined,
      endTime: applied.endTime || undefined,
    })
    list.value = res?.list || []
    total.value = res?.total || 0
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  applied.module = filterForm.module
  applied.action = filterForm.action
  applied.username = filterForm.username.trim()
  applied.startTime = filterForm.dateRange?.[0] || ''
  applied.endTime = filterForm.dateRange?.[1] || ''
  pagination.pageNum = 1
  loadList()
}

function handleReset() {
  filterForm.module = ''
  filterForm.action = ''
  filterForm.username = ''
  filterForm.dateRange = []
  handleQuery()
}

function moduleLabel(value) {
  return MODULES[value] || value || '—'
}

function actionLabel(value) {
  return ACTIONS[value] || value || '—'
}

function statusChange(row) {
  if (row.beforeStatus === null || row.beforeStatus === undefined) {
    return row.afterStatus === null || row.afterStatus === undefined ? '—' : `→ ${row.afterStatus}`
  }
  return `${row.beforeStatus} → ${row.afterStatus ?? '—'}`
}

onMounted(loadList)
</script>

<template>
  <div class="operation-log-page">
    <section class="page-card filter-card">
      <el-form :model="filterForm" inline class="filter-form" @submit.prevent>
        <el-form-item label="模块">
          <el-select v-model="filterForm.module" placeholder="全部" clearable style="width: 120px">
            <el-option v-for="opt in MODULE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="动作">
          <el-select v-model="filterForm.action" placeholder="全部" clearable style="width: 120px">
            <el-option v-for="opt in ACTION_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作人">
          <el-input
            v-model="filterForm.username"
            placeholder="账号"
            clearable
            :prefix-icon="Search"
            style="width: 150px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="时间">
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
        </el-form-item>
      </el-form>
    </section>

    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">操作日志</h3>
        <span class="table-sub">共 {{ total }} 条记录（只读）</span>
      </header>

      <el-table v-loading="loading" :data="list">
        <el-table-column prop="createTime" label="时间" min-width="160" />
        <el-table-column prop="username" label="操作人" width="110" />
        <el-table-column prop="position" label="职位" width="90" />
        <el-table-column label="模块" width="90">
          <template #default="{ row }">{{ moduleLabel(row.module) }}</template>
        </el-table-column>
        <el-table-column label="动作" width="90">
          <template #default="{ row }">{{ actionLabel(row.action) }}</template>
        </el-table-column>
        <el-table-column prop="bizNo" label="业务单号" min-width="150" />
        <el-table-column label="状态变化" width="110" align="center">
          <template #default="{ row }">{{ statusChange(row) }}</template>
        </el-table-column>
        <el-table-column prop="detail" label="操作内容" min-width="260" show-overflow-tooltip />
        <el-table-column prop="ip" label="IP" width="140" show-overflow-tooltip />
        <template #empty>
          <div class="table-empty"><p>暂无操作日志</p></div>
        </template>
      </el-table>

      <div class="table-foot">
        <PagePagination
          :page-num="pagination.pageNum"
          :page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          :background="false"
          @page-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.operation-log-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-card {
  padding: 16px 20px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
}

.filter-actions {
  margin-left: auto;
}

.table-card {
  padding: 0;
}

.table-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
}

.table-title {
  margin: 0;
  font-size: 16px;
}

.table-sub {
  color: var(--text-secondary);
  font-size: 12px;
}

.table-foot {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
}

.table-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
