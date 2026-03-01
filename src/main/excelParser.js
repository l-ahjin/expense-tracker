import XLSX from 'xlsx'
import officeCrypto from 'officecrypto-tool'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

function signedDelta(row) {
  return row.direction === 'OUTFLOW' ? -Math.abs(row.amount ?? 0) : Math.abs(row.amount ?? 0)
}

// 비밀번호 해제 후 워크북 로드
export async function loadWorkbook(filePath, password) {
  let buffer = await require('fs').promises.readFile(filePath)

  let encrypted = false
  try {
    encrypted = officeCrypto.isEncrypted(buffer)
  } catch {
    encrypted = false
  }

  if (encrypted) {
    try {
      buffer = await officeCrypto.decrypt(buffer, { password })
    } catch {
      throw new Error('비밀번호가 올바르지 않아요.')
    }
  }

  const detected = detectSpreadsheetLikeFormat(buffer)

  // Some financial institutions export ".xls" files that are actually HTML tables.
  if (detected === 'html') {
    const workbookFromHtml = tryReadWorkbookFromHtml(buffer)
    if (workbookFromHtml) return workbookFromHtml
    throw new Error('엑셀 파일처럼 보이지만 실제로는 HTML 형식이에요. HTML 표 파싱에 실패했어요.')
  }

  try {
    return XLSX.read(buffer, { type: 'buffer', cellDates: true })
  } catch (e) {
    // Fallback: some malformed/exported files parse better as HTML text
    const workbookFromHtml = tryReadWorkbookFromHtml(buffer)
    if (workbookFromHtml) return workbookFromHtml
    throw new Error('파일을 읽을 수 없어요. 지원하지 않는 형식이거나 손상된 파일이에요.')
  }
}

// 템플릿 기반으로 엑셀 파싱
export function parseRows(workbook, template, options = {}) {
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  // col 필드를 인덱스로 변환
  const colDate = colToIndex(template.col_date)
  const colDesc = colToIndex(template.col_description)
  const colBalance = colToIndex(template.col_balance)
  const colType = colToIndex(template.col_type)
  const colAmount = colToIndex(template.col_amount)
  const colAmountIn = colToIndex(template.col_amount_in)
  const colAmountOut = colToIndex(template.col_amount_out)

  const ref = sheet['!ref'];
  if (ref) {
    // 현재 범위의 끝부분만 추출합니다.
    const parts = ref.split(':');
    const endCell = parts.length > 1 ? parts[1] : parts[0];

    // 시작점을 강제로 'A1'으로 고정하여 다시 설정합니다.
    sheet['!ref'] = "A1:" + endCell;
  }

  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', range: 0})

  // 시작 행부터 (1 기반 → 0 기반 변환)
  const dataRows = raw.slice(template.start_row - 1)

  const results = []
  const isCreditCardSingle =
    template.amount_type === 'single' &&
    (
      String(template.connection_type ?? '').trim() === '신용카드' ||
      String(options.assetGroupType ?? '').trim() === '신용카드'
    )

  for (const row of dataRows) {
    // 날짜 추출
    const rawDate = colDate !== null ? row[colDate] : null
    if (!rawDate) continue

    const date = parseDate(rawDate)
    if (!date) continue

    // 적요
    const description = String(colDesc !== null ? row[colDesc] : '').trim()

    // 금액
    let amountIn = 0
    let amountOut = 0

    if (template.amount_type === 'split') {
      amountIn = parseAmount(colAmountIn !== null ? row[colAmountIn] : null)
      amountOut = parseAmount(colAmountOut !== null ? row[colAmountOut] : null)
    } else if (template.amount_type === 'single') {
      const val = parseAmount(colAmount !== null ? row[colAmount] : null)
      if (isCreditCardSingle) {
        // 신용카드 단일 컬럼: +는 지출, -는 수입
        if (val > 0) amountOut = val
        else if (val < 0) amountIn = Math.abs(val)
      } else {
        if (val > 0) amountIn = val
        else amountOut = Math.abs(val)
      }
    } else if (template.amount_type === 'expense_only') {
      amountOut = parseAmount(colAmount !== null ? row[colAmount] : null)
    }

    // 금액이 둘 다 0이면 스킵
    if (amountIn === 0 && amountOut === 0) continue

    // 잔액
    const balance = colBalance !== null ? parseAmount(row[colBalance]) : null

    // 거래 유형
    const transactionType = colType !== null ? String(row[colType] ?? '').trim() : null

    const direction = amountIn > 0 ? 'INFLOW' : 'OUTFLOW'
    const amount = amountIn > 0 ? amountIn : amountOut

    results.push({
      date,
      description,
      amount,
      direction,
      amountIn,
      amountOut,
      balance,
      transactionType,
      // UI 표시용
      type: direction === 'INFLOW' ? '수입' : '지출',
      category_id: null,
      asset_id: null,
      memo: null,
    })
  }

  return results
}

// 체크카드/신용카드 자동 분류
// cardPaymentCategoryId: DB에서 가져온 "카드 대금" 카테고리 ID
export function classifyRows(rows, assets, cardPaymentCategoryId = null) {
  const cardAssets = assets.filter(a =>
    a.group_type === '체크카드' || a.group_type === '신용카드'
  )

  return rows.map(row => {
    let matchedAsset = null

    for (const asset of cardAssets) {
      const rules = asset.match_rules ?? []
      const matched = rules.some(rule => {
        const typeMatch = rule.type_match_code &&
          row.transactionType === rule.type_match_code
        if (!typeMatch) return false
        if (rule.description_match_keyword) {
          return row.description.includes(rule.description_match_keyword)
        }
        return true
      })
      if (matched) { matchedAsset = asset; break }
    }

    if (matchedAsset) {
      const isCreditCard = matchedAsset.group_type === '신용카드'
      const isIncome = row.direction === 'INFLOW'

      if (isCreditCard) {
        // 신용카드: 자산 그대로 유지, 지출이면 이체로 처리
        return {
          ...row,
          type: isIncome ? row.type : '이체',
          category_id: (!isIncome && cardPaymentCategoryId) ? cardPaymentCategoryId : row.category_id,
          classified: true,
        }
      } else {
        // 체크카드: 자산 교체, 수입이면 type 유지
        return {
          ...row,
          asset_id: matchedAsset.id,
          asset_name: matchedAsset.name,
          type: isIncome ? row.type : '지출',
          classified: true,
        }
      }
    }


    return { ...row, classified: false }
  })
}

