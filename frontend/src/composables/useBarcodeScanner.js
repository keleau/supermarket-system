/**
 * USB 扫码枪输入捕获（键盘模拟型设备）
 * 扫码枪等价于「极快连续按键 + 回车」，靠按键间隔区分扫码枪与人工输入：
 * - 单字符间隔超过 maxInterval 视为人工打字，清空缓冲
 * - 回车时缓冲长度达到 minLength 才认定为一次扫码
 * - 焦点在输入框内时不拦截，交给输入框自身的 @keyup.enter 逻辑，避免重复触发
 */
import { onBeforeUnmount, onMounted } from 'vue'

/**
 * @param {(code: string) => void} onScan 扫码完成回调（已去掉首尾空白）
 * @param {object} [options]
 * @param {number} [options.minLength=4] 条码最小长度
 * @param {number} [options.maxInterval=100] 相邻按键最大间隔（毫秒），兼容不同扫码枪的字符间隔设置
 * @param {() => boolean} [options.enabled] 是否启用（弹窗关闭、提交中等场景可临时禁用）
 */
export function useBarcodeScanner(onScan, options = {}) {
  const { minLength = 4, maxInterval = 100, enabled = () => true } = options

  let buffer = ''
  let lastTime = 0

  function reset() {
    buffer = ''
    lastTime = 0
  }

  /** 输入框类元素：交由元素自身的回车逻辑处理 */
  function isEditable(target) {
    if (!target || !target.tagName) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
  }

  function handleKeydown(event) {
    if (!enabled() || isEditable(event.target)) {
      reset()
      return
    }

    if (event.key === 'Enter') {
      const code = buffer.trim()
      reset()
      if (code.length >= minLength) {
        // 阻止回车触发当前聚焦元素的默认行为（如按钮点击）
        event.preventDefault()
        onScan(code)
      }
      return
    }

    // 忽略方向键、Shift、F 功能键等非字符键
    if (event.key.length !== 1) {
      reset()
      return
    }

    const now = event.timeStamp || performance.now()
    if (lastTime && now - lastTime > maxInterval) buffer = ''
    buffer += event.key
    lastTime = now
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown, true))
}
