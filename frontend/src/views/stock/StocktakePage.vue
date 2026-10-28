<script setup>
/**
 * 库存盘点页
 *
 * 流程：生成任务（快照账面库存）→ 录入实盘 → 提交 → 管理员审核
 * 审核后按实盘数修正库存，并写入盘盈/盘亏流水（biz_type=4/5）。
 * 权限：仓管/管理员制单，管理员审核，会计可只读查看。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, View } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { getCategoryList } from '@/api/modules/product'
import {
  getStocktakeList,
  getStocktakeDetail,
  createStocktake,
  updateStocktakeItems,
  submitStocktake,
  auditStocktake,
  cancelStocktake,
} from '@/api/modules/stocktake'
import { formatInt, money } from '@/utils/format.js'

const userStore = useUserStore()
const canCreate = computed(() => userStore.can('stocktake:create'))
const canAudit = computed(() => userStore.can('stocktake:audit'))
const isAdmin = computed(() => userStore.isAdmin)

const STATUS = {
  0: { label: '草稿', tag: 'info' },
  1: { label: '已提交', tag: 'warning' },
  2: { label: '已审核', tag: 'success' },
  3: { label: '已取消', tag: 'info' },
}
const STATUS_OPTIONS = Object.entries(STATUS).map(([value, meta]) => ({
  value: Number(value),
  label: meta.label,
}))
const REASONS = ['破损', '丢失', '赠品', '计量误差', '其他']

function statusMeta(status) {
  return STATUS[status] || { label: '未知', tag: 'info' }
}

/* ---------------- 列表 ---------------- */

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10 })

const filterForm = reactive({ takeNo: '', status: '', dateRange: [] })
const applied = reactive({ takeNo: '', status: '', startTime: '', endTime: '' })

