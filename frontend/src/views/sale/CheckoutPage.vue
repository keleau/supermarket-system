<script setup>
/**
 * 收银开单页（销售管理）
 * 结构：左侧商品选择（搜索 + 分类 + 商品网格）→ 右侧本次销售清单（可改数量/删除/自动汇总）
 *      → 底部收银结算（支付方式 + 实收 + 找零 + 提交开单）
 * 业务：
 * - 商品来自 GET /api/product/options（仅在售商品，含 salePrice 与 stockNum）
 * - 支持 USB 扫码枪扫码入单：按 productCode 精确匹配后自动加购，带提示音与行高亮
 * - 提交 POST /api/sale/record，后端在同一事务内完成：写单 + 明细 + 扣库存 + 写出库流水
 * - 缺货商品不可加入清单；数量上限 = 当前库存，防止超卖
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Aim, CircleCheckFilled, Search } from '@element-plus/icons-vue'
import { getProductOptions } from '@/api/modules/product'
import { createSaleRecord } from '@/api/modules/sale'
import { useBarcodeScanner } from '@/composables/useBarcodeScanner'
import { money, round2 } from '@/utils/format.js'

const router = useRouter()

/* ---------------- 商品数据 ---------------- */

const loading = ref(false)
const products = ref([])

/** 支付方式（1 现金 2 微信 3 支付宝 4 银行卡，与后端取值 1~4 对齐） */
const PAY_TYPES = {
  1: { label: '现金', tag: 'info' },
  2: { label: '微信支付', tag: 'success' },
  3: { label: '支付宝', tag: 'success' },
  4: { label: '银行卡', tag: 'warning' },
}

async function loadProducts() {
  loading.value = true
  try {
    const list = await getProductOptions()
    products.value = Array.isArray(list) ? list : []
  } finally {
    loading.value = false
  }
}

onMounted(loadProducts)

/* ---------------- 商品搜索与筛选 ---------------- */

const keyword = ref('')
const activeCategory = ref('全部')

/** 分类选项：从商品数据里去重得出（含"全部"） */
const categories = computed(() => [
  '全部',
  ...new Set(products.value.map((p) => p.categoryName).filter(Boolean)),
])

/** 按分类 + 关键字（名称/编码模糊）过滤商品 */
const filteredProducts = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  return products.value.filter((product) => {
    if (activeCategory.value !== '全部' && product.categoryName !== activeCategory.value) return false
    if (!key) return true
    return (
      product.productName.toLowerCase().includes(key) ||
      String(product.productCode || '').includes(key)
    )
  })
})

/** 回车时按条码入单（扫码枪聚焦在搜索框时走这里）；纯数字长串视为扫码，未命中也要给出提醒 */
function handleSearchEnter() {
  const key = keyword.value.trim()
  if (!key) return
  const matched = products.value.some((product) => String(product.productCode) === key)
  if (!matched && !/^\d{8,}$/.test(key)) return
  keyword.value = ''
  handleScan(key)
}

/* ---------------- 销售清单 ---------------- */

const cart = ref([])

/** 实时库存（提交后重新拉取商品选项，库存同步更新） */
function getStock(productId) {
  return products.value.find((product) => product.id === productId)?.stockNum ?? 0
}

/** 加入清单；返回是否成功（缺货 / 超出库存时返回 false 并提示） */
function addToCart(product) {
  if (product.stockNum <= 0) {
    ElMessage.warning(`「${product.productName}」已缺货，无法开单`)
    return false
  }
  const line = cart.value.find((item) => item.productId === product.id)
  if (line) {
    if (line.quantity >= product.stockNum) {
      ElMessage.warning(`「${product.productName}」库存仅剩 ${product.stockNum} 件`)
      return false
    }
    line.quantity += 1
  } else {
    cart.value.push({
      productId: product.id,
      productCode: product.productCode,
      productName: product.productName,
      salePrice: Number(product.salePrice),
      quantity: 1,
    })
  }
  return true
}

