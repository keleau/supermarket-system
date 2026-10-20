/**
 * 商品档案 · 临时演示数据
 * 【临时】后端接口未就绪前用于页面效果演示；
 * 后端完成后改为调用 src/api/modules/product.js 的接口（getProductList/addProduct/updateProduct/deleteProduct），删除本文件。
 *
 * 商品基本信息（名称/条码/分类/售价/进货价）与销售模块 checkoutMock 同一商品体系，
 * 此处扩展规格、单位、供应商、预警阈值、状态、图片等档案字段，CRUD 持久化到 localStorage。
 */
import { CATEGORIES } from '../sale/checkoutMock'

/** 分类下拉选项（"全部" 用于清除筛选） */
export const CATEGORY_OPTIONS = CATEGORIES // ['全部','饮料乳品','休闲零食','粮油调味','日用百货','生鲜果蔬']

/** 单位按分类映射 */
const UNIT_BY_CATEGORY = {
  饮料乳品: '瓶',
  休闲零食: '包',
  粮油调味: '袋',
  日用百货: '件',
  生鲜果蔬: 'kg',
}

/** 供应商按分类映射（演示用） */
const SUPPLIER_BY_CATEGORY = {
  饮料乳品: '农夫山泉股份有限公司',
  休闲零食: '百事食品中国',
  粮油调味: '益海嘉里集团',
  日用百货: '维达国际控股',
  生鲜果蔬: '本地生鲜直供',
}

/** 规格按商品 ID 映射（演示用） */
const SPEC_MAP = {
  1: '550ml',
  2: '250ml',
  3: '330ml',
  4: '105g',
  5: '70g',
  6: '97g',
  7: '约 300g/个',
  8: '3 层 130 抽',
  9: '250ml',
  10: '106g',
  11: '900ml',
  12: '10 卷',
  13: '1kg',
  14: '330ml',
  15: '84g',
  16: '500ml',
}

/** 商品档案基础数据（派生自销售模块商品池，扩展档案字段） */
const BASE_PRODUCTS = [
  { id: 1, productCode: '6900000000001', productName: '农夫山泉 550ml', categoryName: '饮料乳品', salePrice: 2, costPrice: 1.2, stockNum: 380 },
  { id: 2, productCode: '6900000000002', productName: '伊利纯牛奶 250ml', categoryName: '饮料乳品', salePrice: 3.5, costPrice: 2.3, stockNum: 120 },
  { id: 3, productCode: '6900000000003', productName: '可口可乐 330ml', categoryName: '饮料乳品', salePrice: 3, costPrice: 1.8, stockNum: 86 },
  { id: 4, productCode: '6900000000004', productName: '康师傅红烧牛肉面', categoryName: '粮油调味', salePrice: 4.5, costPrice: 3, stockNum: 45 },
  { id: 5, productCode: '6900000000005', productName: '乐事原味薯片 70g', categoryName: '休闲零食', salePrice: 6.5, costPrice: 4.2, stockNum: 60 },
  { id: 6, productCode: '6900000000006', productName: '奥利奥夹心饼干 97g', categoryName: '休闲零食', salePrice: 8.8, costPrice: 5.6, stockNum: 8 },
  { id: 7, productCode: '6900000000007', productName: '红富士苹果', categoryName: '生鲜果蔬', salePrice: 5.98, costPrice: 4.1, stockNum: 32 },
  { id: 8, productCode: '6900000000008', productName: '维达抽纸 3 层', categoryName: '日用百货', salePrice: 8.9, costPrice: 5.8, stockNum: 0 },
  { id: 9, productCode: '6900000000009', productName: '蒙牛酸酸乳 250ml', categoryName: '饮料乳品', salePrice: 2.8, costPrice: 1.8, stockNum: 96 },
  { id: 10, productCode: '6900000000010', productName: '卫龙辣条 106g', categoryName: '休闲零食', salePrice: 5.5, costPrice: 3.4, stockNum: 150 },
  { id: 11, productCode: '6900000000011', productName: '金龙鱼大豆油 900ml', categoryName: '粮油调味', salePrice: 15.9, costPrice: 11.5, stockNum: 24 },
  { id: 12, productCode: '6900000000012', productName: '心相印卷纸 10 卷', categoryName: '日用百货', salePrice: 19.9, costPrice: 13.8, stockNum: 18 },
  { id: 13, productCode: '6900000000013', productName: '皇冠香蕉 1kg', categoryName: '生鲜果蔬', salePrice: 7.98, costPrice: 5.2, stockNum: 26 },
  { id: 14, productCode: '6900000000014', productName: '雪碧 330ml', categoryName: '饮料乳品', salePrice: 3, costPrice: 1.8, stockNum: 72 },
  { id: 15, productCode: '6900000000015', productName: '旺旺雪饼 84g', categoryName: '休闲零食', salePrice: 4.2, costPrice: 2.7, stockNum: 55 },
  { id: 16, productCode: '6900000000016', productName: '海天生抽 500ml', categoryName: '粮油调味', salePrice: 9.9, costPrice: 6.6, stockNum: 6 },
]