async function loadList() {
  loading.value = true
  try {
    const res = await getStocktakeList({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      takeNo: applied.takeNo || undefined,
      status: applied.status === '' ? undefined : applied.status,
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
  applied.takeNo = filterForm.takeNo.trim()
  applied.status = filterForm.status
  applied.startTime = filterForm.dateRange?.[0] || ''
  applied.endTime = filterForm.dateRange?.[1] || ''
  pagination.pageNum = 1
  loadList()
}

function handleReset() {
  filterForm.takeNo = ''
  filterForm.status = ''
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

/* ---------------- 生成盘点任务 ---------------- */

const createVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive({ categoryId: null, remark: '' })
const categoryOptions = ref([])

async function loadCategories() {
  try {
    const res = await getCategoryList()
    categoryOptions.value = Array.isArray(res) ? res : []
  } catch {
    categoryOptions.value = []
  }
}

function openCreate() {
  createForm.categoryId = null
  createForm.remark = ''
  createVisible.value = true
  if (!categoryOptions.value.length) loadCategories()
}

async function handleCreate() {
  createLoading.value = true
  try {
    const res = await createStocktake({
      categoryId: createForm.categoryId ?? null,
      remark: createForm.remark.trim(),
    })
    ElMessage.success(`盘点单 ${res.takeNo} 已生成`)
    createVisible.value = false
    await loadList()
    await openDetail(res.id)
  } finally {
    createLoading.value = false
  }
}

/* ---------------- 详情与实盘 ---------------- */

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const saveLoading = ref(false)
const actionLoading = ref('')

const editable = computed(() => detail.value?.status === 0 && canCreate.value)

function showCancel(row) {
  if (row.status === 0) return canCreate.value || canAudit.value
  if (row.status === 1) return canAudit.value
  return false
}

async function openDetail(id) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    detail.value = await getStocktakeDetail(id)
  } finally {
    detailLoading.value = false
  }
}

function recalcItem(row) {
  const book = Number(row.bookQty) || 0
  const actual = Number(row.actualQty) || 0
  row.diffQty = actual - book
  row.diffAmount = isAdmin.value
    ? Math.round(((row.diffQty * (Number(row.costPrice) || 0)) + Number.EPSILON) * 100) / 100
    : 0
}

async function saveItems() {
  if (!detail.value) return
  saveLoading.value = true
  try {
    await updateStocktakeItems(detail.value.id, {
      items: detail.value.items.map((it) => ({
        id: it.id,
        actualQty: Number(it.actualQty) || 0,
        reason: it.reason || '',
      })),
    })
    ElMessage.success('实盘数量已保存')
    await openDetail(detail.value.id)
    await loadList()
  } finally {
    saveLoading.value = false
  }
}

async function handleSubmit() {
  if (!detail.value) return
  try {
    await saveItems()
  } catch {
    return
  }
  try {
    await ElMessageBox.confirm('提交后不能再修改实盘数量，确认提交？', '提交盘点单', {
      type: 'warning',
      confirmButtonText: '提交',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  actionLoading.value = 'submit'
  try {
    await submitStocktake(detail.value.id)
    ElMessage.success('盘点单已提交')
    await openDetail(detail.value.id)
    await loadList()
  } finally {
    actionLoading.value = ''
  }
}

async function handleAudit() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm('审核后会立即按实盘数修正库存，确认审核？', '审核盘点单', {
      type: 'warning',
      confirmButtonText: '审核',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  actionLoading.value = 'audit'
  try {
    await auditStocktake(detail.value.id)
    ElMessage.success('盘点单已审核，库存已修正')
    await openDetail(detail.value.id)
    await loadList()
  } finally {
    actionLoading.value = ''
  }
}

async function handleCancel(row) {
  const id = row.id || detail.value?.id
  if (!id) return
  try {
    await ElMessageBox.confirm('取消后不会修正库存，确认取消该盘点单？', '取消盘点单', {
      type: 'warning',
      confirmButtonText: '取消盘点',
      cancelButtonText: '返回',
    })
  } catch {
    return
  }

  actionLoading.value = 'cancel'
  try {
    await cancelStocktake(id)
    ElMessage.success('盘点单已取消')
    if (detail.value?.id === id) await openDetail(id)
    await loadList()
  } finally {
    actionLoading.value = ''
  }
}

function moneyOrDash(value) {
  return value === null || value === undefined ? '—' : money(value)
}
</script>

<template>
  <div class="stocktake-page">
    <section class="page-card filter-card">
      <el-form :model="filterForm" inline class="filter-form" @submit.prevent>
        <el-form-item label="盘点单号">
          <el-input
            v-model="filterForm.takeNo"
            placeholder="如 PD20261028"
            clearable
            :prefix-icon="Search"
            style="width: 180px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 120px">
            <el-option v-for="opt in STATUS_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="创建日期">
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
      <div class="filter-extra">
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">生成盘点任务</el-button>
      </div>
    </section>

    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">库存盘点单</h3>
        <span class="table-sub">共 {{ total }} 张盘点单</span>
      </header>

      <el-table v-loading="loading" :data="list">
        <el-table-column prop="takeNo" label="盘点单号" min-width="170" />
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).tag" effect="light" round size="small">
              {{ statusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="盘盈" width="110" align="right">
          <template #default="{ row }">
            <span class="num is-in">{{ formatInt(row.totalGainQty) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="盘亏" width="110" align="right">
          <template #default="{ row }">
            <span class="num is-out">{{ formatInt(row.totalLossQty) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" label="盈亏金额" width="140" align="right">
          <template #default="{ row }">
            <span class="num">
              盈 {{ moneyOrDash(row.totalGainAmount) }} / 亏 {{ moneyOrDash(row.totalLossAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="制单人" width="100" />
        <el-table-column prop="auditor" label="审核人" width="100">
          <template #default="{ row }">{{ row.auditor || '—' }}</template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" min-width="160" />
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" :icon="View" @click="openDetail(row.id)">查看</el-button>
            <el-button
              v-if="row.status === 1 && canAudit"
              text
              type="success"
              :loading="actionLoading === 'audit'"
              @click="openDetail(row.id).then(() => handleAudit())"
            >
              审核
            </el-button>
            <el-button
              v-if="showCancel(row)"
              text
              type="danger"
              :loading="actionLoading === 'cancel'"
              @click="handleCancel(row)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty"><p>暂无盘点单</p></div>
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

    <!-- 生成盘点任务 -->
    <el-dialog v-model="createVisible" title="生成盘点任务" width="480px" :close-on-click-modal="false">
      <el-form :model="createForm" label-position="top">
        <el-form-item label="盘点范围">
          <el-select v-model="createForm.categoryId" placeholder="全部商品" clearable style="width: 100%">
            <el-option v-for="c in categoryOptions" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createForm.remark" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" @click="handleCreate">生成</el-button>
      </template>
    </el-dialog>

    <!-- 盘点详情 -->
    <el-drawer v-model="detailVisible" :title="detail?.takeNo || '盘点详情'" size="900px">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="状态">
              <el-tag :type="statusMeta(detail.status).tag" effect="light" round size="small">
                {{ statusMeta(detail.status).label }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="制单人">{{ detail.operator }}</el-descriptions-item>
            <el-descriptions-item label="审核人">{{ detail.auditor || '—' }}</el-descriptions-item>
            <el-descriptions-item label="盘盈">
              {{ formatInt(detail.totalGainQty) }} 件
              <span v-if="isAdmin">（{{ moneyOrDash(detail.totalGainAmount) }} 元）</span>
            </el-descriptions-item>
            <el-descriptions-item label="盘亏">
              {{ formatInt(detail.totalLossQty) }} 件
              <span v-if="isAdmin">（{{ moneyOrDash(detail.totalLossAmount) }} 元）</span>
            </el-descriptions-item>
            <el-descriptions-item label="审核时间">{{ detail.auditTime || '—' }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="3">{{ detail.remark || '—' }}</el-descriptions-item>
          </el-descriptions>

          <el-table :data="detail.items" class="item-table" max-height="460">
            <el-table-column prop="productName" label="商品" min-width="180" show-overflow-tooltip />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column prop="bookQty" label="账面数" width="90" align="right" />
            <el-table-column label="实盘数" width="150" align="right">
              <template #default="{ row }">
                <el-input-number
                  v-if="editable"
                  v-model="row.actualQty"
                  :min="0"
                  :step="1"
                  controls-position="right"
                  style="width: 120px"
                  @change="recalcItem(row)"
                />
                <span v-else class="num">{{ formatInt(row.actualQty) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="差异" width="90" align="right">
              <template #default="{ row }">
                <span class="num" :class="row.diffQty > 0 ? 'is-in' : row.diffQty < 0 ? 'is-out' : ''">
                  {{ row.diffQty > 0 ? '+' : '' }}{{ formatInt(row.diffQty) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column v-if="isAdmin" prop="costPrice" label="成本价" width="100" align="right">
              <template #default="{ row }">{{ money(row.costPrice) }}</template>
            </el-table-column>
            <el-table-column v-if="isAdmin" label="盈亏金额" width="110" align="right">
              <template #default="{ row }">{{ moneyOrDash(row.diffAmount) }}</template>
            </el-table-column>
            <el-table-column label="盈亏原因" width="150">
              <template #default="{ row }">
                <el-select v-if="editable" v-model="row.reason" placeholder="选填" clearable size="small" style="width: 130px">
                  <el-option v-for="r in REASONS" :key="r" :label="r" :value="r" />
                </el-select>
                <span v-else>{{ row.reason || '—' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button
            v-if="editable"
            :loading="saveLoading"
            @click="saveItems"
          >
            保存实盘
          </el-button>
          <el-button
            v-if="editable"
            type="primary"
            :loading="actionLoading === 'submit'"
            @click="handleSubmit"
          >
            提交盘点
          </el-button>
          <el-button
            v-if="detail?.status === 1 && canAudit"
            type="success"
            :loading="actionLoading === 'audit'"
            @click="handleAudit"
          >
            审核并修正库存
          </el-button>
          <el-button
            v-if="detail && showCancel(detail)"
            type="danger"
            :loading="actionLoading === 'cancel'"
            @click="handleCancel(detail)"
          >
            取消盘点
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.stocktake-page {
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

.filter-extra {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
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

.is-in {
  color: var(--brand-primary);
}

.is-out {
  color: var(--color-danger);
}
</style>
