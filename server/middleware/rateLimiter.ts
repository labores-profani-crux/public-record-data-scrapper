import { Request, Response, NextFunction } from 'express'
import { config } from '../config'

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const identifier = req.ip || 'unknown'
  const now = Date.now()

  if (!store[identifier]) {
    store[identifier] = {
      count: 1,
      resetTime: now + config.rateLimit.windowMs
    }
    return next()
  }

  const record = store[identifier]

  // Reset if window expired
  if (now > record.resetTime) {
    record.count = 1
    record.resetTime = now + config.rateLimit.windowMs
    return next()
  }

  // Increment count
  record.count++

  // Check limit
  if (record.count > config.rateLimit.max) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000)

    res.set('Retry-After', retryAfter.toString())
    res.set('X-RateLimit-Limit', config.rateLimit.max.toString())
    res.set('X-RateLimit-Remaining', '0')
    res.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString())

    return res.status(429).json({
      error: {
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
        retryAfter
      }
    })
  }

  // Add rate limit headers
  res.set('X-RateLimit-Limit', config.rateLimit.max.toString())
  res.set('X-RateLimit-Remaining', (config.rateLimit.max - record.count).toString())
  res.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString())

  next()
}

// Cleanup old entries every hour
setInterval(() => {
  const now = Date.now()
  Object.keys(store).forEach(key => {
    if (now > store[key].resetTime) {
      delete store[key]
    }
  })
}, 60 * 60 * 1000)
