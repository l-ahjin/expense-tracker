// 키워드 규칙 기반으로 거래 내역 카테고리 자동 매칭

export function matchCategory(description, amount, transactionType, rules) {
  for (const rule of rules) {
    // 키워드 매칭
    const keywordMatch = rule.match_type === '전체일치'
      ? description === rule.keyword
      : description.includes(rule.keyword)
    if (!keywordMatch) continue

    // 금액 조건 (선택)
    if (rule.amount != null) {
      if (Math.abs(amount) !== Math.abs(rule.amount)) continue
    }

    return {
      category_id: rule.category_id,
      category_name: rule.category_name,
      parent_name: rule.parent_name,
      type: rule.category_type, // 카테고리 type으로 거래 type 오버라이드
    }
  }
  return null
}

export function applyKeywordRules(rows, rules) {
  return rows.map(row => {
    const match = matchCategory(row.description, row.amount, row.type, rules)
    if (!match) return row
    return {
      ...row,
      category_id: match.category_id,
      category_name: match.category_name,
      parent_name: match.parent_name,
      type: match.type,
    }
  })
}