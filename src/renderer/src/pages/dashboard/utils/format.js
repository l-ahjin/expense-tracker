const KRW = new Intl.NumberFormat('ko-KR')

export function formatCurrency(value, { signed = false, compact = false } = {}) {
  const n = Math.round(Number(value ?? 0))
  const abs = Math.abs(n)

  let text
  if (compact && abs >= 10000) {
    const man = abs / 10000
    text = man >= 100 ? `${Math.round(man)}만` : `${man.toFixed(man >= 10 ? 1 : 2).replace(/\.0+$/, '')}만`
  } else {
    text = KRW.format(abs)
  }

  if (signed) return `${n < 0 ? '-' : '+'}${text}원`
  return `${n < 0 ? '-' : ''}${text}원`
}

export function formatPercent(value, total) {
  const n = Number(value ?? 0)
  const t = Number(total ?? 0)
  if (!t) return '0%'
  return `${((n / t) * 100).toFixed(1)}%`
}

export function formatDateRangeLabel(range) {
  if (!range) return ''
  if (range.mode === 'monthly') return `${range.year}년 ${range.month}월`
  if (range.mode === 'annual') return `${range.year}년`
  return `${range.startDate} ~ ${range.endDate}`
}

export function formatAxisWon(value) {
  const n = Math.round(Number(value ?? 0))
  const abs = Math.abs(n)
  if (abs >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}억`
  if (abs >= 10000) return `${(n / 10000).toFixed(0)}만`
  return KRW.format(n)
}

export function formatShortDateLabel(key, mode) {
  if (!key) return ''
  if (mode === 'monthly' && key.length >= 10) return `${Number(key.slice(8, 10))}일`
  if (key.length === 7) return `${Number(key.slice(5, 7))}월`
  return key
}

export function formatFlowXAxisLabel(key, { periodType = 'monthly', granularity = 'day' } = {}) {
  if (!key) return ''
  if (granularity === 'month') {
    if (periodType === 'yearly' && key.length >= 7) return `${Number(key.slice(5, 7))}월`
    if (key.length >= 7) return key
    return key
  }
  if (key.length >= 10) {
    if (periodType === 'monthly') return `${Number(key.slice(8, 10))}일`
    return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`
  }
  return key
}

export function formatFlowTooltipLabel(key, { granularity = 'day' } = {}) {
  if (!key) return ''
  if (granularity === 'month' && key.length >= 7) {
    const y = Number(key.slice(0, 4))
    const m = Number(key.slice(5, 7))
    return `${y}년 ${m}월`
  }
  if (key.length >= 10) {
    const y = Number(key.slice(0, 4))
    const m = Number(key.slice(5, 7))
    const d = Number(key.slice(8, 10))
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return key
}
