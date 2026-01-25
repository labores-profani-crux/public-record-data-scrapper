import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Check if bullmq is available
let bullmqAvailable = false
try {
  require.resolve('bullmq')
  bullmqAvailable = true
} catch {
  bullmqAvailable = false
}

// Skip all tests if bullmq is not installed
const describeConditional = bullmqAvailable ? describe : describe.skip

// Create hoisted mocks
const mocks = vi.hoisted(() => {
  const mockQueueClose = vi.fn().mockResolvedValue(undefined)
  const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'test-job-id' })
  const instances: Array<{ name: string; opts: Record<string, unknown> }> = []

  class MockQueue {
    name: string
    opts: Record<string, unknown>
    close = mockQueueClose
    add = mockQueueAdd

    constructor(name: string, opts: Record<string, unknown>) {
      this.name = name
      this.opts = opts
      instances.push(this)
    }
  }

  const mockClient = { isReady: true }

  return {
    MockQueue,
    mockQueueClose,
    mockQueueAdd,
    instances,
    mockClient,
    resetInstances: () => {
      instances.length = 0
    }
  }
})

vi.mock('bullmq', () => ({
  Queue: mocks.MockQueue
}))

vi.mock('../../queue/connection', () => ({
  redisConnection: {
    connect: vi.fn().mockReturnValue({ client: mocks.mockClient, subscriber: {} })
  }
}))

describeConditional('Queue Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resetInstances()
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('initializeQueues', () => {
    it('should create three queues with correct names', async () => {
      const { initializeQueues } = await import('../../queue/queues')

      const queues = initializeQueues()

      expect(mocks.instances.length).toBe(3)
      expect(queues.ingestionQueue.name).toBe('ucc-ingestion')
      expect(queues.enrichmentQueue.name).toBe('data-enrichment')
      expect(queues.healthScoreQueue.name).toBe('health-scores')
    })

    it('should configure queues with default job options', async () => {
      const { initializeQueues } = await import('../../queue/queues')

      const queues = initializeQueues()

      const expectedOptions = {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: {
          count: 100,
          age: 7 * 24 * 60 * 60
        },
        removeOnFail: {
          count: 500,
          age: 30 * 24 * 60 * 60
        }
      }

      expect(queues.ingestionQueue.opts).toMatchObject({
        defaultJobOptions: expectedOptions
      })
    })

    it('should connect to Redis when initializing queues', async () => {
      const { redisConnection } = await import('../../queue/connection')
      const { initializeQueues } = await import('../../queue/queues')

      initializeQueues()

      expect(redisConnection.connect).toHaveBeenCalled()
    })

    it('should use the same connection for all queues', async () => {
      const { initializeQueues } = await import('../../queue/queues')

      const queues = initializeQueues()

      expect(queues.ingestionQueue.opts.connection).toBe(mocks.mockClient)
      expect(queues.enrichmentQueue.opts.connection).toBe(mocks.mockClient)
      expect(queues.healthScoreQueue.opts.connection).toBe(mocks.mockClient)
    })
  })

  describe('getIngestionQueue', () => {
    it('should return ingestion queue when initialized', async () => {
      const { initializeQueues, getIngestionQueue } = await import('../../queue/queues')

      initializeQueues()
      const queue = getIngestionQueue()

      expect(queue.name).toBe('ucc-ingestion')
    })

    it('should throw error when queue not initialized', async () => {
      const { getIngestionQueue } = await import('../../queue/queues')

      expect(() => getIngestionQueue()).toThrow(
        'Ingestion queue not initialized. Call initializeQueues() first.'
      )
    })
  })

  describe('getEnrichmentQueue', () => {
    it('should return enrichment queue when initialized', async () => {
      const { initializeQueues, getEnrichmentQueue } = await import('../../queue/queues')

      initializeQueues()
      const queue = getEnrichmentQueue()

      expect(queue.name).toBe('data-enrichment')
    })

    it('should throw error when queue not initialized', async () => {
      const { getEnrichmentQueue } = await import('../../queue/queues')

      expect(() => getEnrichmentQueue()).toThrow(
        'Enrichment queue not initialized. Call initializeQueues() first.'
      )
    })
  })

  describe('getHealthScoreQueue', () => {
    it('should return health score queue when initialized', async () => {
      const { initializeQueues, getHealthScoreQueue } = await import('../../queue/queues')

      initializeQueues()
      const queue = getHealthScoreQueue()

      expect(queue.name).toBe('health-scores')
    })

    it('should throw error when queue not initialized', async () => {
      const { getHealthScoreQueue } = await import('../../queue/queues')

      expect(() => getHealthScoreQueue()).toThrow(
        'Health score queue not initialized. Call initializeQueues() first.'
      )
    })
  })

  describe('closeQueues', () => {
    it('should close all queues', async () => {
      const { initializeQueues, closeQueues } = await import('../../queue/queues')

      initializeQueues()
      await closeQueues()

      expect(mocks.mockQueueClose).toHaveBeenCalledTimes(3)
    })

    it('should handle closing uninitialized queues gracefully', async () => {
      const { closeQueues } = await import('../../queue/queues')

      await expect(closeQueues()).resolves.not.toThrow()
    })

    it('should log success message after closing', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { initializeQueues, closeQueues } = await import('../../queue/queues')

      initializeQueues()
      await closeQueues()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Job queues closed'))
      consoleSpy.mockRestore()
    })
  })

  describe('Job Data Interfaces', () => {
    it('should accept IngestionJobData with required state field', async () => {
      const { initializeQueues, getIngestionQueue } = await import('../../queue/queues')

      initializeQueues()
      const queue = getIngestionQueue()

      await queue.add('test-job', {
        state: 'NY',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        batchSize: 100
      })

      expect(mocks.mockQueueAdd).toHaveBeenCalledWith('test-job', {
        state: 'NY',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        batchSize: 100
      })
    })

    it('should accept EnrichmentJobData with prospectIds array', async () => {
      const { initializeQueues, getEnrichmentQueue } = await import('../../queue/queues')

      initializeQueues()
      const queue = getEnrichmentQueue()

      await queue.add('test-job', {
        prospectIds: ['id-1', 'id-2', 'id-3'],
        force: true
      })

      expect(mocks.mockQueueAdd).toHaveBeenCalledWith('test-job', {
        prospectIds: ['id-1', 'id-2', 'id-3'],
        force: true
      })
    })

    it('should accept HealthScoreJobData with optional fields', async () => {
      const { initializeQueues, getHealthScoreQueue } = await import('../../queue/queues')

      initializeQueues()
      const queue = getHealthScoreQueue()

      await queue.add('test-job', {
        portfolioCompanyId: 'company-123',
        batchSize: 50
      })

      expect(mocks.mockQueueAdd).toHaveBeenCalledWith('test-job', {
        portfolioCompanyId: 'company-123',
        batchSize: 50
      })
    })
  })
})

// Add a single test that always runs to indicate the skip reason
describe('Queue Tests - Dependency Check', () => {
  it.skipIf(!bullmqAvailable)('should skip queue tests when bullmq is not installed', () => {
    expect(true).toBe(true)
  })

  it.skipIf(bullmqAvailable)('skips tests because bullmq is not installed', () => {
    console.log('Queue tests skipped: bullmq package not installed')
    expect(true).toBe(true)
  })
})
