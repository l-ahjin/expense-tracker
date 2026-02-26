function absAmount(v) {
  return Math.abs(Number(v ?? 0))
}

function toFiniteNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function diffDaysInclusive(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000))) + 1
}

function normalizePeriodType(periodType) {
  if (periodType === 'annual') return 'yearly'
  return periodType || 'monthly'
}

function inPeriod(date, periodRange) {
  if (!periodRange?.startDate || !periodRange?.endDate) return true
  return date >= periodRange.startDate && date <= periodRange.endDate
}

function classify(tx) {
  const type = tx.category_type ?? null
  const direction = tx.direction ?? 'INFLOW'
  const amount = absAmount(tx.amount)
  const incomeEarn = type === '수입' && direction === 'INFLOW'
  const incomeReversal = type === '수입' && direction === 'OUTFLOW'
  const expenseSpend = type === '지출' && direction === 'OUTFLOW'
  const expenseRefund = type === '지출' && direction === 'INFLOW'
  const isTransfer = type === '이체'
  const uncategorizedIncome = !type && direction === 'INFLOW'
  const uncategorizedExpense = !type && direction === 'OUTFLOW'
  return {
    type,
    direction,
    amount,
    incomeEarn,
    incomeReversal,
    expenseSpend,
    expenseRefund,
    isTransfer,
    uncategorizedIncome,
    uncategorizedExpense,
  }
}

function getFlowSideBuckets(tx) {
  const c = classify(tx)
  if (c.isTransfer) {
    return {
      incomeNormal: 0,
      incomeAdjustment: 0,
      expenseNormal: 0,
      expenseAdjustment: 0,
    }
  }

  // 카테고리 의미 기준 분리
  // - incomeAdjustment: 수입 차감(수입 카테고리 + OUTFLOW)
  // - expenseAdjustment: 지출 차감(지출 카테고리 + INFLOW)
  const incomeAdjustment = c.incomeReversal ? c.amount : 0
  const expenseAdjustment = c.expenseRefund ? c.amount : 0

  return {
    incomeNormal: c.incomeEarn || c.uncategorizedIncome ? c.amount : 0,
    incomeAdjustment,
    expenseNormal: c.expenseSpend || c.uncategorizedExpense ? c.amount : 0,
    expenseAdjustment,
  }
}

function getDisplayedFlowValues(tx, calcMode = 'actual') {
  const buckets = getFlowSideBuckets(tx)
  const income = calcMode === 'base'
    ? (buckets.incomeNormal + buckets.expenseAdjustment) // 일반 수입 + 차감 지출(INFLOW)
    : (buckets.incomeNormal - buckets.incomeAdjustment)  // 일반 수입 - 차감 수입(OUTFLOW)
  const expense = calcMode === 'base'
    ? (buckets.expenseNormal + buckets.incomeAdjustment) // 일반 지출 + 차감 수입(OUTFLOW)
    : (buckets.expenseNormal - buckets.expenseAdjustment) // 일반 지출 - 차감 지출(INFLOW)
  return {
    ...buckets,
    income,
    expense,
    settlement: income - expense,
  }
}

function getIoAmount(tx, ioType, calcMode) {
  const c = classify(tx)
  if (ioType === 'income') {
    if (calcMode === 'base') return c.incomeEarn ? c.amount : 0
    if (c.incomeEarn) return c.amount
    if (c.incomeReversal) return -c.amount
    return 0
  }
  if (ioType === 'expense') {
    if (calcMode === 'base') return c.expenseSpend ? c.amount : 0
    if (c.expenseSpend) return c.amount
    if (c.expenseRefund) return -c.amount
    return 0
  }
  return 0
}

function getCategoryBuckets(tx) {
  const c = classify(tx)
  if (c.isTransfer) {
    return {
      incomeBasic: 0,
      expenseBasic: 0,
      incomeNormal: 0,
      incomeAdjustment: 0,
      expenseNormal: 0,
      expenseAdjustment: 0,
    }
  }

  const incomeBasic = c.direction === 'INFLOW' ? c.amount : 0
  const expenseBasic = c.direction === 'OUTFLOW' ? c.amount : 0

  return {
    incomeBasic,
    expenseBasic,
    incomeNormal: c.incomeEarn || c.uncategorizedIncome ? c.amount : 0,
    incomeAdjustment: c.incomeReversal ? c.amount : 0, // 수입 차감
    expenseNormal: c.expenseSpend || c.uncategorizedExpense ? c.amount : 0,
    expenseAdjustment: c.expenseRefund ? c.amount : 0, // 지출 차감
  }
}

