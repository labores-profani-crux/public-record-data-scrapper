import { database } from '../database/connection'

interface EnrichmentResult {
  growth_signals: {
    hiring: number
    permits: number
    contracts: number
    expansion: number
    equipment: number
  }
  health_score: {
    score: number
    grade: string
    trend: string
    violations: number
  }
  estimated_revenue: number
  industry_classification: string
  data_sources_used: string[]
}

export class EnrichmentService {
  async enrichProspect(prospectId: string): Promise<EnrichmentResult> {
    // Get prospect details
    const prospect = await database.query(
      'SELECT * FROM prospects WHERE id = $1',
      [prospectId]
    )

    if (prospect.length === 0) {
      throw new Error(`Prospect ${prospectId} not found`)
    }

    const prospectData = prospect[0]

    // Simulate enrichment process
    // In Phase 2, this will call actual external APIs
    const enrichment: EnrichmentResult = {
      growth_signals: {
        hiring: Math.floor(Math.random() * 5),
        permits: Math.floor(Math.random() * 3),
        contracts: Math.floor(Math.random() * 2),
        expansion: Math.floor(Math.random() * 2),
        equipment: Math.floor(Math.random() * 3)
      },
      health_score: {
        score: Math.floor(Math.random() * 40) + 60, // 60-100
        grade: this.calculateGrade(Math.floor(Math.random() * 40) + 60),
        trend: ['improving', 'stable', 'declining'][Math.floor(Math.random() * 3)],
        violations: Math.floor(Math.random() * 3)
      },
      estimated_revenue: prospectData.lien_amount ? prospectData.lien_amount * (4 + Math.random() * 2) : 0,
      industry_classification: prospectData.industry,
      data_sources_used: ['mock-data']
    }

    // Update prospect with enrichment data
    await database.query(
      `UPDATE prospects
       SET last_enriched_at = NOW(),
           enrichment_confidence = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [prospectId, 0.85]
    )

    // Store growth signals
    const signalTypes = ['hiring', 'permits', 'contracts', 'expansion', 'equipment'] as const
    for (const type of signalTypes) {
      const count = enrichment.growth_signals[type]
      for (let i = 0; i < count; i++) {
        await database.query(
          `INSERT INTO growth_signals (prospect_id, type, description, detected_date)
           VALUES ($1, $2, $3, NOW())`,
          [prospectId, type, `Mock ${type} signal ${i + 1}`]
        )
      }
    }

    // Store health score
    await database.query(
      `INSERT INTO health_scores (prospect_id, score, grade, trend, violations_count, sentiment_score, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        prospectId,
        enrichment.health_score.score,
        enrichment.health_score.grade,
        enrichment.health_score.trend,
        enrichment.health_score.violations,
        0.5 + Math.random() * 0.5 // Mock sentiment 0.5-1.0
      ]
    )

    return enrichment
  }

  async enrichBatch(prospectIds: string[]): Promise<Array<{ prospect_id: string; success: boolean; error?: string }>> {
    const results = []

    for (const prospectId of prospectIds) {
      try {
        await this.enrichProspect(prospectId)
        results.push({ prospect_id: prospectId, success: true })
      } catch (error) {
        results.push({
          prospect_id: prospectId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return results
  }

  async triggerRefresh(force: boolean = false) {
    // Get prospects that need refreshing
    const query = force
      ? 'SELECT id FROM prospects'
      : `SELECT id FROM prospects
         WHERE last_enriched_at IS NULL
            OR last_enriched_at < NOW() - INTERVAL '7 days'
         LIMIT 100`

    const prospects = await database.query<{ id: string }>(query)

    const prospectIds = prospects.map(p => p.id)
    const results = await this.enrichBatch(prospectIds)

    return {
      queued: prospectIds.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }
  }

  async getStatus() {
    const stats = await database.query(`
      SELECT
        COUNT(*) as total_prospects,
        COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL) as enriched_count,
        COUNT(*) FILTER (WHERE last_enriched_at IS NULL) as unenriched_count,
        COUNT(*) FILTER (WHERE last_enriched_at < NOW() - INTERVAL '7 days') as stale_count,
        COALESCE(AVG(enrichment_confidence), 0) as avg_confidence
      FROM prospects
    `)

    return stats[0] || {
      total_prospects: 0,
      enriched_count: 0,
      unenriched_count: 0,
      stale_count: 0,
      avg_confidence: 0
    }
  }

  async getQueueStatus() {
    // In Phase 3, this will integrate with BullMQ
    // For now, return mock queue status
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0
    }
  }

  private calculateGrade(score: number): string {
    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }
}
