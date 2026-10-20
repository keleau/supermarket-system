/**
 * 商品档案 & 商品分类接口
 *
 * 商品：
 * - GET    /api/product/list     分页，入参 { pageNum, pageSize, productName?, productCode?, categoryId?, status? }
 * - GET    /api/product/options  在售商品精简列表（收银开单 / 出入库选品）
 * - GET    /api/product/:id      详情
 * - POST   /api/product          新增
 * - PUT    /api/product          编辑（id 在 body）
 * - DELETE /api/product/:id      删除（存在业务记录时被后端拦截）
 *
 * 分类：
 * - GET    /api/category/list    全量（不分页，按 sort 升序）
 * - POST   /api/category
 * - PUT    /api/category
 * - DELETE /api/category/:id
 */
import { del, get, post, put } from '../request'

/* ---------------- 商品 ---------------- */

/** 商品分页列表 */
export function getProductList(params) {
  return get('/product/list', params)
}

/** 在售商品下拉选项（含 salePrice / stockNum，可直接加入购物车） */
export function getProductOptions() {
  return get('/product/options')
}

/** 商品详情 */
export function getProductDetail(id) {
  return get(`/product/${id}`)
}

/** 新增商品 */
export function addProduct(data) {
  return post('/product', data)
}

/** 编辑商品 */
export function updateProduct(data) {
  return put('/product', data)
}

/** 删除商品 */
export function deleteProduct(id) {
  return del(`/product/${id}`)
}

/* ---------------- 商品分类 ---------------- */

/** 分类全量列表（含禁用分类，是各页面分类下拉的统一数据源） */
export function getCategoryList() {
  return get('/category/list')
}

/** 新增分类 */
export function addCategory(data) {
  return post('/category', data)
}

/** 编辑分类 */
export function updateCategory(data) {
  return put('/category', data)
}

/** 删除分类（分类下存在商品时由后端拦截） */
export function deleteCategory(id) {
  return del(`/category/${id}`)
}
