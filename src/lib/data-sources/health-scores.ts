/**
 * Health Score Data Sources
 *
 * Implementation of health score data sources:
 * - Yelp Fusion API (reviews and ratings)
 * - Better Business Bureau (BBB ratings and complaints)
 * - Google Reviews (via Google Places)
 * - Sentiment Analysis services
 */

import { BaseDataSource, DataSourceResponse } from './base-source'

/**
 * Yelp Fusion API - Business reviews and ratings
 * Free tier: 5000 requests/day
 */
export class YelpSource extends BaseDataSource {
  private apiKey: string

  constructor() {
    super({
      name: 'yelp',
      tier: 'free',
      cost: 0,
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    })

    this.apiKey = process.env.YELP_API_KEY || ''
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'Yelp API key not configured',
        source: this.config.name,
        timestamp: new Date().toISOString(),
        responseTime: 0
      }
    }

    return this.executeFetch(async () => {
      const { companyName, location, city, state } = query

      // Construct location string
      const locationStr = location || `${city}, ${state}`

      // Yelp Business Search endpoint
      const searchUrl = `https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(companyName)}&location=${encodeURIComponent(locationStr)}&limit=1`

      const response = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      })

      if (!response.ok) {
        throw new Error(`Yelp API error: ${response.statusText}`)
      }

      const data = await response.json()

      const business = data.businesses?.[0]

      if (!business) {
        return {
          found: false,
          companyName,
          location: locationStr
        }
      }

      // Fetch reviews if we found the business
      const reviewsUrl = `https://api.yelp.com/v3/businesses/${business.id}/reviews?limit=20&sort_by=newest`

      const reviewsResponse = await fetch(reviewsUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      })

      let reviews = []
      if (reviewsResponse.ok) {
        const reviewsData = await reviewsResponse.json()
        reviews = reviewsData.reviews || []
      }

      // Calculate sentiment metrics
      const recentReviews = reviews.slice(0, 10)
      const avgRating = recentReviews.reduce((sum: number, r: any) =>
        sum + (r.rating || 0), 0
      ) / (recentReviews.length || 1)

      // Calculate health score (0-100)
      const healthScore = this.calculateHealthScore(business.rating, business.review_count, avgRating)

      return {
        found: true,
        yelpId: business.id,
        name: business.name,
        rating: business.rating,
        reviewCount: business.review_count,
        categories: business.categories?.map((c: any) => c.title) || [],
        phone: business.phone,
        address: business.location?.display_address?.join(', '),
        isOpen: !business.is_closed,
        recentReviews: recentReviews.slice(0, 5),
        recentAverageRating: avgRating,
        healthScore,
        companyName,
        location: locationStr
      }
    }, query)
  }

  private calculateHealthScore(overallRating: number, reviewCount: number, recentAvgRating: number): number {
    // Weight: 40% overall rating, 30% recent rating, 30% review volume
    const ratingScore = (overallRating / 5) * 40
    const recentScore = (recentAvgRating / 5) * 30
    const volumeScore = Math.min(reviewCount / 100, 1) * 30

    return Math.round(ratingScore + recentScore + volumeScore)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(
      query.companyName &&
      (query.location || (query.city && query.state))
    )
  }
}

/**
 * Better Business Bureau (BBB) - Scraper for BBB ratings
 * Note: BBB doesn't have a public API, so this uses web scraping
 */
export class BBBSource extends BaseDataSource {
  constructor() {
    super({
      name: 'bbb',
      tier: 'free',
      cost: 0,
      timeout: 15000,
      retryAttempts: 2,
      retryDelay: 2000
    })
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    return this.executeFetch(async () => {
      const { companyName, city, state } = query

      // BBB search URL
      const searchUrl = `https://www.bbb.org/search?find_text=${encodeURIComponent(companyName)}&find_loc=${encodeURIComponent(`${city}, ${state}`)}&find_type=Business`

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; UCC-MCA-Intelligence/1.0)'
        }
      })

      if (!response.ok) {
        throw new Error(`BBB request error: ${response.statusText}`)
      }

      const html = await response.text()

      // Parse HTML to extract BBB rating
      // Note: This is a simplified example - real implementation would need proper HTML parsing
      const ratingMatch = html.match(/rating-([A-F][+-]?)/i)
      const rating = ratingMatch ? ratingMatch[1] : null

      const complaintsMatch = html.match(/(\d+)\s+complaints?/i)
      const complaints = complaintsMatch ? parseInt(complaintsMatch[1], 10) : 0

      // Convert letter grade to numeric score
      const letterGrades: Record<string, number> = {
        'A+': 97, 'A': 93, 'A-': 90,
        'B+': 87, 'B': 83, 'B-': 80,
        'C+': 77, 'C': 73, 'C-': 70,
        'D+': 67, 'D': 63, 'D-': 60,
        'F': 50
      }

      const numericScore = rating ? letterGrades[rating] || 50 : null

      return {
        found: rating !== null,
        rating,
        numericScore,
        complaints,
        healthScore: numericScore ? Math.max(0, numericScore - complaints * 2) : null,
        companyName,
        location: `${city}, ${state}`,
        url: searchUrl,
        note: 'BBB data extracted via web scraping'
      }
    }, query)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(query.companyName && query.city && query.state)
  }
}

