<script setup>
/**
 * 商品档案页（商品管理）
 * 核心业务主数据：商品的增删改查（服务端分页）
 * 结构：筛选卡片 → 商品表格（分页）→ 新增/编辑弹窗 → 详情抽屉（进销存轨迹）
 * 权限：管理员可新增/编辑/删除/导出；其他职位仅查看
 * 业务：库存预警 = stockNum < warnNum；缺货 = stockNum <= 0；库存为 0 时后端自动下架
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, Plus, Search, Refresh, Download, Edit, Delete, View } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import {
  addProduct,
  deleteProduct,
  getCategoryList,
  getProductDetail,
  getProductList,
  updateProduct,
} from '@/api/modules/product'
import { getSupplierOptions } from '@/api/modules/supplier'
import { getStockLogList } from '@/api/modules/stock'
import { getSaleItemList } from '@/api/modules/sale'
import { downloadCsv } from '@/utils/csv.js'
import { formatInt, money } from '@/utils/format.js'

const userStore = useUserStore()
const route = useRoute()
const isAdmin = computed(() => userStore.isAdmin)

/* ---------------- 下拉字典（分类 / 供应商） ---------------- */

const categoryOptions = ref([])
const supplierOptions = ref([])

async function loadDicts() {
  const [categories, suppliers] = await Promise.all([getCategoryList(), getSupplierOptions()])
  categoryOptions.value = Array.isArray(categories) ? categories : []
  supplierOptions.value = Array.isArray(suppliers) ? suppliers : []
}

/* ---------------- 列表（服务端分页） ---------------- */

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10 })

const filterForm = reactive({
  productName: '',
  productCode: '',
  categoryId: '',
  status: '',
})

/** 已应用的筛选（点【查询】后生效，与表单输入解耦，符合 B 端操作习惯） */
const appliedFilters = reactive({
  productName: '',
  productCode: '',
  categoryId: '',
  status: '',
})

async function loadList() {
  loading.value = true
  try {
    const res = await getProductList({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      productName: appliedFilters.productName || undefined,
      productCode: appliedFilters.productCode || undefined,
      categoryId: appliedFilters.categoryId === '' ? undefined : appliedFilters.categoryId,
      status: appliedFilters.status === '' ? undefined : appliedFilters.status,
    })
    list.value = res?.list || []
    total.value = res?.total || 0
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  appliedFilters.productName = filterForm.productName.trim()
  appliedFilters.productCode = filterForm.productCode.trim()
  appliedFilters.categoryId = filterForm.categoryId
  appliedFilters.status = filterForm.status
  pagination.pageNum = 1
  loadList()
}

function handleReset() {
  filterForm.productName = ''
  filterForm.productCode = ''
  filterForm.categoryId = ''
  filterForm.status = ''
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

/** 支持从商品分类页跳转携带 categoryId 自动筛选 */
onMounted(async () => {
  const categoryId = route.query.categoryId
  if (categoryId) {
    filterForm.categoryId = Number(categoryId)
    appliedFilters.categoryId = Number(categoryId)
  }
  await loadDicts()
  await loadList()
})

/* ---------------- 库存预警状态判定 ---------------- */

/** 返回 row 的库存语义：normal / warn / out */
function stockState(row) {
  if (row.stockNum <= 0) return 'out'
  if (row.stockNum < row.warnNum) return 'warn'
  return 'normal'
}

/* ---------------- 新增 / 编辑弹窗 ---------------- */

const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref(null)

const defaultForm = () => ({
  id: null,
  productCode: '',
  productName: '',
  categoryId: null,
  spec: '',
  unit: '个',
  costPrice: 0,
  salePrice: null,
  stockNum: 0,
  warnNum: 10,
  status: 1,
  supplierId: null,
})

const form = reactive(defaultForm())

const rules = {
  productName: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  categoryId: [{ required: true, message: '请选择商品分类', trigger: 'change' }],
  salePrice: [
    { required: true, message: '请输入销售单价', trigger: 'blur' },
    { validator: (_rule, v, cb) => (Number(v) > 0 ? cb() : cb(new Error('单价必须大于 0'))), trigger: 'blur' },
  ],
  costPrice: [
    { validator: (_rule, v, cb) => (Number(v) >= 0 ? cb() : cb(new Error('进货价不能为负'))), trigger: 'blur' },
  ],
  stockNum: [
    { validator: (_rule, v, cb) => (Number(v) >= 0 ? cb() : cb(new Error('库存不能为负'))), trigger: 'blur' },
  ],
  warnNum: [
    { validator: (_rule, v, cb) => (Number(v) >= 0 ? cb() : cb(new Error('预警值不能为负'))), trigger: 'blur' },
  ],
}

const STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '在售', value: 1 },
  { label: '下架', value: 0 },
]

