<script setup>
/**
 * 销售退货单页（独立整单退货 / 红字）
 *
 * 流程：收银员在销售记录页发起整单退货申请 → 管理员在本页确认/拒绝
 * 确认后退货单生效：回补库存、原销售单置为已退货、营收统计剔除。
 * 权限：sale:read 可看（收银员只看自己发起的）；确认/拒绝仅管理员；取消由申请人或管理员操作。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search, View } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import {
  getSaleReturnList,
  getSaleReturnDetail,
  confirmSaleReturn,
  rejectSaleReturn,
  cancelSaleReturn,
} from '@/api/modules/saleReturn'
import { formatInt, money } from '@/utils/format.js'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
const canReadAll = computed(() => userStore.can('sale:read:all'))
const canApply = computed(() => userStore.can('sale:return:create'))

const STATUS = {
  0: { label: '待确认', tag: 'warning' },
  1: { label: '已确认', tag: 'success' },
  2: { label: '已拒绝', tag: 'info' },
  3: { label: '已取消', tag: 'info' },
}
const STATUS_OPTIONS = Object.entries(STATUS).map(([value, meta]) => ({
  value: Number(value),
  label: meta.label,
}))

function statusMeta(status) {
  return STATUS[status] || { label: '未知', tag: 'info' }
}

/* ---------------- 列表 ---------------- */

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10 })

const filterForm = reactive({ returnNo: '', saleNo: '', status: '', dateRange: [], operator: '' })
const applied = reactive({ returnNo: '', saleNo: '', status: '', startTime: '', endTime: '', operator: '' })

