/**
 * 销售记录 · 临时演示数据
 * 【临时】后端接口未就绪前用于页面效果演示；
 * 后端完成后改为调用 src/api/modules/sale.js 的接口，删除本文件。
 */

/** 演示商品池（与仪表盘 mock 保持同一套商品体系；costPrice 进货价用于毛利统计） */
const PRODUCT_POOL = [
  { productId: 1, productName: '农夫山泉 550ml', categoryName: '饮料乳品', salePrice: 2, costPrice: 1.2 },
  { productId: 2, productName: '伊利纯牛奶 250ml', categoryName: '饮料乳品', salePrice: 3.5, costPrice: 2.3 },
  { productId: 3, productName: '可口可乐 330ml', categoryName: '饮料乳品', salePrice: 3, costPrice: 1.8 },
  { productId: 4, productName: '康师傅红烧牛肉面', categoryName: '粮油调味', salePrice: 4.5, costPrice: 3 },
  { productId: 5, productName: '乐事原味薯片 70g', categoryName: '休闲零食', salePrice: 6.5, costPrice: 4.2 },
  { productId: 6, productName: '奥利奥夹心饼干 97g', categoryName: '休闲零食', salePrice: 8.8, costPrice: 5.6 },
  { productId: 7, productName: '红富士苹果', categoryName: '生鲜果蔬', salePrice: 5.98, costPrice: 4.1 },
  { productId: 8, productName: '维达抽纸 3 层', categoryName: '日用百货', salePrice: 8.9, costPrice: 5.8 },
]

/** 收银员下拉选项 */
export const saleCashierOptions = ['张敏', '李静', '王强']

/** 支付方式映射（1 现金 2 微信 3 支付宝 4 会员卡，与 types.js 契约一致） */
export const PAY_TYPES = {
  1: { label: '现金', tag: 'info' },
  2: { label: '微信支付', tag: 'success' },
  3: { label: '支付宝', tag: 'success' },
  4: { label: '会员卡', tag: 'warning' },
}

/** 固定种子伪随机（保证每次刷新演示数据一致） */
function createRandom(seed) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function round2(value) {
  return Math.round(value * 100) / 100
}

/** 每日单数模板：近 7 天共 18 单 */
const DAILY_COUNTS = [2, 3, 2, 3, 2, 3, 3]
/** 单据时间模板（24 小时制，模拟营业时段） */
const TIME_TEMPLATES = ['09:42', '10:25', '11:58', '14:06', '15:37', '17:21', '18:50', '20:14']

/**
 * 生成近 7 天演示单据（按销售时间倒序）
 * 返回结构与 GET /api/sale/record/list 的 PageResult.list 一致
 */
export function buildSaleMockRecords() {
  const random = createRandom(20261011)
  const records = []
  let id = 1000

  DAILY_COUNTS.forEach((count, dayIndex) => {
    const day = 5 + dayIndex // 10-05 ~ 10-11
    const dateStr = `2026-10-${String(day).padStart(2, '0')}`

    for (let i = 0; i < count; i += 1) {
      id += 1
      // 每单随机取 1-4 项商品（不重复）
      const itemCount = 1 + Math.floor(random() * 4)
      const picked = [...PRODUCT_POOL].sort(() => random() - 0.5).slice(0, itemCount)
      const items = picked.map((product) => {
        const quantity = 1 + Math.floor(random() * 5)
        return {
          productId: product.productId,
          productName: product.productName,
          categoryName: product.categoryName,
          quantity,
          salePrice: product.salePrice,
          costPrice: product.costPrice,
          amount: round2(product.salePrice * quantity),
        }
      })

      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
      const totalAmount = round2(items.reduce((sum, item) => sum + item.amount, 0))
      const time = TIME_TEMPLATES[Math.floor(random() * TIME_TEMPLATES.length)]

      records.push({
        id,
        saleNo: `XS${dateStr.replaceAll('-', '')}-${String(i + 1).padStart(3, '0')}`,
        createTime: `${dateStr} ${time}`,
        operator: saleCashierOptions[Math.floor(random() * saleCashierOptions.length)],
        payType: 1 + Math.floor(random() * 4),
        totalQuantity,
        totalAmount,
        items,
      })
    }
  })

  // 按销售时间倒序（最新在前）
  return records.sort((a, b) => (a.createTime < b.createTime ? 1 : -1))
}

