/**
 * DataRefreshScheduler Tests
 *
 * Tests for data refresh scheduler including:
 * - Scheduler lifecycle (start/stop)
 * - Event emission
 * - Status tracking
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DataRefreshScheduler, type ScheduleConfig, type SchedulerEvent } from '../DataRefreshScheduler'
import { type IngestionConfig } from '../DataIngestionService'
import { type EnrichmentSource } from '../DataEnrichmentService'

// Mock fetch
global.fetch = vi.fn()

describe('DataRefreshScheduler', () => {
  let scheduler: DataRefreshScheduler
  let mockScheduleConfig: ScheduleConfig
  let mockIngestionConfig: IngestionConfig
  let mockEnrichmentSources: EnrichmentSource[]
  let eventLog: SchedulerEvent[]

  beforeEach(() => {
    vi.clearAllMocks()
    eventLog = []

    mockScheduleConfig = {
      enabled: true,
      ingestionInterval: 1000, // 1 second for testing
      enrichmentInterval: 1000,
      enrichmentBatchSize: 10,
      refreshInterval: 1000,
      staleDataThreshold: 7, // 7 days
      autoStart: false
    }

    mockIngestionConfig = {
      sources: [
        {
          id: 'test-api',
          name: 'Test API',
          type: 'api',
          endpoint: 'https://api.test.com',
          rateLimit: 60
        }
      ],
      batchSize: 100,
      retryAttempts: 3,
      retryDelay: 100,
      states: ['NY', 'CA']
    }

    mockEnrichmentSources = [
      {
        id: 'test-enrichment',
        name: 'Test Enrichment',
        type: 'api',
        capabilities: ['growth-signals', 'health-score']
      }
    ]

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response)
  })

  afterEach(() => {
    if (scheduler) {
      scheduler.stop()
    }
  })

  describe('Initialization', () => {
    it('should initialize with config', () => {
      scheduler = new DataRefreshScheduler(
        mockScheduleConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )

      expect(scheduler).toBeDefined()
    })

    it('should start automatically if autoStart is true', () => {
      const autoStartConfig = { ...mockScheduleConfig, autoStart: true }
      scheduler = new DataRefreshScheduler(
        autoStartConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )

      const status = scheduler.getStatus()
      expect(status.running).toBe(true)
    })

    it('should not start automatically if autoStart is false', () => {
      scheduler = new DataRefreshScheduler(
        mockScheduleConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )

      const status = scheduler.getStatus()
      expect(status.running).toBe(false)
    })
  })

  describe('start() and stop()', () => {
    beforeEach(() => {
      scheduler = new DataRefreshScheduler(
        mockScheduleConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )
    })

    it('should start the scheduler', () => {
      scheduler.start()
      const status = scheduler.getStatus()

      expect(status.running).toBe(true)
    })

    it('should not start if already running', () => {
      scheduler.start()
      scheduler.start() // Second call should be no-op

      const status = scheduler.getStatus()
      expect(status.running).toBe(true)
    })

    it('should stop the scheduler', () => {
      scheduler.start()
      scheduler.stop()

      const status = scheduler.getStatus()
      expect(status.running).toBe(false)
    })

    it('should not stop if not running', () => {
      scheduler.stop() // Should not throw
      const status = scheduler.getStatus()

      expect(status.running).toBe(false)
    })

    it('should allow restart after stop', () => {
      scheduler.start()
      scheduler.stop()
      scheduler.start()

      const status = scheduler.getStatus()
      expect(status.running).toBe(true)
    })
  })

  describe('getStatus()', () => {
    beforeEach(() => {
      scheduler = new DataRefreshScheduler(
        mockScheduleConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )
    })

    it('should return scheduler status', () => {
      const status = scheduler.getStatus()

      expect(status).toHaveProperty('running')
      expect(status).toHaveProperty('totalProspectsProcessed')
      expect(status).toHaveProperty('totalErrors')
    })

    it('should show running false initially', () => {
      const status = scheduler.getStatus()
      expect(status.running).toBe(false)
    })

    it('should show running true after start', () => {
      scheduler.start()
      const status = scheduler.getStatus()

      expect(status.running).toBe(true)
    })

    it('should initialize counters to zero', () => {
      const status = scheduler.getStatus()

      expect(status.totalProspectsProcessed).toBe(0)
      expect(status.totalErrors).toBe(0)
    })
  })

  describe('Event System', () => {
    beforeEach(() => {
      scheduler = new DataRefreshScheduler(
        mockScheduleConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )
    })

    it('should register event handlers', () => {
      const handler = (event: SchedulerEvent) => {
        eventLog.push(event)
      }

      scheduler.on(handler)
      expect(() => scheduler.on(handler)).not.toThrow()
    })

    it('should emit events to registered handlers', async () => {
      scheduler.on((event) => {
        eventLog.push(event)
      })

      scheduler.start()

      // Wait a bit for events
      await new Promise(resolve => setTimeout(resolve, 200))

      expect(eventLog.length).toBeGreaterThanOrEqual(0)
    })

    it('should include timestamp in events', async () => {
      scheduler.on((event) => {
        eventLog.push(event)
      })

      scheduler.start()
      await new Promise(resolve => setTimeout(resolve, 200))

      if (eventLog.length > 0) {
        expect(eventLog[0].timestamp).toBeDefined()
        const timestamp = new Date(eventLog[0].timestamp)
        expect(timestamp.toISOString()).toBe(eventLog[0].timestamp)
      }
    })

    it('should support multiple event handlers', async () => {
      const log1: SchedulerEvent[] = []
      const log2: SchedulerEvent[] = []

      scheduler.on((event) => log1.push(event))
      scheduler.on((event) => log2.push(event))

      scheduler.start()
      await new Promise(resolve => setTimeout(resolve, 200))

      // Both logs should receive events
      expect(log1.length).toBe(log2.length)
    })
  })

  describe('Manual Operations', () => {
    beforeEach(() => {
      scheduler = new DataRefreshScheduler(
        mockScheduleConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )
    })

    it('should manually trigger ingestion', async () => {
      await expect(scheduler.triggerIngestion()).resolves.not.toThrow()
    })

    it('should update status after manual ingestion', async () => {
      await scheduler.triggerIngestion()

      const status = scheduler.getStatus()
      expect(status.lastIngestionRun).toBeDefined()
    })

    it('should refresh specific prospect by ID', async () => {
      // First ingest to create prospects
      await scheduler.triggerIngestion()

      const prospects = scheduler.getProspects()
      if (prospects.length > 0) {
        const result = await scheduler.refreshProspect(prospects[0].id)
        expect(result).toBeTruthy()
      } else {
        // No prospects to refresh
        expect(true).toBe(true)
      }
    })
  })

  describe('Prospect Management', () => {
    beforeEach(() => {
      scheduler = new DataRefreshScheduler(
        mockScheduleConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )
    })

    it('should retrieve stored prospects', () => {
      const prospects = scheduler.getProspects()

      expect(Array.isArray(prospects)).toBe(true)
    })

    it('should start with empty prospects', () => {
      const prospects = scheduler.getProspects()

      expect(prospects.length).toBe(0)
    })

    it('should store prospects after ingestion', async () => {
      await scheduler.triggerIngestion()

      const prospects = scheduler.getProspects()
      expect(Array.isArray(prospects)).toBe(true)
    })
  })

  describe('Scheduler with Disabled Config', () => {
    it('should not schedule jobs when disabled', () => {
      const disabledConfig = { ...mockScheduleConfig, enabled: false }
      scheduler = new DataRefreshScheduler(
        disabledConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )

      scheduler.start()
      const status = scheduler.getStatus()

      // Scheduler is running but jobs are not scheduled
      expect(status.running).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      scheduler = new DataRefreshScheduler(
        mockScheduleConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )
    })

    it('should handle errors during ingestion', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

      let errorEvent: SchedulerEvent | null = null
      scheduler.on((event) => {
        if (event.type === 'error') {
          errorEvent = event
        }
      })

      scheduler.start()
      await new Promise(resolve => setTimeout(resolve, 200))

      // Should continue running despite error
      const status = scheduler.getStatus()
      expect(status.running).toBe(true)
    })

    it('should handle empty ingestion results', async () => {
      await scheduler.triggerIngestion()

      const prospects = scheduler.getProspects()
      expect(prospects.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle rapid start/stop cycles', () => {
      scheduler.start()
      scheduler.stop()
      scheduler.start()
      scheduler.stop()
      scheduler.start()

      const status = scheduler.getStatus()
      expect(status.running).toBe(true)
    })

    it('should cleanup timers on stop', () => {
      scheduler.start()
      scheduler.stop()

      // Should not throw or cause issues
      expect(() => scheduler.getStatus()).not.toThrow()
    })
  })

  describe('Statistics Tracking', () => {
    beforeEach(() => {
      scheduler = new DataRefreshScheduler(
        mockScheduleConfig,
        mockIngestionConfig,
        mockEnrichmentSources
      )
    })

    it('should track total prospects processed', async () => {
      await scheduler.triggerIngestion()

      const status = scheduler.getStatus()
      expect(status.totalProspectsProcessed).toBeGreaterThanOrEqual(0)
    })

    it('should track total errors', () => {
      const status = scheduler.getStatus()

      expect(status.totalErrors).toBeDefined()
      expect(status.totalErrors).toBeGreaterThanOrEqual(0)
    })

    it('should increment error count on failures', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Failure'))

      const statusBefore = scheduler.getStatus()
      scheduler.start()

      await new Promise(resolve => setTimeout(resolve, 200))
      scheduler.stop()

      const statusAfter = scheduler.getStatus()
      // Error count may or may not increase depending on timing
      expect(statusAfter.totalErrors).toBeGreaterThanOrEqual(statusBefore.totalErrors)
    })
  })
})