async function loadList() {
  loading.value = true
  try {
    const res = await getSaleReturnList({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      returnNo: applied.returnNo || undefined,
      saleNo: applied.saleNo || undefined,
      status: applied.status === '' ? undefined : applied.status,
      startTime: applied.startTime || undefined,
      endTime: applied.endTime || undefined,
      operator: canReadAll.value ? applied.operator || undefined : undefined,
    })
    list.value = res?.list || []
    total.value = res?.total || 0
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  applied.returnNo = filterForm.returnNo.trim()
  applied.saleNo = filterForm.saleNo.trim()
  applied.status = filterForm.status
  applied.startTime = filterForm.dateRange?.[0] || ''
  applied.endTime = filterForm.dateRange?.[1] || ''
  applied.operator = filterForm.operator.trim()
  pagination.pageNum = 1
  loadList()
}

function handleReset() {
  filterForm.returnNo = ''
  filterForm.saleNo = ''
  filterForm.status = ''
  filterForm.dateRange = []
  filterForm.operator = ''
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

/* ---------------- 操作按钮 ---------------- */

function canAudit(row) {
  return isAdmin.value && row.status === 0
}

function canCancel(row) {
  if (row.status !== 0) return false
  return isAdmin.value || (canApply.value && row.operator === userStore.realName)
}

/* ---------------- 确认 / 拒绝 / 取消 ---------------- */

const actionLoading = ref('')

async function confirmRow(row) {
  try {
    await ElMessageBox.confirm(
      `确认退货单「${row.returnNo}」吗？\n确认后将回补库存，原销售单置为已退货并冲减营收。`,
      '确认退货',
      { type: 'warning', confirmButtonText: '确认退货', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  actionLoading.value = 'confirm'
  try {
    await confirmSaleReturn(row.id)
    ElMessage.success('退货已确认，库存已回补')
    await refreshAfterAction(row.id)
  } finally {
    actionLoading.value = ''
  }
}

async function rejectRow(row) {
  try {
    await ElMessageBox.confirm(
      `确认拒绝退货单「${row.returnNo}」吗？拒绝后不会回补库存，原销售单保持正常。`,
      '拒绝退货',
      { type: 'warning', confirmButtonText: '确认拒绝', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  actionLoading.value = 'reject'
  try {
    await rejectSaleReturn(row.id)
    ElMessage.success('退货申请已拒绝')
    await refreshAfterAction(row.id)
  } finally {
    actionLoading.value = ''
  }
}

async function cancelRow(row) {
  try {
    await ElMessageBox.confirm('取消后退货申请失效，原销售单保持正常，确认取消？', '取消退货申请', {
      type: 'warning',
      confirmButtonText: '取消申请',
      cancelButtonText: '返回',
    })
  } catch {
    return
  }

  actionLoading.value = 'cancel'
  try {
    await cancelSaleReturn(row.id)
    ElMessage.success('退货申请已取消')
    await refreshAfterAction(row.id)
  } finally {
    actionLoading.value = ''
  }
}

/* ---------------- 详情 ---------------- */

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

async function loadDetail(id) {
  detailLoading.value = true
  try {
    detail.value = await getSaleReturnDetail(id)
  } finally {
    detailLoading.value = false
  }
}

async function openDetail(row) {
  detailVisible.value = true
  try {
    await loadDetail(row.id)
  } catch {
    detailVisible.value = false
  }
}

async function refreshAfterAction(id) {
  await loadList()
  if (detailVisible.value && detail.value?.id === id) await loadDetail(id)
}
</script>

<template>
  <div class="return-page">
    <section class="page-card filter-card">
      <el-form :model="filterForm" inline class="filter-form" @submit.prevent>
        <el-form-item label="退货单号">
          <el-input
            v-model="filterForm.returnNo"
            placeholder="如 TH20261101-001"
            clearable
            :prefix-icon="Search"
            style="width: 190px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="原销售单号">
          <el-input
            v-model="filterForm.saleNo"
            placeholder="如 XS20261101-001"
            clearable
            style="width: 190px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 120px">
            <el-option v-for="opt in STATUS_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="canReadAll" label="申请人">
          <el-input
            v-model="filterForm.operator"
            placeholder="姓名，精确匹配"
            clearable
            style="width: 130px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="申请日期">
          <el-date-picker
            v-model="filterForm.dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            style="width: 250px"
          />
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
      <p class="page-tip">退货申请在「销售记录」页发起；确认后回补库存并冲减营收，拒绝或取消不影响库存。</p>
    </section>

    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">销售退货单</h3>
        <span class="table-sub">共 {{ total }} 张退货单</span>
      </header>

      <el-table v-loading="loading" :data="list">
        <el-table-column prop="returnNo" label="退货单号" min-width="170" />
        <el-table-column prop="saleNo" label="原销售单号" min-width="170" />
        <el-table-column label="状态" width="95" align="center">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).tag" effect="light" round size="small">
              {{ statusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="退货件数" width="95" align="right">
          <template #default="{ row }">
            <span class="num">{{ formatInt(row.totalQuantity) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="冲减金额" width="120" align="right">
          <template #default="{ row }">
            <span class="num offset">-¥{{ money(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="申请人" width="100" />
        <el-table-column prop="auditor" label="确认人" width="100">
          <template #default="{ row }">{{ row.auditor || '—' }}</template>
        </el-table-column>
        <el-table-column prop="auditTime" label="确认时间" min-width="160">
          <template #default="{ row }">{{ row.auditTime || '—' }}</template>
        </el-table-column>
        <el-table-column prop="createTime" label="申请时间" min-width="160" />
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" :icon="View" @click="openDetail(row)">查看</el-button>
            <el-button
              v-if="canAudit(row)"
              text
              type="success"
              :loading="actionLoading === 'confirm'"
              @click="confirmRow(row)"
            >
              确认
            </el-button>
            <el-button
              v-if="canAudit(row)"
              text
              type="danger"
              :loading="actionLoading === 'reject'"
              @click="rejectRow(row)"
            >
              拒绝
            </el-button>
            <el-button
              v-if="canCancel(row)"
              text
              type="info"
              :loading="actionLoading === 'cancel'"
              @click="cancelRow(row)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty"><p>暂无退货单</p></div>
        </template>
      </el-table>

      <div class="table-foot">
        <el-pagination
          :current-page="pagination.pageNum"
          :page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </section>

    <el-drawer v-model="detailVisible" :title="detail?.returnNo || '退货单详情'" size="780px">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="状态">
              <el-tag :type="statusMeta(detail.status).tag" effect="light" round size="small">
                {{ statusMeta(detail.status).label }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="原销售单号">{{ detail.saleNo }}</el-descriptions-item>
            <el-descriptions-item label="申请人">{{ detail.operator }}</el-descriptions-item>
            <el-descriptions-item label="退货件数">{{ formatInt(detail.totalQuantity) }} 件</el-descriptions-item>
            <el-descriptions-item label="冲减金额">
              <span class="offset">-¥{{ money(detail.totalAmount) }}</span> 元
            </el-descriptions-item>
            <el-descriptions-item label="确认人">{{ detail.auditor || '—' }}</el-descriptions-item>
            <el-descriptions-item label="确认时间">{{ detail.auditTime || '—' }}</el-descriptions-item>
            <el-descriptions-item label="申请时间" :span="2">{{ detail.createTime }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="3">{{ detail.remark || '—' }}</el-descriptions-item>
          </el-descriptions>

          <el-table :data="detail.items" class="item-table" max-height="420">
            <el-table-column prop="productName" label="商品" min-width="180" show-overflow-tooltip />
            <el-table-column prop="categoryName" label="分类" width="100" />
            <el-table-column label="退货数量" width="100" align="right">
              <template #default="{ row }">
                <span class="num">{{ formatInt(row.quantity) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="原销售单价" width="110" align="right">
              <template #default="{ row }">
                <span class="num">{{ money(row.salePrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column v-if="isAdmin" label="成本价" width="100" align="right">
              <template #default="{ row }">
                <span class="num">{{ money(row.costPrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="小计金额" width="110" align="right">
              <template #default="{ row }">
                <span class="num">{{ money(row.amount) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button v-if="detail && canCancel(detail)" type="info" @click="cancelRow(detail)">取消申请</el-button>
          <el-button v-if="detail && canAudit(detail)" type="danger" @click="rejectRow(detail)">拒绝</el-button>
          <el-button v-if="detail && canAudit(detail)" type="success" @click="confirmRow(detail)">确认退货</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.return-page {
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

.page-tip {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
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

.num {
  font-variant-numeric: tabular-nums;
}

.offset {
  color: var(--color-danger);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.item-table {
  margin-top: 4px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 767px) {
  .filter-actions {
    margin-left: 0;
  }
}
</style>
