<script setup>
/**
 * 采购管理页（简单版）
 *
 * 流程：采购制单（草稿）→ 提交 → 仓管确认收货 → 入库并生成应付 → 管理员登记付款
 * 权限：采购/管理员制单，仓管/管理员收货，付款仅管理员；采购只能操作自己的单据。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search, View } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { getProductOptions } from '@/api/modules/product'
import { getSupplierOptions } from '@/api/modules/supplier'
import {
  getPurchaseList,
  getPurchaseDetail,
  createPurchase,
  updatePurchase,
  submitPurchase,
  receivePurchase,
  cancelPurchase,
  payPurchase,
} from '@/api/modules/purchase'
import { formatInt, money, round2 } from '@/utils/format.js'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
const canCreate = computed(() => userStore.can('purchase:create'))
const canReceive = computed(() => userStore.can('purchase:receive'))

const STATUS = {
  0: { label: '草稿', tag: 'info' },
  1: { label: '已提交', tag: 'warning' },
  2: { label: '已入库', tag: 'success' },
  3: { label: '已取消', tag: 'info' },
}
const STATUS_OPTIONS = Object.entries(STATUS).map(([value, meta]) => ({
  value: Number(value),
  label: meta.label,
}))
const PAY_STATUS = {
  0: { label: '未付款', tag: 'danger' },
  1: { label: '部分付款', tag: 'warning' },
  2: { label: '已付清', tag: 'success' },
}

function statusMeta(status) {
  return STATUS[status] || { label: '未知', tag: 'info' }
}

function payMeta(status) {
  return PAY_STATUS[status] || { label: '未付款', tag: 'danger' }
}

/* ---------------- 列表 ---------------- */

const loading = ref(false)
const list = ref([])
const total = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10 })

const filterForm = reactive({ orderNo: '', status: '', dateRange: [] })
const applied = reactive({ orderNo: '', status: '', startTime: '', endTime: '' })