function getCategoryAmount(tx, { ioType = 'expense', calcMode = 'actual', entryMode = 'effective' } = {}) {
  const b = getCategoryBuckets(tx)
  if (ioType === 'income') {
    if (entryMode === 'normal') return b.incomeNormal
    if (entryMode === 'adjustment') return b.incomeAdjustment
    return calcMode === 'base' ? b.incomeBasic : b.incomeNormal
  }
  if (entryMode === 'normal') return b.expenseNormal
  if (entryMode === 'adjustment') return b.expenseAdjustment
  return calcMode === 'base' ? b.expenseBasic : b.expenseNormal
}

function matchesCategorySelection(tx, { majorId, minorId = null } = {}) {
  const major = getEffectiveMajor(tx)
  if (majorId != null && String(major.majorId) !== String(majorId)) return false
  if (minorId && String(tx.category_id) !== String(minorId)) return false
  return true
}

function buildCurrentPeriodBuckets(periodRange, granularity = 'day') {
  const bucketSeries = periodRange?.bucketSeries ?? []
  if (bucketSeries.length > 0) {
    return bucketSeries.map(b => ({ key: b.key, label: b.label ?? b.key }))
  }

  const rows = []
  if (!periodRange?.startDate || !periodRange?.endDate) return rows
  if (granularity === 'month') {
    let [y, m] = periodRange.startDate.split('-').map(Number)
    const [ey, em] = periodRange.endDate.split('-').map(Number)
    while (y < ey || (y === ey && m <= em)) {
      rows.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${m}월` })
      m += 1
      if (m > 12) { m = 1; y += 1 }
    }
    return rows
  }
  const cursor = new Date(`${periodRange.startDate}T00:00:00`)
  const end = new Date(`${periodRange.endDate}T00:00:00`)
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    rows.push({ key, label: `${cursor.getDate()}일` })
    cursor.setDate(cursor.getDate() + 1)
  }
  return rows
}

function buildDailyDateKeys(periodRange) {
  const rows = []
  if (!periodRange?.startDate || !periodRange?.endDate) return rows
  const cursor = new Date(`${periodRange.startDate}T00:00:00`)
  const end = new Date(`${periodRange.endDate}T00:00:00`)
  while (cursor <= end) {
    rows.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return rows
}

function buildMonthlyKeys(periodRange) {
  const rows = []
  if (!periodRange?.startDate || !periodRange?.endDate) return rows
  let [y, m] = periodRange.startDate.slice(0, 7).split('-').map(Number)
  const [ey, em] = periodRange.endDate.slice(0, 7).split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    rows.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return rows
}

function monthKey(date) {
  return (date || '').slice(0, 7)
}

function yearKey(date) {
  return (date || '').slice(0, 4)
}

function diffMonthsInclusive(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const [sy, sm] = String(startDate).slice(0, 7).split('-').map(Number)
  const [ey, em] = String(endDate).slice(0, 7).split('-').map(Number)
  if (!sy || !sm || !ey || !em) return 0
  return Math.max(0, (ey - sy) * 12 + (em - sm)) + 1
}

function buildMonthKeysBetween(startDate, endDate) {
  const rows = []
  if (!startDate || !endDate) return rows
  let [y, m] = String(startDate).slice(0, 7).split('-').map(Number)
  const [ey, em] = String(endDate).slice(0, 7).split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    rows.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return rows
}

function buildYearKeysBetween(startDate, endDate) {
  const rows = []
  const sy = Number(String(startDate || '').slice(0, 4))
  const ey = Number(String(endDate || '').slice(0, 4))
  if (!sy || !ey) return rows
  for (let y = sy; y <= ey; y += 1) rows.push(String(y))
  return rows
}

function getEffectiveMajor(tx) {
  const majorId = tx.parent_category_name ? (tx.category_parent_id ?? tx.category_id) : tx.category_id
  const majorName = tx.parent_category_name ?? tx.category_name ?? '미지정'
  return { majorId: majorId != null ? String(majorId) : null, majorName }
}

function getEffectiveMinor(tx) {
  return tx.category_id != null
    ? { minorId: String(tx.category_id), minorName: tx.category_name ?? tx.parent_category_name ?? '미지정' }
    : { minorId: null, minorName: '미지정' }
}

function getCurrentPeriodBucketKey(date, periodRange) {
  if ((periodRange?.bucket ?? 'day') === 'month') return (date || '').slice(0, 7)
  return (date || '').slice(0, 10)
}

export function getKpiTotals(transactions, { periodType, periodRange, calcMode = 'actual' } = {}) {
  let income = 0
  let expense = 0

  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    const values = getDisplayedFlowValues(tx, calcMode)
    income += values.income
    expense += values.expense
  }

  return { income, expense, settlement: income - expense, periodType: normalizePeriodType(periodType) }
}

export function getFlowGranularity(periodType, periodRange) {
  if (periodType === 'yearly' || periodRange?.mode === 'yearly' || periodRange?.periodType === 'yearly') return 'month'
  if (periodType === 'monthly' || periodRange?.mode === 'monthly' || periodRange?.periodType === 'monthly') return 'day'
  const days = diffDaysInclusive(periodRange?.startDate, periodRange?.endDate)
  return days > 60 ? 'month' : 'day'
}

export function buildFlowSeries(transactions, { periodRange, calcMode = 'actual', granularity = 'day' } = {}) {
  const bucketKeys = granularity === 'month' ? buildMonthlyKeys(periodRange) : buildDailyDateKeys(periodRange)
  const map = new Map(
    bucketKeys.map((bucketKey) => [bucketKey, {
      date: bucketKey,
      incomeNormalDaily: 0,
      incomeAdjustmentDaily: 0,
      expenseNormalDaily: 0,
      expenseAdjustmentDaily: 0,
      incomeDaily: 0,
      expenseDaily: 0,
      settlementDaily: 0,
      incomeAdjustmentCumulative: 0,
      expenseAdjustmentCumulative: 0,
      incomeCumulative: 0,
      expenseCumulative: 0,
      settlementCumulative: 0,
    }]),
  )

  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    const key = granularity === 'month' ? (tx.date || '').slice(0, 7) : (tx.date || '').slice(0, 10)
    const row = map.get(key)
    if (!row) continue
    const values = getDisplayedFlowValues(tx, calcMode)
    row.incomeNormalDaily = toFiniteNumber(row.incomeNormalDaily + values.incomeNormal)
    row.incomeAdjustmentDaily = toFiniteNumber(row.incomeAdjustmentDaily + values.incomeAdjustment)
    row.expenseNormalDaily = toFiniteNumber(row.expenseNormalDaily + values.expenseNormal)
    row.expenseAdjustmentDaily = toFiniteNumber(row.expenseAdjustmentDaily + values.expenseAdjustment)
    row.incomeDaily = toFiniteNumber(row.incomeDaily + values.income)
    row.expenseDaily = toFiniteNumber(row.expenseDaily + values.expense)
  }

  let incomeCum = 0
  let expenseCum = 0
  let settlementCum = 0
  let incomeAdjCum = 0
  let expenseAdjCum = 0

  return bucketKeys.map((bucketKey) => {
    const row = map.get(bucketKey) ?? {}
    const incomeDaily = Math.max(0, toFiniteNumber(row.incomeDaily))
    const expenseDaily = Math.max(0, toFiniteNumber(row.expenseDaily))
    const incomeAdjustmentDaily = Math.max(0, toFiniteNumber(row.incomeAdjustmentDaily))
    const expenseAdjustmentDaily = Math.max(0, toFiniteNumber(row.expenseAdjustmentDaily))
    const settlementDaily = toFiniteNumber(incomeDaily - expenseDaily)
    incomeCum = toFiniteNumber(incomeCum + incomeDaily)
    expenseCum = toFiniteNumber(expenseCum + expenseDaily)
    settlementCum = toFiniteNumber(settlementCum + settlementDaily)
    incomeAdjCum = toFiniteNumber(incomeAdjCum + incomeAdjustmentDaily)
    expenseAdjCum = toFiniteNumber(expenseAdjCum + expenseAdjustmentDaily)
    return {
      date: bucketKey,
      granularity,
      incomeNormalDaily: Math.max(0, toFiniteNumber(row.incomeNormalDaily)),
      incomeAdjustmentDaily,
      expenseNormalDaily: Math.max(0, toFiniteNumber(row.expenseNormalDaily)),
      expenseAdjustmentDaily,
      incomeDaily,
      expenseDaily,
      settlementDaily,
      settlementAdjustmentIncomeDaily: -incomeAdjustmentDaily,
      settlementAdjustmentExpenseDaily: expenseAdjustmentDaily,
      incomeAdjustmentCumulative: incomeAdjCum,
      expenseAdjustmentCumulative: expenseAdjCum,
      incomeCumulative: incomeCum,
      expenseCumulative: expenseCum,
      settlementCumulative: settlementCum,
      settlementAdjustmentIncomeCumulative: -incomeAdjCum,
      settlementAdjustmentExpenseCumulative: expenseAdjCum,
    }
  })
}

export function getFlowSeriesDaily(transactions, { periodRange, calcMode = 'actual', granularity = 'day' } = {}) {
  return buildFlowSeries(transactions, { periodRange, calcMode, granularity }).map((row) => ({
    date: row.date,
    income: row.incomeDaily,
    expense: row.expenseDaily,
    expenseNegative: -row.expenseDaily,
    settlement: row.settlementDaily,
    hasActivity: row.incomeDaily !== 0 || row.expenseDaily !== 0,
  }))
}

export function getFlowSeriesCumulative(transactions, { periodRange, calcMode = 'actual', granularity = 'day' } = {}) {
  return buildFlowSeries(transactions, { periodRange, calcMode, granularity }).map((row) => ({
    date: row.date,
    cumulativeSettlement: row.settlementCumulative,
    hasActivity: row.incomeDaily !== 0 || row.expenseDaily !== 0,
  }))
}

export function getFlowSummaryStats(transactions, { periodRange, calcMode = 'actual', metric = 'income', mode = 'daily' } = {}) {
  let count = 0
  let sum = 0
  let max = 0

  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    let v = 0
    const values = getDisplayedFlowValues(tx, calcMode)
    if (metric === 'income') v = values.income
    else if (metric === 'expense') v = values.expense
    else v = values.settlement
    if (metric !== 'settlement' && v <= 0) continue
    if (metric === 'settlement' && v === 0) continue
    count += 1
    const magnitude = Math.abs(v)
    sum += magnitude
    if (magnitude > max) max = magnitude
  }

  return {
    count,
    max,
    avg: count > 0 ? sum / count : 0,
    mode,
    metric,
  }
}

export function getCategoryBreakdownMajor(transactions, { periodType, periodRange, calcMode = 'actual', ioType = 'expense', entryMode = 'effective' } = {}) {
  const map = new Map()
  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    const amount = getCategoryAmount(tx, { ioType, calcMode, entryMode })
    if (amount === 0) continue
    const { majorId, majorName } = getEffectiveMajor(tx)
    if (!majorId) continue
    const item = map.get(majorId) ?? { id: majorId, name: majorName, amount: 0, ioType }
    item.amount += amount
    map.set(majorId, item)
  }

  const items = [...map.values()].filter(i => i.amount > 0).sort((a, b) => b.amount - a.amount)
  const total = items.reduce((s, i) => s + i.amount, 0)
  return { items, total, periodType: normalizePeriodType(periodType) }
}

export function getCategoryBreakdownMinor(transactions, { periodType, periodRange, calcMode = 'actual', ioType = 'expense', majorId, entryMode = 'effective' } = {}) {
  const map = new Map()
  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    const amount = getCategoryAmount(tx, { ioType, calcMode, entryMode })
    if (amount === 0) continue
    const major = getEffectiveMajor(tx)
    if (!major.majorId) continue
    if (majorId != null && String(major.majorId) !== String(majorId)) continue
    // Top-level category transactions (no child category) should not appear as "minor" rows.
    if (tx.category_parent_id == null && majorId != null && String(tx.category_id) === String(majorId)) continue
    const minor = getEffectiveMinor(tx)
    if (!minor.minorId) continue
    const item = map.get(minor.minorId) ?? { id: minor.minorId, name: minor.minorName, amount: 0, ioType, majorId: major.majorId }
    item.amount += amount
    map.set(minor.minorId, item)
  }
  const items = [...map.values()].filter(i => i.amount > 0).sort((a, b) => b.amount - a.amount)
  const total = items.reduce((s, i) => s + i.amount, 0)
  return { items, total, periodType: normalizePeriodType(periodType) }
}

export function getTrendSeriesMonthlyLast12(transactions, { calcMode = 'actual', ioType = 'expense', majorId, minorId = null, endMonthKey = null, entryMode = 'effective' } = {}) {
  const monthSet = new Map()
  for (const tx of transactions ?? []) {
    const key = monthKey(tx.date)
    if (key) monthSet.set(key, true)
  }
  const latest = endMonthKey || [...monthSet.keys()].sort().slice(-1)[0]
  if (!latest) return []

  const [endY, endM] = latest.split('-').map(Number)
  let y = endY
  let m = endM
  const keys = []
  for (let i = 0; i < 12; i++) {
    keys.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m < 1) { m = 12; y -= 1 }
  }

  const rows = new Map(keys.map(k => [k, { key: k, label: `${Number(k.slice(5))}월`, amount: 0, hasActivity: false }]))

  for (const tx of transactions ?? []) {
    if (!matchesCategorySelection(tx, { majorId, minorId })) continue
    const key = monthKey(tx.date)
    const row = rows.get(key)
    if (!row) continue
    const amount = getCategoryAmount(tx, { ioType, calcMode, entryMode })
    if (amount <= 0) continue
    row.amount += amount
    row.hasActivity = true
  }

  return keys.map(k => rows.get(k)).filter(Boolean)
}

export function getTrendSeriesYearlyLast5(transactions, { calcMode = 'actual', ioType = 'expense', majorId, minorId = null, endYearKey = null, entryMode = 'effective' } = {}) {
  const yearSet = new Map()
  for (const tx of transactions ?? []) {
    const key = yearKey(tx.date)
    if (key) yearSet.set(key, true)
  }
  const latest = endYearKey || [...yearSet.keys()].sort().slice(-1)[0]
  if (!latest) return []

  const endY = Number(latest)
  const keys = []
  for (let i = 4; i >= 0; i--) keys.push(String(endY - i))
  const rows = new Map(keys.map(k => [k, { key: k, label: `${k}년`, amount: 0, hasActivity: false }]))

  for (const tx of transactions ?? []) {
    if (!matchesCategorySelection(tx, { majorId, minorId })) continue
    const key = yearKey(tx.date)
    const row = rows.get(key)
    if (!row) continue
    const amount = getCategoryAmount(tx, { ioType, calcMode, entryMode })
    if (amount <= 0) continue
    row.amount += amount
    row.hasActivity = true
  }

  return keys.map(k => rows.get(k)).filter(Boolean)
}

export function getCustomGranularity(periodRange) {
  const months = diffMonthsInclusive(periodRange?.startDate, periodRange?.endDate)
  return months <= 12 ? 'month' : 'year'
}

export function buildCategoryTrendSeriesMonth(transactions, {
  periodRange,
  calcMode = 'actual',
  ioType = 'expense',
  majorId,
  minorId = null,
  entryMode = 'effective',
} = {}) {
  const keys = buildMonthKeysBetween(periodRange?.startDate, periodRange?.endDate)
  const rows = new Map(keys.map(k => [k, { key: k, label: k, amount: 0, hasActivity: false }]))
  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    if (!matchesCategorySelection(tx, { majorId, minorId })) continue
    const key = monthKey(tx.date)
    const row = rows.get(key)
    if (!row) continue
    const amount = getCategoryAmount(tx, { ioType, calcMode, entryMode })
    if (amount <= 0) continue
    row.amount += amount
    row.hasActivity = true
  }
  return keys.map(k => rows.get(k)).filter(Boolean)
}

export function buildCategoryTrendSeriesYear(transactions, {
  periodRange,
  calcMode = 'actual',
  ioType = 'expense',
  majorId,
  minorId = null,
  entryMode = 'effective',
} = {}) {
  const keys = buildYearKeysBetween(periodRange?.startDate, periodRange?.endDate)
  const rows = new Map(keys.map(k => [k, { key: k, label: `${k}년`, amount: 0, hasActivity: false }]))
  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    if (!matchesCategorySelection(tx, { majorId, minorId })) continue
    const key = yearKey(tx.date)
    const row = rows.get(key)
    if (!row) continue
    const amount = getCategoryAmount(tx, { ioType, calcMode, entryMode })
    if (amount <= 0) continue
    row.amount += amount
    row.hasActivity = true
  }
  return keys.map(k => rows.get(k)).filter(Boolean)
}

export function getCategoryTransactions(transactions, { periodRange, calcMode = 'actual', ioType = 'expense', majorId, minorId = null, limit = 20, entryMode = 'effective' } = {}) {
  const rows = []
  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    if (!matchesCategorySelection(tx, { majorId, minorId })) continue
    const major = getEffectiveMajor(tx)
    const amount = getCategoryAmount(tx, { ioType, calcMode, entryMode })
    if (amount <= 0) continue
    rows.push({ ...tx, displayAmount: amount, majorId: major.majorId, majorName: major.majorName })
  }
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id).localeCompare(String(a.id)))
  return rows.slice(0, limit)
}

export function getCategoryAdjustmentSummary(transactions, {
  periodRange,
  calcMode = 'actual',
  ioType = 'expense',
  majorId,
  minorId = null,
} = {}) {
  if (calcMode !== 'actual') return 0
  let sum = 0
  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    if (!matchesCategorySelection(tx, { majorId, minorId })) continue
    sum += getCategoryAmount(tx, { ioType, calcMode, entryMode: 'adjustment' })
  }
  return sum
}
