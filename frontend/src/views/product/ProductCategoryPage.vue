<script setup>
/**
 * 商品分类页（商品管理）
 * 结构：筛选卡片 → 分类表格（前端分页）→ 新增/编辑弹窗
 * 权限：管理员可增删改；其他职位仅查看
 * 业务：分类色标与 design.md 图表色板一一对应；分类下有商品时后端拒绝删除，页面同步置灰拦截
 * 数据：GET /api/category/list（全量不分页）；关联商品数由商品列表按 categoryId 统计得出
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Edit, Delete } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import {
  addCategory,
  deleteCategory,
  getCategoryList,
  updateCategory,
} from '@/api/modules/product'

const router = useRouter()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)

/** 色标可选列表（新增/编辑弹窗色标选择器用，与设计令牌一一对应） */
const COLOR_OPTIONS = [
  { label: '翡翠绿', token: 'var(--chart-1)' },
  { label: '橙子橙', token: 'var(--chart-2)' },
  { label: '草莓红', token: 'var(--chart-3)' },
  { label: '蓝莓蓝', token: 'var(--chart-4)' },
  { label: '葡萄紫', token: 'var(--chart-5)' },
]

/* ---------------- 数据加载 ---------------- */

const loading = ref(false)
const categories = ref([])

async function loadData() {
  loading.value = true
  try {
    // 关联商品数由后端 SQL 聚合返回（productCount），不再拉商品列表估算，
    // 避免商品数超过单页上限时统计不准
    const cats = await getCategoryList()
    categories.value = Array.isArray(cats) ? cats : []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

/** 某分类下的商品数量 */
function getCategoryProductCount(category) {
  return Number(category?.productCount) || 0
}

/* ---------------- 筛选 ---------------- */

const filterForm = reactive({ name: '', status: '' })
const appliedFilters = reactive({ name: '', status: '' })

const filteredCategories = computed(() =>
  categories.value.filter((c) => {
    if (appliedFilters.name && !c.name.includes(appliedFilters.name.trim())) return false
    if (appliedFilters.status !== '' && c.status !== appliedFilters.status) return false
    return true
  }),
)

/* ---------------- 排序 ---------------- */

const sortState = reactive({ prop: 'sort', order: 'ascending' })

const sortedCategories = computed(() => {
  const list = [...filteredCategories.value]
  if (!sortState.prop || !sortState.order) return list
  const dir = sortState.order === 'descending' ? -1 : 1
  return list.sort((a, b) => {
    const va = a[sortState.prop]
    const vb = b[sortState.prop]
    // 相等时必须返回 0，否则相等项会被当成「小于」，排序结果不稳定
    if (va === vb) return 0
    return va > vb ? dir : -dir
  })
})

function handleSortChange({ prop, order }) {
  sortState.prop = prop
  sortState.order = order
}

function handleQuery() {
  appliedFilters.name = filterForm.name
  appliedFilters.status = filterForm.status
  pagination.pageNum = 1
}

function handleReset() {
  filterForm.name = ''
  filterForm.status = ''
  handleQuery()
}

/* ---------------- 分页 ---------------- */

const pagination = reactive({ pageNum: 1, pageSize: 10 })

const pagedCategories = computed(() => {
  const start = (pagination.pageNum - 1) * pagination.pageSize
  return sortedCategories.value.slice(start, start + pagination.pageSize)
})

/* ---------------- 弹窗（新增/编辑） ---------------- */

const dialogVisible = ref(false)
const dialogMode = ref('create')
const editingId = ref(null)
const submitLoading = ref(false)
const form = reactive({
  name: '',
  colorToken: 'var(--chart-1)',
  description: '',
  sort: 0,
  status: 1,
})
const formRef = ref(null)

/** 名称唯一性校验器（编辑时排除自身 id；后端也会再校验一次） */
const validateNameUnique = (_rule, value, callback) => {
  if (!value || !value.trim()) {
    callback(new Error('请输入分类名称'))
    return
  }
  const duplicated = categories.value.some(
    (c) => c.name === value.trim() && c.id !== editingId.value,
  )
  if (duplicated) {
    callback(new Error('分类名称已存在'))
    return
  }
  callback()
}

const rules = {
  name: [{ required: true, validator: validateNameUnique, trigger: 'blur' }],
  sort: [
    { required: true, message: '请输入排序值', trigger: 'blur' },
    { type: 'number', min: 0, message: '排序值不可为负', trigger: 'blur' },
  ],
}

const dialogTitle = computed(() => (dialogMode.value === 'create' ? '新增分类' : '编辑分类'))

function resetForm() {
  form.name = ''
  form.colorToken = 'var(--chart-1)'
  form.description = ''
  form.sort = 0
  form.status = 1
  editingId.value = null
}

function openCreate() {
  dialogMode.value = 'create'
  resetForm()
  dialogVisible.value = true
}

function openEdit(row) {
  dialogMode.value = 'edit'
  editingId.value = row.id
  form.name = row.name
  form.colorToken = row.colorToken || 'var(--chart-1)'
  form.description = row.description || ''
  form.sort = row.sort
  form.status = row.status
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
      name: form.name.trim(),
      colorToken: form.colorToken,
      description: form.description.trim(),
      sort: Number(form.sort) || 0,
      status: Number(form.status),
    }
    if (dialogMode.value === 'create') {
      await addCategory(payload)
      ElMessage.success('分类已新增')
    } else {
      await updateCategory({ id: editingId.value, ...payload })
      ElMessage.success('分类已更新')
    }
    dialogVisible.value = false
    await loadData()
  } catch {
    /* 失败文案（重名 / 分类不存在等）由 request 拦截器统一弹出 */
  } finally {
    submitLoading.value = false
  }
}

