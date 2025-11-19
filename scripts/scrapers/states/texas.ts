/**
 * Texas UCC Scraper
 * 
 * Scrapes UCC filing data from Texas Secretary of State
 * Uses Puppeteer for real web scraping with anti-detection measures
 */

import { BaseScraper, ScraperResult } from '../base-scraper'
import puppeteer, { Browser, Page } from 'puppeteer'

export class TexasScraper extends BaseScraper {
  private browser: Browser | null = null

  constructor() {
    super({
      state: 'TX',
      baseUrl: 'https://www.sos.state.tx.us/ucc/',
      rateLimit: 3, // 3 requests per minute (conservative for new portal)
      timeout: 45000, // Increased timeout for portal that requires login
      retryAttempts: 2
    })
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080'
        ]
      })
    }
    return this.browser
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }

  /**
   * Search for UCC filings in Texas
   */
  async search(companyName: string): Promise<ScraperResult> {
    if (!this.validateSearch(companyName)) {
      this.log('error', 'Invalid company name provided', { companyName })
      return {
        success: false,
        error: 'Invalid company name',
        timestamp: new Date().toISOString()
      }
    }

    this.log('info', 'Starting UCC search', { companyName })

    // Rate limiting - wait 12 seconds between requests (5 per minute)
    await this.sleep(12000)

    const searchUrl = this.getManualSearchUrl(companyName)

    try {
      const { result, retryCount } = await this.retryWithBackoff(async () => {
        return await this.performSearch(companyName, searchUrl)
      }, `TX UCC search for ${companyName}`)

      this.log('info', 'UCC search completed successfully', { 
        companyName, 
        filingCount: result.filings?.length || 0,
        retryCount
      })

      return {
        ...result,
        retryCount
      }
    } catch (error) {
      this.log('error', 'UCC search failed after all retries', {
        companyName,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        searchUrl,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Perform the actual search operation
   *
   * NOTE: As of September 1, 2025, Texas UCC portal requires SOS Portal account login.
   * This scraper will attempt to access public search if available, but may require
   * authentication credentials to be configured.
   */
  private async performSearch(companyName: string, searchUrl: string): Promise<ScraperResult> {
    let page: Page | null = null

    try {
      const browser = await this.getBrowser()
      page = await browser.newPage()

      this.log('info', 'Browser page created', { companyName })

      // Set user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
      await page.setViewport({ width: 1920, height: 1080 })

      // Navigate to main UCC page first
      this.log('info', 'Navigating to TX UCC portal', { companyName, baseUrl: this.config.baseUrl })
      await page.goto(this.config.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: this.config.timeout
      })

      // Check for login requirement
      const requiresLogin = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase()
        return bodyText.includes('sign in') ||
               bodyText.includes('log in') ||
               bodyText.includes('account') ||
               document.querySelector('input[type="password"]') !== null
      })

      if (requiresLogin) {
        this.log('error', 'Texas UCC portal requires authentication', { companyName })
        return {
          success: false,
          error: 'Texas UCC portal requires SOS Portal account login (as of Sept 2025). Please configure authentication or use manual search.',
          searchUrl: this.config.baseUrl,
          timestamp: new Date().toISOString()
        }
      }

      // Look for search form or search link
      const searchFormFound = await page.evaluate(() => {
        // Try to find search input fields
        const searchInputs = document.querySelectorAll('input[name*="debtor"], input[name*="search"], input[name*="name"]')
        return searchInputs.length > 0
      })

      if (!searchFormFound) {
        // Try to find and click search link
        const searchLinkClicked = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'))
          const searchLink = links.find(link =>
            link.textContent?.toLowerCase().includes('search') ||
            link.textContent?.toLowerCase().includes('ucc search')
          )
          if (searchLink) {
            searchLink.click()
            return true
          }
          return false
        })

        if (searchLinkClicked) {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
        }
      }

      // Try to fill search form
      const formFilled = await page.evaluate((name) => {
        // Try various common input name patterns for Texas UCC
        const possibleSelectors = [
          'input[name="debtorName"]',
          'input[name="debtor_name"]',
          'input[name="searchName"]',
          'input[name="name"]',
          'input[type="text"]'
        ]

        for (const selector of possibleSelectors) {
          const input = document.querySelector(selector) as HTMLInputElement
          if (input) {
            input.value = name
            return true
          }
        }
        return false
      }, companyName)

      if (!formFilled) {
        this.log('warn', 'Could not find search input field', { companyName })
        return {
          success: false,
          error: 'Unable to locate search form on Texas UCC portal. Portal structure may have changed.',
          searchUrl: page.url(),
          timestamp: new Date().toISOString()
        }
      }

      // Submit the form
      await page.evaluate(() => {
        const submitButton = document.querySelector('input[type="submit"], button[type="submit"]') as HTMLElement
        if (submitButton) {
          submitButton.click()
        } else {
          const form = document.querySelector('form')
          if (form) {
            form.submit()
          }
        }
      })

      // Wait for results
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
      await this.sleep(2000) // Additional wait for dynamic content

      // Check for CAPTCHA
      const hasCaptcha = await page.evaluate(() => {
        return document.body.innerText.toLowerCase().includes('captcha') ||
               document.body.innerText.toLowerCase().includes('robot') ||
               document.querySelector('iframe[src*="recaptcha"]') !== null ||
               document.querySelector('iframe[src*="hcaptcha"]') !== null
      })

      if (hasCaptcha) {
        this.log('error', 'CAPTCHA detected', { companyName })
        return {
          success: false,
          error: 'CAPTCHA detected - manual intervention required',
          searchUrl: page.url(),
          timestamp: new Date().toISOString()
        }
      }

      // Extract UCC filing data with multiple selector strategies
      const { filings: rawFilings, errors: parseErrors } = await page.evaluate(() => {
        const results: Array<{
          filingNumber: string
          debtorName: string
          securedParty: string
          filingDate: string
          collateral: string
          status: 'active' | 'terminated' | 'lapsed'
          filingType: 'UCC-1' | 'UCC-3'
        }> = []
        const errors: string[] = []

        // Try multiple selector strategies for Texas UCC results
        let resultElements = document.querySelectorAll('table.results tr, table.ucc-results tr, div.result-item, div.filing-item')

        // If no results found with specific selectors, try finding tables
        if (resultElements.length === 0) {
          const tables = document.querySelectorAll('table')
          for (const table of tables) {
            const rows = table.querySelectorAll('tr')
            if (rows.length > 1) { // Has header + data rows
              resultElements = rows
              break
            }
          }
        }

        resultElements.forEach((element, index) => {
          // Skip header rows
          if (element.querySelector('th') || index === 0) {
            return
          }

          try {
            const cells = element.querySelectorAll('td')

            if (cells.length >= 3) {
              // Try to extract from table cells (common pattern: filing#, date, debtor, secured party)
              const filingNumber = cells[0]?.textContent?.trim() || ''
              const filingDate = cells[1]?.textContent?.trim() || ''
              const debtorName = cells[2]?.textContent?.trim() || ''
              const securedParty = cells[3]?.textContent?.trim() || ''
              const status = cells[4]?.textContent?.trim() || ''

              if (filingNumber || debtorName) {
                results.push({
                  filingNumber,
                  debtorName,
                  securedParty,
                  filingDate,
                  collateral: '', // May need detail page navigation
                  status: status.toLowerCase().includes('active') ? 'active' :
                         status.toLowerCase().includes('terminated') ? 'terminated' :
                         status.toLowerCase().includes('lapsed') ? 'lapsed' : 'active',
                  filingType: filingNumber.toLowerCase().includes('ucc3') || filingNumber.toLowerCase().includes('ucc-3') ? 'UCC-3' : 'UCC-1'
                })
              }
            } else {
              // Try div-based layout
              const filingNumber = element.querySelector('[class*="filing"], [class*="number"]')?.textContent?.trim() || ''
              const debtorName = element.querySelector('[class*="debtor"], [class*="name"]')?.textContent?.trim() || ''
              const securedParty = element.querySelector('[class*="secured"], [class*="party"], [class*="creditor"]')?.textContent?.trim() || ''
              const filingDate = element.querySelector('[class*="date"]')?.textContent?.trim() || ''

              if (filingNumber || debtorName) {
                results.push({
                  filingNumber,
                  debtorName,
                  securedParty,
                  filingDate,
                  collateral: '',
                  status: 'active',
                  filingType: filingNumber.toLowerCase().includes('ucc3') || filingNumber.toLowerCase().includes('ucc-3') ? 'UCC-3' : 'UCC-1'
                })
              }
            }
          } catch (err) {
            errors.push(`Error parsing element ${index}: ${err instanceof Error ? err.message : String(err)}`)
          }
        })

        return { filings: results, errors }
      })

      // Validate filings and collect errors
      const { validatedFilings, validationErrors } = this.validateFilings(rawFilings, parseErrors)

      if (validationErrors.length > 0) {
        this.log('warn', 'Some filings had parsing or validation errors', {
          companyName,
          errorCount: validationErrors.length,
          errors: validationErrors
        })
      }

      this.log('info', 'Filings scraped and validated', {
        companyName,
        rawCount: rawFilings.length,
        validCount: validatedFilings.length,
        errorCount: validationErrors.length
      })

      return {
        success: true,
        filings: validatedFilings,
        searchUrl: page.url(),
        timestamp: new Date().toISOString(),
        parsingErrors: validationErrors.length > 0 ? validationErrors : undefined
      }
    } finally {
      if (page) {
        await page.close().catch((err) => {
          this.log('warn', 'Error closing page', {
            error: err instanceof Error ? err.message : String(err)
          })
        })
      }
    }
  }

  /**
   * Get manual search URL for Texas
   *
   * NOTE: As of September 2025, Texas requires SOS Portal account login.
   * This URL directs to the main UCC page where users must authenticate.
   */
  getManualSearchUrl(companyName: string): string {
    return `${this.config.baseUrl}#search=${encodeURIComponent(companyName)}`
  }
}