function removeLine(line) {
  cart.value = cart.value.filter((item) => item.productId !== line.productId)
}

function clearCart() {
  if (!cart.value.length) return
  ElMessageBox.confirm('确定要清空当前销售清单吗？', '清空清单', {
    confirmButtonText: '清空',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(() => {
      cart.value = []
    })
    .catch(() => {})
}

/* ---------------- 金额汇总 ---------------- */

const totalCount = computed(() => cart.value.reduce((sum, line) => sum + line.quantity, 0))
const payable = computed(() => round2(cart.value.reduce((sum, line) => sum + line.salePrice * line.quantity, 0)))

/* ---------------- 收银结算 ---------------- */

const PAY_CASH = 1
const payType = ref(PAY_CASH)
const received = ref(0)
const submitting = ref(false)

const isCash = computed(() => payType.value === PAY_CASH)

/** 非现金支付实收自动等于应收（扫码支付按精确金额收取） */
watch([payable, payType], () => {
  if (!isCash.value) received.value = payable.value
})

/** 找零（负数表示还需收款） */
const changeAmount = computed(() => round2(received.value - payable.value))

const canSubmit = computed(() => {
  if (!cart.value.length) return false
  return !isCash.value || received.value >= payable.value
})

/** 现金快捷金额 */
const quickAmounts = [50, 100, 200]

/* ---------------- 扫码入单 ---------------- */

/** 最近加入清单的商品，用于行级高亮反馈 */
const flashId = ref(null)
let flashTimer = null

function flashRow(productId) {
  clearTimeout(flashTimer)
  flashId.value = productId
  flashTimer = setTimeout(() => {
    flashId.value = null
  }, 800)
}

/** 扫码命中行高亮 */
function cartRowClass({ row }) {
  return row.productId === flashId.value ? 'cart-row-flash' : ''
}

/** 复用同一个音频上下文，避免连续扫码时创建过多实例 */
let audioCtx = null

/** 短促提示音：成功高音，失败低沉双音 */
function playScanSound(success) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const now = audioCtx.currentTime
    const gain = audioCtx.createGain()
    gain.connect(audioCtx.destination)
    gain.gain.setValueAtTime(0.16, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
    const osc = audioCtx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(success ? 1567 : 660, now)
    if (!success) osc.frequency.setValueAtTime(440, now + 0.12)
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + 0.18)
  } catch {
    /* 浏览器不支持 Web Audio 时静默失败 */
  }
}

/**
 * 处理一次扫码：按条码查找在售商品，命中则加入清单并高亮，否则红色提醒。
 * 兼作搜索框回车（聚焦在输入框时）的入口，避免扫码逻辑重复。
 */
function handleScan(code) {
  const hit = products.value.find((product) => String(product.productCode) === code)
  if (!hit) {
    playScanSound(false)
    ElMessage.error({ message: `未找到条码「${code}」对应的在售商品`, grouping: true })
    return
  }
  const added = addToCart(hit)
  if (!added) {
    playScanSound(false)
    flashRow(hit.id)
    return
  }
  playScanSound(true)
  flashRow(hit.id)
  recordRecentScan(hit)
}

/* ---------------- 扫码模式弹窗 ---------------- */

const scanDialogVisible = ref(false)
const scanCode = ref('')
const scanInputRef = ref(null)
/** 最近扫到的商品（最多 5 条），给收银员即时的可视反馈 */
const recentScans = ref([])

function openScanDialog() {
  scanCode.value = ''
  recentScans.value = []
  scanDialogVisible.value = true
}

/** 弹窗动画结束后聚焦输入框，扫码枪即可直接输入 */
function focusScanInput() {
  scanInputRef.value?.focus()
}

/** 扫码成功后记录到弹窗内的最近扫码列表 */
function recordRecentScan(product) {
  const line = cart.value.find((item) => item.productId === product.id)
  const quantity = line ? line.quantity : 1
  const existing = recentScans.value.find((item) => item.productId === product.id)
  if (existing) {
    existing.quantity = quantity
  } else {
    recentScans.value.unshift({
      productId: product.id,
      productName: product.productName,
      productCode: product.productCode,
      quantity,
    })
    if (recentScans.value.length > 5) recentScans.value.pop()
  }
}