/**
 * Google Reviews API - Reviews via Google Places
 * Requires Google Places API key
 */
export class GoogleReviewsSource extends BaseDataSource {
  private apiKey: string

  constructor() {
    super({
      name: 'google-reviews',
      tier: 'starter',
      cost: 0.02,
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    })

    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || ''
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'Google Places API key not configured',
        source: this.config.name,
        timestamp: new Date().toISOString(),
        responseTime: 0
      }
    }

    return this.executeFetch(async () => {
      const { companyName, placeId, city, state } = query

      let actualPlaceId = placeId

      // If no placeId provided, search for it first
      if (!actualPlaceId) {
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(companyName + ' ' + city + ' ' + state)}&key=${this.apiKey}`

        const searchResponse = await fetch(searchUrl)
        if (!searchResponse.ok) {
          throw new Error(`Google Places search error: ${searchResponse.statusText}`)
        }

        const searchData = await searchResponse.json()
        if (searchData.status !== 'OK' || !searchData.results?.[0]) {
          return {
            found: false,
            companyName,
            location: `${city}, ${state}`
          }
        }

        actualPlaceId = searchData.results[0].place_id
      }

      // Get place details including reviews
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${actualPlaceId}&fields=name,rating,user_ratings_total,reviews,opening_hours&key=${this.apiKey}`

      const response = await fetch(detailsUrl)

      if (!response.ok) {
        throw new Error(`Google Places API error: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.status !== 'OK') {
        throw new Error(`Google Places API error: ${data.status}`)
      }

      const place = data.result

      // Analyze reviews
      const reviews = place.reviews || []
      const recentReviews = reviews.slice(0, 5)

      const avgRating = recentReviews.reduce((sum: number, r: any) =>
        sum + (r.rating || 0), 0
      ) / (recentReviews.length || 1)

      // Calculate sentiment from review text
      const positiveWords = ['great', 'excellent', 'amazing', 'professional', 'recommend', 'best', 'outstanding']
      const negativeWords = ['terrible', 'awful', 'poor', 'worst', 'disappointed', 'unprofessional', 'avoid']

      let sentimentScore = 0
      reviews.forEach((review: any) => {
        const text = review.text?.toLowerCase() || ''
        const positiveCount = positiveWords.filter(w => text.includes(w)).length
        const negativeCount = negativeWords.filter(w => text.includes(w)).length
        sentimentScore += (positiveCount - negativeCount)
      })

      // Calculate health score (0-100)
      const healthScore = this.calculateHealthScore(
        place.rating,
        place.user_ratings_total,
        avgRating,
        sentimentScore
      )

      return {
        found: true,
        placeId: actualPlaceId,
        name: place.name,
        rating: place.rating,
        totalReviews: place.user_ratings_total,
        reviews: recentReviews,
        recentAverageRating: avgRating,
        sentimentScore,
        healthScore,
        isOpen: place.opening_hours?.open_now,
        companyName,
        location: `${city}, ${state}`
      }
    }, query)
  }

  private calculateHealthScore(
    overallRating: number,
    reviewCount: number,
    recentAvg: number,
    sentiment: number
  ): number {
    // Weight: 35% overall rating, 30% recent rating, 20% volume, 15% sentiment
    const ratingScore = (overallRating / 5) * 35
    const recentScore = (recentAvg / 5) * 30
    const volumeScore = Math.min(reviewCount / 200, 1) * 20
    const sentimentScore = Math.max(0, Math.min(sentiment / 10, 1)) * 15

    return Math.round(ratingScore + recentScore + volumeScore + sentimentScore)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(
      query.companyName &&
      ((query.city && query.state) || query.placeId)
    )
  }
}

/**
 * Sentiment Analysis API - Analyze review sentiment
 * Uses AWS Comprehend or Google Cloud Natural Language
 */
export class SentimentAnalysisSource extends BaseDataSource {
  private provider: 'aws' | 'google'
  private apiKey: string

  constructor(provider: 'aws' | 'google' = 'aws') {
    super({
      name: 'sentiment-analysis',
      tier: 'professional',
      cost: 0.0001, // Per text unit
      timeout: 10000,
      retryAttempts: 2,
      retryDelay: 1000
    })

    this.provider = provider
    this.apiKey = provider === 'google'
      ? (process.env.GOOGLE_NLP_API_KEY || '')
      : (process.env.AWS_COMPREHEND_KEY || '')
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    if (!this.apiKey && this.provider === 'google') {
      return {
        success: false,
        error: 'Sentiment analysis API key not configured',
        source: this.config.name,
        timestamp: new Date().toISOString(),
        responseTime: 0
      }
    }

    return this.executeFetch(async () => {
      const { texts } = query

      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Invalid input: texts array required')
      }

      if (this.provider === 'google') {
        return await this.analyzeWithGoogle(texts)
      } else {
        return await this.analyzeWithAWS(texts)
      }
    }, query)
  }

  private async analyzeWithGoogle(texts: string[]): Promise<any> {
    const url = `https://language.googleapis.com/v1/documents:analyzeSentiment?key=${this.apiKey}`

    const results = []

    for (const text of texts.slice(0, 10)) { // Limit to 10 texts
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          document: {
            type: 'PLAIN_TEXT',
            content: text
          },
          encodingType: 'UTF8'
        })
      })

      if (!response.ok) {
        throw new Error(`Google NLP API error: ${response.statusText}`)
      }

      const data = await response.json()
      results.push({
        text: text.substring(0, 100) + '...',
        score: data.documentSentiment.score,
        magnitude: data.documentSentiment.magnitude,
        sentiment: this.categorizeSentiment(data.documentSentiment.score)
      })
    }

    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length
    const avgMagnitude = results.reduce((sum, r) => sum + r.magnitude, 0) / results.length

    return {
      provider: 'google',
      textsAnalyzed: results.length,
      results,
      averageScore: avgScore,
      averageMagnitude: avgMagnitude,
      overallSentiment: this.categorizeSentiment(avgScore),
      healthImpact: this.calculateHealthImpact(avgScore, avgMagnitude)
    }
  }

  private async analyzeWithAWS(texts: string[]): Promise<any> {
    // Note: AWS Comprehend requires AWS SDK, this is a simplified example
    // In production, use AWS SDK with proper credentials
    return {
      provider: 'aws',
      textsAnalyzed: texts.length,
      note: 'AWS Comprehend integration requires AWS SDK setup',
      results: [],
      averageScore: 0,
      overallSentiment: 'neutral'
    }
  }

  private categorizeSentiment(score: number): string {
    if (score >= 0.25) return 'positive'
    if (score <= -0.25) return 'negative'
    return 'neutral'
  }

  private calculateHealthImpact(score: number, magnitude: number): number {
    // Convert sentiment to health impact (-50 to +50)
    // Higher magnitude = stronger impact
    return Math.round(score * magnitude * 50)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(query.texts && Array.isArray(query.texts) && query.texts.length > 0)
  }
}