function openCreate() {
  isEdit.value = false
  Object.assign(form, defaultForm())
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  Object.assign(form, {
    ...defaultForm(),
    id: row.id,
    productCode: row.productCode,
    productName: row.productName,
    categoryId: row.categoryId,
    spec: row.spec || '',
    unit: row.unit || '个',
    costPrice: Number(row.costPrice) || 0,
    salePrice: Number(row.salePrice) || 0,
    stockNum: row.stockNum,
    warnNum: row.warnNum,
    status: row.status,
    supplierId: row.supplierId ?? null,
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
      productCode: form.productCode?.trim() || '',
      productName: form.productName.trim(),
      categoryId: form.categoryId,
      spec: form.spec?.trim() || '',
      unit: form.unit?.trim() || '个',
      costPrice: Number(form.costPrice) || 0,
      salePrice: Number(form.salePrice) || 0,
      stockNum: Number(form.stockNum) || 0,
      warnNum: Number(form.warnNum) || 0,
      supplierId: form.supplierId ?? null,
      status: Number(form.status),
    }
    if (isEdit.value) {
      await updateProduct({ id: form.id, ...payload })
      ElMessage.success('商品信息已更新')
    } else {
      await addProduct(payload)
      ElMessage.success('商品已新增')
    }
    dialogVisible.value = false
    await loadList()
  } catch {
    // 失败文案（条码重复 / 分类不存在等）由 request 拦截器统一弹出
  } finally {
    submitLoading.value = false
  }
}

/* ---------------- 删除 ---------------- */

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除商品「${row.productName}」吗？\n若该商品已有出入库或销售记录，后端会拒绝删除，可改用「下架」。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await deleteProduct(row.id)
    ElMessage.success('商品已删除')
    // 删除后若当前页空了，回退一页
    if (list.value.length === 1 && pagination.pageNum > 1) pagination.pageNum -= 1
    await loadList()
  } catch {
    /* 业务拦截文案由拦截器弹出 */
  }
}

/* ---------------- 导出（仅管理员，导出当前筛选下的当前页） ---------------- */

function handleExport() {
  const today = new Date().toISOString().slice(0, 10)
  downloadCsv(
    `商品档案_${today}.csv`,
    ['商品名称', '条码', '分类', '规格', '单位', '进货价(元)', '售价(元)', '库存', '预警阈值', '状态', '供应商', '创建时间'],
    list.value.map((p) => [
      p.productName,
      p.productCode,
      p.categoryName,
      p.spec,
      p.unit,
      p.costPrice,
      p.salePrice,
      p.stockNum,
      p.warnNum,
      p.status === 1 ? '在售' : '下架',
      p.supplierName || '',
      p.createTime,
    ]),
  )
  ElMessage.success(`已导出当前页 ${list.value.length} 条商品档案`)
}

/* ---------------- 详情抽屉（进销存轨迹） ---------------- */

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailProduct = ref(null)
const detailStockLogs = ref([])
const detailSaleItems = ref([])

/** 进销存汇总：入库总量 / 出库总量 / 销售总量 */
const detailSummary = computed(() => {
  const inbound = detailStockLogs.value
    .filter((l) => l.changeType === 1)
    .reduce((s, l) => s + Number(l.quantity || 0), 0)
  const outbound = detailStockLogs.value
    .filter((l) => l.changeType === 2)
    .reduce((s, l) => s + Number(l.quantity || 0), 0)
  const sold = detailSaleItems.value.reduce((s, item) => s + Number(item.quantity || 0), 0)
  return { inbound, outbound, sold }
})

function changeMeta(changeType) {
  return changeType === 1
    ? { label: '入库', tag: 'success' }
    : { label: '出库', tag: 'warning' }
}

async function openDetail(row) {
  detailProduct.value = row
  detailVisible.value = true
  detailStockLogs.value = []
  detailSaleItems.value = []
  detailLoading.value = true
  try {
    const [detail, logs, sales] = await Promise.all([
      getProductDetail(row.id),
      getStockLogList({ productId: row.id, pageNum: 1, pageSize: 20 }),
      getSaleItemList({ productId: row.id, pageNum: 1, pageSize: 20 }),
    ])
    detailProduct.value = detail || row
    detailStockLogs.value = logs?.list || []
    detailSaleItems.value = sales?.list || []
  } finally {
    detailLoading.value = false
  }
}

