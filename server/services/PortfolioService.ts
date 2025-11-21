import { database } from '../database/connection'

interface PortfolioCompany {
  id: string
  company_name: string
  funded_date: string
  funded_amount: number
  current_health_score: number
  health_grade: string
  health_trend: string
  state: string
  industry: string
  days_since_funding: number
}

interface ListParams {
  page: number
  limit: number
  health_grade?: string
  sort_by: string
  sort_order: 'asc' | 'desc'
}

export class PortfolioService {
  async list(params: ListParams) {
    const { page, limit, health_grade, sort_by, sort_order } = params
    const offset = (page - 1) * limit

    // Build WHERE clause
    const conditions: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (health_grade) {
      conditions.push(`health_grade = $${paramCount++}`)
      values.push(health_grade)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Query portfolio companies
    const query = `
      SELECT
        id,
        company_name,
        funded_date,
        funded_amount,
        current_health_score,
        health_grade,
        health_trend,
        state,
        industry,
        EXTRACT(DAY FROM NOW() - funded_date)::integer as days_since_funding
      FROM portfolio_companies
      ${whereClause}
      ORDER BY ${sort_by} ${sort_order.toUpperCase()}
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `
    values.push(limit, offset)

    const companies = await database.query<PortfolioCompany>(query, values)

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM portfolio_companies ${whereClause}`
    const countResult = await database.query<{ count: string }>(countQuery, values.slice(0, -2))
    const total = parseInt(countResult[0]?.count || '0')

    return {
      companies,
      page,
      limit,
      total
    }
  }

  async getById(id: string) {
    const query = `
      SELECT
        id,
        company_name,
        funded_date,
        funded_amount,
        current_health_score,
        health_grade,
        health_trend,
        state,
        industry,
        contact_email,
        contact_phone,
        notes,
        EXTRACT(DAY FROM NOW() - funded_date)::integer as days_since_funding,
        created_at,
        updated_at
      FROM portfolio_companies
      WHERE id = $1
    `

    const results = await database.query<PortfolioCompany>(query, [id])
    return results[0] || null
  }

  async getHealthHistory(id: string) {
    const query = `
      SELECT
        score,
        grade,
        trend,
        violations_count,
        sentiment_score,
        recorded_at
      FROM health_scores
      WHERE portfolio_company_id = $1
      ORDER BY recorded_at DESC
      LIMIT 30
    `

    const results = await database.query(query, [id])
    return results
  }

  async getStats() {
    const query = `
      SELECT
        COUNT(*) as total_companies,
        COALESCE(SUM(funded_amount), 0) as total_funded,
        COALESCE(AVG(current_health_score), 0) as avg_health_score,
        COUNT(*) FILTER (WHERE health_grade = 'A') as grade_a_count,
        COUNT(*) FILTER (WHERE health_grade = 'B') as grade_b_count,
        COUNT(*) FILTER (WHERE health_grade = 'C') as grade_c_count,
        COUNT(*) FILTER (WHERE health_grade = 'D') as grade_d_count,
        COUNT(*) FILTER (WHERE health_grade = 'F') as grade_f_count,
        COUNT(*) FILTER (WHERE health_trend = 'improving') as improving_count,
        COUNT(*) FILTER (WHERE health_trend = 'stable') as stable_count,
        COUNT(*) FILTER (WHERE health_trend = 'declining') as declining_count
      FROM portfolio_companies
    `

    const results = await database.query(query)
    return results[0] || {
      total_companies: 0,
      total_funded: 0,
      avg_health_score: 0,
      grade_a_count: 0,
      grade_b_count: 0,
      grade_c_count: 0,
      grade_d_count: 0,
      grade_f_count: 0,
      improving_count: 0,
      stable_count: 0,
      declining_count: 0
    }
  }
}
