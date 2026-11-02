<script setup>
/**
 * 统一分页组件
 * 服务端分页页面用 page-change / size-change 触发重新请求；
 * 前端分页页面可直接 v-model:page-num / v-model:page-size 使用。
 */
defineProps({
  total: { type: Number, default: 0 },
  pageNum: { type: Number, default: 1 },
  pageSize: { type: Number, default: 10 },
  pageSizes: { type: Array, default: () => [10, 20, 50] },
  layout: { type: String, default: 'total, sizes, prev, pager, next, jumper' },
  background: { type: Boolean, default: true },
})

const emit = defineEmits(['update:pageNum', 'update:pageSize', 'page-change', 'size-change'])

function handlePageChange(pageNum) {
  emit('update:pageNum', pageNum)
  emit('page-change', pageNum)
}

function handleSizeChange(pageSize) {
  emit('update:pageSize', pageSize)
  emit('update:pageNum', 1)
  emit('size-change', pageSize)
}
</script>

<template>
  <el-pagination
    :current-page="pageNum"
    :page-size="pageSize"
    :total="total"
    :page-sizes="pageSizes"
    :layout="layout"
    :background="background"
    @current-change="handlePageChange"
    @size-change="handleSizeChange"
  />
</template>