/* ---------------- 收银开单跨页共享（收银页提交后销售记录页立即可见，localStorage 持久化防刷新丢失） ---------------- */

const EXTRA_KEY = 'market_extra_sale_records'

function todayStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 启动时恢复当天收银写入的单据（跨天后自动还原为纯演示数据） */
function loadExtraRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXTRA_KEY) || 'null')
    if (parsed?.date === todayStr() && Array.isArray(parsed.list)) return parsed.list
  } catch {
    /* 数据损坏时按无新增处理 */
  }
  return []
}

/** 收银开单新增的单据 */
const extraRecords = loadExtraRecords()

function saveExtraRecords() {
  localStorage.setItem(EXTRA_KEY, JSON.stringify({ date: todayStr(), list: extraRecords }))
}

/** 当日单据序号计数（单据号 XSyyyymmdd-XXX，进程内递增） */
const dailySeq = {}

/** 取某日期已占用的最大单据序号（演示数据 + 已恢复的收银单据），保证编号不重复 */
function maxSaleNoSeq(dateKey) {
  let max = 0
  const scan = (list) =>
    list.forEach((record) => {
      if (!record.saleNo.startsWith(`XS${dateKey}-`)) return
      const seq = Number(record.saleNo.split('-')[1])
      if (seq > max) max = seq
    })
  scan(buildSaleMockRecords())
  scan(extraRecords)
  return max
}

/**
 * 收银开单提交后写入一条新单据
 * @param {{ items: Array, payType: number, operator: string, totalQuantity: number, totalAmount: number }} draft
 */
export function addSaleRecord(draft) {
  const dateStr = todayStr()
  const dateKey = dateStr.replaceAll('-', '')
  // 序号接续当日已有单据（含刷新后恢复的），避免单据号冲突
  dailySeq[dateKey] = Math.max(dailySeq[dateKey] || 0, maxSaleNoSeq(dateKey)) + 1

  const record = {
    id: Date.now(),
    saleNo: `XS${dateKey}-${String(dailySeq[dateKey]).padStart(3, '0')}`,
    createTime: `${dateStr} ${new Date().toTimeString().slice(0, 8)}`,
    operator: draft.operator,
    payType: draft.payType,
    totalQuantity: draft.totalQuantity,
    totalAmount: draft.totalAmount,
    items: draft.items,
  }
  extraRecords.unshift(record)
  saveExtraRecords()
  return record
}

/** 全量单据 = 收银新增（视为最新业务，固定在前） + 演示数据 */
export function getAllSaleRecords() {
  return [...extraRecords, ...buildSaleMockRecords()].map((r) => ({
    ...r,
    status: getRecordStatus(r.saleNo),
  }))
}

/* ---------------- 订单状态（退货 / 作废） ---------------- */

/** 订单状态：1 正常 2 已退货 3 已作废 */
export const SALE_STATUS = {
  1: { label: '正常', tag: 'success' },
  2: { label: '已退货', tag: 'warning' },
  3: { label: '已作废', tag: 'info' },
}

const STATUS_KEY = 'market_sale_status'

function loadStatusMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATUS_KEY) || 'null')
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    /* 数据损坏按无状态覆盖处理 */
  }
  return {}
}

const statusMap = loadStatusMap()

function saveStatusMap() {
  localStorage.setItem(STATUS_KEY, JSON.stringify(statusMap))
}

/** 取某单据当前状态（默认正常） */
export function getRecordStatus(saleNo) {
  return statusMap[saleNo] || 1
}

/** 更新单据状态（退货 / 作废） */
export function setRecordStatus(saleNo, status) {
  statusMap[saleNo] = status
  saveStatusMap()
}