/** 弹窗内输入框回车（扫码枪或手动输入都会走这里） */
function handleScanInputEnter() {
  const code = scanCode.value.trim()
  if (!code) return
  scanCode.value = ''
  handleScan(code)
}

/** 挂载全局扫码枪监听（不聚焦输入框时也可扫码加购；结算中/成功弹窗期间暂停） */
useBarcodeScanner(handleScan, { enabled: () => !successVisible.value && !submitting.value })

/* ---------------- 提交开单 ---------------- */

const successVisible = ref(false)
const successInfo = ref(null)

async function handleSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const record = await createSaleRecord({
      items: cart.value.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        salePrice: line.salePrice,
      })),
      payType: payType.value,
    })

    successInfo.value = {
      saleNo: record.saleNo,
      payLabel: PAY_TYPES[payType.value]?.label || '未知',
      payable: Number(record.totalAmount),
      received: isCash.value ? received.value : Number(record.totalAmount),
      change: isCash.value ? round2(received.value - Number(record.totalAmount)) : 0,
    }

    successVisible.value = true
    // 清空本次销售清单与实收金额，支付方式保留
    cart.value = []
    received.value = 0
    // 库存已扣减，重新拉取在售商品
    await loadProducts()
  } catch {
    /* 失败文案（商品已下架 / 库存不足 / 支付方式不合法）由 request 拦截器统一弹出 */
    await loadProducts()
  } finally {
    submitting.value = false
  }
}

function goSaleRecord() {
  successVisible.value = false
  router.push('/sale/record')
}
</script>