async function loadList() {
  loading.value = true
  try {
    const res = await getPurchaseList({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      orderNo: applied.orderNo || undefined,
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
  applied.orderNo = filterForm.orderNo.trim()
  applied.status = filterForm.status
  applied.startTime = filterForm.dateRange?.[0] || ''
  applied.endTime = filterForm.dateRange?.[1] || ''
  pagination.pageNum = 1
  loadList()
}

function handleReset() {
  filterForm.orderNo = ''
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

/* ---------------- 操作按钮显隐 ---------------- */

function isOwner(row) {
  return isAdmin.value || row.operator === userStore.realName
}

function showEdit(row) {
  return canCreate.value && row.status === 0 && isOwner(row)
}

function showSubmit(row) {
  return canCreate.value && row.status === 0 && isOwner(row)
}

function showCancel(row) {
  return canCreate.value && (row.status === 0 || row.status === 1) && isOwner(row)
}

function showReceive(row) {
  return canReceive.value && row.status === 1
}

function showPay(row) {
  return isAdmin.value && row.status === 2 && row.payStatus !== 2
}

/* ---------------- 新建 / 编辑 ---------------- */

const formVisible = ref(false)
const saving = ref(false)
const editingId = ref(null)
const productOptions = ref([])
const supplierOptions = ref([])
const optionsLoaded = ref(false)

const form = reactive({ supplierId: null, remark: '', items: [] })
const dialogTitle = computed(() => (editingId.value ? '编辑采购单' : '新建采购单'))

function itemAmount(row) {
  return round2((Number(row.quantity) || 0) * (Number(row.price) || 0))
}

const formTotal = computed(() => round2(form.items.reduce((sum, row) => sum + itemAmount(row), 0)))

async function ensureOptions() {
  if (optionsLoaded.value) return
  const [products, suppliers] = await Promise.all([
    getProductOptions({ includeOffline: 1 }),
    getSupplierOptions(),
  ])
  productOptions.value = Array.isArray(products) ? products : []
  supplierOptions.value = Array.isArray(suppliers) ? suppliers : []
  optionsLoaded.value = true
}

function productLabel(product) {
  const offline = product.status === 0 ? '（已下架）' : ''
  return `${product.productName}${offline}（库存 ${product.stockNum}${product.unit || ''}）`
}

function blankItem() {
  return { productId: null, quantity: 1, price: 0 }
}

async function openCreate() {
  editingId.value = null
  form.supplierId = null
  form.remark = ''
  form.items = [blankItem()]
  formVisible.value = true
  try {
    await ensureOptions()
  } catch {
    // 下拉加载失败由请求拦截器提示
  }
}

async function openEdit(row) {
  try {
    const detail = await getPurchaseDetail(row.id)
    await ensureOptions()
    editingId.value = detail.id
    form.supplierId = detail.supplierId
    form.remark = detail.remark || ''
    form.items = (detail.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: Number(item.price) || 0,
    }))
    if (!form.items.length) form.items = [blankItem()]
    formVisible.value = true
  } catch {
    // 详情加载失败由请求拦截器提示
  }
}

function addItem() {
  form.items.push(blankItem())
}

function removeItem(index) {
  if (form.items.length <= 1) return
  form.items.splice(index, 1)
}

function validateForm() {
  if (!form.supplierId) {
    ElMessage.warning('请选择供应商')
    return false
  }
  if (!form.items.length) {
    ElMessage.warning('请添加采购明细')
    return false
  }

  const seen = new Set()
  for (const row of form.items) {
    if (!row.productId) {
      ElMessage.warning('请为每条明细选择商品')
      return false
    }
    if (seen.has(row.productId)) {
      ElMessage.warning('同一商品不能重复添加')
      return false
    }
    seen.add(row.productId)

    const qty = Number(row.quantity)
    if (row.quantity === null || !Number.isInteger(qty) || qty <= 0) {
      ElMessage.warning('采购数量必须是大于 0 的整数')
      return false
    }

    const price = Number(row.price)
    if (row.price === null || row.price === '' || !Number.isFinite(price) || price < 0) {
      ElMessage.warning('采购单价不能为空，且不能为负')
      return false
    }
  }
  return true
}

async function saveForm() {
  if (!validateForm()) return

  saving.value = true
  try {
    const payload = {
      supplierId: form.supplierId,
      remark: form.remark.trim(),
      items: form.items.map((row) => ({
        productId: row.productId,
        quantity: Number(row.quantity),
        price: Number(row.price),
      })),
    }

    if (editingId.value) {
      await updatePurchase(editingId.value, payload)
      ElMessage.success('采购单已保存')
    } else {
      const created = await createPurchase(payload)
      ElMessage.success(`采购单 ${created.orderNo} 已创建`)
    }
    formVisible.value = false
    await loadList()
  } finally {
    saving.value = false
  }
}

/* ---------------- 提交 / 收货 / 取消 ---------------- */

const actionLoading = ref('')

async function submitRow(row) {
  try {
    await ElMessageBox.confirm('提交后采购单不能再修改，确认提交？', '提交采购单', {
      type: 'warning',
      confirmButtonText: '提交',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  actionLoading.value = 'submit'
  try {
    await submitPurchase(row.id)
    ElMessage.success('采购单已提交')
    await refreshAfterAction(row.id)
  } finally {
    actionLoading.value = ''
  }
}

async function receiveRow(row) {
  try {
    await ElMessageBox.confirm(
      '确认收货后会立即增加库存、更新加权成本并生成应付金额，确认收货？',
      '确认收货入库',
      { type: 'warning', confirmButtonText: '确认收货', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  actionLoading.value = 'receive'
  try {
    await receivePurchase(row.id)
    ElMessage.success('收货成功，库存与应付已生成')
    await refreshAfterAction(row.id)
  } finally {
    actionLoading.value = ''
  }
}

async function cancelRow(row) {
  try {
    await ElMessageBox.confirm('取消后该采购单不能恢复，确认取消？', '取消采购单', {
      type: 'warning',
      confirmButtonText: '取消采购单',
      cancelButtonText: '返回',
    })
  } catch {
    return
  }

  actionLoading.value = 'cancel'
  try {
    await cancelPurchase(row.id)
    ElMessage.success('采购单已取消')
    await refreshAfterAction(row.id)
  } finally {
    actionLoading.value = ''
  }
}

/* ---------------- 详情 ---------------- */

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

const detailUnpaid = computed(() => {
  if (detail.value?.payableAmount === undefined) return null
  const payable = Number(detail.value.payableAmount) || 0
  const paid = Number(detail.value.paidAmount) || 0
  return round2(payable - paid)
})

async function loadDetail(id) {
  detailLoading.value = true
  try {
    detail.value = await getPurchaseDetail(id)
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

/** 仓管看不到采购金额，接口会直接不返回该字段 */
function moneyOrDash(value) {
  return value === null || value === undefined ? '—' : money(value)
}

/* ---------------- 登记付款 ---------------- */

const payVisible = ref(false)
const paying = ref(false)
const payOrder = ref(null)
const payAmount = ref(0)

const payRemaining = computed(() => {
  const payable = Number(payOrder.value?.payableAmount) || 0
  const paid = Number(payOrder.value?.paidAmount) || 0
  return round2(payable - paid)
})

function openPay(row) {
  payOrder.value = row
  payAmount.value = round2((Number(row.payableAmount) || 0) - (Number(row.paidAmount) || 0))
  payVisible.value = true
}

async function submitPay() {
  const amount = Number(payAmount.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    ElMessage.warning('付款金额必须大于 0')
    return
  }
  if (amount > payRemaining.value) {
    ElMessage.warning('付款金额不能超过未付金额')
    return
  }

  paying.value = true
  try {
    await payPurchase(payOrder.value.id, { amount })
    ElMessage.success('付款已登记')
    payVisible.value = false
    await refreshAfterAction(payOrder.value.id)
  } finally {
    paying.value = false
  }
}
</script>

<template>
  <div class="purchase-page">
    <section class="page-card filter-card">
      <el-form :model="filterForm" inline class="filter-form" @submit.prevent>
        <el-form-item label="采购单号">
          <el-input
            v-model="filterForm.orderNo"
            placeholder="如 CG20261101-001"
            clearable
            :prefix-icon="Search"
            style="width: 200px"
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
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">新建采购单</el-button>
      </div>
    </section>

    <section class="page-card table-card">
      <header class="table-head">
        <h3 class="table-title">采购单</h3>
        <span class="table-sub">共 {{ total }} 张采购单</span>
      </header>

      <el-table v-loading="loading" :data="list">
        <el-table-column prop="orderNo" label="采购单号" min-width="170" />
        <el-table-column prop="supplierName" label="供应商" min-width="150" show-overflow-tooltip />
        <el-table-column label="状态" width="95" align="center">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).tag" effect="light" round size="small">
              {{ statusMeta(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="采购金额" width="120" align="right">
          <template #default="{ row }">
            <span class="num">{{ moneyOrDash(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="付款进度" width="170" align="right">
          <template #default="{ row }">
            <template v-if="row.status === 2 && row.payStatus !== undefined">
              <el-tag :type="payMeta(row.payStatus).tag" effect="plain" size="small">
                {{ payMeta(row.payStatus).label }}
              </el-tag>
              <div class="pay-detail">{{ money(row.paidAmount) }} / {{ money(row.payableAmount) }}</div>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="制单人" width="100" />
        <el-table-column prop="createTime" label="创建时间" min-width="160" />
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" :icon="View" @click="openDetail(row)">查看</el-button>
            <el-button v-if="showEdit(row)" text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button
              v-if="showSubmit(row)"
              text
              type="primary"
              :loading="actionLoading === 'submit'"
              @click="submitRow(row)"
            >
              提交
            </el-button>
            <el-button
              v-if="showReceive(row)"
              text
              type="success"
              :loading="actionLoading === 'receive'"
              @click="receiveRow(row)"
            >
              收货
            </el-button>
            <el-button v-if="showPay(row)" text type="warning" @click="openPay(row)">付款</el-button>
            <el-button
              v-if="showCancel(row)"
              text
              type="danger"
              :loading="actionLoading === 'cancel'"
              @click="cancelRow(row)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty"><p>暂无采购单</p></div>
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

    <!-- 新建 / 编辑采购单 -->
    <el-dialog v-model="formVisible" :title="dialogTitle" width="860px" :close-on-click-modal="false">
      <el-form :model="form" label-position="top">
        <div class="form-row">
          <el-form-item label="供应商" required class="grow">
            <el-select v-model="form.supplierId" filterable placeholder="请选择供应商" style="width: 100%">
              <el-option
                v-for="supplier in supplierOptions"
                :key="supplier.id"
                :label="supplier.supplierName"
                :value="supplier.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="备注" class="grow">
            <el-input v-model="form.remark" maxlength="200" show-word-limit placeholder="选填" />
          </el-form-item>
        </div>

        <div class="item-head">
          <span class="item-title">采购明细</span>
          <el-button size="small" :icon="Plus" @click="addItem">添加商品</el-button>
        </div>

        <el-table :data="form.items" size="small" class="item-table">
          <el-table-column label="商品" min-width="240">
            <template #default="{ row }">
              <el-select v-model="row.productId" filterable placeholder="选择商品" style="width: 100%">
                <el-option
                  v-for="product in productOptions"
                  :key="product.id"
                  :label="productLabel(product)"
                  :value="product.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="140">
            <template #default="{ row }">
              <el-input-number
                v-model="row.quantity"
                :min="1"
                :step="1"
                :precision="0"
                controls-position="right"
                style="width: 110px"
              />
            </template>
          </el-table-column>
          <el-table-column label="采购单价" width="160">
            <template #default="{ row }">
              <el-input-number
                v-model="row.price"
                :min="0"
                :step="0.5"
                :precision="2"
                controls-position="right"
                style="width: 130px"
              />
            </template>
          </el-table-column>
          <el-table-column label="小计" width="110" align="right">
            <template #default="{ row }">
              <span class="num">{{ money(itemAmount(row)) }}</span>
            </template>
          </el-table-column>
          <el-table-column width="64" align="center">
            <template #default="{ $index }">
              <el-button text type="danger" :disabled="form.items.length <= 1" @click="removeItem($index)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="form-total">
          合计金额：<span class="total-num">{{ money(formTotal) }}</span> 元
        </div>
      </el-form>

      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存草稿</el-button>
      </template>
    </el-dialog>

    <!-- 采购单详情 -->
    <el-drawer v-model="detailVisible" :title="detail?.orderNo || '采购单详情'" size="820px">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="状态">
              <el-tag :type="statusMeta(detail.status).tag" effect="light" round size="small">
                {{ statusMeta(detail.status).label }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="供应商">{{ detail.supplierName }}</el-descriptions-item>
            <el-descriptions-item label="制单人">{{ detail.operator }}</el-descriptions-item>
            <el-descriptions-item label="采购金额">{{ moneyOrDash(detail.totalAmount) }} 元</el-descriptions-item>
            <el-descriptions-item label="应付金额">{{ moneyOrDash(detail.payableAmount) }} 元</el-descriptions-item>
            <el-descriptions-item label="付款状态">
              <el-tag
                v-if="detail.status === 2 && detail.payStatus !== undefined"
                :type="payMeta(detail.payStatus).tag"
                effect="plain"
                size="small"
              >
                {{ payMeta(detail.payStatus).label }}
              </el-tag>
              <span v-else class="muted">—</span>
            </el-descriptions-item>
            <el-descriptions-item label="已付金额">{{ moneyOrDash(detail.paidAmount) }} 元</el-descriptions-item>
            <el-descriptions-item label="未付金额">{{ moneyOrDash(detailUnpaid) }} 元</el-descriptions-item>
            <el-descriptions-item label="收货人">{{ detail.receiver || '—' }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ detail.submitTime || '—' }}</el-descriptions-item>
            <el-descriptions-item label="收货时间">{{ detail.receiveTime || '—' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ detail.createTime }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="3">{{ detail.remark || '—' }}</el-descriptions-item>
          </el-descriptions>

          <el-table :data="detail.items" class="item-table" max-height="420">
            <el-table-column prop="productName" label="商品" min-width="180" show-overflow-tooltip />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column label="数量" width="90" align="right">
              <template #default="{ row }">
                <span class="num">{{ formatInt(row.quantity) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="采购单价" width="110" align="right">
              <template #default="{ row }">
                <span class="num">{{ moneyOrDash(row.price) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="小计" width="120" align="right">
              <template #default="{ row }">
                <span class="num">{{ moneyOrDash(row.amount) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button
            v-if="detail && showPay(detail)"
            type="warning"
            @click="openPay(detail)"
          >
            登记付款
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 登记付款 -->
    <el-dialog v-model="payVisible" title="登记付款" width="420px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="采购单号">{{ payOrder?.orderNo }}</el-form-item>
        <el-form-item label="供应商">{{ payOrder?.supplierName }}</el-form-item>
        <el-form-item label="未付金额">{{ money(payRemaining) }} 元</el-form-item>
        <el-form-item label="本次付款金额" required>
          <el-input-number
            v-model="payAmount"
            :min="0.01"
            :max="payRemaining || 0.01"
            :precision="2"
            :step="100"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payVisible = false">取消</el-button>
        <el-button type="primary" :loading="paying" @click="submitPay">确认付款</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.purchase-page {
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

.muted {
  color: var(--text-secondary);
}

.pay-detail {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.form-row {
  display: flex;
  gap: 16px;
}

.grow {
  flex: 1;
}

.item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0 8px;
}

.item-title {
  font-size: 14px;
  font-weight: 600;
}

.item-table {
  margin-bottom: 8px;
}

.form-total {
  padding: 10px 4px 0;
  text-align: right;
  color: var(--text-secondary);
}

.total-num {
  font-size: 20px;
  font-weight: 600;
  color: var(--brand-primary);
  font-variant-numeric: tabular-nums;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 767px) {
  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .filter-actions {
    margin-left: 0;
  }
}
</style>
