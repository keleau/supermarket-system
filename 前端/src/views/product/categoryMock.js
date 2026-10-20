/**
 * 商品分类 · 临时演示数据
 * 【临时】后端接口未就绪前用于页面效果演示；
 * 后端完成后改为调用 @/api/modules/product.js 的分类接口，删除本文件。
 */
import { checkoutProducts } from '../sale/checkoutMock.js'

/** 分类色标令牌映射（与 design.md 图表色板一一对应，确保全项目视觉一致） */
export const CATEGORY_CHART_TOKENS = {
  饮料乳品: 'var(--chart-1)',
  休闲零食: 'var(--chart-2)',
  粮油调味: 'var(--chart-3)',
  日用百货: 'var(--chart-4)',
  生鲜果蔬: 'var(--chart-5)',
}

/** 色标可选列表（新增/编辑弹窗色标选择器用） */
export const COLOR_OPTIONS = [
  { label: '翡翠绿', token: 'var(--chart-1)' },
  { label: '橙子橙', token: 'var(--chart-2)' },
  { label: '草莓红', token: 'var(--chart-3)' },
  { label: '蓝莓蓝', token: 'var(--chart-4)' },
  { label: '葡萄紫', token: 'var(--chart-5)' },
]

const STORAGE_KEY = 'market_product_categories'

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function loadCategories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (parsed?.date === todayStr() && Array.isArray(parsed.list)) return parsed.list
  } catch {
    /* 数据损坏时按默认处理 */
  }
  return null
}

/** 默认分类（与项目五分类一致） */
const defaultCategories = [
  { id: 1, name: '饮料乳品', colorToken: 'var(--chart-1)', description: '矿泉水、乳制品、碳酸饮料等', sort: 1, status: 1 },
  { id: 2, name: '休闲零食', colorToken: 'var(--chart-2)', description: '薯片、饼干、膨化食品等', sort: 2, status: 1 },
  { id: 3, name: '粮油调味', colorToken: 'var(--chart-3)', description: '方便面、食用油、调味品等', sort: 3, status: 1 },
  { id: 4, name: '日用百货', colorToken: 'var(--chart-4)', description: '纸巾、清洁用品、日用消耗品等', sort: 4, status: 1 },
  { id: 5, name: '生鲜果蔬', colorToken: 'var(--chart-5)', description: '水果、蔬菜、生鲜等', sort: 5, status: 1 },
]

let categories = loadCategories() || defaultCategories.map((c) => ({ ...c }))

function saveCategories() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayStr(), list: categories }))
}

/** 获取全部分类（按排序值升序） */
export function getAllCategories() {
  return [...categories].sort((a, b) => a.sort - b.sort)
}

/** 各分类下商品数量（从商品池统计引用计数） */
export function getCategoryProductCount(categoryName) {
  return checkoutProducts.filter((p) => p.categoryName === categoryName).length
}

/** 新增分类 */
export function addCategory(draft) {
  const id = Math.max(0, ...categories.map((c) => c.id)) + 1
  const record = { id, ...draft }
  categories.push(record)
  saveCategories()
  return record
}

/** 更新分类 */
export function updateCategory(id, draft) {
  const idx = categories.findIndex((c) => c.id === id)
  if (idx === -1) return null
  categories[idx] = { ...categories[idx], ...draft }
  saveCategories()
  return categories[idx]
}

/** 删除前检查：被商品引用时拦截 */
export function checkCanDelete(categoryName) {
  const count = getCategoryProductCount(categoryName)
  return { canDelete: count === 0, productCount: count }
}

/** 检查分类名称唯一性（编辑时排除自身 id） */
export function checkNameUnique(name, excludeId = null) {
  const trimmed = name.trim()
  return !categories.some((c) => c.name === trimmed && c.id !== excludeId)
}

/** 获取启用状态的分类（供商品档案/销售统计分类下拉使用） */
export function getActiveCategories() {
  return getAllCategories().filter((c) => c.status === 1)
}

/** 删除分类 */
export function deleteCategory(id) {
  const cat = categories.find((c) => c.id === id)
  if (!cat) return false
  categories = categories.filter((c) => c.id !== id)
  saveCategories()
  return true
}