/** 商品名首字符（用于 avatar 占位） */
function nameInitial(name) {
  return name ? name.slice(0, 1) : '？'
}
</script>

<template>
  <div class="product-page">
    <!-- ============ 筛选卡片 ============ -->
    <section class="page-card filter-card">
      <el-form :model="filterForm" inline class="filter-form">
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
        <el-form-item label="条码">
          <el-input
            v-model="filterForm.productCode"
            placeholder="如 6900000000001"
            clearable
            style="width: 200px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="filterForm.categoryId" placeholder="全部" clearable style="width: 150px">
            <el-option v-for="c in categoryOptions" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterForm.status" placeholder="全部" clearable style="width: 110px">
            <el-option v-for="s in STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
          <el-button v-if="isAdmin" :icon="Download" @click="handleExport">导出档案</el-button>
        </el-form-item>
      </el-form>
      <div v-if="isAdmin" class="filter-extra">
        <el-button type="primary" :icon="Plus" @click="openCreate">新增商品</el-button>
      </div>
    </section>

    <!-- ============ 商品表格卡片 ============ -->
    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">商品档案</h3>
        <span class="table-sub">共 {{ total }} 个商品</span>
      </header>

      <el-table
        v-loading="loading"
        :data="list"
        class="product-table"
      >
        <el-table-column label="商品" min-width="220">
          <template #default="{ row }">
            <div class="product-cell">
              <el-avatar :size="36" class="product-avatar">{{ nameInitial(row.productName) }}</el-avatar>
              <div class="product-meta">
                <span class="product-name">{{ row.productName }}</span>
                <span class="product-code">{{ row.productCode }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="categoryName" label="分类" width="110" />
        <el-table-column prop="spec" label="规格" width="110" show-overflow-tooltip />
        <el-table-column prop="costPrice" label="进货价" align="right" width="110">
          <template #default="{ row }">
            <span class="num">¥{{ money(row.costPrice) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="salePrice" label="售价" align="right" width="100">
          <template #default="{ row }">
            <span class="num amount">¥{{ money(row.salePrice) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="stockNum" label="库存" align="right" min-width="150">
          <template #default="{ row }">
            <span class="num stock-num">{{ formatInt(row.stockNum) }}{{ row.unit }}</span>
            <el-tag
              v-if="stockState(row) === 'out'"
              size="small"
              type="danger"
              effect="light"
              round
              class="stock-tag"
            >缺货</el-tag>
            <el-tag
              v-else-if="stockState(row) === 'warn'"
              size="small"
              type="warning"
              effect="light"
              round
              class="stock-tag"
            >预警</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" effect="light" round size="small">
              {{ row.status === 1 ? '在售' : '下架' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="supplierName" label="供应商" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" fixed="right" width="176">
          <template #default="{ row }">
            <el-button text type="primary" :icon="View" @click="openDetail(row)">详情</el-button>
            <template v-if="isAdmin">
              <el-button text type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button text type="danger" :icon="Delete" @click="handleDelete(row)">删除</el-button>
            </template>
            <span v-else class="view-only">仅查看</span>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty">
            <el-icon :size="32" class="empty-icon"><Box /></el-icon>
            <p>暂无商品档案数据</p>
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
      :title="isEdit ? '编辑商品' : '新增商品'"
      width="560"
      class="product-dialog"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="product-form"
      >
        <div class="form-row">
          <el-form-item label="商品名称" prop="productName" class="span-2">
            <el-input v-model="form.productName" placeholder="如 农夫山泉 550ml" maxlength="50" show-word-limit />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="条码" prop="productCode" class="span-2">
            <el-input v-model="form.productCode" placeholder="留空将自动生成 690 前缀条码" maxlength="13" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="商品分类" prop="categoryId">
            <el-select v-model="form.categoryId" placeholder="请选择分类" style="width: 100%">
              <el-option v-for="c in categoryOptions" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="规格" prop="spec">
            <el-input v-model="form.spec" placeholder="如 550ml / 70g" maxlength="20" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="单位" prop="unit">
            <el-input v-model="form.unit" placeholder="如 瓶 / 包 / kg" maxlength="6" />
          </el-form-item>
          <el-form-item label="供应商" prop="supplierId">
            <el-select v-model="form.supplierId" placeholder="请选择供应商" clearable filterable style="width: 100%">
              <el-option v-for="s in supplierOptions" :key="s.id" :label="s.supplierName" :value="s.id" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="进货价(元)" prop="costPrice">
            <el-input-number v-model="form.costPrice" :min="0" :precision="2" :step="0.1" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="售价(元)" prop="salePrice">
            <el-input-number v-model="form.salePrice" :min="0.01" :precision="2" :step="0.1" controls-position="right" style="width: 100%" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="库存数量" prop="stockNum">
            <el-input-number v-model="form.stockNum" :min="0" :step="1" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="预警阈值" prop="warnNum">
            <el-input-number v-model="form.warnNum" :min="0" :step="1" controls-position="right" style="width: 100%" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="销售状态" prop="status" class="span-2">
            <el-radio-group v-model="form.status">
              <el-radio :value="1">在售</el-radio>
              <el-radio :value="0">下架</el-radio>
            </el-radio-group>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- ============ 商品详情抽屉（进销存轨迹） ============ -->
    <el-drawer
      v-model="detailVisible"
      :title="detailProduct?.productName || '商品详情'"
      size="560px"
      class="detail-drawer"
    >
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detailProduct">
          <!-- 基本信息 -->
          <el-descriptions :column="2" border class="detail-desc">
            <el-descriptions-item label="商品条码">
              <span class="code">{{ detailProduct.productCode }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="商品分类">{{ detailProduct.categoryName }}</el-descriptions-item>
            <el-descriptions-item label="规格">{{ detailProduct.spec }}</el-descriptions-item>
            <el-descriptions-item label="单位">{{ detailProduct.unit }}</el-descriptions-item>
            <el-descriptions-item label="进货价">
              <span class="num">¥{{ money(detailProduct.costPrice) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="售价">
              <span class="num amount">¥{{ money(detailProduct.salePrice) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="当前库存">
              <span class="num">{{ formatInt(detailProduct.stockNum) }}{{ detailProduct.unit }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="预警阈值">
              <span class="num">{{ formatInt(detailProduct.warnNum) }}{{ detailProduct.unit }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <!-- 进销存汇总 -->
          <section class="flow-summary">
            <div class="flow-item flow-in">
              <span class="flow-label">累计入库</span>
              <span class="flow-value num">{{ formatInt(detailSummary.inbound) }}</span>
            </div>
            <div class="flow-item flow-out">
              <span class="flow-label">累计出库</span>
              <span class="flow-value num">{{ formatInt(detailSummary.outbound) }}</span>
            </div>
            <div class="flow-item flow-sale">
              <span class="flow-label">累计销售</span>
              <span class="flow-value num">{{ formatInt(detailSummary.sold) }}</span>
            </div>
          </section>

          <!-- 库存流水 -->
          <section class="flow-block">
            <h4 class="block-title">库存流水</h4>
            <el-table v-if="detailStockLogs.length" :data="detailStockLogs" size="small" class="flow-table" max-height="220">
              <el-table-column prop="createTime" label="时间" min-width="150" />
              <el-table-column label="类型" width="80" align="center">
                <template #default="{ row }">
                  <el-tag :type="changeMeta(row.changeType).tag" effect="light" size="small" round>
                    {{ changeMeta(row.changeType).label }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="数量" align="right" width="90">
                <template #default="{ row }">
                  <span class="num" :class="row.changeType === 1 ? 'is-in' : 'is-out'">
                    {{ row.changeType === 1 ? '+' : '-' }}{{ formatInt(row.quantity) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="operator" label="操作人" width="90" />
            </el-table>
            <el-empty v-else description="暂无库存流水" :image-size="60" />
          </section>

          <!-- 销售历史 -->
          <section class="flow-block">
            <h4 class="block-title">销售历史</h4>
            <el-table v-if="detailSaleItems.length" :data="detailSaleItems" size="small" class="flow-table" max-height="220">
              <el-table-column prop="saleNo" label="单据编号" min-width="150" show-overflow-tooltip />
              <el-table-column prop="createTime" label="时间" min-width="150" />
              <el-table-column label="数量" align="right" width="80">
                <template #default="{ row }">
                  <span class="num">{{ formatInt(row.quantity) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="金额" align="right" width="100">
                <template #default="{ row }">
                  <span class="num amount">¥{{ money(row.amount) }}</span>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-else description="暂无销售记录" :image-size="60" />
          </section>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.product-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-crumb {
  font-size: 13px;
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

/* sortable 列头：文字 + 排序图标强制并排 */
.product-table :deep(.el-table__header .cell) {
  white-space: nowrap;
}

.product-table :deep(.el-table th.el-table__cell) {
  background: var(--bg-muted);
  color: var(--text-regular);
  font-weight: 500;
}

.product-table :deep(.el-table__row:hover > td) {
  background: var(--bg-muted) !important;
}

/* 商品单元格：avatar + 名称/条码 */
.product-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.product-avatar {
  flex-shrink: 0;
  background: var(--brand-primary-light-9);
  color: var(--brand-primary);
  font-weight: 600;
  font-size: 14px;
}

.product-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.product-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.product-code {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: 'SF Mono', 'Consolas', monospace;
  letter-spacing: 0.02em;
}

/* 库存列：数字 + 预警 Tag，强制不换行，防截断 */
.stock-num {
  white-space: nowrap;
}

.stock-tag {
  margin-left: 6px;
  vertical-align: middle;
  white-space: nowrap;
}

.num {
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 13px;
  color: var(--text-regular);
}

.amount {
  color: var(--text-primary);
  font-weight: 600;
}

.view-only {
  font-size: 13px;
  color: var(--text-disabled);
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

/* ==================== 新增/编辑弹窗 ==================== */
.product-dialog :deep(.el-dialog) {
  border-radius: var(--radius-card);
}

.product-dialog :deep(.el-dialog__header) {
  padding: 20px 24px 14px;
  border-bottom: 1px solid var(--border-light);
}

.product-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.product-dialog :deep(.el-dialog__body) {
  padding: 20px 24px;
}

.product-dialog :deep(.el-dialog__footer) {
  padding: 12px 24px 20px;
  border-top: 1px solid var(--border-light);
}

.product-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
}

.form-row .span-2 {
  grid-column: span 2;
}

.product-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--text-regular);
  padding-bottom: 4px;
}

.product-form :deep(.el-form-item__content) {
  line-height: 1;
}

/* ==================== 响应式断点 ==================== */

/* 中屏：筛选控件宽度收窄、允许换行，新增按钮换到下行右对齐 */
@media (max-width: 1199px) {
  .filter-card {
    gap: 8px;
  }
  .filter-form {
    flex-wrap: wrap;
    gap: 8px 12px;
  }
  .filter-form :deep(.el-input) {
    width: 160px !important;
  }
  .filter-form :deep(.el-select) {
    width: 110px !important;
  }
  .filter-extra {
    width: 100%;
    justify-content: flex-end;
  }
}

/* 小屏：筛选控件分两行排布，操作按钮独占一行 */
@media (max-width: 991px) {
  .filter-card {
    padding: 14px 16px;
  }
  .filter-form {
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
  .table-head {
    margin-bottom: 12px;
  }
}

/* 超小屏：筛选控件单列堆叠，表单双列改单列 */
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
  .form-row {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .form-row .span-2 {
    grid-column: span 1;
  }
  .table-foot {
    justify-content: center;
  }
}

/* ==================== 详情抽屉 ==================== */
.detail-drawer :deep(.el-drawer__header) {
  padding: 18px 20px 14px;
  margin-bottom: 0;
  border-bottom: 1px solid var(--border-light);
}

.detail-drawer :deep(.el-drawer__title) {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.detail-drawer :deep(.el-drawer__body) {
  padding: 18px 20px;
}

/* v-loading 必须挂在元素根节点上，不能直接挂 el-drawer */
.detail-body {
  min-height: 240px;
}

.detail-desc {
  margin-bottom: 16px;
}

.detail-desc .code {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.detail-desc .amount {
  font-weight: 600;
  color: var(--text-primary);
}

.flow-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.flow-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: var(--radius-control);
  background: var(--bg-muted);
}

.flow-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.flow-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.flow-in .flow-value {
  color: var(--color-success);
}

.flow-out .flow-value {
  color: var(--color-warning);
}

.flow-sale .flow-value {
  color: var(--brand-primary);
}

.flow-block {
  margin-bottom: 20px;
}

.block-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.flow-table {
  width: 100%;
}

.flow-table .is-in {
  color: var(--color-success);
  font-weight: 600;
}

.flow-table .is-out {
  color: var(--color-warning);
  font-weight: 600;
}

.flow-block :deep(.el-empty) {
  padding: 20px 0;
}
</style>
