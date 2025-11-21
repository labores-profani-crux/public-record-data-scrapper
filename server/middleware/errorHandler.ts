import { Request, Response, NextFunction } from 'express'

export interface AppError extends Error {
  statusCode?: number
  code?: string
}

export class HttpError extends Error implements AppError {
  statusCode: number
  code: string

  constructor(statusCode: number, message: string, code?: string) {
    super(message)
    this.statusCode = statusCode
    this.code = code || 'INTERNAL_ERROR'
    this.name = 'HttpError'
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  // Log error
  console.error('[ERROR]', {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    statusCode,
    message,
    stack: config.server.env === 'development' ? err.stack : undefined,
    correlationId: (req as any).correlationId
  })

  // Send error response
  res.status(statusCode).json({
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
      statusCode,
      correlationId: (req as any).correlationId,
      ...(config.server.env === 'development' && { stack: err.stack })
    }
  })
}

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
      statusCode: 404
    }
  })
}

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

import { config } from '../config'
