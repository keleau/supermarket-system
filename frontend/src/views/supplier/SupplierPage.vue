<script setup>
/**
 * 供应商管理页
 * 结构：筛选卡片 → 供应商表格（分页）→ 新增/编辑弹窗
 * 权限：管理员可增删改；其他职位仅查看
 * 业务：供应商名称唯一；名下存在商品时后端拒绝删除，页面同步置灰拦截
 * 数据：GET /api/supplier/list（服务端分页）；关联商品数由商品列表按 supplierId 统计得出
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Edit, Delete } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import {
  addSupplier,
  deleteSupplier,
  getSupplierList,
  updateSupplier,
} from '@/api/modules/supplier'
import { getProductList } from '@/api/modules/product'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)

/* ---------------- 列表（服务端分页） ---------------- */

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10 })

const filterForm = reactive({ supplierName: '', contactPerson: '' })
const appliedFilters = reactive({ supplierName: '', contactPerson: '' })

/** 供应商 id → 名下商品数量 */
const productCountMap = ref({})

async function loadList() {
  loading.value = true
  try {
    const res = await getSupplierList({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      supplierName: appliedFilters.supplierName || undefined,
      contactPerson: appliedFilters.contactPerson || undefined,
    })
    list.value = res?.list || []
    total.value = res?.total || 0
  } finally {
    loading.value = false
  }
}

/** 统计各供应商名下商品数量（商品总量有限，一次拉全量统计即可） */
async function loadProductCounts() {
  const res = await getProductList({ pageNum: 1, pageSize: 200 })
  const counter = {}
  ;(res?.list || []).forEach((p) => {
    if (p.supplierId == null) return
    counter[p.supplierId] = (counter[p.supplierId] || 0) + 1
  })
  productCountMap.value = counter
}

function handleQuery() {
  appliedFilters.supplierName = filterForm.supplierName.trim()
  appliedFilters.contactPerson = filterForm.contactPerson.trim()
  pagination.pageNum = 1
  loadList()
}

