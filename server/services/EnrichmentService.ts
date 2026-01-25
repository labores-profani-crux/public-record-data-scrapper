/**
 * EnrichmentService
 *
 * Service layer for data enrichment in the UCC-MCA Intelligence Platform.
 * Enriches prospect data with growth signals, health scores, revenue estimates,
 * and industry classifications from external data sources.
 *
 * Note: Current implementation uses mock data. In production, this will integrate
 * with external APIs for real data enrichment.
 *
 * @module server/services/EnrichmentService
 */

import { database } from '../database/connection'

/**
 * Result of enriching a prospect with additional data.
 */
interface EnrichmentResult {
  /** Detected growth signals by type */
  growth_signals: {
    /** Number of hiring signals detected */
    hiring: number
    /** Number of permit applications detected */
    permits: number
    /** Number of new contracts detected */
    contracts: number
    /** Number of expansion signals detected */
    expansion: number
    /** Number of equipment purchase signals detected */
    equipment: number
  }
  /** Calculated health score */
  health_score: {
    /** Numeric score (0-100) */
    score: number
    /** Letter grade (A-F) */
    grade: string
    /** Trend direction (improving, stable, declining) */
    trend: string
    /** Number of violations found */
    violations: number
  }
  /** Estimated annual revenue */
  estimated_revenue: number
  /** Industry classification */
  industry_classification: string
  /** Data sources used for enrichment */
  data_sources_used: string[]
}

/**
 * Service for enriching prospect data with external signals.
 *
 * Provides methods for:
 * - Single prospect enrichment
 * - Batch enrichment
 * - Triggering refresh of stale data
 * - Enrichment status monitoring
 *
 * @example
 * ```typescript
 * const service = new EnrichmentService()
 *
 * // Enrich a single prospect
 * const result = await service.enrichProspect('prospect-id')
 *
 * // Batch enrich multiple prospects
 * const results = await service.enrichBatch(['id1', 'id2', 'id3'])
 *
 * // Trigger refresh of stale data
 * const refreshResult = await service.triggerRefresh()
 * ```
 */
export class EnrichmentService {
  /**
   * Enrich a single prospect with growth signals and health data.
   *
   * This method:
   * 1. Fetches the prospect from the database
   * 2. Gathers enrichment data (currently mocked)
   * 3. Updates the prospect with enrichment metadata
   * 4. Stores growth signals and health scores
   *
   * @param prospectId - The prospect's unique identifier
   * @returns Enrichment result with all gathered data
   * @throws {Error} If the prospect is not found
   */
  async enrichProspect(prospectId: string): Promise<EnrichmentResult> {
    // Get prospect details
    const prospect = await database.query('SELECT * FROM prospects WHERE id = $1', [prospectId])

    if (prospect.length === 0) {
      throw new Error(`Prospect ${prospectId} not found`)
    }

    const prospectData = prospect[0] as { lien_amount?: number; industry?: string }

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
      estimated_revenue: prospectData.lien_amount
        ? prospectData.lien_amount * (4 + Math.random() * 2)
        : 0,
      industry_classification: prospectData.industry || 'unknown',
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

  /**
   * Enrich multiple prospects in a batch operation.
   *
   * Processes each prospect individually, collecting successes and failures.
   * Errors for individual prospects don't stop the batch.
   *
   * @param prospectIds - Array of prospect IDs to enrich
   * @returns Array of results indicating success/failure for each prospect
   */
  async enrichBatch(
    prospectIds: string[]
  ): Promise<Array<{ prospect_id: string; success: boolean; error?: string }>> {
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

  /**
   * Trigger a refresh of stale or unenriched prospect data.
   *
   * By default, refreshes prospects that:
   * - Have never been enriched
   * - Were last enriched more than 7 days ago
   *
   * Limited to 100 prospects per call for performance.
   *
   * @param force - If true, refresh all prospects regardless of staleness
   * @returns Summary of refresh operation results
   */
  async triggerRefresh(force: boolean = false) {
    // Get prospects that need refreshing
    const query = force
      ? 'SELECT id FROM prospects'
      : `SELECT id FROM prospects
         WHERE last_enriched_at IS NULL
            OR last_enriched_at < NOW() - INTERVAL '7 days'
         LIMIT 100`

    const prospects = await database.query<{ id: string }>(query)

    const prospectIds = prospects.map((p) => p.id)
    const results = await this.enrichBatch(prospectIds)

    return {
      queued: prospectIds.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length
    }
  }

  /**
   * Get the current status of enrichment across all prospects.
   *
   * @returns Statistics about enrichment coverage and quality
   */
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

    return (
      stats[0] || {
        total_prospects: 0,
        enriched_count: 0,
        unenriched_count: 0,
        stale_count: 0,
        avg_confidence: 0
      }
    )
  }

  /**
   * Get the current status of the enrichment job queue.
   *
   * Note: In Phase 3, this will integrate with BullMQ for real queue status.
   *
   * @returns Queue statistics (currently mocked)
   */
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

  /**
   * Calculate letter grade from numeric score.
   *
   * @param score - Numeric score (0-100)
   * @returns Letter grade (A, B, C, D, or F)
   */
  private calculateGrade(score: number): string {
    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }
}
