import { reactive } from 'vue'

/**
 * 服务端分页列表的公共状态与翻页动作
 * @param {() => void} loadList 重新加载列表的方法
 * @param {{ pageSize?: number }} options 初始每页条数
 */
export function usePagination(loadList, { pageSize = 10 } = {}) {
  const pagination = reactive({ pageNum: 1, pageSize })

  function handlePageChange(pageNum) {
    pagination.pageNum = pageNum
    loadList()
  }

  function handleSizeChange(size) {
    pagination.pageSize = size
    pagination.pageNum = 1
    loadList()
  }

  return { pagination, handlePageChange, handleSizeChange }
}
