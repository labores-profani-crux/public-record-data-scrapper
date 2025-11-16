/**
 * Base Scraper
 * 
 * Abstract base class for web scrapers with anti-detection and rate limiting
 */

export interface ScraperConfig {
  state: string
  baseUrl: string
  rateLimit: number // requests per minute
  timeout: number
  retryAttempts: number
}

export interface UCCFiling {
  filingNumber: string
  debtorName: string
  securedParty: string
  filingDate: string
  collateral: string
  status: 'active' | 'terminated' | 'lapsed'
  filingType: 'UCC-1' | 'UCC-3'
}

export interface ScraperResult {
  success: boolean
  filings?: UCCFiling[]
  error?: string
  searchUrl?: string
  timestamp: string
}

export abstract class BaseScraper {
  protected config: ScraperConfig

  constructor(config: ScraperConfig) {
    this.config = config
  }

  /**
   * Search for UCC filings
   */
  abstract search(companyName: string): Promise<ScraperResult>

  /**
   * Get manual search URL for fallback
   */
  abstract getManualSearchUrl(companyName: string): string

  /**
   * Validate search parameters
   */
  protected validateSearch(companyName: string): boolean {
    return Boolean(companyName && companyName.length > 0)
  }

  /**
   * Sleep helper for rate limiting
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get state code
   */
  getState(): string {
    return this.config.state
  }
}
