import { Worker, Job } from 'bullmq'
import { redisConnection } from '../connection'
import { IngestionJobData } from '../queues'
import { database } from '../../database/connection'

async function processIngestion(job: Job<IngestionJobData>): Promise<void> {
  const { state, startDate, endDate, batchSize = 1000 } = job.data

  await job.updateProgress(0)

  console.log(`[Ingestion Worker] Starting UCC ingestion for state: ${state}`)

  try {
    // Phase 2 will implement actual scraping
    // For now, simulate ingestion process
    await job.updateProgress(25)

    // Step 1: Fetch UCC filings from state portal
    console.log(`[Ingestion Worker] Fetching filings from ${state} portal...`)
    await simulateApiCall(1000)
    await job.updateProgress(50)

    // Step 2: Parse and normalize data
    console.log(`[Ingestion Worker] Parsing and normalizing data...`)
    await simulateApiCall(500)
    await job.updateProgress(75)

    // Step 3: Store in database (mock data for now)
    const mockFilingsCount = Math.floor(Math.random() * 100) + 50
    console.log(`[Ingestion Worker] Storing ${mockFilingsCount} filings in database...`)

    // Insert mock data tracking record
    await database.query(
      `INSERT INTO data_ingestion_logs (source, status, records_processed, started_at, completed_at, metadata)
       VALUES ($1, $2, $3, NOW(), NOW(), $4)`,
      [
        `ucc_${state.toLowerCase()}`,
        'success',
        mockFilingsCount,
        JSON.stringify({ state, batchSize, startDate, endDate })
      ]
    )

    await job.updateProgress(100)

    console.log(`[Ingestion Worker] Successfully ingested ${mockFilingsCount} filings for ${state}`)
  } catch (error) {
    console.error(`[Ingestion Worker] Error processing ${state}:`, error)

    // Log failure
    await database.query(
      `INSERT INTO data_ingestion_logs (source, status, error_message, started_at, completed_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [
        `ucc_${state.toLowerCase()}`,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      ]
    )

    throw error
  }
}

function simulateApiCall(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createIngestionWorker() {
  const { client } = redisConnection.connect()

  const worker = new Worker<IngestionJobData>('ucc-ingestion', processIngestion, {
    connection: client,
    concurrency: 2, // Process 2 states concurrently
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60000 // per minute
    }
  })

  worker.on('completed', (job) => {
    console.log(`[Ingestion Worker] Job ${job.id} completed successfully`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[Ingestion Worker] Job ${job?.id} failed:`, err.message)
  })

  worker.on('error', (err) => {
    console.error('[Ingestion Worker] Worker error:', err)
  })

  console.log('✓ Ingestion worker started')

  return worker
}