<template>
  <div class="checkout-page">
    <!-- ============ 上部：商品选择 + 销售清单 ============ -->
    <div class="checkout-grid">
      <!-- 左：商品搜索区域 -->
      <section class="page-card product-card">
        <header class="card-head">
          <div class="card-heading">
            <h3 class="card-title">商品选择</h3>
            <p class="card-subtitle">点击商品加入清单，或点击「扫码入单」用扫码枪加购</p>
          </div>
          <el-button type="primary" plain :icon="Aim" class="scan-btn" @click="openScanDialog">
            扫码入单
          </el-button>
        </header>

        <el-input
          v-model="keyword"
          class="product-search"
          placeholder="输入商品名称 / 编码搜索"
          :prefix-icon="Search"
          clearable
          @keyup.enter="handleSearchEnter"
        />

        <div class="category-bar">
          <el-radio-group v-model="activeCategory" size="default">
            <el-radio-button v-for="cate in categories" :key="cate" :value="cate">{{ cate }}</el-radio-button>
          </el-radio-group>
        </div>

        <div v-loading="loading" class="product-grid-wrap">
          <div v-if="filteredProducts.length" class="product-grid">
            <button
              v-for="product in filteredProducts"
              :key="product.id"
              type="button"
              class="product-item"
              :class="{ 'is-low': product.stockNum > 0 && product.stockNum <= 10 }"
              :disabled="product.stockNum <= 0"
              @click="addToCart(product)"
            >
              <span class="p-name">{{ product.productName }}</span>
              <span class="p-code">{{ product.productCode }}</span>
              <span class="p-bottom">
                <span class="p-price">¥{{ money(product.salePrice) }}</span>
                <span class="p-stock" :class="{ 'is-out': product.stockNum <= 0, 'is-low': product.stockNum > 0 && product.stockNum <= 10 }">
                  {{ product.stockNum <= 0 ? '缺货' : `库存 ${product.stockNum} ${product.unit || '件'}` }}
                </span>
              </span>
            </button>
          </div>
          <el-empty v-else description="未找到匹配的商品，换个关键字试试" :image-size="72" class="product-empty" />
        </div>
      </section>

      <!-- 右：本次销售清单 -->
      <section class="page-card cart-card">
        <header class="card-head">
          <div class="card-heading">
            <h3 class="card-title">本次销售清单</h3>
            <p class="card-subtitle">已选 <b class="count-em">{{ totalCount }}</b> 件商品</p>
          </div>
          <el-button text type="danger" :disabled="!cart.length" @click="clearCart">清空</el-button>
        </header>

        <el-table v-if="cart.length" :data="cart" class="cart-table" max-height="352" :row-class-name="cartRowClass">
          <el-table-column prop="productName" label="商品名称" min-width="140" show-overflow-tooltip />
          <el-table-column label="单价" width="84" align="right">
            <template #default="{ row }">¥{{ money(row.salePrice) }}</template>
          </el-table-column>
          <el-table-column label="数量" width="132" align="center">
            <template #default="{ row }">
              <el-input-number
                v-model="row.quantity"
                :min="1"
                :max="getStock(row.productId)"
                size="small"
                controls-position="right"
                class="qty-input"
              />
            </template>
          </el-table-column>
          <el-table-column label="小计" width="92" align="right">
            <template #default="{ row }">
              <span class="line-amount">¥{{ money(row.salePrice * row.quantity) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="64" align="center">
            <template #default="{ row }">
              <el-button text type="danger" size="small" @click="removeLine(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="点击左侧商品加入清单" :image-size="72" class="cart-empty" />

        <footer class="cart-summary">
          <span class="summary-count">共 <b>{{ totalCount }}</b> 件</span>
          <span class="summary-pay">
            应收合计
            <b class="payable-num">¥{{ money(payable) }}</b>
          </span>
        </footer>
      </section>
    </div>

    <!-- ============ 下部：收银结算 ============ -->
    <section class="page-card pay-card">
      <header class="card-head">
        <div class="card-heading">
          <h3 class="card-title">收银结算</h3>
        </div>
      </header>

      <div class="pay-body">
        <div class="pay-block">
          <span class="pay-label">支付方式</span>
          <el-radio-group v-model="payType">
            <el-radio-button :value="2">微信支付</el-radio-button>
            <el-radio-button :value="3">支付宝</el-radio-button>
            <el-radio-button :value="1">现金</el-radio-button>
            <el-radio-button :value="4">银行卡</el-radio-button>
          </el-radio-group>
        </div>

        <div class="pay-block">
          <span class="pay-label">实收金额</span>
          <div class="received-row">
            <el-input-number
              v-model="received"
              :min="0"
              :max="999999"
              :precision="2"
              :step="10"
              :controls="false"
              :disabled="!isCash"
              placeholder="0.00"
              class="received-input"
            />
            <template v-if="isCash">
              <el-button
                v-for="amount in quickAmounts"
                :key="amount"
                size="small"
                class="quick-btn"
                @click="received = amount"
              >
                ¥{{ amount }}
              </el-button>
              <el-button size="small" class="quick-btn" @click="received = payable">等于应收</el-button>
            </template>
            <span v-else class="received-hint">非现金支付按应收金额全额收取</span>
          </div>
        </div>

        <div class="pay-block pay-result">
          <div class="result-row">
            <span class="result-label">应收金额</span>
            <span class="result-value">¥{{ money(payable) }}</span>
          </div>
          <div class="result-row">
            <span class="result-label">找零</span>
            <span v-if="changeAmount >= 0" class="result-value change-ok">¥{{ money(changeAmount) }}</span>
            <span v-else class="result-value change-lack">还需收款 ¥{{ money(-changeAmount) }}</span>
          </div>
        </div>
      </div>

      <footer class="pay-footer">
        <span class="pay-tip">提交后自动扣减库存，单据将保存至销售记录</span>
        <el-button
          type="primary"
          size="large"
          class="submit-btn"
          :disabled="!canSubmit"
          :loading="submitting"
          @click="handleSubmit"
        >
          提交开单
        </el-button>
      </footer>
    </section>

    <!-- ============ 扫码入单弹窗 ============ -->
    <el-dialog
      v-model="scanDialogVisible"
      width="440px"
      align-center
      :close-on-click-modal="false"
      class="scan-dialog"
      @opened="focusScanInput"
    >
      <div class="scan-body">
        <div class="scan-visual">
          <span class="scan-ring"></span>
          <span class="scan-ring scan-ring-2"></span>
          <el-icon class="scan-icon"><Aim /></el-icon>
        </div>
        <h4 class="scan-title">扫码入单</h4>
        <p class="scan-tip">请将商品条码对准扫码枪，听到提示音即加入清单</p>

        <el-input
          ref="scanInputRef"
          v-model="scanCode"
          class="scan-input"
          placeholder="等待扫码…（也可手动输入条码后回车）"
          clearable
          @keyup.enter="handleScanInputEnter"
        />

        <ul v-if="recentScans.length" class="scan-list">
          <li v-for="item in recentScans" :key="item.productId" class="scan-item">
            <span class="scan-item-name">{{ item.productName }}</span>
            <span class="scan-item-code">{{ item.productCode }}</span>
            <span class="scan-item-qty">×{{ item.quantity }}</span>
          </li>
        </ul>
        <p v-else class="scan-empty">本次尚未扫码，扫第一件商品试试</p>
      </div>
      <template #footer>
        <div class="scan-footer">
          <span class="scan-total">当前共 {{ totalCount }} 件 · 应收 ¥{{ money(payable) }}</span>
          <el-button type="primary" @click="scanDialogVisible = false">完成扫码</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- ============ 开单成功弹窗 ============ -->
    <el-dialog
      v-model="successVisible"
      width="420px"
      align-center
      :close-on-click-modal="false"
      class="success-dialog"
    >
      <div class="success-body">
        <el-icon class="success-icon"><CircleCheckFilled /></el-icon>
        <h4 class="success-title">开单成功</h4>
        <p class="success-no">单据号：{{ successInfo?.saleNo }}</p>
        <div class="success-meta">
          <div class="meta-row">
            <span>支付方式</span>
            <span>{{ successInfo?.payLabel }}</span>
          </div>
          <div class="meta-row">
            <span>应收金额</span>
            <span>¥{{ money(successInfo?.payable) }}</span>
          </div>
          <div class="meta-row">
            <span>实收金额</span>
            <span>¥{{ money(successInfo?.received) }}</span>
          </div>
          <div class="meta-row">
            <span>找零</span>
            <span class="meta-change">¥{{ money(successInfo?.change) }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="goSaleRecord">查看销售记录</el-button>
        <el-button type="primary" @click="successVisible = false">继续开单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.checkout-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.checkout-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
  align-items: stretch;
}

/* ---------------- 卡片通用头 ---------------- */

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.count-em {
  color: var(--brand-primary);
  font-weight: 700;
}

/* ---------------- 左：商品选择 ---------------- */

.product-card {
  display: flex;
  flex-direction: column;
  padding: 18px 20px 16px;
}

.product-search {
  margin-top: 14px;
}

.category-bar {
  margin-top: 12px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.category-bar :deep(.el-radio-button__inner) {
  border-color: var(--border-color);
}

.product-grid-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  max-height: 464px;
  align-content: start;
  padding-right: 2px;
}

.product-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    box-shadow var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.product-item:hover:not(:disabled) {
  border-color: var(--brand-primary-light-5);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.product-item:active:not(:disabled) {
  transform: translateY(0);
}

.product-item:disabled {
  background: var(--bg-muted);
  cursor: not-allowed;
  opacity: 0.62;
}

.p-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 20px;
}

.p-code {
  font-size: 11.5px;
  color: var(--text-secondary);
  font-family: Consolas, Monaco, monospace;
  letter-spacing: 0.4px;
}

.p-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.p-price {
  font-size: 15px;
  font-weight: 700;
  color: var(--brand-primary);
}

.p-stock {
  font-size: 12px;
  color: var(--text-secondary);
}

.p-stock.is-low {
  color: var(--color-warning);
}

.p-stock.is-out {
  color: var(--text-disabled);
}

.product-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

/* ---------------- 右：销售清单 ---------------- */

.cart-card {
  display: flex;
  flex-direction: column;
  padding: 18px 20px 16px;
}

.cart-table {
  margin-top: 12px;
}

.qty-input {
  width: 104px;
}

.line-amount {
  font-weight: 600;
  color: var(--text-primary);
}

.cart-table :deep(.cart-row-flash > td) {
  animation: cart-flash 0.8s var(--ease-standard);
}

@keyframes cart-flash {
  0% {
    background: var(--brand-primary-light-9);
  }
  100% {
    background: transparent;
  }
}

.cart-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

.cart-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color);
}