/* ---------------- 删除 ---------------- */

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('确定删除该分类吗？删除后不可恢复', '删除确认', {
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteCategory(row.id)
    ElMessage.success('分类已删除')
    await loadData()
  } catch {
    /* 分类下存在商品时后端返回错误文案，由拦截器弹出 */
  }
}

/* ---------------- 关联商品跳转 ---------------- */

function goProductList(categoryId) {
  router.push({ path: '/product/list', query: { categoryId } })
}
</script>

<template>
  <div class="category-page">
    <!-- ============ 筛选卡片 ============ -->
    <section class="page-card filter-card">
      <el-form :model="filterForm" inline class="filter-form">
        <el-form-item label="分类名称">
          <el-input
            v-model="filterForm.name"
            placeholder="如饮料乳品"
            clearable
            :prefix-icon="Search"
            style="width: 180px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 110px">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
      <div v-if="isAdmin" class="filter-extra">
        <el-button type="primary" :icon="Plus" @click="openCreate">新增分类</el-button>
      </div>
    </section>

    <!-- ============ 分类表格卡片 ============ -->
    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">商品分类</h3>
        <span class="table-sub">共 {{ sortedCategories.length }} 个分类</span>
      </header>

      <el-table
        v-loading="loading"
        :data="pagedCategories"
        class="category-table"
        :default-sort="{ prop: 'sort', order: 'ascending' }"
        @sort-change="handleSortChange"
      >
        <el-table-column label="色标" width="72" align="center">
          <template #default="{ row }">
            <span class="color-dot" :style="{ background: row.colorToken }" />
          </template>
        </el-table-column>
        <el-table-column prop="name" label="分类名称" min-width="120" />
        <el-table-column prop="description" label="分类描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="关联商品" align="right" width="120">
          <template #default="{ row }">
            <span class="num link-num" @click="goProductList(row.id)">
              {{ getCategoryProductCount(row) }}
            </span>
            <span class="unit">件</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" align="right" width="90" sortable="custom" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 1" size="small" type="success" effect="light" round>启用</el-tag>
            <el-tag v-else size="small" type="info" effect="light" round>禁用</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-tooltip
              v-if="getCategoryProductCount(row) > 0"
              content="该分类下存在商品，无法删除"
              placement="top"
            >
              <span class="disabled-btn-wrapper">
                <el-button type="danger" text :icon="Delete" disabled>删除</el-button>
              </span>
            </el-tooltip>
            <el-button v-else type="danger" text :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <el-table-column v-else label="操作" width="100" align="center" fixed="right">
          <template #default>
            <span class="readonly-text">仅查看</span>
          </template>
        </el-table-column>
      </el-table>

      <footer v-if="sortedCategories.length > pagination.pageSize" class="table-foot">
        <el-pagination
          v-model:current-page="pagination.pageNum"
          v-model:page-size="pagination.pageSize"
          :total="sortedCategories.length"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </footer>
    </section>

    <!-- ============ 新增/编辑弹窗 ============ -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="520px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="category-form">
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="form.name" placeholder="如饮料乳品" maxlength="20" show-word-limit />
        </el-form-item>
        <el-form-item label="分类色标">
          <div class="color-picker">
            <button
              v-for="opt in COLOR_OPTIONS"
              :key="opt.token"
              type="button"
              class="color-option"
              :class="{ active: form.colorToken === opt.token }"
              :style="{ background: opt.token }"
              :title="opt.label"
              @click="form.colorToken = opt.token"
            />
          </div>
        </el-form-item>
        <el-form-item label="分类描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="简述该分类包含的商品范围"
            maxlength="60"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="排序值" prop="sort">
          <el-input-number v-model="form.sort" :min="0" :max="999" controls-position="right" style="width: 160px" />
          <span class="form-hint">数值越小越靠前</span>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="form.status"
            :active-value="1"
            :inactive-value="0"
            active-text="启用"
            inactive-text="禁用"
            inline-prompt
          />
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
/* ==================== 页面容器 ==================== */
.category-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ==================== 筛选卡片 ==================== */
.filter-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.filter-form :deep(.el-form-item) {
  margin: 0;
}

