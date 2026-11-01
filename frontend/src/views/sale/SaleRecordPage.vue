<script setup>
/**
 * 销售记录页（销售管理）
 * 结构：筛选卡片 → 4 个统计小卡片 → 单据表格（服务端分页）→ 单据明细弹窗
 * 权限：管理员可见导出与作废按钮；收银员可对本人销售单发起退货申请，退货确认由管理员在「退货单」页完成
 * 业务：
 * - 历史流水不可删除，页面无删除按钮
 * - 退货为独立整单退货单：申请不动库存，管理员确认后回补库存并冲减营收
 * - 作废仅管理员可用，作废后回补库存并把该单待确认的退货申请一并取消
 * - 统计口径只认 status = 1 的正常单据，因此记录条数与销售统计的订单数对不上是正常的
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user'
import {
  getSaleRecordDetail,
  getSaleRecordList,
  voidSaleRecord,
} from '@/api/modules/sale'
import { createSaleReturn } from '@/api/modules/saleReturn'
import { downloadCsv } from '@/utils/csv.js'
import { formatInt, money } from '@/utils/format.js'

const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin)
/** 管理员 / 会计可查看全部收银员的单据；收银员只能看自己的 */
const canReadAll = computed(() => userStore.can('sale:read:all'))
/** 管理员 / 收银员可以发起整单退货申请 */
const canApplyReturn = computed(() => userStore.can('sale:return:create'))

/** 支付方式（1 现金 2 微信 3 支付宝 4 银行卡） */
const PAY_TYPES = {
  1: { label: '现金', tag: 'info' },
  2: { label: '微信支付', tag: 'success' },
  3: { label: '支付宝', tag: 'success' },
  4: { label: '银行卡', tag: 'warning' },
}

/** 单据状态（1 正常 2 已退货 3 已作废） */
const SALE_STATUS = {
  1: { label: '正常', tag: 'success' },
  2: { label: '已退货', tag: 'warning' },
  3: { label: '已作废', tag: 'info' },
}

function payMeta(payType) {
  return PAY_TYPES[payType] || { label: '未知', tag: 'info' }
}

function statusMeta(status) {
  return SALE_STATUS[status] || SALE_STATUS[1]
}

/* ---------------- 列表（服务端分页） ---------------- */

const loading = ref(false)
const records = ref([])
const total = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10 })

const filterForm = reactive({
  dateRange: [], // [开始日期, 结束日期]（YYYY-MM-DD）
  saleNo: '',
  operator: '',
  payType: '',
})

/** 已应用的筛选（点【查询】后生效，与表单输入解耦，符合 B 端操作习惯） */
const appliedFilters = reactive({
  startTime: '',
  endTime: '',
  saleNo: '',
  operator: '',
  payType: '',
})