/** 组装完整档案数据（扩展规格/单位/供应商/预警/状态/创建时间） */
function buildArchive() {
  return BASE_PRODUCTS.map((p) => ({
    ...p,
    spec: SPEC_MAP[p.id] || '标准装',
    unit: UNIT_BY_CATEGORY[p.categoryName] || '个',
    warnNum: 10,
    status: p.stockNum === 0 ? 0 : 1, // 缺货自动下架
    supplierName: SUPPLIER_BY_CATEGORY[p.categoryName] || '默认供应商',
    imageUrl: '',
    createTime: '2026-09-15 10:00:00',
  }))
}

/* ---------------- CRUD 持久化（localStorage，演示用） ---------------- */

const ARCHIVE_KEY = 'market_product_archive'

function loadArchive() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || 'null')
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* 数据损坏按初始档案处理 */
  }
  return buildArchive()
}

let archive = loadArchive()

function saveArchive() {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive))
}

/** 取全部商品档案（新增在前） */
export function getAllProducts() {
  return [...archive]
}

/** 生成下一个商品 ID */
function nextId() {
  return archive.reduce((max, p) => Math.max(max, p.id), 0) + 1
}

/** 生成下一个条码（690 前缀 + 10 位序号） */
function nextCode() {
  const seq = archive.length + 1
  return `690${String(seq).padStart(10, '0')}`
}

/**
 * 新增商品
 * @param {Object} draft 表单数据（productName/categoryName/spec/unit/costPrice/salePrice/stockNum/warnNum/supplierName/status）
 */
export function addProduct(draft) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const record = {
    id: nextId(),
    productCode: draft.productCode?.trim() || nextCode(),
    productName: draft.productName.trim(),
    categoryName: draft.categoryName,
    spec: draft.spec?.trim() || '标准装',
    unit: draft.unit || '个',
    costPrice: Number(draft.costPrice) || 0,
    salePrice: Number(draft.salePrice) || 0,
    stockNum: Number(draft.stockNum) || 0,
    warnNum: Number(draft.warnNum) || 0,
    status: Number(draft.status) ?? 1,
    supplierName: draft.supplierName?.trim() || '默认供应商',
    imageUrl: '',
    createTime: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  }
  archive.unshift(record)
  saveArchive()
  return record
}

/** 编辑商品（保留 id/productCode/createTime，更新其余字段） */
export function updateProduct(id, draft) {
  const idx = archive.findIndex((p) => p.id === id)
  if (idx === -1) return null
  archive[idx] = {
    ...archive[idx],
    productName: draft.productName.trim(),
    categoryName: draft.categoryName,
    spec: draft.spec?.trim() || '标准装',
    unit: draft.unit || '个',
    costPrice: Number(draft.costPrice) || 0,
    salePrice: Number(draft.salePrice) || 0,
    stockNum: Number(draft.stockNum) || 0,
    warnNum: Number(draft.warnNum) || 0,
    status: Number(draft.status) ?? 1,
    supplierName: draft.supplierName?.trim() || '默认供应商',
  }
  saveArchive()
  return archive[idx]
}

/** 删除商品 */
export function deleteProduct(id) {
  archive = archive.filter((p) => p.id !== id)
  saveArchive()
}

/** 重置为初始档案（演示用，答辩前可重置） */
export function resetArchive() {
  archive = buildArchive()
  saveArchive()
}
