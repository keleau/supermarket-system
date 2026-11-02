<script setup>
/**
 * 状态标签
 * meta 统一为 { label, tag } 结构，由各领域字典（订单状态 / 支付方式 / 库存类型）提供。
 */
defineProps({
  meta: { type: Object, required: true },
  label: { type: String, default: '' },
  effect: { type: String, default: 'light' },
  size: { type: String, default: 'small' },
  round: { type: Boolean, default: true },
})
</script>

<template>
  <el-tag :type="meta.tag" :effect="effect" :size="size" :round="round">
    {{ label || meta.label }}
  </el-tag>
</template>
