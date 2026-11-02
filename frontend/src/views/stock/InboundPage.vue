<script setup>
/**
 * 出入库明细页（库存管理）
 * 同一个组件按路由名区分两种模式：
 * - /stock/inbound  入库明细（可提交入库）
 * - /stock/outbound 出库明细（可提交出库）
 * 结构：筛选卡片 → 记录表格（服务端分页）→ 新增出入库弹窗
 * 业务：提交后由后端在事务内更新库存并生成流水，前端只刷新列表
 * 权限：管理员与操作员均可提交
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import { Download, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { getProductOptions } from '@/api/modules/product'
import { getSupplierOptions } from '@/api/modules/supplier'
import { createInbound, createOutbound, getInboundList, getOutboundList } from '@/api/modules/stock'
import { useBarcodeScanner } from '@/composables/useBarcodeScanner'
import { bizMeta, STOCK_BIZ_TYPES } from '@/constants/stock'
import { formatInt, money } from '@/utils/format.js'

const route = useRoute()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)

/** 当前模式：inbound 入库 / outbound 出库 */
const changeType = computed(() => (route.name === 'StockOutbound' ? 2 : 1))
const isInbound = computed(() => changeType.value === 1)
const pageTitle = computed(() => (isInbound.value ? '入库明细' : '出库明细'))
/** 入库需要 stock:in，出库需要 stock:out；只读岗位看不到新增按钮 */
const canCreate = computed(() => (isInbound.value ? userStore.can('stock:in') : userStore.can('stock:out')))

/** 入库/出库页只展示各自可能出现的业务类型 */
const BIZ_OPTIONS = computed(() => {
  const allowed = isInbound.value ? [1, 6, 3, 4, 7, 8] : [2, 5, 7]
  return allowed.map((value) => ({ value, label: STOCK_BIZ_TYPES[value].label }))
})

/* ---------------- 选品与供应商下拉 ---------------- */

const productOptions = ref([])
const supplierOptions = ref([])

async function loadOptions() {
  // 出入库必须能看到已下架商品：库存扣到 0 时后端会自动下架，若只拉在售商品就永远无法补货
  const requests = [getProductOptions({ includeOffline: 1 })]
  // 出库不需要供应商，入库才拉
  if (isInbound.value) requests.push(getSupplierOptions())
  const [products, suppliers] = await Promise.all(requests)
  productOptions.value = Array.isArray(products) ? products : []
  supplierOptions.value = Array.isArray(suppliers) ? suppliers : []
}

/** 选品下拉展示文案：名称 + 下架标记 + 当前库存 */
function productLabel(product) {
  const offline = product.status === 0 ? '（已下架）' : ''
  return `${product.productName}${offline}（当前库存 ${product.stockNum}${product.unit || ''}）`
}

/* ---------------- 列表（服务端分页） ---------------- */

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10 })

const filterForm = reactive({
  productName: '',
  bizType: '',
  dateRange: [],
})

const appliedFilters = reactive({
  productName: '',
  bizType: '',
  startTime: '',
  endTime: '',
})

