/**
 * 收银开单 · 临时演示数据
 * 【临时】后端接口未就绪前用于页面效果演示；
 * 后端完成后改为调用商品/销售接口（GET /api/product/list），删除本文件。
 */

/**
 * 商品池为模块级单例 + localStorage 持久化：收银开单提交后直接扣减库存，
 * 刷新页面、切换页面后库存状态均保持，模拟真实收银扣减效果（跨天后自动还原）。
 */

/** 收银可选商品分类（"全部" 用于清除筛选） */
export const CATEGORIES = ['全部', '饮料乳品', '休闲零食', '粮油调味', '日用百货', '生鲜果蔬']

/** 条码号生成：690 开头模拟真实商品条码 */
function barcode(seq) {
  return `690${String(seq).padStart(10, '0')}`
}

/** 商品池（模块级单例；含缺货、低库存样例用于演示状态区分；costPrice 进货价与销售 mock 商品体系一致） */
export const checkoutProducts = [
  { productId: 1, productCode: barcode(1), productName: '农夫山泉 550ml', categoryName: '饮料乳品', salePrice: 2, costPrice: 1.2, stockNum: 380 },
  { productId: 2, productCode: barcode(2), productName: '伊利纯牛奶 250ml', categoryName: '饮料乳品', salePrice: 3.5, costPrice: 2.3, stockNum: 120 },
  { productId: 3, productCode: barcode(3), productName: '可口可乐 330ml', categoryName: '饮料乳品', salePrice: 3, costPrice: 1.8, stockNum: 86 },
  { productId: 4, productCode: barcode(4), productName: '康师傅红烧牛肉面', categoryName: '粮油调味', salePrice: 4.5, costPrice: 3, stockNum: 45 },
  { productId: 5, productCode: barcode(5), productName: '乐事原味薯片 70g', categoryName: '休闲零食', salePrice: 6.5, costPrice: 4.2, stockNum: 60 },
  { productId: 6, productCode: barcode(6), productName: '奥利奥夹心饼干 97g', categoryName: '休闲零食', salePrice: 8.8, costPrice: 5.6, stockNum: 8 },
  { productId: 7, productCode: barcode(7), productName: '红富士苹果', categoryName: '生鲜果蔬', salePrice: 5.98, costPrice: 4.1, stockNum: 32 },
  { productId: 8, productCode: barcode(8), productName: '维达抽纸 3 层', categoryName: '日用百货', salePrice: 8.9, costPrice: 5.8, stockNum: 0 },
  { productId: 9, productCode: barcode(9), productName: '蒙牛酸酸乳 250ml', categoryName: '饮料乳品', salePrice: 2.8, costPrice: 1.8, stockNum: 96 },
  { productId: 10, productCode: barcode(10), productName: '卫龙辣条 106g', categoryName: '休闲零食', salePrice: 5.5, costPrice: 3.4, stockNum: 150 },
  { productId: 11, productCode: barcode(11), productName: '金龙鱼大豆油 900ml', categoryName: '粮油调味', salePrice: 15.9, costPrice: 11.5, stockNum: 24 },
  { productId: 12, productCode: barcode(12), productName: '心相印卷纸 10 卷', categoryName: '日用百货', salePrice: 19.9, costPrice: 13.8, stockNum: 18 },
  { productId: 13, productCode: barcode(13), productName: '皇冠香蕉 1kg', categoryName: '生鲜果蔬', salePrice: 7.98, costPrice: 5.2, stockNum: 26 },
  { productId: 14, productCode: barcode(14), productName: '雪碧 330ml', categoryName: '饮料乳品', salePrice: 3, costPrice: 1.8, stockNum: 72 },
  { productId: 15, productCode: barcode(15), productName: '旺旺雪饼 84g', categoryName: '休闲零食', salePrice: 4.2, costPrice: 2.7, stockNum: 55 },
  { productId: 16, productCode: barcode(16), productName: '海天生抽 500ml', categoryName: '粮油调味', salePrice: 9.9, costPrice: 6.6, stockNum: 6 },
]

/** 提交开单后扣减商品池库存（刷新/切页保持，跨天还原） */
const STOCK_KEY = 'market_checkout_stock'

function todayStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 启动时恢复当天已扣减的库存 */
function applySavedStock() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STOCK_KEY) || 'null')
    if (parsed?.date !== todayStr()) return
    checkoutProducts.forEach((product) => {
      const saved = parsed.map?.[product.productId]
      if (typeof saved === 'number') product.stockNum = saved
    })
  } catch {
    /* 数据损坏时按未扣减处理 */
  }
}
applySavedStock()

function saveStock() {
  const map = {}
  checkoutProducts.forEach((product) => {
    map[product.productId] = product.stockNum
  })
  localStorage.setItem(STOCK_KEY, JSON.stringify({ date: todayStr(), map }))
}

export function deductStock(productId, quantity) {
  const product = checkoutProducts.find((item) => item.productId === productId)
  if (product) {
    product.stockNum = Math.max(0, product.stockNum - quantity)
    saveStock()
  }
}

/** 入库增加库存（库存模块使用，与 deductStock 对称） */
export function addStock(productId, quantity) {
  const product = checkoutProducts.find((item) => item.productId === productId)
  if (product) {
    product.stockNum += quantity
    saveStock()
  }
}
