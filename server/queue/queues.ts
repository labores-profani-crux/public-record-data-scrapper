import { Queue } from 'bullmq'
import { redisConnection } from './connection'

// Job data interfaces
export interface IngestionJobData {
  state: string
  startDate?: string
  endDate?: string
  batchSize?: number
}

export interface EnrichmentJobData {
  prospectIds: string[]
  force?: boolean
}

export interface HealthScoreJobData {
  portfolioCompanyId?: string
  batchSize?: number
}

// Queue instances
let ingestionQueue: Queue<IngestionJobData> | null = null
let enrichmentQueue: Queue<EnrichmentJobData> | null = null
let healthScoreQueue: Queue<HealthScoreJobData> | null = null

export function initializeQueues() {
  const { client } = redisConnection.connect()

  const queueConfig = {
    connection: client,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential' as const,
        delay: 2000
      },
      removeOnComplete: {
        count: 100,
        age: 7 * 24 * 60 * 60 // 7 days
      },
      removeOnFail: {
        count: 500,
        age: 30 * 24 * 60 * 60 // 30 days
      }
    }
  }

  ingestionQueue = new Queue<IngestionJobData>('ucc-ingestion', queueConfig)
  enrichmentQueue = new Queue<EnrichmentJobData>('data-enrichment', queueConfig)
  healthScoreQueue = new Queue<HealthScoreJobData>('health-scores', queueConfig)

  console.log('✓ Job queues initialized')

  return {
    ingestionQueue,
    enrichmentQueue,
    healthScoreQueue
  }
}

export function getIngestionQueue(): Queue<IngestionJobData> {
  if (!ingestionQueue) {
    throw new Error('Ingestion queue not initialized. Call initializeQueues() first.')
  }
  return ingestionQueue
}

export function getEnrichmentQueue(): Queue<EnrichmentJobData> {
  if (!enrichmentQueue) {
    throw new Error('Enrichment queue not initialized. Call initializeQueues() first.')
  }
  return enrichmentQueue
}

export function getHealthScoreQueue(): Queue<HealthScoreJobData> {
  if (!healthScoreQueue) {
    throw new Error('Health score queue not initialized. Call initializeQueues() first.')
  }
  return healthScoreQueue
}

export async function closeQueues(): Promise<void> {
  const queues = [ingestionQueue, enrichmentQueue, healthScoreQueue]
  await Promise.all(queues.map(q => q?.close()))
  console.log('✓ Job queues closed')
}