.filter-actions {
  margin-left: auto !important;
}

.filter-extra {
  display: flex;
  align-items: center;
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
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.table-sub {
  font-size: 13px;
  color: var(--text-secondary);
}

/* 色标圆点 */
.color-dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-pill);
  border: 2px solid var(--bg-card);
  box-shadow: 0 0 0 1px var(--border-color);
  vertical-align: middle;
}

/* 数字 + 单位 */
.num {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--text-primary);
}

.unit {
  margin-left: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 关联商品数量：可点击跳转 */
.link-num {
  color: var(--brand-primary);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color var(--motion-fast);
}

.link-num:hover {
  color: var(--brand-primary-hover);
}

.readonly-text {
  font-size: 13px;
  color: var(--text-disabled);
}

/* 删除按钮置灰时的包裹层（el-tooltip 需要可 hover 的元素） */
.disabled-btn-wrapper {
  display: inline-block;
}

/* 分页 */
.table-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

/* ==================== 弹窗表单 ==================== */
.category-form {
  padding: 4px 0;
}

.form-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 色标选择器 */
.color-picker {
  display: flex;
  gap: 12px;
}

.color-option {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  border: 2px solid var(--border-color);
  cursor: pointer;
  transition: transform var(--motion-fast), border-color var(--motion-fast);
  padding: 0;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 4px var(--brand-primary);
}

/* ==================== 响应式 ==================== */

@media (max-width: 1199px) {
  .filter-card {
    gap: 8px;
  }
  .filter-form {
    gap: 8px 12px;
  }
  .filter-extra {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 991px) {
  .filter-card {
    padding: 14px 16px;
  }
  .filter-form {
    flex-wrap: wrap;
    gap: 8px 12px;
  }
  .filter-form :deep(.el-input),
  .filter-form :deep(.el-select) {
    width: 100% !important;
  }
  .filter-form :deep(.el-form-item) {
    width: calc(50% - 6px);
    margin: 0;
  }
  .filter-actions {
    width: 100%;
    margin-left: 0 !important;
    justify-content: flex-end;
  }
  .table-card {
    padding: 16px;
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
  .filter-form :deep(.el-input),
  .filter-form :deep(.el-select) {
    width: 100% !important;
  }
  .filter-actions {
    justify-content: stretch;
  }
  .filter-actions :deep(.el-button) {
    flex: 1;
  }
  .filter-extra {
    justify-content: stretch;
  }
  .filter-extra :deep(.el-button) {
    flex: 1;
  }
  .table-card {
    padding: 12px;
  }
  .table-foot {
    justify-content: center;
  }
}
</style>