.summary-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.summary-count b {
  color: var(--text-primary);
  font-weight: 700;
}

.summary-pay {
  font-size: 13px;
  color: var(--text-secondary);
}

.payable-num {
  margin-left: 6px;
  font-size: 22px;
  font-weight: 700;
  color: var(--brand-primary);
}

/* ---------------- 下：收银结算 ---------------- */

.pay-card {
  padding: 18px 20px 16px;
}

.pay-body {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-light);
}

.pay-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pay-label {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.received-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.received-input {
  width: 140px;
}

.received-input :deep(.el-input__inner) {
  font-weight: 600;
}

.quick-btn {
  font-weight: 500;
}

.received-hint {
  font-size: 12px;
  color: var(--text-disabled);
}

.pay-result {
  min-width: 220px;
  margin-left: auto;
  gap: 6px;
}

.result-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
}

.result-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.result-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.result-value.change-ok {
  color: var(--brand-primary);
}

.result-value.change-lack {
  color: var(--color-danger);
}

.pay-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
}

.pay-tip {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.submit-btn {
  min-width: 200px;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
}

/* ---------------- 扫码入单弹窗 ---------------- */

.scan-btn {
  flex-shrink: 0;
}

.scan-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0 0;
}

.scan-visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
}

.scan-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--brand-primary-light-5);
  animation: scan-pulse 2s var(--ease-standard) infinite;
}

