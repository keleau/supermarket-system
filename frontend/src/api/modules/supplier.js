/**
 * 供应商接口
 * - GET    /api/supplier/list     分页，入参 { pageNum, pageSize, supplierName?, contactPerson? }
 * - GET    /api/supplier/options  下拉选项（无分页）
 * - POST   /api/supplier          新增
 * - PUT    /api/supplier          编辑（id 在 body）
 * - DELETE /api/supplier/:id      删除（存在关联商品时由后端拦截）
 */
import { del, get, post, put } from '../request'

/** 供应商分页列表 */
export function getSupplierList(params) {
  return get('/supplier/list', params)
}

/** 供应商下拉选项 */
export function getSupplierOptions() {
  return get('/supplier/options')
}

/** 新增供应商 */
export function addSupplier(data) {
  return post('/supplier', data)
}

/** 编辑供应商 */
export function updateSupplier(data) {
  return put('/supplier', data)
}

/** 删除供应商 */
export function deleteSupplier(id) {
  return del(`/supplier/${id}`)
}