/**
 * Trustpilot API - Business reviews and ratings
 * Requires Trustpilot API access
 */
export class TrustpilotSource extends BaseDataSource {
  private apiKey: string

  constructor() {
    super({
      name: 'trustpilot',
      tier: 'professional',
      cost: 0.05,
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    })

    this.apiKey = process.env.TRUSTPILOT_API_KEY || ''
  }

  async fetchData(query: Record<string, any>): Promise<DataSourceResponse> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'Trustpilot API key not configured',
        source: this.config.name,
        timestamp: new Date().toISOString(),
        responseTime: 0
      }
    }

    return this.executeFetch(async () => {
      const { companyName, domain } = query

      // Search for business
      const searchUrl = `https://api.trustpilot.com/v1/business-units/search?name=${encodeURIComponent(companyName)}`

      const response = await fetch(searchUrl, {
        headers: {
          'apikey': this.apiKey
        }
      })

      if (!response.ok) {
        throw new Error(`Trustpilot API error: ${response.statusText}`)
      }

      const data = await response.json()

      const business = data.businessUnits?.[0]

      if (!business) {
        return {
          found: false,
          companyName
        }
      }

      // Get reviews
      const reviewsUrl = `https://api.trustpilot.com/v1/business-units/${business.id}/reviews`

      const reviewsResponse = await fetch(reviewsUrl, {
        headers: {
          'apikey': this.apiKey
        }
      })

      let reviews = []
      if (reviewsResponse.ok) {
        const reviewsData = await reviewsResponse.json()
        reviews = reviewsData.reviews || []
      }

      return {
        found: true,
        businessId: business.id,
        name: business.displayName,
        trustScore: business.trustScore,
        stars: business.stars,
        reviewCount: business.numberOfReviews?.total || 0,
        reviews: reviews.slice(0, 10),
        companyName
      }
    }, query)
  }

  protected validateQuery(query: Record<string, any>): boolean {
    return Boolean(query.companyName || query.domain)
  }
}