.scan-ring-2 {
  animation-delay: 1s;
}

.scan-icon {
  font-size: 38px;
  color: var(--brand-primary);
}

@keyframes scan-pulse {
  0% {
    transform: scale(0.72);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.12);
    opacity: 0;
  }
}

.scan-title {
  margin: 6px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.scan-tip {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  text-align: center;
}

.scan-input {
  margin-top: 14px;
}

.scan-input :deep(.el-input__inner) {
  text-align: center;
  font-family: Consolas, Monaco, monospace;
  letter-spacing: 1px;
}

.scan-list {
  width: 100%;
  max-height: 168px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.scan-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-muted);
  font-size: 12.5px;
  animation: scan-item-in 0.24s var(--ease-standard);
}

@keyframes scan-item-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.scan-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--text-primary);
}

.scan-item-code {
  font-size: 11.5px;
  font-family: Consolas, Monaco, monospace;
  color: var(--text-secondary);
}

.scan-item-qty {
  font-weight: 700;
  color: var(--brand-primary);
}

.scan-empty {
  margin: 14px 0 0;
  font-size: 12.5px;
  color: var(--text-disabled);
}

.scan-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.scan-total {
  font-size: 12.5px;
  color: var(--text-secondary);
}

/* ---------------- 成功弹窗 ---------------- */

.success-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0 4px;
}

.success-icon {
  font-size: 56px;
  color: var(--color-success);
}

.success-title {
  margin: 12px 0 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.success-no {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  font-family: Consolas, Monaco, monospace;
  letter-spacing: 0.4px;
}

.success-meta {
  width: 100%;
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--bg-muted);
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.meta-row span:last-child {
  color: var(--text-primary);
  font-weight: 600;
}

.meta-row .meta-change {
  color: var(--brand-primary);
}

/* ---------------- 响应式 ---------------- */

@media (max-width: 1280px) {
  .checkout-grid {
    grid-template-columns: 1fr;
  }

  .pay-result {
    margin-left: 0;
  }
}
</style>
