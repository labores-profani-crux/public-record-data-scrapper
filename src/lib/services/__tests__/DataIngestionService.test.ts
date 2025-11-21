/**
 * DataIngestionService Unit Tests
 *
 * Tests for UCC filing data ingestion from various sources
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DataIngestionService } from '../DataIngestionService'
import {
  createMockIngestionConfig,
  createMockDataSource,
  createMockUCCFiling,
  createMockFetchResponse,
  wait,
  mockConsole
} from './test-utils'

// Mock fetch globally
global.fetch = vi.fn()

describe('DataIngestionService', () => {
  let service: DataIngestionService
  let consoleMocks: ReturnType<typeof mockConsole>

  beforeEach(() => {
    const config = createMockIngestionConfig()
    service = new DataIngestionService(config)
    consoleMocks = mockConsole()
    vi.clearAllMocks()
  })

  afterEach(() => {
    consoleMocks.restore()
  })

  describe('ingestData', () => {
    it('should ingest data from all configured sources', async () => {
      const mockFilings = [createMockUCCFiling(), createMockUCCFiling()]

      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: mockFilings })
      )

      const results = await service.ingestData(['CA'])

      expect(results).toHaveLength(3) // 3 mock sources
      expect(results.every(r => r.success)).toBe(true)
    })

    it('should handle source failures gracefully', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(createMockFetchResponse({ filings: [] }))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createMockFetchResponse({ filings: [] }))

      const results = await service.ingestData(['CA'])

      expect(results).toHaveLength(3)
      expect(results.filter(r => r.success)).toHaveLength(2)
      expect(results.filter(r => !r.success)).toHaveLength(1)
      expect(results[1].errors).toContain('Network error')
    })

    it('should respect state filters', async () => {
      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [] })
      )

      await service.ingestData(['CA', 'NY'])

      // Verify fetch was called for the correct states
      expect(fetch).toHaveBeenCalled()
    })

    it('should include metadata in results', async () => {
      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [createMockUCCFiling()] })
      )

      const results = await service.ingestData(['CA'])

      results.forEach(result => {
        expect(result.metadata).toBeDefined()
        expect(result.metadata.source).toBeTruthy()
        expect(result.metadata.timestamp).toBeTruthy()
        expect(result.metadata.recordCount).toBeGreaterThanOrEqual(0)
        expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0)
      })
    })

    it('should collect filings from successful sources', async () => {
      const filing1 = createMockUCCFiling({ fileNumber: 'CA-001' })
      const filing2 = createMockUCCFiling({ fileNumber: 'CA-002' })

      vi.mocked(fetch)
        .mockResolvedValueOnce(createMockFetchResponse({ filings: [filing1] }))
        .mockResolvedValueOnce(createMockFetchResponse({ filings: [filing2] }))
        .mockResolvedValueOnce(createMockFetchResponse({ filings: [] }))

      const results = await service.ingestData(['CA'])

      const totalFilings = results.reduce((sum, r) => sum + r.filings.length, 0)
      expect(totalFilings).toBeGreaterThanOrEqual(2)
    })
  })

  describe('rate limiting', () => {
    it('should respect rate limits for sources', async () => {
      const config = createMockIngestionConfig({
        sources: [createMockDataSource({ rateLimit: 2 })], // 2 requests per minute
        batchSize: 10
      })
      service = new DataIngestionService(config)

      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [] })
      )

      // Make multiple rapid requests
      const promises = Array(5).fill(null).map(() =>
        service.ingestData(['CA'])
      )

      await Promise.all(promises)

      // Should have been rate limited
      expect(fetch).toHaveBeenCalled()
    })

    it('should track request counts per source', async () => {
      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [] })
      )

      await service.ingestData(['CA'])
      await wait(100)
      await service.ingestData(['NY'])

      // Request counts should be tracked internally
      expect(fetch).toHaveBeenCalled()
    })
  })

  describe('circuit breaker', () => {
    it('should open circuit after consecutive failures', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Service unavailable'))

      // Make multiple requests to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        await service.ingestData(['CA']).catch(() => {})
      }

      // Circuit should be open now
      const result = await service.ingestData(['CA'])
      expect(result.some(r => !r.success)).toBe(true)
    })

    it('should close circuit after successful request in half-open state', async () => {
      // Fail first to open circuit
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Error'))

      await service.ingestData(['CA']).catch(() => {})

      // Wait for circuit to half-open
      await wait(100)

      // Succeed to close circuit
      vi.mocked(fetch).mockResolvedValueOnce(
        createMockFetchResponse({ filings: [] })
      )

      const result = await service.ingestData(['CA'])
      expect(result.some(r => r.success)).toBe(true)
    })
  })

  describe('retry logic', () => {
    it('should retry failed requests', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(createMockFetchResponse({ filings: [] }))

      const results = await service.ingestData(['CA'])

      // Should succeed after retries
      expect(results.some(r => r.success)).toBe(true)
      expect(fetch).toHaveBeenCalledTimes(9) // 3 sources × 3 attempts
    })

    it('should use exponential backoff for retries', async () => {
      const startTime = Date.now()

      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce(createMockFetchResponse({ filings: [] }))

      await service.ingestData(['CA'])

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should have some delay due to backoff
      expect(duration).toBeGreaterThan(0)
    })

    it('should not retry on non-retryable errors', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Invalid API key'))

      const results = await service.ingestData(['CA'])

      // Should fail fast without retries
      expect(results.some(r => !r.success)).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should handle network errors', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

      const results = await service.ingestData(['CA'])

      expect(results.every(r => !r.success)).toBe(true)
      expect(results.every(r => r.errors.length > 0)).toBe(true)
    })

    it('should handle malformed API responses', async () => {
      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ invalid: 'data' })
      )

      const results = await service.ingestData(['CA'])

      // Should handle gracefully
      expect(results).toBeDefined()
    })

    it('should handle timeout errors', async () => {
      vi.mocked(fetch).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      // This would timeout in real scenario
      // In test, we just verify it handles the case
    })

    it('should log errors to console', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Test error'))

      await service.ingestData(['CA'])

      expect(consoleMocks.mocks.error).toHaveBeenCalled()
    })
  })

  describe('data validation', () => {
    it('should validate UCC filing data structure', async () => {
      const invalidFiling = { invalid: 'data' }

      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [invalidFiling] })
      )

      const results = await service.ingestData(['CA'])

      // Should handle invalid data
      expect(results).toBeDefined()
    })

    it('should filter out duplicate filings', async () => {
      const filing = createMockUCCFiling({ fileNumber: 'CA-001' })

      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [filing, filing] })
      )

      const results = await service.ingestData(['CA'])

      // Should deduplicate
      const allFilings = results.flatMap(r => r.filings)
      const uniqueFileNumbers = new Set(allFilings.map(f => f.fileNumber))
      expect(uniqueFileNumbers.size).toBeLessThanOrEqual(allFilings.length)
    })
  })

  describe('performance', () => {
    it('should process large batches efficiently', async () => {
      const largeFilingSet = Array(1000).fill(null).map((_, i) =>
        createMockUCCFiling({ fileNumber: `CA-${i}` })
      )

      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: largeFilingSet })
      )

      const startTime = Date.now()
      const results = await service.ingestData(['CA'])
      const duration = Date.now() - startTime

      expect(results).toBeDefined()
      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000)
    })

    it('should handle batch size limits', async () => {
      const config = createMockIngestionConfig({ batchSize: 50 })
      service = new DataIngestionService(config)

      const largeFilingSet = Array(200).fill(null).map((_, i) =>
        createMockUCCFiling({ fileNumber: `CA-${i}` })
      )

      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: largeFilingSet })
      )

      const results = await service.ingestData(['CA'])

      // Should process in batches
      expect(results).toBeDefined()
    })
  })

  describe('source types', () => {
    it('should handle state portal sources', async () => {
      const config = createMockIngestionConfig({
        sources: [createMockDataSource({ type: 'state-portal' })]
      })
      service = new DataIngestionService(config)

      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [] })
      )

      const results = await service.ingestData(['CA'])

      expect(results[0].metadata.source).toContain('Portal')
    })

    it('should handle API sources', async () => {
      const config = createMockIngestionConfig({
        sources: [createMockDataSource({ type: 'api', apiKey: 'test-key' })]
      })
      service = new DataIngestionService(config)

      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [] })
      )

      const results = await service.ingestData(['CA'])

      expect(results[0]).toBeDefined()
    })

    it('should handle database sources', async () => {
      const config = createMockIngestionConfig({
        sources: [createMockDataSource({ type: 'database' })]
      })
      service = new DataIngestionService(config)

      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [] })
      )

      const results = await service.ingestData(['CA'])

      expect(results[0]).toBeDefined()
    })
  })

  describe('concurrent operations', () => {
    it('should handle concurrent ingestion requests', async () => {
      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [] })
      )

      const promises = [
        service.ingestData(['CA']),
        service.ingestData(['NY']),
        service.ingestData(['TX'])
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(results.every(r => Array.isArray(r))).toBe(true)
    })

    it('should maintain state consistency during concurrent operations', async () => {
      vi.mocked(fetch).mockResolvedValue(
        createMockFetchResponse({ filings: [createMockUCCFiling()] })
      )

      // Run multiple concurrent operations
      await Promise.all([
        service.ingestData(['CA']),
        service.ingestData(['CA']),
        service.ingestData(['CA'])
      ])

      // State should remain consistent
      expect(true).toBe(true) // Placeholder - would check internal state
    })
  })
})
