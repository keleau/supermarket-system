/**
 * 供应商 · 临时演示数据
 * 【临时】后端接口未就绪前用于页面效果演示；
 * 后端完成后改为调用 src/api/modules/supplier.js 的接口，删除本文件。
 */

const STORAGE_KEY = 'market_suppliers'

/** 默认供应商（与商品 mock 的分类供应商一致） */
const defaultSuppliers = [
  { id: 1, supplierName: '农夫山泉股份有限公司', contactPerson: '王经理', phone: '13800000001', address: '浙江省杭州市建德市', remark: '饮料乳品主供', createTime: '2026-09-01 09:00:00' },
  { id: 2, supplierName: '百事食品中国', contactPerson: '李主管', phone: '13800000002', address: '上海市闵行区', remark: '休闲零食主供', createTime: '2026-09-02 10:00:00' },
  { id: 3, supplierName: '益海嘉里集团', contactPerson: '张经理', phone: '13800000003', address: '上海市浦东新区', remark: '粮油调味主供', createTime: '2026-09-03 11:00:00' },
  { id: 4, supplierName: '维达国际控股', contactPerson: '陈主管', phone: '13800000004', address: '广东省江门市', remark: '日用百货主供', createTime: '2026-09-04 14:00:00' },
  { id: 5, supplierName: '本地生鲜直供', contactPerson: '刘师傅', phone: '13800000005', address: '本市农贸市场', remark: '生鲜果蔬主供', createTime: '2026-09-05 08:00:00' },
]

function pad(n) {
  return String(n).padStart(2, '0')
}

function nowStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function loadSuppliers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* 数据损坏按默认处理 */
  }
  return defaultSuppliers.map((s) => ({ ...s }))
}

let suppliers = loadSuppliers()

function saveSuppliers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers))
}

/** 取全部供应商 */
export function getAllSuppliers() {
  return [...suppliers]
}

/** 供应商下拉选项（入库单选择供应商用） */
export function getSupplierOptions() {
  return suppliers.map((s) => ({ id: s.id, supplierName: s.supplierName }))
}

/** 检查名称唯一性（编辑时排除自身 id） */
export function checkNameUnique(name, excludeId = null) {
  const trimmed = name.trim()
  return !suppliers.some((s) => s.supplierName === trimmed && s.id !== excludeId)
}

/** 新增供应商 */
export function addSupplier(draft) {
  const id = Math.max(0, ...suppliers.map((s) => s.id)) + 1
  const record = {
    id,
    supplierName: draft.supplierName.trim(),
    contactPerson: draft.contactPerson?.trim() || '',
    phone: draft.phone?.trim() || '',
    address: draft.address?.trim() || '',
    remark: draft.remark?.trim() || '',
    createTime: nowStr(),
  }
  suppliers.unshift(record)
  saveSuppliers()
  return record
}

/** 编辑供应商 */
export function updateSupplier(id, draft) {
  const idx = suppliers.findIndex((s) => s.id === id)
  if (idx === -1) return null
  suppliers[idx] = {
    ...suppliers[idx],
    supplierName: draft.supplierName.trim(),
    contactPerson: draft.contactPerson?.trim() || '',
    phone: draft.phone?.trim() || '',
    address: draft.address?.trim() || '',
    remark: draft.remark?.trim() || '',
  }
  saveSuppliers()
  return suppliers[idx]
}

/** 删除供应商 */
export function deleteSupplier(id) {
  suppliers = suppliers.filter((s) => s.id !== id)
  saveSuppliers()
}