// 날짜 파싱
function parseDate(val) {
  if (!val) return null
  if (val instanceof Date) return formatDate(val)
  const str = String(val).trim()
  // YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD
  const patterns = [
    /^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,
    /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/,
    /^(\d{4})(\d{2})(\d{2})$/,
  ]
  for (const p of patterns) {
    const m = str.match(p)
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  return null
}

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseAmount(val) {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return Math.round(val)
  const cleaned = String(val).replace(/[,\s₩]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : Math.round(num)
}

function colToIndex(col) {
  if (!col) return null
  return col.toUpperCase().charCodeAt(0) - 65
}

function detectSpreadsheetLikeFormat(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown'
  // xlsx zip signature: PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'zip'
  // legacy xls OLE compound signature: D0 CF 11 E0
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return 'ole'

  const sniff = buffer.slice(0, Math.min(buffer.length, 8192)).toString('utf8').toLowerCase()
  if (
    sniff.includes('<html') ||
    sniff.includes('<table') ||
    sniff.includes('<!doctype html') ||
    sniff.includes('<meta http-equiv="content-type"')
  ) {
    return 'html'
  }
  return 'unknown'
}

function tryReadWorkbookFromHtml(buffer) {
  const workbookFromCheerio = tryReadWorkbookFromHtmlWithCheerio(buffer)
  if (workbookFromCheerio) return workbookFromCheerio

  const candidates = [
    { text: buffer.toString('utf8'), type: 'string' },
    // many Korean financial exports use CP949/EUC-KR; keep byte mapping for parser fallback
    { text: buffer.toString('latin1'), type: 'binary' },
  ]
  for (const candidate of candidates) {
    try {
      if (!/<table[\s>]/i.test(candidate.text)) continue
      const workbook = XLSX.read(candidate.text, { type: candidate.type, cellDates: true })
      if (Array.isArray(workbook?.SheetNames) && workbook.SheetNames.length > 0) {
        return workbook
      }
    } catch {
      // try next candidate
    }
  }
  return null
}

function tryReadWorkbookFromHtmlWithCheerio(buffer) {
  let cheerio
  try {
    cheerio = require('cheerio')
  } catch {
    // If cheerio is not installed yet, fall back to XLSX HTML parser.
    return null
  }

  const htmlCandidates = [
    buffer.toString('utf8'),
    buffer.toString('latin1'),
  ]

  for (const rawHtml of htmlCandidates) {
    try {
      const normalizedHtml = normalizeLooseFinancialHtml(rawHtml)
      if (!/<table[\s>]/i.test(normalizedHtml)) continue

      const $ = cheerio.load(normalizedHtml, { decodeEntities: false })
      const $table = $('table').filter((_, el) => $(el).find('tr').length > 0).first()
      if (!$table.length) continue

      const matrix = htmlTableToMatrix($, $table)
      if (!Array.isArray(matrix) || matrix.length === 0) continue

      const sheet = XLSX.utils.aoa_to_sheet(matrix)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
      return workbook
    } catch {
      // try next candidate
    }
  }

  return null
}

function normalizeLooseFinancialHtml(html) {
  if (!html) return ''
  return String(html)
    // malformed close tags like </td   > / </th   >
    .replace(/<\/(td|th)\s+>/gi, '</$1>')
    // strip null bytes if present
    .replace(/\u0000/g, '')
}

function htmlTableToMatrix($, $table) {
  const matrix = []

  $table.find('tr').each((rowIndex, tr) => {
    const row = matrix[rowIndex] ?? []
    matrix[rowIndex] = row

    let colIndex = 0
    while (row[colIndex] !== undefined) colIndex += 1

    $(tr).children('th,td').each((_, cell) => {
      while (row[colIndex] !== undefined) colIndex += 1

      const $cell = $(cell)
      const text = normalizeHtmlCellText($cell.text())
      const colspan = Math.max(1, Number.parseInt($cell.attr('colspan') || '1', 10) || 1)
      const rowspan = Math.max(1, Number.parseInt($cell.attr('rowspan') || '1', 10) || 1)

      for (let r = 0; r < rowspan; r += 1) {
        const targetRowIndex = rowIndex + r
        if (!matrix[targetRowIndex]) matrix[targetRowIndex] = []
        const targetRow = matrix[targetRowIndex]
        let targetColIndex = colIndex
        while (targetRow[targetColIndex] !== undefined) targetColIndex += 1

        for (let c = 0; c < colspan; c += 1) {
          targetRow[targetColIndex + c] = (r === 0 && c === 0) ? text : ''
        }
      }

      colIndex += colspan
    })
  })

  return matrix.map((row) => {
    const normalized = Array.isArray(row) ? [...row] : []
    while (normalized.length > 0 && (normalized[normalized.length - 1] === undefined || normalized[normalized.length - 1] === '')) {
      normalized.pop()
    }
    return normalized.map((v) => (v === undefined ? '' : v))
  })
}

function normalizeHtmlCellText(text) {
  return String(text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
