/**
 * Growth Signal Data Sources
 *
 * Implementation of growth signal data sources:
 * - NewsAPI (news and press releases)
 * - USASpending.gov (government contracts)
 * - Indeed Jobs API (hiring signals)
 * - Permit data sources
 */

import { BaseDataSource, DataSourceResponse } from './base-source'

/**
 * NewsAPI - Company news and press releases
 * Free tier: 100 requests/day
 */
export class NewsAPISource extends BaseDataSource {
  private apiKey: string

  constructor() {
    super({
      name: 'newsapi',
      tier: 'free',
      cost: 0,
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    })

    this.apiKey = process.env.NEWS_API_KEY || ''
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'NewsAPI key not configured',
        source: this.config.name,
        timestamp: new Date().toISOString(),
        responseTime: 0
      }
    }

    return this.executeFetch(async () => {
      const { companyName, fromDate } = query

      // Calculate date range (last 30 days by default)
      const from = fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const to = new Date().toISOString().split('T')[0]

      // NewsAPI Everything endpoint
      const searchUrl = `https://newsapi.org/v2/everything?q="${encodeURIComponent(companyName)}"&from=${from}&to=${to}&sortBy=publishedAt&language=en&apiKey=${this.apiKey}`

      const response = await fetch(searchUrl)

      if (!response.ok) {
        throw new Error(`NewsAPI error: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.status !== 'ok') {
        throw new Error(`NewsAPI error: ${data.message || 'Unknown error'}`)
      }

      // Categorize articles by sentiment/type
      const articles = data.articles || []
      const growthKeywords = ['expansion', 'hiring', 'investment', 'funding', 'acquisition', 'growth', 'new location', 'contract win']
      const riskKeywords = ['lawsuit', 'bankruptcy', 'closure', 'layoff', 'investigation', 'scandal', 'fine', 'violation']

      const growthArticles = articles.filter((a: any) =>
        growthKeywords.some(kw =>
          a.title?.toLowerCase().includes(kw) || a.description?.toLowerCase().includes(kw)
        )
      )

      const riskArticles = articles.filter((a: any) =>
        riskKeywords.some(kw =>
          a.title?.toLowerCase().includes(kw) || a.description?.toLowerCase().includes(kw)
        )
      )

      return {
        totalArticles: data.totalResults || 0,
        articles: articles.slice(0, 10),
        growthSignals: growthArticles.length,
        riskSignals: riskArticles.length,
        growthArticles: growthArticles.slice(0, 5),
        riskArticles: riskArticles.slice(0, 5),
        companyName,
        dateRange: { from, to }
      }
    }, query)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(query.companyName && query.companyName.length > 0)
  }
}

/**
 * USASpending.gov API - Federal government contract awards
 * Free, no API key required
 */
export class USASpendingSource extends BaseDataSource {
  constructor() {
    super({
      name: 'usaspending',
      tier: 'free',
      cost: 0,
      timeout: 15000,
      retryAttempts: 3,
      retryDelay: 2000
    })
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    return this.executeFetch(async () => {
      const { companyName, uei } = query

      // USASpending.gov search endpoint
      const searchUrl = 'https://api.usaspending.gov/api/v2/search/spending_by_award/'

      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filters: {
            recipient_search_text: [companyName],
            time_period: [
              {
                start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                end_date: new Date().toISOString().split('T')[0]
              }
            ]
          },
          fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Award Type', 'Awarding Agency', 'Start Date'],
          page: 1,
          limit: 100,
          sort: 'Award Amount',
          order: 'desc'
        })
      })

      if (!response.ok) {
        throw new Error(`USASpending API error: ${response.statusText}`)
      }

      const data = await response.json()

      const results = data.results || []
      const totalAmount = results.reduce((sum: number, award: any) =>
        sum + (parseFloat(award.Award_Amount) || 0), 0
      )

      // Calculate growth trend (compare recent 6 months vs previous 6 months)
      const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000
      const recentAwards = results.filter((a: any) =>
        new Date(a.Start_Date).getTime() > sixMonthsAgo
      )
      const olderAwards = results.filter((a: any) =>
        new Date(a.Start_Date).getTime() <= sixMonthsAgo
      )

      const recentTotal = recentAwards.reduce((sum: number, a: any) =>
        sum + (parseFloat(a.Award_Amount) || 0), 0
      )
      const olderTotal = olderAwards.reduce((sum: number, a: any) =>
        sum + (parseFloat(a.Award_Amount) || 0), 0
      )

      return {
        totalContracts: data.page_metadata?.total || 0,
        totalAmount,
        contracts: results.slice(0, 20),
        recentContracts: recentAwards.length,
        recentAmount: recentTotal,
        growthTrend: olderTotal > 0 ? ((recentTotal - olderTotal) / olderTotal) * 100 : 0,
        companyName
      }
    }, query)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(query.companyName && query.companyName.length > 0)
  }
}

/**
 * BuildingPermits API - Building permit data (growth signal)
 * Note: Requires local government API access or commercial service
 */
export class BuildingPermitsSource extends BaseDataSource {
  private apiKey: string

  constructor() {
    super({
      name: 'building-permits',
      tier: 'starter',
      cost: 0.10,
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    })

    this.apiKey = process.env.BUILDING_PERMITS_API_KEY || ''
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    return this.executeFetch(async () => {
      const { companyName, address, city, state, zipCode } = query

      // Example using a hypothetical permit aggregation service
      // In reality, this would need to be implemented per jurisdiction
      const searchUrl = `https://api.permitdata.io/v1/permits/search`

      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          company: companyName,
          address,
          city,
          state,
          zipCode,
          dateFrom: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        })
      })

      if (!response.ok) {
        // Return empty data if API not configured rather than failing
        if (!this.apiKey || response.status === 401) {
          return {
            permits: [],
            totalPermits: 0,
            totalValue: 0,
            recentActivity: false,
            companyName,
            note: 'Permit API not configured'
          }
        }
        throw new Error(`Building Permits API error: ${response.statusText}`)
      }

      const data = await response.json()

      const permits = data.permits || []
      const totalValue = permits.reduce((sum: number, p: any) =>
        sum + (parseFloat(p.estimatedValue) || 0), 0
      )

      // Check for recent activity (last 90 days)
      const recentThreshold = Date.now() - 90 * 24 * 60 * 60 * 1000
      const recentPermits = permits.filter((p: any) =>
        new Date(p.issuedDate).getTime() > recentThreshold
      )

      return {
        totalPermits: permits.length,
        permits: permits.slice(0, 10),
        totalValue,
        recentPermits: recentPermits.length,
        recentActivity: recentPermits.length > 0,
        permitTypes: [...new Set(permits.map((p: any) => p.type))],
        companyName
      }
    }, query)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(query.companyName || (query.address && query.city && query.state))
  }
}

