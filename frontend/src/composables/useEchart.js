/**
 * ECharts 组合式封装（仪表盘专用）
 * - 按需注册，避免全量引入撑大 bundle
 * - 自动挂载 / ResizeObserver 自适应 / 组件卸载时 dispose
 * - 配色一律从 design.md 落地的 CSS 变量实时读取，禁止在图表配置里硬编码色值
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'

use([CanvasRenderer, LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

/** 读取 :root 上的设计令牌（去掉首尾空格） */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** hex 色值转 rgba 字符串（用于面积渐变、透明填充） */
export function hexToRgba(hex, alpha) {
  const { r, g, b } = parseHex(hex)
  if (r == null) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 将 hex 向白色提亮 percent（0-100），用于深色底上的同系强调色（派生自令牌，非新色） */
export function lighten(hex, percent) {
  const { r, g, b } = parseHex(hex)
  if (r == null) return hex
  const mix = (channel) => Math.round(channel + (255 - channel) * (percent / 100))
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

function parseHex(hex) {
  const value = (hex || '').replace('#', '')
  if (value.length !== 6) return {}
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

/** 系统是否要求减少动态效果（与全局 CSS 降级保持一致） */
export function preferReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 统一 tooltip 视觉：白卡片 + 冷色阴影，走令牌 */
export function baseTooltip(extra = {}) {
  return {
    backgroundColor: cssVar('--bg-card'),
    borderColor: cssVar('--border-light'),
    borderWidth: 1,
    padding: [8, 12],
    textStyle: {
      color: cssVar('--text-primary'),
      fontSize: 12,
      lineHeight: 20,
    },
    extraCssText: 'box-shadow: var(--shadow-md); border-radius: var(--radius-control);',
    ...extra,
  }
}

/** 坐标轴线 / 刻度文字等通用样式 */
export function axisTextStyle() {
  return {
    color: cssVar('--text-secondary'),
    fontSize: 12,
  }
}

/**
 * @param {import('vue').Ref<object>} optionRef 图表配置的响应式引用，变化时自动 setOption
 * @param {{ notMerge?: boolean }} [options] notMerge 默认 true（整图重置）；
 *        传 false 时使用 merge 模式，数据变化由 ECharts 做平滑形变动画（适用于结构不变、仅数据切换的场景）
 * @returns {{ chartEl: import('vue').Ref<HTMLElement|null>, getChart: () => any }}
 */
export function useEchart(optionRef, options = {}) {
  const { notMerge = true } = options
  const chartEl = ref(null)
  let chart = null
  let resizeObserver = null

  function ensureChart() {
    const el = chartEl.value
    if (!el) return
    // 容器被条件渲染重建时，旧实例挂在已废弃的节点上，必须销毁后重新初始化
    if (chart && chart.getDom() !== el) {
      resizeObserver?.disconnect()
      chart.dispose()
      chart = null
    }
    if (chart) return
    chart = init(el)
    resizeObserver = new ResizeObserver(() => chart?.resize())
    resizeObserver.observe(el)
  }

  function render() {
    ensureChart()
    chart?.setOption(optionRef.value, notMerge)
  }

  function handleVisibility() {
    if (!document.hidden) chart?.resize()
  }

  onMounted(() => {
    render()
    document.addEventListener('visibilitychange', handleVisibility)
  })

  // 数据变化时重绘。flush: 'post' 是关键：图表容器常处于「空状态不渲染、有数据才渲染」的
  // 条件分支里，默认的 'pre' 会在 DOM 更新前触发，此时 chartEl 仍为 null，canvas 永远建不出来
  watch(optionRef, render, { deep: true, flush: 'post' })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibility)
    resizeObserver?.disconnect()
    chart?.dispose()
    chart = null
  })

  return { chartEl, getChart: () => chart }
}
