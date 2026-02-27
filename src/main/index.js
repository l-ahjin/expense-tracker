import { app, BrowserWindow, ipcMain, dialog, safeStorage, nativeTheme, Menu } from 'electron'
import { join, basename, dirname, extname } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDB, closeDB, generateTransactionId, getCardPaymentCategoryId } from './db'
import fs from 'fs'
import { createHash } from 'crypto'
import { google } from 'googleapis'
import fontList from 'font-list'
import { loadWorkbook, parseRows, classifyRows } from './excelParser.js'
import { applyKeywordRules } from './keywordMatcher.js'

let activeSyncRunState = null

const SYNC_FAILURE_REASON = {
  APP_CLOSED_BY_USER: 'sync_interrupted_app_closed_by_user',
  UNEXPECTED_SHUTDOWN: 'sync_interrupted_unexpected_shutdown',
}

function finalizeSyncRunAsFailed(runId, reasonCode) {
  const db = getDB()
  const nowSql = db.prepare(`SELECT datetime('now') AS now`).get()?.now ?? null

  db.prepare(`
    UPDATE sync_run_items
    SET
      status = 'failed',
      finished_at = COALESCE(finished_at, datetime('now')),
      rows_failed = CASE WHEN COALESCE(rows_failed, 0) > 0 THEN rows_failed ELSE 1 END,
      error_message = COALESCE(NULLIF(error_message, ''), ?)
    WHERE run_id = ?
      AND status = 'running'
  `).run(reasonCode, runId)

  db.prepare(`
    UPDATE sync_run_items
    SET
      status = 'skipped',
      finished_at = COALESCE(finished_at, datetime('now'))
    WHERE run_id = ?
      AND status = 'waiting'
  `).run(runId)

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(rows_inserted), 0) AS inserted,
      COALESCE(SUM(rows_updated), 0) AS updated,
      COALESCE(SUM(rows_skipped), 0) AS skipped,
      COALESCE(SUM(rows_deleted), 0) AS deleted,
      COALESCE(SUM(rows_failed), 0) AS failed
    FROM sync_run_items
    WHERE run_id = ?
  `).get(runId) ?? { inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0 }

  db.prepare(`
    UPDATE sync_runs
    SET
      finished_at = COALESCE(finished_at, datetime('now')),
      status = 'failed',
      total_inserted = ?,
      total_updated = ?,
      total_skipped = ?,
      total_deleted = ?,
      total_failed = ?,
      error_message = ?
    WHERE id = ?
  `).run(
    Number(totals.inserted ?? 0),
    Number(totals.updated ?? 0),
    Number(totals.skipped ?? 0),
    Number(totals.deleted ?? 0),
    Number(totals.failed ?? 0),
    reasonCode,
    runId
  )

  if (activeSyncRunState?.runId === runId) {
    const finishedAt = new Date().toISOString()
    const nextItems = Array.isArray(activeSyncRunState.items)
      ? activeSyncRunState.items.map((item) => {
        if (item.status === 'running') return { ...item, status: 'failed', failed: Math.max(1, Number(item.failed ?? 0)), error: reasonCode }
        if (item.status === 'waiting') return { ...item, status: 'skipped' }
        return item
      })
      : activeSyncRunState.items
    activeSyncRunState = {
      ...activeSyncRunState,
      status: 'failed',
      finishedAt,
      error: reasonCode,
      items: nextItems,
      summary: {
        inserted: Number(totals.inserted ?? 0),
        updated: Number(totals.updated ?? 0),
        skipped: Number(totals.skipped ?? 0),
        deleted: Number(totals.deleted ?? 0),
        failed: Number(totals.failed ?? 0),
      },
    }
  }

  return { nowSql, totals }
}

function failActiveSyncRunIfRunning(reasonCode) {
  if (activeSyncRunState?.status !== 'running' || !activeSyncRunState?.runId) return false
  finalizeSyncRunAsFailed(Number(activeSyncRunState.runId), reasonCode)
  return true
}

function recoverInterruptedSyncRunsOnStartup() {
  const db = getDB()
  const runs = db.prepare(`SELECT id FROM sync_runs WHERE status = 'running' ORDER BY id ASC`).all()
  for (const run of runs) {
    finalizeSyncRunAsFailed(Number(run.id), SYNC_FAILURE_REASON.UNEXPECTED_SHUTDOWN)
  }
}

function normalizeCategoryFlowPolicy(type, flowPolicy) {
  if (type === '이체') return 'BOTH'
  if (flowPolicy === 'FIXED_IN' || flowPolicy === 'FIXED_OUT') return flowPolicy
  return type === '수입' ? 'FIXED_IN' : 'FIXED_OUT'
}

function normalizeDirection(value, fallbackAmount = null) {
  if (value === 'INFLOW' || value === 'OUTFLOW') return value
  if (value === '+' || value === 'inflow') return 'INFLOW'
  if (value === '-' || value === 'outflow') return 'OUTFLOW'
  if (typeof fallbackAmount === 'number') {
    return fallbackAmount < 0 ? 'OUTFLOW' : 'INFLOW'
  }
  return null
}

function normalizeAmountAndDirection(data) {
  const rawAmount = Number(data.amount ?? 0)
  if (!Number.isFinite(rawAmount)) {
    throw new Error('금액이 올바르지 않아요.')
  }
  const direction = normalizeDirection(data.direction, rawAmount)
  if (!direction) {
    throw new Error('거래 방향을 선택해주세요.')
  }
  return {
    amount: Math.abs(Math.round(rawAmount)),
    direction,
  }
}

function signedDelta({ amount, direction }) {
  const abs = Math.abs(Number(amount ?? 0))
  return direction === 'OUTFLOW' ? -abs : abs
}

function getCategoryMeta(db, categoryId) {
  if (!categoryId) return null
  return db.prepare('SELECT id, type, flow_policy FROM categories WHERE id = ?').get(categoryId) ?? null
}

function assertCategoryDirectionPolicy(db, categoryId, direction) {
  const category = getCategoryMeta(db, categoryId)
  if (!category) return null

  if (category.flow_policy === 'FIXED_IN' && direction !== 'INFLOW') {
    throw new Error('선택한 카테고리는 유입(+) 방향만 허용해요.')
  }
  if (category.flow_policy === 'FIXED_OUT' && direction !== 'OUTFLOW') {
    throw new Error('선택한 카테고리는 유출(-) 방향만 허용해요.')
  }
  return category
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function endOfMonth(year, month) {
  return new Date(year, month, 0)
}

function buildDashboardRange(payload = {}) {
  const mode = payload.mode ?? 'monthly'
  if (mode === 'annual') {
    const year = Number(payload.year) || new Date().getFullYear()
    return {
      mode,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      bucket: 'month',
      year,
      month: null,
    }
  }

  if (mode === 'custom') {
    if (!payload.startDate || !payload.endDate) {
      throw new Error('기간을 선택해주세요.')
    }
    if (payload.startDate > payload.endDate) {
      throw new Error('시작일이 종료일보다 늦을 수 없어요.')
    }
    const start = new Date(`${payload.startDate}T00:00:00`)
    const end = new Date(`${payload.endDate}T00:00:00`)
    const diffDays = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1
    return {
      mode,
      startDate: payload.startDate,
      endDate: payload.endDate,
      bucket: diffDays <= 45 ? 'day' : 'month',
      year: null,
      month: null,
    }
  }

  const now = new Date()
  const year = Number(payload.year) || now.getFullYear()
  const month = Number(payload.month) || (now.getMonth() + 1)
  return {
    mode: 'monthly',
    startDate: `${year}-${pad2(month)}-01`,
    endDate: formatLocalDate(endOfMonth(year, month)),
    bucket: 'day',
    year,
    month,
  }
}

function buildBucketSeries({ startDate, endDate, bucket }) {
  const result = []
  if (bucket === 'day') {
    const cursor = new Date(`${startDate}T00:00:00`)
    const end = new Date(`${endDate}T00:00:00`)
    while (cursor <= end) {
      const key = formatLocalDate(cursor)
      result.push({ key, label: `${cursor.getMonth() + 1}/${cursor.getDate()}` })
      cursor.setDate(cursor.getDate() + 1)
    }
    return result
  }

  const [sy, sm] = startDate.split('-').map(Number)
  const [ey, em] = endDate.split('-').map(Number)
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    const key = `${y}-${pad2(m)}`
    result.push({ key, label: `${y % 100}.${pad2(m)}` })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return result
}

// IPC 핸들러 등록
function registerIpcHandlers() {
  const db = getDB()

  // 자산 그룹
  ipcMain.handle('asset-groups:getAll', () => {
    return db.prepare('SELECT * FROM asset_groups ORDER BY sort_order, id').all()
  })
  ipcMain.handle('asset-groups:create', (_, data) => {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM asset_groups').get()
    return db.prepare('INSERT INTO asset_groups (name, type, sort_order) VALUES (?, ?, ?)').run(
      data.name, data.type, (maxOrder.m ?? -1) + 1
    )
  })
  ipcMain.handle('asset-groups:update', (_, id, data) => {
    return db.prepare('UPDATE asset_groups SET name = ?, type = ? WHERE id = ?').run(data.name, data.type, id)
  })
  ipcMain.handle('asset-groups:delete', (_, id) => {
    return db.prepare('DELETE FROM asset_groups WHERE id = ?').run(id)
  })
  ipcMain.handle('asset-groups:reorder', (_, orderedIds) => {
    const update = db.prepare('UPDATE asset_groups SET sort_order = ? WHERE id = ?')
    const tx = db.transaction(() => { orderedIds.forEach((id, i) => update.run(i, id)) })
    tx()
  })

  // 자산
  ipcMain.handle('assets:getAll', () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const monthStart = `${year}-${month}-01`
    const monthEnd = `${year}-${month}-31`

    const assets = db.prepare(`
      SELECT a.*, ag.name as group_name, ag.type as group_type,
            pt.name as template_name,
            pt2.name as credit_template_name,
            la.name as linked_asset_name
      FROM assets a
      LEFT JOIN asset_groups ag ON a.asset_group_id = ag.id
      LEFT JOIN parser_templates pt ON a.template_id = pt.id
      LEFT JOIN parser_templates pt2 ON a.credit_template_id = pt2.id
      LEFT JOIN assets la ON a.linked_asset_id = la.id
      ORDER BY a.asset_group_id, a.sort_order, a.id
    `).all()

    const allAssetTransactions = assets.length > 0
      ? db.prepare(`
          SELECT
            t.asset_id,
            t.amount,
            t.direction,
            t.balance,
            t.date,
            t.rowid AS tx_rowid
          FROM transactions t
          WHERE t.is_excluded = 0
            AND t.asset_id IN (${assets.map(() => '?').join(',')})
          ORDER BY t.date DESC, t.rowid DESC
        `).all(...assets.map(a => a.id))
      : []

    const monthlyCardStats = db.prepare(`
      SELECT
        t.asset_id,
        SUM(CASE
          WHEN t.direction = 'OUTFLOW' AND IFNULL(c.type, '') <> '이체'
          THEN t.amount ELSE 0 END
        ) AS monthly_card_usage,
        SUM(CASE
          WHEN t.direction = 'INFLOW' AND (c.type = '지출' OR t.category_id IS NULL)
          THEN t.amount ELSE 0 END
        ) AS monthly_card_benefit
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.date >= ? AND t.date <= ? AND t.is_excluded = 0
      GROUP BY t.asset_id
    `).all(monthStart, monthEnd)
    const cardStatsMap = new Map(monthlyCardStats.map(row => [row.asset_id, row]))

    // 각 자산의 매칭 규칙 포함
    const rules = db.prepare('SELECT * FROM asset_match_rules ORDER BY sort_order, id').all()
    function deriveDisplayBalance(asset) {
      if (asset.group_type !== '일반') {
        return {
          display_balance: null,
          display_balance_estimated: 0,
          display_balance_estimated_reason: null,
        }
      }

      const relatedAssetIds = new Set([
        asset.id,
        ...assets
          .filter(a => a.linked_asset_id === asset.id && (a.group_type === '체크카드' || a.group_type === '신용카드'))
          .map(a => a.id),
      ])

      const txs = allAssetTransactions.filter(t => relatedAssetIds.has(t.asset_id))
      if (txs.length === 0) {
        return {
          display_balance: null,
          display_balance_estimated: 0,
          display_balance_estimated_reason: null,
        }
      }

      const latestTx = txs[0]
      if (latestTx.balance != null) {
        return {
          display_balance: latestTx.balance,
          display_balance_estimated: 0,
          display_balance_estimated_reason: null,
        }
      }

      const anchorIndex = txs.findIndex(t => t.balance != null)
      if (anchorIndex >= 0) {
        let estimated = Number(txs[anchorIndex].balance) || 0
        const newerRows = txs.slice(0, anchorIndex).reverse()
        for (const row of newerRows) {
          if (row.direction === 'INFLOW') estimated += Number(row.amount) || 0
          else estimated -= Number(row.amount) || 0
        }
        return {
          display_balance: estimated,
          display_balance_estimated: 1,
          display_balance_estimated_reason: 'derived',
        }
      }

      return {
        display_balance: null,
        display_balance_estimated: 0,
        display_balance_estimated_reason: 'no_anchor',
      }
    }

    return assets.map(a => {
      const balanceMeta = deriveDisplayBalance(a)
      return {
        ...a,
        ...balanceMeta,
        monthly_card_usage: cardStatsMap.get(a.id)?.monthly_card_usage ?? 0,
        monthly_card_benefit: cardStatsMap.get(a.id)?.monthly_card_benefit ?? 0,
        match_rules: rules.filter(r => r.asset_id === a.id)
      }
    })
  })

  ipcMain.handle('assets:create', (_, data) => {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM assets WHERE asset_group_id = ?').get(data.asset_group_id)
    const result = db.prepare(`
      INSERT INTO assets
        (name, asset_group_id, is_active, sort_order, template_id,
        credit_template_id, linked_asset_id)
      VALUES (?, ?, 1, ?, ?, ?, ?)
    `).run(
      data.name, data.asset_group_id ?? null,
      (maxOrder.m ?? -1) + 1,
      data.template_id ?? null,
      data.credit_template_id ?? null,
      data.linked_asset_id ?? null,
    )

    // 매칭 규칙 저장
    if (data.match_rules?.length > 0) {
      const insertRule = db.prepare(
        'INSERT INTO asset_match_rules (asset_id, type_match_code, description_match_keyword, sort_order) VALUES (?, ?, ?, ?)'
      )
      const tx = db.transaction(() => {
        data.match_rules.forEach((rule, i) => {
          insertRule.run(result.lastInsertRowid, rule.type_match_code, rule.description_match_keyword || null, i)
        })
      })
      tx()
    }

    return result
  })

  ipcMain.handle('assets:update', (_, id, data) => {
    db.prepare(`
      UPDATE assets
      SET name = ?, asset_group_id = ?, is_active = ?,
          template_id = ?, credit_template_id = ?, linked_asset_id = ?
      WHERE id = ?
    `).run(
      data.name, data.asset_group_id ?? null, data.is_active ?? 1,
      data.template_id ?? null,
      data.credit_template_id ?? null,
      data.linked_asset_id ?? null,
      id
    )

    // 매칭 규칙 교체 (기존 삭제 후 재삽입)
    db.prepare('DELETE FROM asset_match_rules WHERE asset_id = ?').run(id)
    if (data.match_rules?.length > 0) {
      const insertRule = db.prepare(
        'INSERT INTO asset_match_rules (asset_id, type_match_code, description_match_keyword, sort_order) VALUES (?, ?, ?, ?)'
      )
      const tx = db.transaction(() => {
        data.match_rules.forEach((rule, i) => {
          insertRule.run(id, rule.type_match_code, rule.description_match_keyword || null, i)
        })
      })
      tx()
    }
  })

  ipcMain.handle('assets:delete', (_, id) => {
    return db.prepare('DELETE FROM assets WHERE id = ?').run(id)
  })

  ipcMain.handle('assets:reorder', (_, groupId, orderedIds) => {
    const update = db.prepare('UPDATE assets SET sort_order = ? WHERE id = ?')
    const tx = db.transaction(() => { orderedIds.forEach((id, i) => update.run(i, id)) })
    tx()
  })

  // 카테고리
  ipcMain.handle('categories:getAll', () => {
    return db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all()
  })

  ipcMain.handle('categories:create', (_, data) => {
    const maxOrder = db.prepare(
      'SELECT MAX(sort_order) as m FROM categories WHERE type = ? AND parent_id IS ?'
    ).get(data.type, data.parent_id ?? null)
    const flowPolicy = normalizeCategoryFlowPolicy(data.type, data.flow_policy)
    return db.prepare(`
      INSERT INTO categories (name, type, flow_policy, parent_id, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.name, data.type, flowPolicy, data.parent_id ?? null, (maxOrder.m ?? -1) + 1)
  })

  ipcMain.handle('categories:update', (_, id, data) => {
    const cat = db.prepare('SELECT id, is_system, parent_id FROM categories WHERE id = ?').get(id)
    if (cat?.is_system) {
      return db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(data.name, id)
    }
    const flowPolicy = normalizeCategoryFlowPolicy(data.type, data.flow_policy)
    const nextParentId = data.parent_id ?? null

    const updateCategory = db.prepare(`
      UPDATE categories SET name = ?, type = ?, flow_policy = ?, parent_id = ? WHERE id = ?
    `)
    const syncChildrenFlow = db.prepare(`
      UPDATE categories SET flow_policy = ? WHERE parent_id = ?
    `)

    const tx = db.transaction(() => {
      const result = updateCategory.run(data.name, data.type, flowPolicy, nextParentId, id)
      // 대분류의 구분이 바뀌면 기존 소분류도 같은 구분으로 일괄 동기화
      if (cat && cat.parent_id == null && nextParentId == null) {
        syncChildrenFlow.run(flowPolicy, id)
      }
      return result
    })

    return tx()
  })

  ipcMain.handle('categories:delete', (_, id) => {
    const cat = db.prepare('SELECT is_system, name FROM categories WHERE id = ?').get(id)
    if (cat?.is_system) {
      throw new Error(`"${cat.name}"은 시스템 카테고리로 삭제할 수 없어요.`)
    }
    return db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  })

  ipcMain.handle('categories:reorder', (_, orderedIds) => {
    const update = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?')
    const tx = db.transaction(() => {
      orderedIds.forEach((id, index) => update.run(index, id))
    })
    tx()
  })

  ipcMain.handle('dashboard:getStats', (_, payload) => {
    const range = buildDashboardRange(payload)
    const transactions = db.prepare(`
      SELECT
        t.id,
        t.date,
        t.amount,
        t.direction,
        t.asset_id,
        a.name as asset_name,
        t.description,
        t.memo,
        t.category_id,
        c.name as category_name,
        c.type as category_type,
        c.flow_policy as category_flow_policy,
        c.parent_id as category_parent_id,
        p.name as parent_category_name
      FROM transactions t
      LEFT JOIN assets a ON t.asset_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE t.date >= ? AND t.date <= ? AND t.is_excluded = 0
      ORDER BY t.date DESC, t.rowid DESC
    `).all(range.startDate, range.endDate)

    const monthKeys = db.prepare(`
      SELECT DISTINCT substr(date, 1, 7) as month
      FROM transactions
      WHERE is_excluded = 0
      ORDER BY month DESC
    `).all().map(r => r.month)

    return {
      range,
      bucketSeries: buildBucketSeries(range),
      transactions,
      monthKeys,
    }
  })

  // 거래 내역
  // 월별 거래 내역 (무한스크롤용)
  ipcMain.handle('transactions:getByMonth', (_, { year, month, assetId }) => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = `${year}-${String(month).padStart(2, '0')}-31`

    const rows = assetId
      ? db.prepare(`
          SELECT t.*, c.name as category_name, c.type as category_type, c.flow_policy as category_flow_policy,
                p.name as parent_category_name, a.name as asset_name
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          LEFT JOIN categories p ON c.parent_id = p.id
          LEFT JOIN assets a ON t.asset_id = a.id
          WHERE t.date >= ? AND t.date <= ? AND t.asset_id = ?
          ORDER BY t.date DESC, t.rowid DESC
        `).all(start, end, assetId)
      : db.prepare(`
          SELECT t.*, c.name as category_name, c.type as category_type, c.flow_policy as category_flow_policy,
                p.name as parent_category_name, a.name as asset_name
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          LEFT JOIN categories p ON c.parent_id = p.id
          LEFT JOIN assets a ON t.asset_id = a.id
          WHERE t.date >= ? AND t.date <= ?
          ORDER BY t.date DESC, t.rowid DESC
        `).all(start, end)

    const summary = rows.reduce((acc, row) => {
      if (row.category_type === '수입') {
        if (row.direction === 'INFLOW') acc.income += row.amount
        else acc.incomeAdjustment += row.amount
      } else if (row.category_type === '지출') {
        if (row.direction === 'OUTFLOW') acc.expense += row.amount
        else acc.expenseRefund += row.amount
      } else if (row.category_type === '이체') {
        acc.transfer += row.amount
      }
      return acc
    }, {
      income: 0,
      incomeAdjustment: 0,
      expense: 0,
      expenseRefund: 0,
      transfer: 0,
    })
    summary.net = (summary.income - summary.incomeAdjustment) - (summary.expense - summary.expenseRefund)

    return { rows, summary }
  })

  // 거래 내역 검색 
  ipcMain.handle('transactions:search', (_, {
    keyword,
    assetIds,
    categoryIds,
    categoryId,
    type,
    direction,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    includeAdjustments = true,
    includeUncategorized = true,
    limit,
    offset,
    onlyUncategorized,
  }) => {
    const conditions = ['1=1']
    const params = []

    if (onlyUncategorized) {
      conditions.push('t.category_id IS NULL')
    }
    if (keyword) {
      conditions.push('(t.description LIKE ? OR t.memo LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (assetIds?.length > 0) {
      conditions.push(`t.asset_id IN (${assetIds.map(() => '?').join(',')})`)
      params.push(...assetIds)
    }
    const hasCategoryFilter = (Array.isArray(categoryIds) && categoryIds.length > 0) || !!categoryId

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const orParts = []
      for (const id of categoryIds) {
        orParts.push('(t.category_id = ? OR c.parent_id = ?)')
        params.push(id, id)
      }
      if (includeUncategorized) {
        conditions.push(`((${orParts.join(' OR ')}) OR t.category_id IS NULL)`)
      } else {
        conditions.push(`(${orParts.join(' OR ')})`)
      }
    } else if (categoryId) {
      if (includeUncategorized) {
        conditions.push('((t.category_id = ? OR c.parent_id = ?) OR t.category_id IS NULL)')
      } else {
        conditions.push('(t.category_id = ? OR c.parent_id = ?)')
      }
      params.push(categoryId, categoryId)
    } else if (!includeUncategorized && !onlyUncategorized) {
      conditions.push('t.category_id IS NOT NULL')
    }
    if (type) {
      if (includeUncategorized) {
        if (type === '수입') {
          conditions.push(`(
            c.type = ? OR
            (t.category_id IS NULL AND t.direction = 'INFLOW')
          )`)
          params.push(type)
        } else if (type === '지출') {
          conditions.push(`(
            c.type = ? OR
            (t.category_id IS NULL AND t.direction = 'OUTFLOW')
          )`)
          params.push(type)
        } else {
          // 이체는 미분류를 이체로 간주하지 않음
          conditions.push('c.type = ?')
          params.push(type)
        }
      } else {
        conditions.push('c.type = ?')
        params.push(type)
      }
    }
    if (direction) {
      conditions.push('t.direction = ?')
      params.push(direction)
    }
    if (dateFrom) {
      conditions.push('t.date >= ?')
      params.push(dateFrom)
    }
    if (dateTo) {
      conditions.push('t.date <= ?')
      params.push(dateTo)
    }
    if (amountMin != null) {
      conditions.push('t.amount >= ?')
      params.push(amountMin)
    }
    if (amountMax != null) {
      conditions.push('t.amount <= ?')
      params.push(amountMax)
    }
    if (!includeAdjustments) {
      conditions.push(`(
        t.category_id IS NULL OR
        NOT (
          (c.type = '수입' AND t.direction = 'OUTFLOW') OR
          (c.type = '지출' AND t.direction = 'INFLOW')
        )
      )`)
    }

    const where = conditions.join(' AND ')

    const total = db.prepare(`
      SELECT COUNT(*) as cnt FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE ${where}
    `).get(...params)?.cnt ?? 0

    const rows = db.prepare(`
      SELECT t.*, c.name as category_name, c.type as category_type, c.flow_policy as category_flow_policy,
            p.name as parent_category_name, a.name as asset_name
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      LEFT JOIN assets a ON t.asset_id = a.id
      WHERE ${where}
      ORDER BY t.date DESC, t.rowid DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit ?? 50, offset ?? 0)

    return { rows, total }
  })

  // 거래 수정 (카테고리, 메모)
  ipcMain.handle('transactions:update', (_, id, update) => {
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
    if (!existing) throw new Error('거래를 찾을 수 없어요.')

    const allowed = ['category_id', 'memo', 'date', 'asset_id', 'amount', 'description', 'direction']
    const fields = Object.keys(update).filter(k => allowed.includes(k))
    if (fields.length === 0) return

    const next = { ...existing, ...update }

    if ('amount' in update || 'direction' in update) {
      const normalized = normalizeAmountAndDirection(next)
      next.amount = normalized.amount
      next.direction = normalized.direction
    } else {
      next.direction = normalizeDirection(next.direction)
    }

    if (!next.direction) {
      throw new Error('거래 방향을 확인해주세요.')
    }

    assertCategoryDirectionPolicy(db, next.category_id ?? null, next.direction)

    const set = fields.map(f => {
      if (f === 'amount') return 'amount = ?'
      if (f === 'direction') return 'direction = ?'
      return `${f} = ?`
    }).join(', ')

    const values = fields.map(f => {
      if (f === 'amount') return next.amount
      if (f === 'direction') return next.direction
      return next[f] ?? null
    })

    db.prepare(`UPDATE transactions SET ${set} WHERE id = ?`).run(...values, id)
  })

  // 거래 삭제
  ipcMain.handle('transactions:delete', (_, id) => {
    return db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
  })

  // 거래 수동 추가
  ipcMain.handle('transactions:create', (_, data) => {
    const crypto = require('crypto')
    const id = crypto.randomBytes(8).toString('hex')
    const { amount, direction } = normalizeAmountAndDirection(data)
    assertCategoryDirectionPolicy(db, data.category_id ?? null, direction)
    return db.prepare(`
      INSERT INTO transactions (id, date, amount, direction, asset_id, balance, description, memo, category_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.date, amount, direction, data.asset_id ?? null,
      data.balance ?? null, data.description ?? '',
      data.memo ?? null, data.category_id ?? null
    )
  })

  // 카테고리 미지정 건수
  ipcMain.handle('transactions:uncategorizedCount', () => {
    return db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE category_id IS NULL').get().cnt
  })

  // 거래가 존재하는 년월 목록 (무한스크롤 월 목록용)
  ipcMain.handle('transactions:getMonths', (_, { assetId }) => {
    const rows = assetId
      ? db.prepare(`
          SELECT DISTINCT substr(date, 1, 7) as month
          FROM transactions WHERE asset_id = ?
          ORDER BY month DESC
        `).all(assetId)
      : db.prepare(`
          SELECT DISTINCT substr(date, 1, 7) as month
          FROM transactions ORDER BY month DESC
        `).all()
    return rows.map(r => r.month)
  })

  // 키워드 규칙
  ipcMain.handle('keyword-rules:getAll', () => {
    return db.prepare(`
      SELECT kr.*, 
            c.name as category_name, c.type as category_type,
            p.name as parent_name
      FROM keyword_rules kr
      LEFT JOIN categories c ON kr.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      ORDER BY kr.priority ASC, kr.id ASC
    `).all()
  })

  ipcMain.handle('keyword-rules:create', (_, data) => {
    const max = db.prepare('SELECT MAX(priority) as m FROM keyword_rules').get()
    return db.prepare(`
      INSERT INTO keyword_rules (keyword, match_type, category_id, amount, priority)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.keyword,
      data.match_type,
      data.category_id ?? null,
      data.amount ?? null,
      (max.m ?? 0) + 10
    )
  })

  ipcMain.handle('keyword-rules:update', (_, id, data) => {
    return db.prepare(`
      UPDATE keyword_rules
      SET keyword = ?, match_type = ?, category_id = ?, amount = ?, priority = ?
      WHERE id = ?
    `).run(
      data.keyword,
      data.match_type,
      data.category_id ?? null,
      data.amount ?? null,
      data.priority,
      id
    )
  })

  ipcMain.handle('keyword-rules:delete', (_, id) => {
    return db.prepare('DELETE FROM keyword_rules WHERE id = ?').run(id)
  })

  ipcMain.handle('keyword-rules:reorder', (_, orderedIds) => {
    const update = db.prepare('UPDATE keyword_rules SET priority = ? WHERE id = ?')
    const tx = db.transaction(() => {
      orderedIds.forEach((id, i) => update.run((i + 1) * 10, id))
    })
    tx()
  })

  // 파서 템플릿
  ipcMain.handle('parser-templates:getAll', () => {
    return db.prepare(`
      SELECT *
      FROM parser_templates
      ORDER BY id
    `).all().map(t => ({
      ...t,
      password: t.password
        ? safeStorage.decryptString(Buffer.from(t.password, 'base64'))
        : null
    }))
  })

  ipcMain.handle('parser-templates:create', (_, data) => {
    const encryptedPassword = data.password
      ? safeStorage.encryptString(data.password).toString('base64')
      : null

    return db.prepare(`
      INSERT INTO parser_templates
        (name, connection_type, password, start_row, amount_type,
        col_date, col_description, col_amount, col_amount_in, col_amount_out, col_balance, col_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name, data.connection_type, encryptedPassword,
      data.start_row, data.amount_type,
      data.col_date, data.col_description,
      data.col_amount ?? null, data.col_amount_in ?? null,
      data.col_amount_out ?? null, data.col_balance ?? null,
      data.col_type ?? null
    )
  })

  ipcMain.handle('parser-templates:update', (_, id, data) => {
    const encryptedPassword = data.password
      ? safeStorage.encryptString(data.password).toString('base64')
      : null

    return db.prepare(`
      UPDATE parser_templates
      SET name = ?, connection_type = ?, password = ?, start_row = ?, amount_type = ?,
          col_date = ?, col_description = ?, col_amount = ?,
          col_amount_in = ?, col_amount_out = ?, col_balance = ?, col_type = ?
      WHERE id = ?
    `).run(
      data.name, data.connection_type, encryptedPassword,
      data.start_row, data.amount_type,
      data.col_date, data.col_description,
      data.col_amount ?? null, data.col_amount_in ?? null,
      data.col_amount_out ?? null, data.col_balance ?? null,
      data.col_type ?? null, id
    )
  })

  ipcMain.handle('parser-templates:delete', (_, id) => {
    return db.prepare('DELETE FROM parser_templates WHERE id = ?').run(id)
  })

  // 파일 다이얼로그
  ipcMain.handle('excel:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('excel:listDetectedFiles', async () => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('file_watcher_path')
    const watcherPath = row ? JSON.parse(row.value) : null
    if (!watcherPath) {
      return { configured: false, path: null, lastScannedAt: Date.now(), files: [] }
    }

    if (!fs.existsSync(watcherPath)) {
      return { configured: true, path: watcherPath, lastScannedAt: Date.now(), files: [], pathMissing: true }
    }

    let importRows = []
    try {
      importRows = db.prepare(`
        SELECT file_path, filename, file_id, last_modified_at, content_hash, imported_at, id
        FROM excel_imports
        ORDER BY imported_at DESC, id DESC
      `).all()
    } catch {
      importRows = []
    }

    const latestByFileId = new Map()
    const latestByPathName = new Map()
    for (const r of importRows) {
      if (r.file_id != null && !latestByFileId.has(String(r.file_id))) {
        latestByFileId.set(String(r.file_id), r)
      }
      const key = `${r.file_path ?? ''}::${r.filename ?? ''}`
      if (!latestByPathName.has(key)) latestByPathName.set(key, r)
    }

    const entries = fs.readdirSync(watcherPath, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .filter(entry => {
        const ext = extname(entry.name).toLowerCase()
        return (ext === '.xls' || ext === '.xlsx') && !entry.name.startsWith('~$')
      })

    const files = []
    for (const entry of entries) {
      const absPath = join(watcherPath, entry.name)
      try {
        const stat = fs.statSync(absPath)
        const fileId = Number.isFinite(stat.ino) ? stat.ino : null
        const lastModifiedAt = Number.isFinite(stat.mtimeMs) ? Math.floor(stat.mtimeMs) : null
        const contentHash = createHash('sha256').update(fs.readFileSync(absPath)).digest('hex')

        const pathKey = `${watcherPath}::${entry.name}`
        const matched = (fileId != null && latestByFileId.get(String(fileId))) || latestByPathName.get(pathKey) || null

        let status = 'new'
        if (matched) {
          const sameMtime = matched.last_modified_at != null && lastModifiedAt != null && Number(matched.last_modified_at) === Number(lastModifiedAt)
          const sameHash = !!matched.content_hash && matched.content_hash === contentHash
          status = (sameHash || sameMtime) ? 'saved' : 'modified'
        }

        files.push({
          path: absPath,
          filename: entry.name,
          filePath: watcherPath,
          fileId,
          lastModifiedAt,
          sizeBytes: stat.size,
          contentHash,
          status, // new | modified | saved
        })
      } catch {
        // Skip unreadable files
      }
    }

    files.sort((a, b) => (b.lastModifiedAt ?? 0) - (a.lastModifiedAt ?? 0))

    return {
      configured: true,
      path: watcherPath,
      pathMissing: false,
      lastScannedAt: Date.now(),
      files,
    }
  })

  ipcMain.handle('excel:getImportHistory', (_, payload = {}) => {
    const limit = Math.max(1, Math.min(100, Number(payload.limit) || 20))
    const offset = Math.max(0, Number(payload.offset) || 0)
    const where = []
    const params = []

    if (payload.q && String(payload.q).trim()) {
      where.push('ei.filename LIKE ?')
      params.push(`%${String(payload.q).trim()}%`)
    }
    if (payload.assetId != null && payload.assetId !== '' && Number.isFinite(Number(payload.assetId))) {
      where.push('ei.asset_id = ?')
      params.push(Number(payload.assetId))
    }
    if (payload.dateFrom) {
      where.push("date(ei.imported_at) >= date(?)")
      params.push(payload.dateFrom)
    }
    if (payload.dateTo) {
      where.push("date(ei.imported_at) <= date(?)")
      params.push(payload.dateTo)
    }

    const sql = `
      SELECT
        ei.id,
        ei.file_path,
        ei.filename,
        ei.asset_id,
        a.name AS asset_name,
        ei.row_count,
        ei.saved_count,
        ei.imported_at
      FROM excel_imports ei
      LEFT JOIN assets a ON a.id = ei.asset_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ei.imported_at DESC, ei.id DESC
      LIMIT ? OFFSET ?
    `

    const items = db.prepare(sql).all(...params, limit, offset)
    const nextCheck = db.prepare(`
      SELECT 1
      FROM excel_imports ei
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ei.imported_at DESC, ei.id DESC
      LIMIT 1 OFFSET ?
    `).get(...params, offset + limit)

    return {
      items,
      hasMore: !!nextCheck,
    }
  })

  // 엑셀 파싱 (미리보기용)
  ipcMain.handle('excel:parse', async (_, { filePath, templateId, assetId }) => {
    const template = db.prepare('SELECT * FROM parser_templates WHERE id = ?').get(templateId)
    if (!template) throw new Error('템플릿을 찾을 수 없어요.')

    // 비밀번호 복호화
    let password = null
    if (template.password) {
      password = safeStorage.decryptString(Buffer.from(template.password, 'base64'))
    }

    // 워크북 로드
    const workbook = await loadWorkbook(filePath, password)

    // 파싱
    const rows = parseRows(workbook, template)

    // 자산 정보로 체크카드/신용카드 분류
    const allAssets = db.prepare(`
      SELECT a.*, ag.type as group_type
      FROM assets a
      LEFT JOIN asset_groups ag ON a.asset_group_id = ag.id
    `).all()

    const allRules = db.prepare('SELECT * FROM asset_match_rules ORDER BY sort_order, id').all()
    const assetsWithRules = allAssets.map(a => ({
      ...a,
      match_rules: allRules.filter(r => r.asset_id === a.id)
    }))

    const rules = db.prepare(`
      SELECT kr.*, c.name as category_name, c.type as category_type, c.flow_policy as category_flow_policy, p.name as parent_name
      FROM keyword_rules kr
      LEFT JOIN categories c ON kr.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      ORDER BY kr.priority ASC
    `).all()

    const cardPaymentCategoryId = getCardPaymentCategoryId()
    const classified = classifyRows(rows, assetsWithRules, cardPaymentCategoryId)
    const withCategories = applyKeywordRules(classified, rules)

    const asset = db.prepare(`
      SELECT a.*, ag.type as group_type
      FROM assets a
      LEFT JOIN asset_groups ag ON a.asset_group_id = ag.id
      WHERE a.id = ?
    `).get(assetId)

    // 기존 거래내역 존재 여부 확인
    const hasExistingTransactions = db.prepare(
      'SELECT COUNT(*) as cnt FROM transactions WHERE asset_id = ?'
    ).get(assetId).cnt > 0

    // start_balance 업데이트 제안 여부
    let suggestBalance = null
    if (asset?.group_type === '일반' && !hasExistingTransactions && classified.length > 0) {
      suggestBalance = true
    }

    const allCategories = db.prepare('SELECT * FROM categories').all()
    const categoryMap = new Map(allCategories.map(c => [c.id, c]))

    // 카테고리 정책과 거래 방향이 충돌하면 자동 매칭 해제
    const withPolicyValidatedCategory = withCategories.map(row => {
      if (!row.category_id) return row
      const cat = categoryMap.get(row.category_id)
      if (!cat) return { ...row, category_id: null, category_name: null, parent_name: null }
      if (cat.flow_policy === 'FIXED_IN' && row.direction !== 'INFLOW') {
        return { ...row, category_id: null, category_name: null, parent_name: null }
      }
      if (cat.flow_policy === 'FIXED_OUT' && row.direction !== 'OUTFLOW') {
        return { ...row, category_id: null, category_name: null, parent_name: null }
      }
      return row
    })

    // category_id가 있는 행에 카테고리 메타 enrichment
    const withCategoryNames = withPolicyValidatedCategory.map(row => {
      if (row.category_id) {
        const cat = categoryMap.get(row.category_id)
        const parent = cat?.parent_id ? categoryMap.get(cat.parent_id) : null
        return {
          ...row,
          category_name: row.category_name ?? cat?.name ?? null,
          parent_name: row.parent_name ?? parent?.name ?? null,
          category_type: row.category_type ?? cat?.type ?? null,
          category_flow_policy: row.category_flow_policy ?? cat?.flow_policy ?? null,
        }
      }
      return row
    })

    // 중복 체크 (이미 DB에 있는 거래 ID)
    const withIds = withCategoryNames.map(row => ({
      ...row,
      id: generateTransactionId(row.date, row.amount, assetId, row.balance, row.description, row.direction),
    }))

    const existingIds = new Set(
      db.prepare('SELECT id FROM transactions').all().map(r => r.id)
    )

    const withDuplicateFlag = withIds.map(row => ({
      ...row,
      isDuplicate: existingIds.has(row.id),
    }))

    return {
      rows: withDuplicateFlag,
      hasExistingTransactions,
      suggestBalance,
      totalCount: withDuplicateFlag.length,
      duplicateCount: withDuplicateFlag.filter(r => r.isDuplicate).length,
    }
  })

  // 최종 저장
  ipcMain.handle('excel:save', async (_, { rows, assetId, filePath, templateId }) => {
    const stat = fs.statSync(filePath)
    const fileBuffer = fs.readFileSync(filePath)
    const fileMeta = {
      filePath: dirname(filePath),
      filename: basename(filePath),
      fileId: Number.isFinite(stat.ino) ? stat.ino : null,
      lastModifiedAt: Number.isFinite(stat.mtimeMs) ? Math.floor(stat.mtimeMs) : null,
      contentHash: createHash('sha256').update(fileBuffer).digest('hex'),
    }

    const saveTransaction = db.transaction(() => {
      const importResult = db.prepare(`
        INSERT INTO excel_imports
          (file_path, filename, file_id, last_modified_at, content_hash, asset_id, template_id, row_count, saved_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileMeta.filePath,
        fileMeta.filename,
        fileMeta.fileId ?? null,
        fileMeta.lastModifiedAt ?? null,
        fileMeta.contentHash ?? null,
        assetId,
        templateId,
        rows.length,
        null,
      )

      const importId = importResult.lastInsertRowid

      const insert = db.prepare(`
        INSERT OR IGNORE INTO transactions
          (id, date, amount, direction, asset_id, balance, description, memo, category_id, import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let savedCount = 0
      for (const row of rows) {
        if (row.isDuplicate || !row.selected) continue
        if (row.category_id) {
          assertCategoryDirectionPolicy(db, row.category_id, row.direction)
        }
        const result = insert.run(
          row.id,
          row.date,
          Math.abs(row.amount),
          normalizeDirection(row.direction, signedDelta(row)),
          row.asset_id ?? assetId,
          row.balance ?? null,
          row.description,
          null,
          row.category_id ?? null,  // 키워드 매칭된 category_id 저장
          importId
        )
        if (result.changes > 0) savedCount++
      }

      db.prepare('UPDATE excel_imports SET saved_count = ? WHERE id = ?')
        .run(savedCount, importId)

      return { savedCount, importId }
    })

    return saveTransaction()
  })

  const SENSITIVE_KEYS = ['google_sheets'] // 암호화할 키 목록

  function readSettingValue(key) {
    const row = db.prepare('SELECT value, is_encrypted FROM settings WHERE key = ?').get(key)
    if (!row) return null

    const raw = row.is_encrypted
      ? safeStorage.decryptString(Buffer.from(row.value, 'base64'))
      : row.value

    return JSON.parse(raw)
  }

  ipcMain.handle('settings:get', (_, key) => {
    return readSettingValue(key)
  })

  ipcMain.handle('settings:set', (_, key, value) => {
    const isSensitive = SENSITIVE_KEYS.includes(key)
    let stored = JSON.stringify(value)

    if (isSensitive) {
      stored = safeStorage.encryptString(stored).toString('base64')
    }

    db.prepare(`
      INSERT INTO settings (key, value, is_encrypted)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_encrypted = excluded.is_encrypted
    `).run(key, stored, isSensitive ? 1 : 0)
  })

  ipcMain.handle('settings:delete', (_, key) => {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  })

  ipcMain.handle('fonts:getInstalled', async () => {
    try {
      const fonts = await fontList.getFonts({ disableQuoting: true })
      const normalized = Array.from(new Set(
        (Array.isArray(fonts) ? fonts : [])
          .map((font) => String(font ?? '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'ko', { sensitivity: 'base' }))
      return { fonts: normalized, error: null }
    } catch {
      return { fonts: [], error: '설치된 폰트 목록을 불러오지 못했어요. 시스템 기본만 사용할 수 있어요.' }
    }
  })

  ipcMain.handle('app:setThemeSource', (_, themeSource) => {
    nativeTheme.themeSource =
      themeSource === 'dark' ? 'dark' : themeSource === 'light' ? 'light' : 'system'
    return nativeTheme.themeSource
  })

  ipcMain.handle('google-sheets:selectServiceAccountFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null

    const filePath = result.filePaths[0]
    const fileName = basename(filePath)
    const jsonText = fs.readFileSync(filePath, 'utf8')
    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      throw new Error('서비스 계정 키 파일이 올바른 JSON 형식이 아니에요.')
    }

    if (!parsed?.client_email || !parsed?.private_key) {
      throw new Error('서비스 계정 키 파일에 필요한 정보(client_email, private_key)가 없어요.')
    }

    return {
      fileName,
      jsonString: jsonText,
      clientEmail: parsed.client_email,
    }
  })

  ipcMain.handle('google-sheets:testConnection', async (_, payload) => {
    const spreadsheetId = String(payload?.spreadsheet_id ?? '').trim()
    const serviceAccountJson = String(payload?.service_account_json ?? '').trim()
    if (!serviceAccountJson) {
      throw new Error('서비스 계정 키 파일을 먼저 선택해주세요.')
    }
    if (!spreadsheetId) {
      throw new Error('스프레드시트 ID를 입력해주세요.')
    }

    let credentials
    try {
      credentials = JSON.parse(serviceAccountJson)
    } catch {
      throw new Error('저장된 서비스 계정 키 정보가 올바르지 않아요. 다시 선택해주세요.')
    }

    if (!credentials?.client_email || !credentials?.private_key) {
      throw new Error('서비스 계정 키 정보에 필요한 값(client_email, private_key)이 없어요.')
    }

    try {
      const auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
      const sheets = google.sheets({ version: 'v4', auth })
      const res = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title',
      })
      return {
        ok: true,
        spreadsheetTitle: res.data?.properties?.title ?? '',
      }
    } catch (error) {
      const message = String(error?.message ?? '')
      if (message.includes('Requested entity was not found')) {
        throw new Error('스프레드시트 ID를 찾을 수 없어요. ID를 확인해주세요.')
      }
      if (message.includes('The caller does not have permission') || message.includes('PERMISSION_DENIED')) {
        throw new Error('권한이 없어요. 서비스 계정 이메일을 스프레드시트에 편집자로 공유해주세요.')
      }
      throw new Error(`연결 테스트에 실패했어요. ${message || '네트워크/인증 설정을 확인해주세요.'}`)
    }
  })

  ipcMain.handle('google-sheets:getSpreadsheetMeta', async (_, payload) => {
    const spreadsheetId = String(payload?.spreadsheet_id ?? '').trim()
    const serviceAccountJson = String(payload?.service_account_json ?? '').trim()
    if (!serviceAccountJson) {
      throw new Error('서비스 계정 키 파일을 먼저 선택해주세요.')
    }
    if (!spreadsheetId) {
      throw new Error('스프레드시트 ID를 입력해주세요.')
    }

    let credentials
    try {
      credentials = JSON.parse(serviceAccountJson)
    } catch {
      throw new Error('저장된 서비스 계정 키 정보가 올바르지 않아요. 다시 선택해주세요.')
    }

    if (!credentials?.client_email || !credentials?.private_key) {
      throw new Error('서비스 계정 키 정보에 필요한 값(client_email, private_key)이 없어요.')
    }

    try {
      const auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
      const sheets = google.sheets({ version: 'v4', auth })
      const res = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title,sheets.properties(sheetId,title,index)',
      })
      const sheetList = Array.isArray(res.data?.sheets)
        ? res.data.sheets.map((sheet) => ({
          sheetId: Number(sheet?.properties?.sheetId ?? 0),
          title: String(sheet?.properties?.title ?? ''),
          index: Number(sheet?.properties?.index ?? 0),
        }))
        : []
      return {
        ok: true,
        spreadsheetTitle: res.data?.properties?.title ?? '',
        sheets: sheetList,
        sheetNames: sheetList.map((sheet) => sheet.title),
      }
    } catch (error) {
      const message = String(error?.message ?? '')
      if (message.includes('Requested entity was not found')) {
        throw new Error('스프레드시트 ID를 찾을 수 없어요. ID를 확인해주세요.')
      }
      if (message.includes('The caller does not have permission') || message.includes('PERMISSION_DENIED')) {
        throw new Error('권한이 없어요. 서비스 계정 이메일을 스프레드시트에 편집자로 공유해주세요.')
      }
      throw new Error(`스프레드시트 정보를 불러오지 못했어요. ${message || '네트워크/인증 설정을 확인해주세요.'}`)
    }
  })

  function nowIso() {
    return new Date().toISOString()
  }

  function sheetA1Name(name) {
    return `'${String(name).replace(/'/g, "''")}'`
  }

  function colLetter(n) {
    let result = ''
    let x = Number(n)
    while (x > 0) {
      const mod = (x - 1) % 26
      result = String.fromCharCode(65 + mod) + result
      x = Math.floor((x - 1) / 26)
    }
    return result || 'A'
  }

  function normalizeCell(v) {
    if (v == null) return ''
    return String(v)
  }

  function arraysEqualAsCells(a = [], b = []) {
    const max = Math.max(a.length, b.length)
    for (let i = 0; i < max; i += 1) {
      if (normalizeCell(a[i]) !== normalizeCell(b[i])) return false
    }
    return true
  }

  function createGoogleSheetsClientFromConfig(config) {
    const spreadsheetId = String(config?.spreadsheet_id ?? '').trim()
    const serviceAccountJson = String(config?.service_account_json ?? '').trim()
    if (!serviceAccountJson) throw new Error('서비스 계정 키 파일을 먼저 설정해주세요.')
    if (!spreadsheetId) throw new Error('스프레드시트 ID를 먼저 설정해주세요.')
    let credentials
    try {
      credentials = JSON.parse(serviceAccountJson)
    } catch {
      throw new Error('저장된 서비스 계정 키 정보가 올바르지 않아요.')
    }
    if (!credentials?.client_email || !credentials?.private_key) {
      throw new Error('서비스 계정 키 정보에 필요한 값(client_email, private_key)이 없어요.')
    }
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    return { sheets, spreadsheetId }
  }

  async function fetchSpreadsheetMeta(sheets, spreadsheetId) {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'properties.title,sheets.properties(sheetId,title,index,gridProperties.rowCount,gridProperties.columnCount)',
    })
    const sheetList = Array.isArray(res.data?.sheets)
      ? res.data.sheets.map((sheet) => ({
        sheetId: Number(sheet?.properties?.sheetId ?? 0),
        title: String(sheet?.properties?.title ?? ''),
        index: Number(sheet?.properties?.index ?? 0),
        rowCount: Number(sheet?.properties?.gridProperties?.rowCount ?? 0),
        columnCount: Number(sheet?.properties?.gridProperties?.columnCount ?? 0),
      }))
      : []
    return {
      spreadsheetTitle: String(res.data?.properties?.title ?? ''),
      sheets: sheetList,
    }
  }

  async function ensureSheetWithHeader({ sheets, spreadsheetId, sheetName, header, autoCreateMissingSheets }) {
    let meta = await fetchSpreadsheetMeta(sheets, spreadsheetId)
    let sheet = meta.sheets.find((s) => s.title === sheetName) ?? null
    let created = false

    if (!sheet) {
      if (!autoCreateMissingSheets) {
        throw new Error(`시트 자동 생성이 꺼져 있고 "${sheetName}" 시트가 없어요.`)
      }
      const createdRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      })
      const added = createdRes.data?.replies?.[0]?.addSheet?.properties
      sheet = {
        sheetId: Number(added?.sheetId ?? 0),
        title: String(added?.title ?? sheetName),
      }
      created = true
    }

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetA1Name(sheetName)}!A1:${colLetter(header.length)}1`,
    })
    const existingHeader = Array.isArray(headerRes.data?.values?.[0]) ? headerRes.data.values[0] : []

    if (created) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetA1Name(sheetName)}!A1:${colLetter(header.length)}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [header] },
      })
    } else {
      const hasAnyHeaderValue = existingHeader.some((v) => normalizeCell(v) !== '')
      if (!hasAnyHeaderValue) {
        throw new Error(`기존 "${sheetName}" 시트의 헤더(1행)가 비어 있어요. 헤더를 확인해주세요.`)
      }
      if (!arraysEqualAsCells(existingHeader, header)) {
        throw new Error(`"${sheetName}" 시트의 헤더(1행)가 예상 형식과 달라요. 헤더를 확인해주세요.`)
      }
    }

    return {
      sheetId: sheet.sheetId,
      sheetName,
      created,
      spreadsheetTitle: meta.spreadsheetTitle,
    }
  }

  async function overwriteSheetRows({ sheets, spreadsheetId, sheetName, header, rows }) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetA1Name(sheetName)}!A2:${colLetter(header.length)}`,
    })
    if (!rows.length) return
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetA1Name(sheetName)}!A2:${colLetter(header.length)}`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    })
  }

  async function deleteSheetRowsByNumbers({ sheets, spreadsheetId, sheetName, rowNumbers }) {
    if (!Array.isArray(rowNumbers) || rowNumbers.length === 0) return 0
    const latestMeta = await fetchSpreadsheetMeta(sheets, spreadsheetId)
    const targetSheet = latestMeta.sheets.find((s) => s.title === sheetName)
    if (!targetSheet?.sheetId) return 0
    const sorted = [...rowNumbers].sort((a, b) => b - a)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: sorted.map((rowNumber) => ({
          deleteDimension: {
            range: {
              sheetId: targetSheet.sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        })),
      },
    })
    return sorted.length
  }

  function mapCategoryFlowDisplay(type, flowPolicy) {
    if (type === '이체') return '-'
    if (type === '수입') return flowPolicy === 'FIXED_OUT' ? '차감' : '일반'
    if (type === '지출') return flowPolicy === 'FIXED_IN' ? '차감' : '일반'
    return '-'
  }

  function mapDirectionDisplay(direction) {
    return direction === 'INFLOW' ? '입금' : '출금'
  }

  function buildCategoryRows() {
    const rows = db.prepare(`
      SELECT id, name, parent_id, type, flow_policy, sort_order
      FROM categories
      ORDER BY
        CASE type WHEN '수입' THEN 0 WHEN '지출' THEN 1 WHEN '이체' THEN 2 ELSE 99 END ASC,
        CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END ASC,
        sort_order ASC,
        id ASC
    `).all()

    const byId = new Map(rows.map((row) => [row.id, row]))
    const childrenByParent = new Map()
    for (const row of rows) {
      if (!row.parent_id) continue
      if (!childrenByParent.has(row.parent_id)) childrenByParent.set(row.parent_id, [])
      childrenByParent.get(row.parent_id).push(row)
    }
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
    }

    const topLevel = rows.filter((row) => !row.parent_id).sort((a, b) => {
      const typeOrder = (v) => (v === '수입' ? 0 : v === '지출' ? 1 : v === '이체' ? 2 : 99)
      return typeOrder(a.type) - typeOrder(b.type) || a.sort_order - b.sort_order || a.id - b.id
    })

    const out = []
    for (const parent of topLevel) {
      out.push([
        String(parent.id),
        String(parent.type ?? ''),
        String(parent.name ?? ''),
        '',
        mapCategoryFlowDisplay(parent.type, parent.flow_policy),
      ])
      const children = childrenByParent.get(parent.id) ?? []
      for (const child of children) {
        const actualParent = byId.get(child.parent_id) ?? parent
        out.push([
          String(child.id),
          String(child.type ?? ''),
          String(actualParent?.name ?? ''),
          String(child.name ?? ''),
          mapCategoryFlowDisplay(child.type, child.flow_policy),
        ])
      }
    }
    return out
  }

  function buildAssetGroupRows() {
    return db.prepare(`
      SELECT id, name, type
      FROM asset_groups
      ORDER BY sort_order ASC, id ASC
    `).all().map((row) => [String(row.id), String(row.name ?? ''), String(row.type ?? '')])
  }

  function buildAssetRows() {
    return db.prepare(`
      SELECT
        a.id,
        a.name,
        a.is_active,
        a.sort_order,
        ag.sort_order AS group_sort_order,
        ag.name AS group_name,
        linked.name AS linked_asset_name
      FROM assets a
      LEFT JOIN asset_groups ag ON ag.id = a.asset_group_id
      LEFT JOIN assets linked ON linked.id = a.linked_asset_id
      ORDER BY
        CASE WHEN ag.sort_order IS NULL THEN 1 ELSE 0 END ASC,
        ag.sort_order ASC,
        a.sort_order ASC,
        a.id ASC
    `).all().map((row) => [
      String(row.id),
      String(row.group_name ?? ''),
      String(row.name ?? ''),
      String(row.linked_asset_name ?? ''),
      Number(row.is_active) ? 'TRUE' : 'FALSE',
    ])
  }

  function buildAllTransactionRows() {
    return db.prepare(`
      SELECT
        t.id,
        t.date,
        t.direction,
        t.amount,
        t.description,
        t.memo,
        a.name AS asset_name,
        c.name AS category_name,
        c.type AS category_type,
        c.parent_id AS category_parent_id,
        p.name AS parent_category_name
      FROM transactions t
      LEFT JOIN assets a ON a.id = t.asset_id
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN categories p ON p.id = c.parent_id
      ORDER BY t.date ASC, t.created_at ASC, t.id ASC
    `).all().map((row) => {
      const isSub = !!row.category_parent_id
      return {
        id: String(row.id),
        values: [
          String(row.id),
          String(row.date ?? ''),
          mapDirectionDisplay(row.direction),
          String(row.category_type ?? ''),
          isSub ? String(row.parent_category_name ?? '') : String(row.category_name ?? ''),
          isSub ? String(row.category_name ?? '') : '',
          String(row.description ?? ''),
          String(row.asset_name ?? ''),
          Number(row.amount ?? 0),
          String(row.memo ?? ''),
        ],
      }
    })
  }

  function buildUnsyncedTransactionRows(maxLogId = null) {
    return db.prepare(`
      WITH pending_tx AS (
        SELECT DISTINCT scl.entity_id AS transaction_id
        FROM sync_change_log scl
        WHERE scl.entity_type = 'transactions'
          AND scl.processed_at IS NULL
          AND (? IS NULL OR scl.id <= ?)
      )
      SELECT
        t.id,
        t.date,
        t.direction,
        t.amount,
        t.description,
        t.memo,
        a.name AS asset_name,
        c.name AS category_name,
        c.type AS category_type,
        c.parent_id AS category_parent_id,
        p.name AS parent_category_name
      FROM transactions t
      LEFT JOIN assets a ON a.id = t.asset_id
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN categories p ON p.id = c.parent_id
      INNER JOIN pending_tx pt ON pt.transaction_id = CAST(t.id AS TEXT)
      ORDER BY t.date ASC, t.created_at ASC, t.id ASC
    `).all(maxLogId, maxLogId).map((row) => {
      const isSub = !!row.category_parent_id
      return {
        id: String(row.id),
        values: [
          String(row.id),
          String(row.date ?? ''),
          mapDirectionDisplay(row.direction),
          String(row.category_type ?? ''),
          isSub ? String(row.parent_category_name ?? '') : String(row.category_name ?? ''),
          isSub ? String(row.category_name ?? '') : '',
          String(row.description ?? ''),
          String(row.asset_name ?? ''),
          Number(row.amount ?? 0),
          String(row.memo ?? ''),
        ],
      }
    })
  }

  function markEntityChangesProcessed(entityType, runId = null, maxLogId = null) {
    const ts = nowIso()
    db.prepare(`
      UPDATE sync_change_log
      SET processed_at = ?, run_id = COALESCE(?, run_id)
      WHERE entity_type = ?
        AND processed_at IS NULL
        AND (? IS NULL OR id <= ?)
    `).run(ts, runId, entityType, maxLogId, maxLogId)
  }

  function getPendingSyncCounts() {
    const row = db.prepare(`
      SELECT
        COALESCE((
          SELECT COUNT(*)
          FROM (
            SELECT DISTINCT scl.entity_id
            FROM sync_change_log scl
            INNER JOIN transactions t ON CAST(t.id AS TEXT) = scl.entity_id
            WHERE scl.entity_type = 'transactions'
              AND scl.processed_at IS NULL
          )
        ), 0) AS transactions_pending_existing,
        COALESCE((
          SELECT COUNT(*)
          FROM (
            SELECT DISTINCT scl.entity_id
            FROM sync_change_log scl
            LEFT JOIN transactions t ON CAST(t.id AS TEXT) = scl.entity_id
            WHERE scl.entity_type = 'transactions'
              AND scl.processed_at IS NULL
              AND t.id IS NULL
          )
        ), 0) AS transactions_pending_deleted,
        COALESCE((
          SELECT COUNT(*)
          FROM (SELECT DISTINCT entity_id FROM sync_change_log WHERE entity_type = 'categories' AND processed_at IS NULL)
        ), 0) AS categories_pending,
        COALESCE((
          SELECT COUNT(*)
          FROM (SELECT DISTINCT entity_id FROM sync_change_log WHERE entity_type = 'asset_groups' AND processed_at IS NULL)
        ), 0) AS asset_groups_pending,
        COALESCE((
          SELECT COUNT(*)
          FROM (SELECT DISTINCT entity_id FROM sync_change_log WHERE entity_type = 'assets' AND processed_at IS NULL)
        ), 0) AS assets_pending
    `).get() ?? {}

    const transactionsPending = Number(row.transactions_pending_existing ?? 0) + Number(row.transactions_pending_deleted ?? 0)
    const categoriesPending = Number(row.categories_pending ?? 0)
    const assetGroupsPending = Number(row.asset_groups_pending ?? 0)
    const assetsPending = Number(row.assets_pending ?? 0)
    return {
      transactionsPendingExisting: Number(row.transactions_pending_existing ?? 0),
      transactionsPendingDeleted: Number(row.transactions_pending_deleted ?? 0),
      transactionsPending,
      categoriesPending,
      assetGroupsPending,
      assetsPending,
      syncPendingTotal: transactionsPending + categoriesPending + assetGroupsPending + assetsPending,
    }
  }

  function setActiveSyncRunState(patch) {
    if (!activeSyncRunState) {
      activeSyncRunState = { visible: true }
    }
    activeSyncRunState = { ...activeSyncRunState, ...patch }
  }

  function updateActiveSyncItem(entityType, patch) {
    if (!activeSyncRunState?.items) return
    activeSyncRunState = {
      ...activeSyncRunState,
      items: activeSyncRunState.items.map((item) => (item.entityType === entityType ? { ...item, ...patch } : item)),
    }
    const doneStatuses = new Set(['success', 'failed', 'skipped'])
    const doneCount = activeSyncRunState.items.filter((item) => doneStatuses.has(item.status)).length
    const total = activeSyncRunState.items.length || 1
    activeSyncRunState.progress = Math.round((doneCount / total) * 100)
    activeSyncRunState.summary = activeSyncRunState.items.reduce((acc, item) => ({
      inserted: acc.inserted + Number(item.inserted || 0),
      updated: acc.updated + Number(item.updated || 0),
      skipped: acc.skipped + Number(item.skipped || 0),
      deleted: acc.deleted + Number(item.deleted || 0),
      failed: acc.failed + Number(item.failed || 0),
    }), { inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0 })
  }

  function pushActiveSyncLog(message) {
    if (!activeSyncRunState) return
    const nextLogs = [...(activeSyncRunState.logs ?? []), { at: nowIso(), message }].slice(-100)
    activeSyncRunState = { ...activeSyncRunState, logs: nextLogs }
  }

  function createRunAndItemsRecord(db, payload) {
    const runInsert = db.prepare(`
      INSERT INTO sync_runs (
        provider, status, spreadsheet_id,
        transactions_sheet_name, categories_sheet_name, asset_groups_sheet_name, assets_sheet_name
      )
      VALUES ('google_sheets', 'running', ?, ?, ?, ?, ?)
    `)
    const runResult = runInsert.run(
      payload.spreadsheetId,
      payload.sheetNames.transactions,
      payload.sheetNames.categories,
      payload.sheetNames.asset_groups,
      payload.sheetNames.assets
    )
    const runId = Number(runResult.lastInsertRowid)
    const itemInsert = db.prepare(`
      INSERT INTO sync_run_items (run_id, entity_type, sheet_name, status)
      VALUES (?, ?, ?, 'waiting')
    `)
    const itemIds = {
      categories: Number(itemInsert.run(runId, 'categories', payload.sheetNames.categories).lastInsertRowid),
      asset_groups: Number(itemInsert.run(runId, 'asset_groups', payload.sheetNames.asset_groups).lastInsertRowid),
      assets: Number(itemInsert.run(runId, 'assets', payload.sheetNames.assets).lastInsertRowid),
      transactions: Number(itemInsert.run(runId, 'transactions', payload.sheetNames.transactions).lastInsertRowid),
    }
    return { runId, itemIds }
  }

  function updateRunItemRecord(itemId, patch = {}) {
    const current = db.prepare('SELECT * FROM sync_run_items WHERE id = ?').get(itemId)
    if (!current) return
    db.prepare(`
      UPDATE sync_run_items
      SET
        finished_at = COALESCE(?, finished_at),
        status = COALESCE(?, status),
        rows_total = COALESCE(?, rows_total),
        rows_inserted = COALESCE(?, rows_inserted),
        rows_updated = COALESCE(?, rows_updated),
        rows_skipped = COALESCE(?, rows_skipped),
        rows_deleted = COALESCE(?, rows_deleted),
        rows_failed = COALESCE(?, rows_failed),
        error_message = CASE WHEN ? IS NULL THEN error_message ELSE ? END,
        details_json = CASE WHEN ? IS NULL THEN details_json ELSE ? END
      WHERE id = ?
    `).run(
      patch.finishedAt ?? null,
      patch.status ?? null,
      patch.rowsTotal ?? null,
      patch.rowsInserted ?? null,
      patch.rowsUpdated ?? null,
      patch.rowsSkipped ?? null,
      patch.rowsDeleted ?? null,
      patch.rowsFailed ?? null,
      patch.errorMessage === undefined ? null : patch.errorMessage,
      patch.errorMessage === undefined ? null : patch.errorMessage,
      patch.detailsJson === undefined ? null : JSON.stringify(patch.detailsJson),
      patch.detailsJson === undefined ? null : JSON.stringify(patch.detailsJson),
      itemId
    )
  }

  function markRunTotalsAndStatus(runId, status, errorMessage = null) {
    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(rows_inserted), 0) AS inserted,
        COALESCE(SUM(rows_updated), 0) AS updated,
        COALESCE(SUM(rows_skipped), 0) AS skipped,
        COALESCE(SUM(rows_deleted), 0) AS deleted,
        COALESCE(SUM(rows_failed), 0) AS failed
      FROM sync_run_items
      WHERE run_id = ?
    `).get(runId) ?? { inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0 }
    db.prepare(`
      UPDATE sync_runs
      SET
        finished_at = datetime('now'),
        status = ?,
        total_inserted = ?,
        total_updated = ?,
        total_skipped = ?,
        total_deleted = ?,
        total_failed = ?,
        error_message = ?
      WHERE id = ?
    `).run(
      status,
      Number(totals.inserted ?? 0),
      Number(totals.updated ?? 0),
      Number(totals.skipped ?? 0),
      Number(totals.deleted ?? 0),
      Number(totals.failed ?? 0),
      errorMessage,
      runId
    )
  }

  async function runEntityOverwrite({ entityType, itemId, sheetsClient, spreadsheetId, sheetName, header, rows, autoCreateMissingSheets, changeLogCutoffId = null }) {
    updateRunItemRecord(itemId, { status: 'running' })
    updateActiveSyncItem(entityType, { status: 'running' })
    pushActiveSyncLog(`${entityLabelForLog(entityType)} 시트 확인 중...`)

    const ensured = await ensureSheetWithHeader({
      sheets: sheetsClient,
      spreadsheetId,
      sheetName,
      header,
      autoCreateMissingSheets,
    })
    if (ensured.created) {
      pushActiveSyncLog(`${entityLabelForLog(entityType)} 시트를 새로 생성했어요.`)
    }
    await overwriteSheetRows({
      sheets: sheetsClient,
      spreadsheetId,
      sheetName,
      header,
      rows,
    })
    updateRunItemRecord(itemId, {
      status: 'success',
      finishedAt: nowIso(),
      rowsTotal: rows.length,
      rowsInserted: rows.length,
      rowsUpdated: 0,
      rowsSkipped: 0,
      rowsDeleted: 0,
      rowsFailed: 0,
      detailsJson: { overwrite: true },
    })
    markEntityChangesProcessed(entityType, activeSyncRunState?.runId ?? null, changeLogCutoffId)
    updateActiveSyncItem(entityType, {
      status: 'success',
      sheetName,
      inserted: rows.length,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 0,
    })
    pushActiveSyncLog(`${entityLabelForLog(entityType)} 동기화 완료`)
  }

  async function runEntityUpsert({
    entityType,
    itemId,
    sheetsClient,
    spreadsheetId,
    sheetName,
    header,
    rows,
    autoCreateMissingSheets,
    deleteMissing = true,
    changeLogCutoffId = null,
  }) {
    updateRunItemRecord(itemId, { status: 'running' })
    updateActiveSyncItem(entityType, { status: 'running' })
    pushActiveSyncLog(`${entityLabelForLog(entityType)} 시트 확인 중...`)

    const ensured = await ensureSheetWithHeader({
      sheets: sheetsClient,
      spreadsheetId,
      sheetName,
      header,
      autoCreateMissingSheets,
    })
    if (ensured.created) {
      pushActiveSyncLog(`${entityLabelForLog(entityType)} 시트를 새로 생성했어요.`)
    }

    const dataRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetA1Name(sheetName)}!A2:${colLetter(header.length)}`,
    })
    const sheetRows = Array.isArray(dataRes.data?.values) ? dataRes.data.values : []
    const existingById = new Map()
    sheetRows.forEach((row, idx) => {
      const id = normalizeCell(row?.[0])
      if (!id) return
      existingById.set(id, { rowNumber: idx + 2, values: row })
    })

    const localById = new Map()
    const inserts = []
    const updates = []
    let skipped = 0

    for (const rowValues of rows) {
      const id = normalizeCell(rowValues?.[0])
      if (!id) continue
      localById.set(id, rowValues)
      const existing = existingById.get(id)
      if (!existing) {
        inserts.push(rowValues)
        continue
      }
      if (arraysEqualAsCells(existing.values, rowValues)) {
        skipped += 1
        continue
      }
      updates.push({ rowNumber: existing.rowNumber, values: rowValues })
    }

    if (updates.length) {
      await sheetsClient.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates.map((u) => ({
            range: `${sheetA1Name(sheetName)}!A${u.rowNumber}:${colLetter(header.length)}${u.rowNumber}`,
            values: [u.values],
          })),
        },
      })
    }

    if (inserts.length) {
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetA1Name(sheetName)}!A:${colLetter(header.length)}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: inserts },
      })
    }

    let deletedCount = 0
    if (deleteMissing) {
      const rowsToDelete = []
      for (const [id, meta] of existingById.entries()) {
        if (!localById.has(id)) rowsToDelete.push(meta.rowNumber)
      }
      deletedCount = await deleteSheetRowsByNumbers({
        sheets: sheetsClient,
        spreadsheetId,
        sheetName,
        rowNumbers: rowsToDelete,
      })
    }

    updateRunItemRecord(itemId, {
      status: 'success',
      finishedAt: nowIso(),
      rowsTotal: rows.length,
      rowsInserted: inserts.length,
      rowsUpdated: updates.length,
      rowsSkipped: skipped,
      rowsDeleted: deletedCount,
      rowsFailed: 0,
      detailsJson: { upsert: true, deleteMissing },
    })
    markEntityChangesProcessed(entityType, activeSyncRunState?.runId ?? null, changeLogCutoffId)
    updateActiveSyncItem(entityType, {
      status: 'success',
      sheetName,
      inserted: inserts.length,
      updated: updates.length,
      skipped,
      deleted: deletedCount,
      failed: 0,
    })
    pushActiveSyncLog(
      `${entityLabelForLog(entityType)} 동기화 완료 (추가 ${inserts.length}, 수정 ${updates.length}, 삭제 ${deletedCount})`
    )
  }

  function entityLabelForLog(entityType) {
    if (entityType === 'categories') return '카테고리'
    if (entityType === 'asset_groups') return '자산 그룹'
    if (entityType === 'assets') return '자산'
    if (entityType === 'transactions') return '거래 내역'
    return entityType
  }

  async function runTransactionsSync({
    itemId,
    sheetsClient,
    spreadsheetId,
    sheetName,
    autoCreateMissingSheets,
    deleteMissing = true,
    changeLogCutoffId = null,
  }) {
    const entityType = 'transactions'
    const header = ['ID', '날짜', '구분', '카테고리(유형)', '카테고리(대)', '카테고리(소)', '적요', '결제 수단', '금액', '메모']
    updateRunItemRecord(itemId, { status: 'running' })
    updateActiveSyncItem(entityType, { status: 'running' })
    pushActiveSyncLog('거래 내역 시트 확인 중...')

    const ensured = await ensureSheetWithHeader({
      sheets: sheetsClient,
      spreadsheetId,
      sheetName,
      header,
      autoCreateMissingSheets,
    })
    if (ensured.created) pushActiveSyncLog('거래 내역 시트를 새로 생성했어요.')

    const dataRes = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetA1Name(sheetName)}!A2:${colLetter(header.length)}`,
    })
    const sheetRows = Array.isArray(dataRes.data?.values) ? dataRes.data.values : []
    const existingById = new Map()
    sheetRows.forEach((row, idx) => {
      const id = normalizeCell(row?.[0])
      if (!id) return
      existingById.set(id, { rowNumber: idx + 2, values: row })
    })

    const unsyncedRows = buildUnsyncedTransactionRows(changeLogCutoffId)
    const allRows = buildAllTransactionRows()
    const localAllIdSet = new Set(allRows.map((row) => row.id))

    const updates = []
    const inserts = []
    let skipped = 0

    for (const row of unsyncedRows) {
      const existing = existingById.get(row.id)
      if (!existing) {
        inserts.push(row.values)
        continue
      }
      if (arraysEqualAsCells(existing.values, row.values)) {
        skipped += 1
        continue
      }
      updates.push({ rowNumber: existing.rowNumber, values: row.values })
    }

    if (updates.length) {
      await sheetsClient.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates.map((u) => ({
            range: `${sheetA1Name(sheetName)}!A${u.rowNumber}:${colLetter(header.length)}${u.rowNumber}`,
            values: [u.values],
          })),
        },
      })
    }

    if (inserts.length) {
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetA1Name(sheetName)}!A:${colLetter(header.length)}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: inserts },
      })
    }

    let deletedCount = 0
    if (deleteMissing) {
      const rowsToDelete = []
      for (const [id, meta] of existingById.entries()) {
        if (!localAllIdSet.has(id)) rowsToDelete.push(meta.rowNumber)
      }
      rowsToDelete.sort((a, b) => b - a)
      if (rowsToDelete.length) {
        deletedCount = await deleteSheetRowsByNumbers({
          sheets: sheetsClient,
          spreadsheetId,
          sheetName,
          rowNumbers: rowsToDelete,
        })
      }
    }

    markEntityChangesProcessed(entityType, activeSyncRunState?.runId ?? null, changeLogCutoffId)

    const rowsUpdated = updates.length
    const rowsInserted = inserts.length
    const rowsSkipped = skipped
    updateRunItemRecord(itemId, {
      status: 'success',
      finishedAt: nowIso(),
      rowsTotal: unsyncedRows.length,
      rowsInserted,
      rowsUpdated,
      rowsSkipped,
      rowsDeleted: deletedCount,
      rowsFailed: 0,
      detailsJson: { deleteMissing, deletedRows: deletedCount },
    })
    updateActiveSyncItem(entityType, {
      status: 'success',
      sheetName,
      inserted: rowsInserted,
      updated: rowsUpdated,
      skipped: rowsSkipped,
      deleted: deletedCount,
      failed: 0,
    })
    pushActiveSyncLog(`거래 내역 동기화 완료 (추가 ${rowsInserted}, 수정 ${rowsUpdated}, 삭제 ${deletedCount})`)
  }

  async function executeSyncRunJob(runContext) {
    const { runId, itemIds, config, spreadsheetId, sheetsClient } = runContext
    try {
      await runEntityUpsert({
        entityType: 'categories',
        itemId: itemIds.categories,
        sheetsClient,
        spreadsheetId,
        sheetName: config.sheetNames.categories,
        header: ['ID', '유형', '대분류', '소분류', '구분'],
        rows: buildCategoryRows(),
        autoCreateMissingSheets: config.autoCreateMissingSheets,
        changeLogCutoffId: config.changeLogCutoffId ?? null,
      })

      await runEntityUpsert({
        entityType: 'asset_groups',
        itemId: itemIds.asset_groups,
        sheetsClient,
        spreadsheetId,
        sheetName: config.sheetNames.asset_groups,
        header: ['ID', '그룹명', '유형'],
        rows: buildAssetGroupRows(),
        autoCreateMissingSheets: config.autoCreateMissingSheets,
        changeLogCutoffId: config.changeLogCutoffId ?? null,
      })

      await runEntityUpsert({
        entityType: 'assets',
        itemId: itemIds.assets,
        sheetsClient,
        spreadsheetId,
        sheetName: config.sheetNames.assets,
        header: ['ID', '그룹', '이름', '결제 계좌', '사용 여부'],
        rows: buildAssetRows(),
        autoCreateMissingSheets: config.autoCreateMissingSheets,
        changeLogCutoffId: config.changeLogCutoffId ?? null,
      })

      await runTransactionsSync({
        itemId: itemIds.transactions,
        sheetsClient,
        spreadsheetId,
        sheetName: config.sheetNames.transactions,
        autoCreateMissingSheets: config.autoCreateMissingSheets,
        deleteMissing: config.deleteMissingTransactions !== false,
        changeLogCutoffId: config.changeLogCutoffId ?? null,
      })

      markRunTotalsAndStatus(runId, 'success', null)
      setActiveSyncRunState({
        status: 'success',
        finishedAt: nowIso(),
      })
      pushActiveSyncLog('동기화 작업이 완료되었어요.')
    } catch (error) {
      const message = String(error?.message ?? '동기화 실행 중 오류가 발생했어요.')
      pushActiveSyncLog(`오류: ${message}`)
      const currentItems = db.prepare('SELECT id, entity_type, status FROM sync_run_items WHERE run_id = ? ORDER BY id ASC').all(runId)
      for (const item of currentItems) {
        if (item.status === 'running') {
          updateRunItemRecord(item.id, {
            status: 'failed',
            finishedAt: nowIso(),
            rowsFailed: 1,
            errorMessage: message,
          })
          updateActiveSyncItem(item.entity_type, { status: 'failed', failed: 1, error: message })
        } else if (item.status === 'waiting') {
          updateRunItemRecord(item.id, { status: 'skipped', finishedAt: nowIso() })
          updateActiveSyncItem(item.entity_type, { status: 'skipped' })
        }
      }
      markRunTotalsAndStatus(runId, 'failed', message)
      setActiveSyncRunState({
        status: 'failed',
        finishedAt: nowIso(),
        error: message,
      })
    }
  }

  ipcMain.handle('sync:getActiveRun', () => {
    return activeSyncRunState ?? null
  })

  ipcMain.handle('sync:startRun', async (_, payload = {}) => {
    if (activeSyncRunState?.status === 'running') {
      throw new Error('이미 진행 중인 동기화 작업이 있어요.')
    }

    const googleSheetsConfig = readSettingValue('google_sheets')
    const { sheets: sheetsClient, spreadsheetId } = createGoogleSheetsClientFromConfig(googleSheetsConfig)

    const sheetNames = {
      categories: String(payload?.sheetNames?.categories ?? googleSheetsConfig?.sheet_names?.categories ?? '카테고리').trim(),
      asset_groups: String(payload?.sheetNames?.asset_groups ?? googleSheetsConfig?.sheet_names?.asset_groups ?? '자산 그룹').trim(),
      assets: String(payload?.sheetNames?.assets ?? googleSheetsConfig?.sheet_names?.assets ?? '자산').trim(),
      transactions: String(payload?.sheetNames?.transactions ?? googleSheetsConfig?.sheet_names?.transactions ?? '거래 내역').trim(),
    }

    for (const [key, value] of Object.entries(sheetNames)) {
      if (!value) throw new Error(`${key} 시트명이 비어 있어요.`)
    }
    const unique = new Set(Object.values(sheetNames))
    if (unique.size !== Object.values(sheetNames).length) {
      throw new Error('시트명이 중복되어 동기화를 시작할 수 없어요.')
    }
    const uncategorizedCount = Number(db.prepare('SELECT COUNT(*) AS cnt FROM transactions WHERE category_id IS NULL').get()?.cnt ?? 0)
    if (uncategorizedCount > 0) {
      throw new Error(`미지정 카테고리 거래가 ${uncategorizedCount}건 있어 동기화를 시작할 수 없어요.`)
    }
    const pendingCounts = getPendingSyncCounts()
    if (pendingCounts.syncPendingTotal <= 0) {
      throw new Error('동기화할 변경 내역이 없어요.')
    }

    const meta = await fetchSpreadsheetMeta(sheetsClient, spreadsheetId)
    if (payload?.autoCreateMissingSheets === false) {
      const existing = new Set(meta.sheets.map((s) => s.title))
      const missing = [
        ['카테고리', sheetNames.categories],
        ['자산 그룹', sheetNames.asset_groups],
        ['자산', sheetNames.assets],
        ['거래 내역', sheetNames.transactions],
      ].filter(([, name]) => !existing.has(name)).map(([label]) => label)
      if (missing.length) {
        throw new Error(`시트 자동 생성이 꺼져 있어요. 다음 시트가 없어 동기화를 시작할 수 없어요: ${missing.join(', ')}`)
      }
    }

    const changeLogCutoffId = Number(db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM sync_change_log').get()?.id ?? 0)

    const { runId, itemIds } = createRunAndItemsRecord(db, {
      spreadsheetId,
      sheetNames,
    })

    activeSyncRunState = {
      runId,
      status: 'running',
      progress: 0,
      startedAt: nowIso(),
      finishedAt: null,
      summary: { inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0 },
      logs: [{ at: nowIso(), message: '동기화 실행을 시작했어요.' }],
      items: [
        { entityType: 'categories', status: 'waiting', sheetName: sheetNames.categories, inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
        { entityType: 'asset_groups', status: 'waiting', sheetName: sheetNames.asset_groups, inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
        { entityType: 'assets', status: 'waiting', sheetName: sheetNames.assets, inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
        { entityType: 'transactions', status: 'waiting', sheetName: sheetNames.transactions, inserted: 0, updated: 0, skipped: 0, deleted: 0, failed: 0, error: '' },
      ],
      config: {
        autoCreateMissingSheets: payload?.autoCreateMissingSheets !== false,
        deleteMissingTransactions: payload?.deleteMissingTransactions !== false,
        changeLogCutoffId,
      },
    }

    void executeSyncRunJob({
      runId,
      itemIds,
      spreadsheetId,
      sheetsClient,
      config: {
        sheetNames,
        autoCreateMissingSheets: payload?.autoCreateMissingSheets !== false,
        deleteMissingTransactions: payload?.deleteMissingTransactions !== false,
        changeLogCutoffId,
      },
    })

    return { ok: true, runId }
  })

  ipcMain.handle('sync:getOverview', () => {
    const googleSheets = readSettingValue('google_sheets')
    const rawSheetNames = (googleSheets && typeof googleSheets === 'object' && googleSheets.sheet_names && typeof googleSheets.sheet_names === 'object')
      ? googleSheets.sheet_names
      : {}

    const latestRun = db.prepare(`
      SELECT
        sr.id,
        sr.provider,
        sr.started_at,
        sr.finished_at,
        sr.status,
        sr.spreadsheet_id,
        sr.transactions_sheet_name,
        sr.categories_sheet_name,
        sr.asset_groups_sheet_name,
        sr.assets_sheet_name,
        sr.total_inserted,
        sr.total_updated,
        sr.total_skipped,
        sr.total_deleted,
        sr.total_failed,
        sr.error_message
      FROM sync_runs sr
      ORDER BY COALESCE(sr.finished_at, sr.started_at) DESC, sr.id DESC
      LIMIT 1
    `).get() ?? null

    const latestRunItems = latestRun
      ? db.prepare(`
        SELECT
          id,
          run_id,
          entity_type,
          sheet_name,
          started_at,
          finished_at,
          status,
          rows_total,
          rows_inserted,
          rows_updated,
          rows_skipped,
          rows_deleted,
          rows_failed,
          error_message,
          details_json
        FROM sync_run_items
        WHERE run_id = ?
        ORDER BY id ASC
      `).all(latestRun.id)
      : []

    const pendingCounts = getPendingSyncCounts()
    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM categories) AS categoriesTotal,
        (SELECT COUNT(*) FROM asset_groups) AS assetGroupsTotal,
        (SELECT COUNT(*) FROM assets) AS assetsTotal,
        (SELECT COUNT(*) FROM transactions) AS transactionsTotal
    `).get() ?? { transactionsTotal: 0 }

    const serviceAccountEmail = String(googleSheets?.service_account_email ?? '').trim()
    const spreadsheetId = String(googleSheets?.spreadsheet_id ?? '').trim()
    const serviceAccountJson = String(googleSheets?.service_account_json ?? '').trim()

    return {
      settingsSummary: {
        provider: 'google_sheets',
        authType: String(googleSheets?.auth_type ?? 'service_account'),
        configured: Boolean(serviceAccountJson && spreadsheetId),
        hasServiceAccountKey: Boolean(serviceAccountJson),
        hasSpreadsheetId: Boolean(spreadsheetId),
        serviceAccountEmail,
        spreadsheetId,
        sheetNames: {
          categories: String(rawSheetNames.categories ?? '').trim(),
          asset_groups: String(rawSheetNames.asset_groups ?? '').trim(),
          assets: String(rawSheetNames.assets ?? '').trim(),
          transactions: String(rawSheetNames.transactions ?? '').trim(),
        },
      },
      latestRun,
      latestRunItems,
      counts: {
        transactionsUnsynced: Number(pendingCounts.transactionsPendingExisting ?? 0),
        transactionsPendingDeleted: Number(pendingCounts.transactionsPendingDeleted ?? 0),
        categoriesPending: Number(pendingCounts.categoriesPending ?? 0),
        assetGroupsPending: Number(pendingCounts.assetGroupsPending ?? 0),
        assetsPending: Number(pendingCounts.assetsPending ?? 0),
        syncPendingTotal: Number(pendingCounts.syncPendingTotal ?? 0),
        categoriesTotal: Number(counts.categoriesTotal ?? 0),
        assetGroupsTotal: Number(counts.assetGroupsTotal ?? 0),
        assetsTotal: Number(counts.assetsTotal ?? 0),
        transactionsTotal: Number(counts.transactionsTotal ?? 0),
      },
    }
  })

  ipcMain.handle('sync:getHistory', (_, payload = {}) => {
    const limit = Math.max(1, Math.min(100, Number(payload.limit) || 20))
    const offset = Math.max(0, Number(payload.offset) || 0)
    const where = []
    const params = []

    if (payload.status && ['running', 'success', 'partial', 'failed'].includes(payload.status)) {
      where.push('sr.status = ?')
      params.push(payload.status)
    }
    if (payload.dateFrom) {
      where.push("date(COALESCE(sr.finished_at, sr.started_at)) >= date(?)")
      params.push(payload.dateFrom)
    }
    if (payload.dateTo) {
      where.push("date(COALESCE(sr.finished_at, sr.started_at)) <= date(?)")
      params.push(payload.dateTo)
    }
    if (payload.q && String(payload.q).trim()) {
      const q = `%${String(payload.q).trim()}%`
      where.push(`(
        COALESCE(sr.spreadsheet_id, '') LIKE ?
        OR COALESCE(sr.error_message, '') LIKE ?
        OR EXISTS (
          SELECT 1 FROM sync_run_items sri
          WHERE sri.run_id = sr.id
            AND (
              COALESCE(sri.sheet_name, '') LIKE ?
              OR COALESCE(sri.error_message, '') LIKE ?
            )
        )
      )`)
      params.push(q, q, q, q)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const runs = db.prepare(`
      SELECT
        sr.id,
        sr.provider,
        sr.started_at,
        sr.finished_at,
        sr.status,
        sr.spreadsheet_id,
        sr.transactions_sheet_name,
        sr.categories_sheet_name,
        sr.asset_groups_sheet_name,
        sr.assets_sheet_name,
        sr.total_inserted,
        sr.total_updated,
        sr.total_skipped,
        sr.total_deleted,
        sr.total_failed,
        sr.error_message
      FROM sync_runs sr
      ${whereSql}
      ORDER BY COALESCE(sr.finished_at, sr.started_at) DESC, sr.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)

    const hasMore = !!db.prepare(`
      SELECT 1
      FROM sync_runs sr
      ${whereSql}
      ORDER BY COALESCE(sr.finished_at, sr.started_at) DESC, sr.id DESC
      LIMIT 1 OFFSET ?
    `).get(...params, offset + limit)

    const runIds = runs.map(r => r.id)
    let itemMap = {}
    if (runIds.length) {
      const placeholders = runIds.map(() => '?').join(', ')
      const items = db.prepare(`
        SELECT
          id,
          run_id,
          entity_type,
          sheet_name,
          started_at,
          finished_at,
          status,
          rows_total,
          rows_inserted,
          rows_updated,
          rows_skipped,
          rows_deleted,
          rows_failed,
          error_message,
          details_json
        FROM sync_run_items
        WHERE run_id IN (${placeholders})
        ORDER BY id ASC
      `).all(...runIds)
      itemMap = items.reduce((acc, item) => {
        if (!acc[item.run_id]) acc[item.run_id] = []
        acc[item.run_id].push(item)
        return acc
      }, {})
    }

    return {
      items: runs.map(run => ({ ...run, items: itemMap[run.id] ?? [] })),
      hasMore,
    }
  })

  // 폴더 선택 다이얼로그
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // 백업 내보내기
  ipcMain.handle('backup:export', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: `expense-tracker-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (result.canceled) return

    const targetPath = result.filePath
    const db = getDB()

    // VACUUM INTO fails if target file already exists on some SQLite builds.
    try {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)
    } catch {}

    const escaped = String(targetPath).replace(/'/g, "''")
    db.exec(`VACUUM INTO '${escaped}'`)
  })

  ipcMain.handle('backup:getResetPreview', () => {
    const db = getDB()
    const counts = {
      transactions: Number(db.prepare('SELECT COUNT(*) AS c FROM transactions').get()?.c ?? 0),
      categories: Number(db.prepare('SELECT COUNT(*) AS c FROM categories').get()?.c ?? 0),
      assets: Number(db.prepare('SELECT COUNT(*) AS c FROM assets').get()?.c ?? 0),
      assetGroups: Number(db.prepare('SELECT COUNT(*) AS c FROM asset_groups').get()?.c ?? 0),
      imports: Number(db.prepare('SELECT COUNT(*) AS c FROM excel_imports').get()?.c ?? 0),
      syncRuns: Number(db.prepare('SELECT COUNT(*) AS c FROM sync_runs').get()?.c ?? 0),
    }
    return { counts }
  })

  ipcMain.handle('backup:resetData', async (_, payload = {}) => {
    const mode = payload?.mode === 'full' ? 'full' : 'partial'
    const selections = {
      transactions: Boolean(payload?.selections?.transactions),
      imports: Boolean(payload?.selections?.imports),
      syncHistory: Boolean(payload?.selections?.syncHistory),
    }

    if (activeSyncRunState?.status === 'running') {
      throw new Error('동기화가 진행 중일 때는 초기화를 실행할 수 없어요.')
    }

    if (mode === 'partial' && !selections.transactions && !selections.imports && !selections.syncHistory) {
      throw new Error('부분 초기화할 항목을 선택해 주세요.')
    }

    if (mode === 'full') {
      const dbPath = join(app.getPath('userData'), 'expense-tracker.db')
      const walPath = `${dbPath}-wal`
      const shmPath = `${dbPath}-shm`

      closeDB()

      try { if (fs.existsSync(walPath)) fs.unlinkSync(walPath) } catch {}
      try { if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath) } catch {}
      try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath) } catch {}

      await dialog.showMessageBox({
        type: 'info',
        message: '초기화 완료',
        detail: '전체 초기화가 완료되어 앱을 재시작해요.',
        buttons: ['확인'],
      })

      app.relaunch()
      app.exit(0)
      return { ok: true, mode: 'full' }
    }

    const db = getDB()
    const run = db.transaction(() => {
      if (selections.transactions) {
        db.prepare('DELETE FROM transactions').run()
        db.prepare(`DELETE FROM sync_change_log WHERE entity_type = 'transactions'`).run()
      }

      if (selections.imports) {
        db.prepare('DELETE FROM excel_imports').run()
      }

      if (selections.syncHistory) {
        db.prepare('DELETE FROM sync_runs').run()
        activeSyncRunState = null
      }
    })
    run()

    return { ok: true, mode: 'partial' }
  })

  // 백업 복원
  ipcMain.handle('backup:import', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (result.canceled) return

    const dbPath = join(app.getPath('userData'), 'expense-tracker.db')
    const walPath = `${dbPath}-wal`
    const shmPath = `${dbPath}-shm`

    // Close active DB connection before replacing files.
    closeDB()

    // Remove WAL/SHM so the restored DB is not mixed with previous journal files.
    try { if (fs.existsSync(walPath)) fs.unlinkSync(walPath) } catch {}
    try { if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath) } catch {}

    fs.copyFileSync(result.filePaths[0], dbPath)

    await dialog.showMessageBox({
      type: 'info',
      message: '복원 완료',
      detail: '복원이 완료됐어요. 앱을 재시작할게요.',
      buttons: ['확인'],
    })

    app.relaunch()
    app.exit(0)
  })
}

function createWindow() {
  const win = new BrowserWindow({
    title: 'Expense tracker',
    width: 1440,
    height: 900,
    minWidth: 1440,
    minHeight: 900,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.removeMenu()

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('will-prevent-unload', (event) => {
    // Renderer blocks unload while sync is running. Ask whether to force-close and mark run failed.
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: '동기화가 진행 중입니다',
      message: '동기화가 진행 중입니다.',
      detail: '지금 종료하면 진행 중인 동기화가 실패 처리됩니다. 그래도 종료할까요?',
      buttons: ['취소', '그래도 종료'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (choice !== 1) {
      return
    }
    failActiveSyncRunIfRunning(SYNC_FAILURE_REASON.APP_CLOSED_BY_USER)
    event.preventDefault()
  })
}

function setupApplicationMenu() {
  if (process.platform === 'darwin') {
    const menu = Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [{ role: 'quit' }]
      }
    ])
    Menu.setApplicationMenu(menu)
  } else {
    Menu.setApplicationMenu(null)
  }
}
app.whenReady().then(() => {
  getDB()
  recoverInterruptedSyncRunsOnStartup()
  registerIpcHandlers()
  setupApplicationMenu()
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