/**
 * Indeed Jobs API - Job posting data (hiring/growth signal)
 * Uses Indeed Publisher API
 */
export class IndeedJobsSource extends BaseDataSource {
  private publisherId: string

  constructor() {
    super({
      name: 'indeed-jobs',
      tier: 'free',
      cost: 0,
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    })

    this.publisherId = process.env.INDEED_PUBLISHER_ID || ''
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    return this.executeFetch(async () => {
      const { companyName, location } = query

      if (!this.publisherId) {
        // Fallback to web scraping approach or return limited data
        return {
          jobs: [],
          totalJobs: 0,
          recentJobs: 0,
          growthSignal: 'unknown',
          companyName,
          note: 'Indeed API not configured'
        }
      }

      // Indeed Job Search API
      const searchUrl = `https://api.indeed.com/ads/apisearch?publisher=${this.publisherId}&q="${encodeURIComponent(companyName)}"&l=${encodeURIComponent(location || '')}&format=json&v=2&limit=25`

      const response = await fetch(searchUrl)

      if (!response.ok) {
        throw new Error(`Indeed API error: ${response.statusText}`)
      }

      const data = await response.json()

      const jobs = data.results || []

      // Analyze job posting dates to determine hiring velocity
      const dates = jobs.map((j: any) => new Date(j.date))
      const recentThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000
      const recentJobs = dates.filter(d => d.getTime() > recentThreshold).length

      // Determine growth signal
      let growthSignal = 'low'
      if (recentJobs > 10) growthSignal = 'high'
      else if (recentJobs > 5) growthSignal = 'medium'

      // Extract key job categories
      const jobTitles = jobs.map((j: any) => j.jobtitle)
      const seniorRoles = jobTitles.filter((title: string) =>
        /senior|lead|manager|director|vp|chief/i.test(title)
      ).length

      return {
        totalJobs: data.totalResults || 0,
        jobs: jobs.slice(0, 15),
        recentJobs,
        growthSignal,
        seniorRoles,
        isHiring: jobs.length > 0,
        jobCategories: [...new Set(jobs.map((j: any) => j.jobtitle).slice(0, 10))],
        companyName,
        location
      }
    }, query)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(query.companyName && query.companyName.length > 0)
  }
}

/**
 * LinkedIn Jobs API - Professional hiring data
 * Note: Requires LinkedIn API access (restricted)
 */
export class LinkedInJobsSource extends BaseDataSource {
  private apiKey: string

  constructor() {
    super({
      name: 'linkedin-jobs',
      tier: 'professional',
      cost: 0.25,
      timeout: 10000,
      retryAttempts: 2,
      retryDelay: 2000
    })

    this.apiKey = process.env.LINKEDIN_API_KEY || ''
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'LinkedIn API key not configured',
        source: this.config.name,
        timestamp: new Date().toISOString(),
        responseTime: 0
      }
    }

    return this.executeFetch(async () => {
      const { companyName, companyId } = query

      // LinkedIn Jobs API (requires partnership)
      const searchUrl = `https://api.linkedin.com/v2/jobs?q=company&company=${companyId || companyName}`

      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      })

      if (!response.ok) {
        throw new Error(`LinkedIn API error: ${response.statusText}`)
      }

      const data = await response.json()

      const jobs = data.elements || []

      return {
        totalJobs: data.paging?.total || jobs.length,
        jobs: jobs.slice(0, 20),
        companyName,
        isActivelyHiring: jobs.length > 0
      }
    }, query)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(query.companyName || query.companyId)
  }
}
