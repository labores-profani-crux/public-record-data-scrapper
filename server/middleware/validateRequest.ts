import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { HttpError } from './errorHandler'

interface ValidationSchemas {
  body?: ZodSchema
  query?: ZodSchema
  params?: ZodSchema
}

export const validateRequest = (schemas: ValidationSchemas) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate body
      if (schemas.body) {
        req.body = schemas.body.parse(req.body)
      }

      // Validate query
      if (schemas.query) {
        req.query = schemas.query.parse(req.query)
      }

      // Validate params
      if (schemas.params) {
        req.params = schemas.params.parse(req.params)
      }

      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))

        return res.status(400).json({
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            details: errorMessages
          }
        })
      }

      next(error)
    }
  }
}
