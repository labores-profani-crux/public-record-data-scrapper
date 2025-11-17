import { database } from '../database/connection'
import type { Prospect } from '../../src/lib/types'

interface ListParams {
  page: number
  limit: number
  state?: string
  industry?: string
  min_score?: number
  max_score?: number
  status?: 'all' | 'unclaimed' | 'claimed' | 'contacted'
  sort_by: string
  sort_order: 'asc' | 'desc'
}

interface ListResult {
  prospects: Prospect[]
  page: number
  limit: number
  total: number
}

export class ProspectsService {
  async list(params: ListParams): Promise<ListResult> {
    const { page, limit, state, industry, min_score, max_score, status, sort_by, sort_order } = params
    const offset = (page - 1) * limit

    // Build WHERE clause
    const conditions: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (state) {
      conditions.push(`state = $${paramCount++}`)
      values.push(state)
    }

    if (industry) {
      conditions.push(`industry = $${paramCount++}`)
      values.push(industry)
    }

    if (min_score !== undefined) {
      conditions.push(`priority_score >= $${paramCount++}`)
      values.push(min_score)
    }

    if (max_score !== undefined) {
      conditions.push(`priority_score <= $${paramCount++}`)
      values.push(max_score)
    }

    if (status && status !== 'all') {
      conditions.push(`status = $${paramCount++}`)
      values.push(status)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Query prospects
    const query = `
      SELECT * FROM prospects
      ${whereClause}
      ORDER BY ${sort_by} ${sort_order.toUpperCase()}
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `
    values.push(limit, offset)

    const prospects = await database.query<Prospect>(query, values)

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM prospects ${whereClause}`
    const countResult = await database.query<{ count: string }>(countQuery, values.slice(0, -2))
    const total = parseInt(countResult[0]?.count || '0')

    return {
      prospects,
      page,
      limit,
      total
    }
  }

  async getById(id: string): Promise<Prospect | null> {
    const results = await database.query<Prospect>(
      'SELECT * FROM prospects WHERE id = $1',
      [id]
    )
    return results[0] || null
  }

  async create(data: Partial<Prospect>): Promise<Prospect> {
    const results = await database.query<Prospect>(
      `INSERT INTO prospects (company_name, state, industry, lien_amount, filing_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.company_name,
        data.state,
        data.industry,
        data.lien_amount,
        data.filing_date,
        data.status || 'unclaimed'
      ]
    )
    return results[0]
  }

  async update(id: string, data: Partial<Prospect>): Promise<Prospect | null> {
    // Build SET clause dynamically
    const fields = Object.keys(data).filter(key => data[key as keyof Prospect] !== undefined)

    if (fields.length === 0) {
      return this.getById(id)
    }

    const setClause = fields.map((field, i) => `${field} = $${i + 2}`).join(', ')
    const values = [id, ...fields.map(f => data[f as keyof Prospect])]

    const results = await database.query<Prospect>(
      `UPDATE prospects SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      values
    )
    return results[0] || null
  }

  async delete(id: string): Promise<boolean> {
    const results = await database.query(
      'DELETE FROM prospects WHERE id = $1',
      [id]
    )
    return (results as any).rowCount > 0
  }

  async claim(id: string, userId: string): Promise<Prospect | null> {
    const results = await database.query<Prospect>(
      `UPDATE prospects
       SET status = 'claimed', claimed_by = $2, claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, userId]
    )
    return results[0] || null
  }

  async batchClaim(ids: string[], userId: string): Promise<{ success: number; failed: number }> {
    let success = 0
    let failed = 0

    for (const id of ids) {
      try {
        const result = await this.claim(id, userId)
        if (result) {
          success++
        } else {
          failed++
        }
      } catch (error) {
        failed++
      }
    }

    return { success, failed }
  }
}