async function loadList() {
  loading.value = true
  try {
    const res = await getSaleRecordList({
      pageNum: pagination.pageNum,
      pageSize: pagination.pageSize,
      saleNo: appliedFilters.saleNo || undefined,
      operator: appliedFilters.operator || undefined,
      payType: appliedFilters.payType === '' ? undefined : appliedFilters.payType,
      startTime: appliedFilters.startTime || undefined,
      endTime: appliedFilters.endTime || undefined,
    })
    records.value = res?.list || []
    total.value = res?.total || 0
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  appliedFilters.startTime = filterForm.dateRange?.[0] || ''
  appliedFilters.endTime = filterForm.dateRange?.[1] || ''
  appliedFilters.saleNo = filterForm.saleNo.trim()
  appliedFilters.operator = filterForm.operator.trim()
  appliedFilters.payType = filterForm.payType
  pagination.pageNum = 1 // 重新查询回到第一页
  loadList()
}

function handleReset() {
  filterForm.dateRange = []
  filterForm.saleNo = ''
  filterForm.operator = ''
  filterForm.payType = ''
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

/* ---------------- 统计小卡片（当前页汇总） ---------------- */

const summary = computed(() => {
  const list = records.value
  const totalAmount = list.reduce((sum, record) => sum + Number(record.totalAmount || 0), 0)
  const totalQuantity = list.reduce((sum, record) => sum + Number(record.totalQuantity || 0), 0)
  return {
    orderCount: list.length,
    totalQuantity,
    totalAmount,
    avgAmount: list.length ? totalAmount / list.length : 0,
  }
})

/* ---------------- 明细弹窗 ---------------- */

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailRecord = ref(null)

async function openDetail(row) {
  detailRecord.value = row
  detailVisible.value = true
  detailLoading.value = true
  try {
    detailRecord.value = (await getSaleRecordDetail(row.id)) || row
  } finally {
    detailLoading.value = false
  }
}

/** 关闭弹窗后刷新列表（退货/作废会改变状态） */
function closeDetail() {
  detailVisible.value = false
}

/* ---------------- 导出（仅管理员可见，导出当前页） ---------------- */

/** 导出当前筛选结果 */
function exportFiltered() {
  const today = new Date().toISOString().slice(0, 10)
  downloadCsv(
    `销售记录_${today}.csv`,
    ['单据编号', '销售时间', '收银员', '支付方式', '状态', '商品总数量', '销售总金额(元)'],
    records.value.map((record) => [
      record.saleNo,
      record.createTime,
      record.operator,
      payMeta(record.payType).label,
      statusMeta(record.status).label,
      record.totalQuantity,
      record.totalAmount,
    ]),
  )
  ElMessage.success(`已导出当前页 ${records.value.length} 条销售记录`)
}

/** 导出单条单据的商品明细 */
function exportDetail(record) {
  if (!record?.items?.length) {
    ElMessage.warning('该单据暂无可导出的商品明细')
    return
  }
  downloadCsv(
    `${record.saleNo}_明细.csv`,
    ['商品名称', '商品分类', '销售单价(元)', '销售数量', '小计金额(元)'],
    record.items.map((item) => [
      item.productName,
      item.categoryName,
      item.salePrice,
      item.quantity,
      item.amount,
    ]),
  )
  ElMessage.success(`单据 ${record.saleNo} 已导出`)
}

/* ---------------- 退货申请 / 作废 ---------------- */

/** 发起整单退货申请：只生成待确认退货单，不动库存；管理员确认后才回补库存 */
async function handleApplyReturn(row) {
  if (row.status !== 1) return
  try {
    await ElMessageBox.confirm(
      `确认对单据「${row.saleNo}」发起整单退货申请吗？\n提交后需管理员在「退货单」页确认，确认后才会回补库存并冲减营收。`,
      '发起退货申请',
      {
        type: 'warning',
        confirmButtonText: '提交申请',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  try {
    const result = await createSaleReturn({ saleNo: row.saleNo })
    ElMessage.success(`退货单 ${result.returnNo} 已提交，等待管理员确认`)
    await reloadAfterWrite()
  } catch {
    /* 失败文案（如「该单据已有待确认的退货单」）由 request 拦截器统一弹出 */
  }
}

/** 作废单据：回补库存，并取消该单待确认的退货申请 */
async function handleVoid(row) {
  if (row.status !== 1) return
  try {
    await ElMessageBox.confirm(
      `确认作废单据「${row.saleNo}」吗？\n作废后该单不计入销售统计，库存会回补，待确认的退货申请会一并取消。`,
      '作废确认',
      {
        type: 'warning',
        confirmButtonText: '确认作废',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  try {
    await voidSaleRecord(row.saleNo)
    ElMessage.success(`单据 ${row.saleNo} 已作废，库存已回补`)
    await reloadAfterWrite()
  } catch {
    /* 失败文案由 request 拦截器统一弹出 */
  }
}

/** 写操作后刷新列表与已打开的明细 */
async function reloadAfterWrite() {
  await loadList()
  if (detailVisible.value && detailRecord.value) {
    detailRecord.value = (await getSaleRecordDetail(detailRecord.value.id)) || detailRecord.value
  }
}
</script>

<template>
  <div class="sale-record">
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
            :clearable="true"
            class="date-picker"
          />
        </el-form-item>
        <el-form-item label="单据编号">
          <el-input
            v-model="filterForm.saleNo"
            placeholder="如：XS20261011-001"
            clearable
            class="sale-no-input"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item v-if="canReadAll" label="收银员">
          <el-input
            v-model="filterForm.operator"
            placeholder="姓名，精确匹配"
            clearable
            class="operator-select"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item label="支付方式">
          <el-select v-model="filterForm.payType" placeholder="全部" clearable class="pay-select">
            <el-option label="现金" :value="1" />
            <el-option label="微信支付" :value="2" />
            <el-option label="支付宝" :value="3" />
            <el-option label="银行卡" :value="4" />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" @click="handleQuery">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button v-if="isAdmin" text type="primary" @click="exportFiltered">导出当前页</el-button>
        </el-form-item>
      </el-form>
    </section>

    <!-- ============ 统计小卡片（当前页汇总） ============ -->
    <section class="stat-grid">
      <div class="page-card stat-card">
        <span class="stat-label">本页销售单数</span>
        <span class="stat-value num">{{ formatInt(summary.orderCount) }}<em>单</em></span>
      </div>
      <div class="page-card stat-card">
        <span class="stat-label">本页销售件数</span>
        <span class="stat-value num">{{ formatInt(summary.totalQuantity) }}<em>件</em></span>
      </div>
      <div class="page-card stat-card">
        <span class="stat-label">本页销售金额</span>
        <span class="stat-value num">¥{{ money(summary.totalAmount) }}<em>元</em></span>
      </div>
      <div class="page-card stat-card">
        <span class="stat-label">本页平均客单价</span>
        <span class="stat-value num">¥{{ money(summary.avgAmount) }}<em>元</em></span>
      </div>
    </section>

    <!-- ============ 单据表格卡片 ============ -->
    <section class="page-card table-card">
      <el-table v-loading="loading" :data="records" class="record-table">
        <el-table-column prop="saleNo" label="单据编号" min-width="175" show-overflow-tooltip />
        <el-table-column prop="createTime" label="销售时间" min-width="150" />
        <el-table-column prop="operator" label="收银员" width="96" />
        <el-table-column label="状态" width="150" align="center">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).tag" effect="light" round size="small">
              {{ statusMeta(row.status).label }}
            </el-tag>
            <el-tag
              v-if="row.activeReturnStatus === 0"
              type="warning"
              effect="plain"
              size="small"
              class="return-pending"
            >
              退货待确认
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="支付方式" width="112">
          <template #default="{ row }">
            <el-tag :type="payMeta(row.payType).tag" effect="light">{{ payMeta(row.payType).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="商品总数量" align="right" width="118">
          <template #default="{ row }">
            <span class="num">{{ formatInt(row.totalQuantity) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="销售总金额" align="right" min-width="130">
          <template #default="{ row }">
            <span class="num amount">¥{{ money(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="290">
          <template #default="{ row }">
            <el-button text type="primary" @click="openDetail(row)">查看明细</el-button>
            <el-button v-if="isAdmin" text @click="exportDetail(row)">导出</el-button>
            <el-button
              v-if="canApplyReturn && row.status === 1 && row.activeReturnStatus !== 0"
              text
              type="warning"
              @click="handleApplyReturn(row)"
            >
              申请退货
            </el-button>
            <el-button v-if="isAdmin && row.status === 1" text type="info" @click="handleVoid(row)">
              作废
            </el-button>
          </template>
        </el-table-column>
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

    <!-- ============ 销售单据明细弹窗 ============ -->
    <el-dialog
      v-model="detailVisible"
      title="销售单据明细"
      width="70%"
      class="detail-dialog"
      :close-on-click-modal="false"
    >
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detailRecord">
          <el-descriptions :column="3" border class="detail-desc">
            <el-descriptions-item label="单据编号">
              <span class="num">{{ detailRecord.saleNo }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="销售时间">{{ detailRecord.createTime }}</el-descriptions-item>
            <el-descriptions-item label="收银员">{{ detailRecord.operator }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusMeta(detailRecord.status).tag" effect="light" round size="small">
                {{ statusMeta(detailRecord.status).label }}
              </el-tag>
              <el-tag
                v-if="detailRecord.activeReturnStatus === 0"
                type="warning"
                effect="plain"
                size="small"
                class="return-pending"
              >
                退货待确认
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="支付方式">{{ payMeta(detailRecord.payType).label }}</el-descriptions-item>
            <el-descriptions-item label="总件数">
              <span class="num">{{ formatInt(detailRecord.totalQuantity) }} 件</span>
            </el-descriptions-item>
            <el-descriptions-item label="实收金额">
              <span class="num amount">¥{{ money(detailRecord.totalAmount) }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <el-table :data="detailRecord.items" class="detail-table">
            <el-table-column prop="productName" label="商品名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="categoryName" label="商品分类" width="120" />
            <el-table-column label="销售单价" align="right" width="110">
              <template #default="{ row }">
                <span class="num">¥{{ money(row.salePrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="销售数量" align="right" width="100">
              <template #default="{ row }">
                <span class="num">{{ formatInt(row.quantity) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="小计金额" align="right" width="120">
              <template #default="{ row }">
                <span class="num amount">¥{{ money(row.amount) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </div>

      <template #footer>
        <el-button
          v-if="canApplyReturn && detailRecord?.status === 1 && detailRecord?.activeReturnStatus !== 0"
          type="warning"
          @click="handleApplyReturn(detailRecord)"
        >
          申请退货
        </el-button>
        <el-button v-if="isAdmin && detailRecord?.status === 1" type="info" @click="handleVoid(detailRecord)">
          作废
        </el-button>
        <el-button v-if="isAdmin" @click="exportDetail(detailRecord)">导出本单</el-button>
        <el-button @click="closeDetail">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sale-record {
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
  width: 260px;
}

.sale-no-input {
  width: 200px;
}

.operator-select,
.pay-select {
  width: 120px;
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
  padding: 8px 20px 16px;
}

.record-table {
  width: 100%;
}

.amount {
  font-weight: 600;
}

.return-pending {
  margin-left: 4px;
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
@media (max-width: 1280px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 960px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }
}
</style>