function handleReset() {
  filterForm.supplierName = ''
  filterForm.contactPerson = ''
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

onMounted(() => {
  loadList()
  loadProductCounts()
})

/* ---------------- 新增 / 编辑弹窗 ---------------- */

const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref(null)
const submitLoading = ref(false)
const formRef = ref(null)

const defaultForm = () => ({
  supplierName: '',
  contactPerson: '',
  phone: '',
  address: '',
  remark: '',
})

const form = reactive(defaultForm())

const validateNameUnique = (_rule, value, callback) => {
  if (!value || !value.trim()) {
    callback(new Error('请输入供应商名称'))
    return
  }
  const duplicated = list.value.some(
    (s) => s.supplierName === value.trim() && s.id !== editingId.value,
  )
  if (duplicated) {
    callback(new Error('供应商名称已存在'))
    return
  }
  callback()
}

const rules = {
  supplierName: [{ required: true, validator: validateNameUnique, trigger: 'blur' }],
  phone: [
    {
      validator: (_rule, v, cb) => {
        if (!v) return cb()
        return /^1[3-9]\d{9}$/.test(v) ? cb() : cb(new Error('手机号格式不正确'))
      },
      trigger: 'blur',
    },
  ],
}

function openCreate() {
  isEdit.value = false
  editingId.value = null
  Object.assign(form, defaultForm())
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  editingId.value = row.id
  Object.assign(form, {
    supplierName: row.supplierName,
    contactPerson: row.contactPerson || '',
    phone: row.phone || '',
    address: row.address || '',
    remark: row.remark || '',
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitLoading.value = true
  try {
    const payload = {
      supplierName: form.supplierName.trim(),
      contactPerson: form.contactPerson?.trim() || '',
      phone: form.phone?.trim() || '',
      address: form.address?.trim() || '',
      remark: form.remark?.trim() || '',
    }
    if (isEdit.value) {
      await updateSupplier({ id: editingId.value, ...payload })
      ElMessage.success('供应商信息已更新')
    } else {
      await addSupplier(payload)
      ElMessage.success('供应商已新增')
    }
    dialogVisible.value = false
    await loadList()
  } catch {
    /* 失败文案（重名等）由 request 拦截器统一弹出 */
  } finally {
    submitLoading.value = false
  }
}

/* ---------------- 删除 ---------------- */

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除供应商「${row.supplierName}」吗？删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await deleteSupplier(row.id)
    ElMessage.success('供应商已删除')
    if (list.value.length === 1 && pagination.pageNum > 1) pagination.pageNum -= 1
    await loadList()
    await loadProductCounts()
  } catch {
    /* 存在关联商品时后端返回错误文案，由拦截器弹出 */
  }
}

/* ---------------- 关联商品统计 ---------------- */

/** 统计某供应商名下商品数量 */
function supplierProductCount(supplierId) {
  return productCountMap.value[supplierId] || 0
}
</script>

<template>
  <div class="supplier-page">
    <!-- ============ 筛选卡片 ============ -->
    <section class="page-card filter-card">
      <el-form :model="filterForm" inline class="filter-form" @submit.prevent>
        <el-form-item label="供应商名称">
          <el-input
            v-model="filterForm.supplierName"
            placeholder="如 农夫山泉"
            clearable
            :prefix-icon="Search"
            style="width: 220px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input
            v-model="filterForm.contactPerson"
            placeholder="如 王经理"
            clearable
            style="width: 160px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
      <div v-if="isAdmin" class="filter-extra">
        <el-button type="primary" :icon="Plus" @click="openCreate">新增供应商</el-button>
      </div>
    </section>

    <!-- ============ 供应商表格卡片 ============ -->
    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">供应商列表</h3>
        <span class="table-sub">共 {{ total }} 家供应商</span>
      </header>

      <el-table v-loading="loading" :data="list" class="supplier-table">
        <el-table-column label="供应商" min-width="220">
          <template #default="{ row }">
            <div class="supplier-cell">
              <el-avatar :size="36" class="supplier-avatar">{{ row.supplierName.slice(0, 1) }}</el-avatar>
              <div class="supplier-meta">
                <span class="supplier-name">{{ row.supplierName }}</span>
                <span class="supplier-time">创建于 {{ row.createTime?.slice(0, 10) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="contactPerson" label="联系人" width="120">
          <template #default="{ row }">
            <span>{{ row.contactPerson || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="联系电话" min-width="130">
          <template #default="{ row }">
            <span class="num">{{ row.phone || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.address || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="关联商品" align="right" width="100">
          <template #default="{ row }">
            <span class="num">{{ supplierProductCount(row.id) }}</span>
            <span class="unit">件</span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.remark || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" label="操作" fixed="right" width="140" align="center">
          <template #default="{ row }">
            <el-button text type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-tooltip
              v-if="supplierProductCount(row.id) > 0"
              content="该供应商下存在关联商品，无法删除"
              placement="top"
            >
              <span class="disabled-btn-wrapper">
                <el-button text type="danger" :icon="Delete" disabled>删除</el-button>
              </span>
            </el-tooltip>
            <el-button v-else text type="danger" :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <el-table-column v-else label="操作" fixed="right" width="100" align="center">
          <template #default>
            <span class="view-only">仅查看</span>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty">
            <el-icon :size="32" class="empty-icon"><Connection /></el-icon>
            <p>暂无供应商数据</p>
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

    <!-- ============ 新增 / 编辑弹窗 ============ -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑供应商' : '新增供应商'"
      width="520"
      class="supplier-dialog"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="supplier-form">
        <el-form-item label="供应商名称" prop="supplierName">
          <el-input v-model="form.supplierName" placeholder="如 农夫山泉股份有限公司" maxlength="40" show-word-limit />
        </el-form-item>
        <div class="form-row">
          <el-form-item label="联系人" prop="contactPerson">
            <el-input v-model="form.contactPerson" placeholder="如 王经理" maxlength="20" />
          </el-form-item>
          <el-form-item label="联系电话" prop="phone">
            <el-input v-model="form.phone" placeholder="11 位手机号" maxlength="11" />
          </el-form-item>
        </div>
        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" placeholder="供应商所在地址" maxlength="80" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="选填" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.supplier-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ==================== 筛选卡片 ==================== */
.filter-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 18px 20px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 20px;
  flex: 1;
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

.filter-extra {
  display: flex;
  gap: 8px;
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

.supplier-table :deep(.el-table th.el-table__cell) {
  background: var(--bg-muted);
  color: var(--text-regular);
  font-weight: 500;
}

.supplier-table :deep(.el-table__row:hover > td) {
  background: var(--bg-muted) !important;
}

.supplier-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.supplier-avatar {
  flex-shrink: 0;
  background: var(--brand-primary-light-9);
  color: var(--brand-primary);
  font-weight: 600;
  font-size: 14px;
}

.supplier-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.supplier-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.supplier-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.num {
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 13px;
  color: var(--text-regular);
}

.unit {
  margin-left: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.view-only {
  font-size: 13px;
  color: var(--text-disabled);
}

.disabled-btn-wrapper {
  display: inline-block;
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

/* ==================== 弹窗 ==================== */
.supplier-dialog :deep(.el-dialog) {
  border-radius: var(--radius-card);
}

.supplier-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--text-regular);
  padding-bottom: 4px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
}

/* ==================== 响应式 ==================== */
@media (max-width: 1199px) {
  .filter-card {
    gap: 8px;
  }
  .filter-extra {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 767px) {
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
  .filter-form :deep(.el-input) {
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
  .form-row {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
