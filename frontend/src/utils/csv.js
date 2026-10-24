/**
 * 前端 CSV 导出工具（销售模块页面共用，避免重复定义）
 * 生成带 BOM 的 UTF-8 文件，避免 Excel 打开中文乱码
 */

/**
 * @param {string} filename 下载文件名（建议带 .csv 后缀）
 * @param {Array<string>} headers 表头一维数组
 * @param {Array<Array<string|number>>} rows 数据二维数组
 */
export function downloadCsv(filename, headers, rows) {
  const escapeCell = (cell) => {
    const text = String(cell ?? '')
    // 含逗号/引号/换行（含 \r\n）的单元格用引号包裹并转义内部引号
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
