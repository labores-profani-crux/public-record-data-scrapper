import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Generate correlation ID
  const correlationId = uuidv4()
  ;(req as any).correlationId = correlationId

  const start = Date.now()

  // Log incoming request
  console.log('[REQUEST]', {
    timestamp: new Date().toISOString(),
    correlationId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  })

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start

    console.log('[RESPONSE]', {
      timestamp: new Date().toISOString(),
      correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    })
  })

  next()
}
