function absAmount(v) {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.abs(n) : 0
}

function inPeriod(date, periodRange) {
  if (!periodRange?.startDate || !periodRange?.endDate) return true
  return date >= periodRange.startDate && date <= periodRange.endDate
}

function classify(tx) {
  const type = tx.category_type ?? null
  const direction = tx.direction ?? 'INFLOW'
  const amount = absAmount(tx.amount)
  const isTransfer = type === '이체'
  const uncategorizedIncome = !type && direction === 'INFLOW'
  const uncategorizedExpense = !type && direction === 'OUTFLOW'

  return {
    type,
    direction,
    amount,
    isTransfer,
    incomeNormal: type === '수입' && direction === 'INFLOW',
    incomeAdjustment: type === '수입' && direction === 'OUTFLOW', // 수입 차감(정정/반환)
    expenseNormal: type === '지출' && direction === 'OUTFLOW',
    expenseAdjustment: type === '지출' && direction === 'INFLOW', // 지출 차감(환급/정산/할인)
    uncategorizedIncome,
    uncategorizedExpense,
  }
}

function txLabel(tx) {
  return tx.description || tx.memo || '(적요 없음)'
}

function baseEvent(tx, amount, side) {
  return {
    id: String(tx.id),
    date: tx.date,
    name: txLabel(tx),
    description: tx.description || '',
    memo: tx.memo || '',
    amount,
    categoryName: tx.category_name || tx.parent_category_name || '-',
    type: tx.category_type || null,
    side,
    keyword: tx.description || tx.memo || '',
  }
}

function byAmountDesc(a, b) {
  return (b.amount - a.amount) || String(a.date).localeCompare(String(b.date))
}

function collectEvents(transactions, { periodRange, predicate, side }) {
  const rows = []
  for (const tx of transactions ?? []) {
    if (!inPeriod(tx.date, periodRange)) continue
    const c = classify(tx)
    if (c.isTransfer) continue
    if (!predicate(c, tx)) continue
    rows.push(baseEvent(tx, c.amount, side))
  }
  return rows.sort(byAmountDesc)
}

export function getTop6({ transactions, tab, basis = 'actual', periodRange, limit = 6 }) {
  if (tab === 'income') {
    // 기본: INFLOW 전체(일반 수입 + 지출 차감), 실질: 일반 수입만
    const items = collectEvents(transactions, {
      periodRange,
      side: 'income',
      predicate: (c) => basis === 'basic'
        ? (c.direction === 'INFLOW')
        : (c.incomeNormal || c.uncategorizedIncome),
    })
    return items.slice(0, limit)
  }

  if (tab === 'expense') {
    // 기본: OUTFLOW 전체(일반 지출 + 수입 차감), 실질: 일반 지출만
    const items = collectEvents(transactions, {
      periodRange,
      side: 'expense',
      predicate: (c) => basis === 'basic'
        ? (c.direction === 'OUTFLOW')
        : (c.expenseNormal || c.uncategorizedExpense),
    })
    return items.slice(0, limit)
  }

  return []
}

export function getTop3Normal({ transactions, tab, periodRange, limit = 3 }) {
  if (tab === 'income') {
    return collectEvents(transactions, {
      periodRange,
      side: 'income',
      predicate: (c) => c.incomeNormal || c.uncategorizedIncome,
    }).slice(0, limit)
  }
  if (tab === 'expense') {
    return collectEvents(transactions, {
      periodRange,
      side: 'expense',
      predicate: (c) => c.expenseNormal || c.uncategorizedExpense,
    }).slice(0, limit)
  }
  return []
}

export function getTop3Adjustment({ transactions, tab, periodRange, limit = 3 }) {
  if (tab === 'income') {
    // 수입 차감 = 수입 카테고리 + OUTFLOW (정정/반환)
    return collectEvents(transactions, {
      periodRange,
      side: 'income-adjustment',
      predicate: (c) => c.incomeAdjustment,
    }).slice(0, limit)
  }
  if (tab === 'expense') {
    // 지출 차감 = 지출 카테고리 + INFLOW (환급/정산/할인)
    return collectEvents(transactions, {
      periodRange,
      side: 'expense-adjustment',
      predicate: (c) => c.expenseAdjustment,
    }).slice(0, limit)
  }
  return []
}

export function getTopIncomeTransactions(transactions, ctx, limit = 5) {
  return collectEvents(transactions, {
    periodRange: ctx?.periodRange,
    side: 'income',
    predicate: (c) => c.incomeNormal,
  }).slice(0, limit)
}

export function getTopExpenseTransactions(transactions, ctx, limit = 5) {
  return collectEvents(transactions, {
    periodRange: ctx?.periodRange,
    side: 'expense',
    predicate: (c) => c.expenseNormal,
  }).slice(0, limit)
}

export function getTopSettlementContributors(transactions, ctx, incomeLimit = 3, expenseLimit = 3) {
  return {
    incomeTop: getTopIncomeTransactions(transactions, ctx, incomeLimit),
    expenseTop: getTopExpenseTransactions(transactions, ctx, expenseLimit),
  }
}

