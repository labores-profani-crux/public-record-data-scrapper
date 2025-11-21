import { Router } from 'express'
import { database } from '../database/connection'
import { asyncHandler } from '../middleware/errorHandler'

const router = Router()

// GET /api/health - Basic health check
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    })
  })
)

// GET /api/health/detailed - Detailed health check with dependencies
router.get(
  '/detailed',
  asyncHandler(async (req, res) => {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: 'unknown',
        memory: 'ok',
        cpu: 'ok'
      }
    }

    // Check database
    try {
      await database.query('SELECT 1')
      checks.services.database = 'ok'
    } catch (error) {
      checks.services.database = 'error'
      checks.status = 'degraded'
    }

    // Check memory usage
    const memUsage = process.memoryUsage()
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)

    if (memUsedMB / memTotalMB > 0.9) {
      checks.services.memory = 'warning'
      checks.status = 'degraded'
    }

    res.json(checks)
  })
)

// GET /api/health/ready - Readiness probe for Kubernetes
router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    try {
      // Check if database is ready
      await database.query('SELECT 1')

      res.status(200).json({
        ready: true,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      res.status(503).json({
        ready: false,
        error: 'Database not ready',
        timestamp: new Date().toISOString()
      })
    }
  })
)

// GET /api/health/live - Liveness probe for Kubernetes
router.get('/live', (req, res) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString()
  })
})

export default router