async function loadList() {
  loading.value = true
  try {
    const fetcher = isInbound.value ? getInboundList : getOutboundList
    const res = await fetcher({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      productName: appliedFilters.productName || undefined,
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
  appliedFilters.bizType = filterForm.bizType
  appliedFilters.startTime = filterForm.dateRange?.[0] || ''
  appliedFilters.endTime = filterForm.dateRange?.[1] || ''
  pagination.pageNum = 1
  loadList()
}

function handleReset() {
  filterForm.productName = ''
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

onMounted(async () => {
  await loadOptions()
  loadList()
  // 商品新增后的「期初入库」引导：/stock/inbound?productId=xxx
  const productId = Number(route.query.productId)
  if (isInbound.value && userStore.can('stock:in') && Number.isInteger(productId) && productId > 0) {
    openCreate(productId)
  }
})

// 入库/出库共用同一个组件：路由切换时组件会被复用，必须手动重置筛选并重新加载
watch(isInbound, async () => {
  filterForm.productName = ''
  filterForm.bizType = ''
  filterForm.dateRange = []
  applied.productName = ''
  applied.bizType = ''
  applied.startTime = ''
  applied.endTime = ''
  pagination.pageNum = 1
  await loadOptions()
  loadList()
})

/* ---------------- 新增入库 / 出库弹窗 ---------------- */

const dialogVisible = ref(false)
const submitLoading = ref(false)
const formRef = ref(null)

const defaultForm = () => ({
  productId: null,
  quantity: 1,
  supplierId: null,
  inboundPrice: null,
  remark: '',
})

const form = reactive(defaultForm())

/** 当前选中商品的可用库存（出库数量上限，提交前先做一次本地提示） */
const selectedStock = computed(() => {
  const hit = productOptions.value.find((p) => p.id === form.productId)
  return hit ? hit.stockNum : 0
})

const rules = computed(() => ({
  productId: [{ required: true, message: `请选择${isInbound.value ? '入库' : '出库'}商品`, trigger: 'change' }],
  quantity: [
    { required: true, message: '请输入数量', trigger: 'blur' },
    { type: 'number', min: 1, message: '数量必须大于 0', trigger: 'blur' },
    ...(isInbound.value
      ? []
      : [
          {
            validator: (_rule, value, callback) =>
              Number(value) > selectedStock.value
                ? callback(new Error(`出库数量不能大于当前库存（${selectedStock.value}）`))
                : callback(),
            trigger: 'blur',
          },
        ]),
  ],
}))

function openCreate(productId = null) {
  Object.assign(form, defaultForm())
  if (productId) form.productId = Number(productId)
  barcode.value = ''
  dialogVisible.value = true
  // 弹窗打开后把光标放到扫码框，扫码枪即可直接输入
  nextTick(() => barcodeRef.value?.focus())
}

/* ---------------- 扫码选商品 ---------------- */

const barcodeRef = ref(null)
const barcode = ref('')

/** 按条码匹配在售商品并自动选中（扫码枪输入与手动输入回车共用） */
function applyBarcode(code) {
  const key = String(code || '').trim()
  if (!key) return
  const hit = productOptions.value.find((p) => String(p.productCode) === key)
  if (!hit) {
    ElMessage.warning(`未找到条码「${key}」对应的商品`)
    return
  }
  form.productId = hit.id
  barcode.value = ''
  ElMessage.success(`已选中「${hit.productName}」`)
}

function handleBarcodeEnter() {
  applyBarcode(barcode.value)
}

/** 弹窗打开期间支持不聚焦扫码框直接扫码 */
useBarcodeScanner(applyBarcode, { enabled: () => dialogVisible.value })

async function handleSubmit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitLoading.value = true
  try {
    if (isInbound.value) {
      await createInbound({
        productId: form.productId,
        quantity: Number(form.quantity),
        inboundPrice: form.inboundPrice === null || form.inboundPrice === '' ? undefined : Number(form.inboundPrice),
        supplierId: form.supplierId ?? undefined,
        remark: form.remark,
      })
      ElMessage.success('入库成功，库存已更新')
    } else {
      await createOutbound({
        productId: form.productId,
        quantity: Number(form.quantity),
        remark: form.remark,
      })
      ElMessage.success('出库成功，库存已更新')
    }
    dialogVisible.value = false
    // 库存已变化，选品下拉的库存数同步刷新
    await Promise.all([loadList(), loadOptions()])
  } catch {
    /* 失败文案（如「出库数量大于当前库存」）由 request 拦截器统一弹出 */
    await loadOptions()
  } finally {
    submitLoading.value = false
  }
}
</script>

<template>
  <div class="inbound-page">
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
        <el-form-item label="业务类型">
          <el-select v-model="filterForm.bizType" placeholder="全部" clearable style="width: 130px">
            <el-option v-for="opt in BIZ_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="`${isInbound ? '入库' : '出库'}日期`">
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
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate()">
          {{ isInbound ? '新增入库' : '新增出库' }}
        </el-button>
      </div>
    </section>

    <!-- ============ 记录表格卡片 ============ -->
    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">{{ pageTitle }}</h3>
        <span class="table-sub">共 {{ total }} 条{{ isInbound ? '入库' : '出库' }}记录</span>
      </header>

      <el-table v-loading="loading" :data="list" class="inbound-table">
        <el-table-column prop="productName" label="商品名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="业务类型" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="bizMeta(row.bizType).tag" effect="light" round size="small">
              {{ row.bizTypeName || bizMeta(row.bizType).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" :label="`${isInbound ? '入库' : '出库'}数量`" align="right" width="110">
          <template #default="{ row }">
            <span class="num">{{ formatInt(row.quantity) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="isInbound" prop="supplierName" label="供应商" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.supplierName || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="isInbound && isAdmin" prop="inboundPrice" label="入库单价" align="right" width="110">
          <template #default="{ row }">
            <span class="num">{{ row.inboundPrice ? `¥${money(row.inboundPrice)}` : '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="库存变化" align="right" width="140">
          <template #default="{ row }">
            <span class="num stock-change">
              {{ formatInt(row.beforeNum) }} → <b>{{ formatInt(row.afterNum) }}</b>
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="100" />
        <el-table-column prop="createTime" :label="`${isInbound ? '入库' : '出库'}时间`" min-width="160" />
        <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.remark || '—' }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty">
            <el-icon :size="32" class="empty-icon"><Download /></el-icon>
            <p>暂无{{ isInbound ? '入库' : '出库' }}记录</p>
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

    <!-- ============ 新增出入库弹窗 ============ -->
    <el-dialog
      v-model="dialogVisible"
      :title="isInbound ? '新增入库' : '新增出库'"
      width="520"
      class="inbound-dialog"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="inbound-form">
        <el-form-item label="扫码选商品">
          <el-input
            ref="barcodeRef"
            v-model="barcode"
            placeholder="扫码枪扫描条码，自动选中商品"
            clearable
            @keyup.enter="handleBarcodeEnter"
          />
          <span class="form-hint">也可手动输入条码后回车；已下架商品同样可入库补货</span>
        </el-form-item>
        <el-form-item :label="`${isInbound ? '入库' : '出库'}商品`" prop="productId">
          <el-select v-model="form.productId" filterable placeholder="请选择商品" style="width: 100%">
            <el-option
              v-for="p in productOptions"
              :key="p.id"
              :label="productLabel(p)"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="`${isInbound ? '入库' : '出库'}数量`" prop="quantity">
          <el-input-number
            v-model="form.quantity"
            :min="1"
            :max="isInbound ? undefined : Math.max(selectedStock, 1)"
            :step="1"
            controls-position="right"
            style="width: 100%"
          />
          <span v-if="!isInbound" class="form-hint">当前库存 {{ selectedStock }}，出库数量不可超过库存</span>
        </el-form-item>
        <el-form-item v-if="isInbound" label="供应商">
          <el-select v-model="form.supplierId" clearable filterable placeholder="选择供应商" style="width: 100%">
            <el-option v-for="s in supplierOptions" :key="s.id" :label="s.supplierName" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="isInbound" label="入库单价(元)">
          <el-input-number v-model="form.inboundPrice" :min="0" :precision="2" :step="0.1" controls-position="right" style="width: 100%" />
          <span class="form-hint">填写后按移动加权平均更新商品成本，留空则维持原均价</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="选填" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          确定{{ isInbound ? '入库' : '出库' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.inbound-page {
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

.inbound-table :deep(.el-table th.el-table__cell) {
  background: var(--bg-muted);
  color: var(--text-regular);
  font-weight: 500;
}

.inbound-table :deep(.el-table__row:hover > td) {
  background: var(--bg-muted) !important;
}

.num {
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 13px;
  color: var(--text-regular);
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
.inbound-dialog :deep(.el-dialog) {
  border-radius: var(--radius-card);
}

.inbound-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--text-regular);
  padding-bottom: 4px;
}

.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.stock-change {
  color: var(--text-secondary);
}

.stock-change b {
  color: var(--text-primary);
}

/* ==================== 响应式 ==================== */
@media (max-width: 1199px) {
  .filter-card {
    gap: 8px;
  }
  .filter-form {
    flex-wrap: wrap;
    gap: 8px 12px;
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
  .filter-form :deep(.el-input),
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
