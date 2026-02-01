import type { Request, Response, NextFunction } from 'express'

export type RequestedDataTier = 'oss' | 'paid' | 'unknown'
export type ResolvedDataTier = 'free-tier' | 'starter-tier'

export interface DataTierContext {
  requested: RequestedDataTier
  resolved: ResolvedDataTier
}

export interface DataTierRequest extends Request {
  dataTier?: DataTierContext
}

const OSS_ALIASES = new Set(['oss', 'open', 'free', 'free-tier', 'community', 'base'])

const PAID_ALIASES = new Set(['paid', 'starter', 'starter-tier', 'pro', 'premium'])

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (!value) return ''
  const raw = Array.isArray(value) ? value[0] : value
  return raw.trim().toLowerCase()
}

export function resolveRequestedDataTier(
  headerValue: string | string[] | undefined
): RequestedDataTier {
  const normalized = normalizeHeaderValue(headerValue)
  if (!normalized) return 'oss'
  if (OSS_ALIASES.has(normalized)) return 'oss'
  if (PAID_ALIASES.has(normalized)) return 'paid'
  return 'unknown'
}

export function resolveDataTier(headerValue: string | string[] | undefined): ResolvedDataTier {
  const requested = resolveRequestedDataTier(headerValue)
  return requested === 'paid' ? 'starter-tier' : 'free-tier'
}

export function getResolvedDataTier(req: Request): ResolvedDataTier {
  const cached = (req as DataTierRequest).dataTier?.resolved
  return cached ?? resolveDataTier(req.headers['x-data-tier'])
}

export function getDataTierContext(req: Request): DataTierContext {
  const cached = (req as DataTierRequest).dataTier
  if (cached) return cached
  const requested = resolveRequestedDataTier(req.headers['x-data-tier'])
  return {
    requested,
    resolved: requested === 'paid' ? 'starter-tier' : 'free-tier'
  }
}

export const dataTierRouter = (req: Request, res: Response, next: NextFunction): void => {
  const context = getDataTierContext(req)
  ;(req as DataTierRequest).dataTier = context
  res.setHeader('x-data-tier-resolved', context.resolved)
  next()
}
