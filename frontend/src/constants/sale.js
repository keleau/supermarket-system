/**
 * 销售领域字典
 * 支付方式取值与后端 sale_record.pay_type 契约一致（1~4）。
 */
export const SALE_PAY_TYPES = {
  1: { label: '现金', tag: 'info' },
  2: { label: '微信支付', tag: 'success' },
  3: { label: '支付宝', tag: 'success' },
  4: { label: '银行卡', tag: 'warning' },
}

export function payMeta(payType) {
  return SALE_PAY_TYPES[payType] || { label: '未知', tag: 'info' }
}
