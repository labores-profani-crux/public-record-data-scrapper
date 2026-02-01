import { beforeAll, afterAll, afterEach } from 'vitest'
import { database } from '../database/connection'

// Test database setup
beforeAll(async () => {
  // Connect to test database
  const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL

  if (!testDbUrl) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for tests')
  }

  try {
    await database.connect()
    console.log('✓ Test database connected')
  } catch (error) {
    console.error('Failed to connect to test database:', error)
    throw error
  }
})

// Clean up after each test
afterEach(async () => {
  // Clean up test data after each test
  // This ensures tests don't interfere with each other
  try {
    await database.query('BEGIN')

    // Delete in reverse order of foreign key dependencies
    await database.query('DELETE FROM audit_logs')
    await database.query('DELETE FROM usage_tracking')
    await database.query('DELETE FROM growth_signals')
    await database.query('DELETE FROM health_scores')
    await database.query('DELETE FROM prospects')
    await database.query('DELETE FROM portfolio_companies')
    await database.query('DELETE FROM ucc_filings')
    await database.query('DELETE FROM data_ingestion_logs')

    await database.query('COMMIT')
  } catch (error) {
    await database.query('ROLLBACK')
    console.error('Failed to clean up test data:', error)
  }
})

// Tear down after all tests
afterAll(async () => {
  try {
    await database.disconnect()
    console.log('✓ Test database disconnected')
  } catch (error) {
    console.error('Failed to disconnect from test database:', error)
  }
})
