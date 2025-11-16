/**
 * Texas UCC Scraper
 * 
 * Scrapes UCC filing data from Texas Secretary of State
 * Uses Puppeteer for real web scraping with anti-detection measures
 */

import { BaseScraper, ScraperResult, UCCFiling } from '../base-scraper'
import puppeteer, { Browser, Page } from 'puppeteer'

export class TexasScraper extends BaseScraper {
  private browser: Browser | null = null

  constructor() {
    super({
      state: 'TX',
      baseUrl: 'https://mycpa.cpa.state.tx.us/coa/',
      rateLimit: 5, // 5 requests per minute
      timeout: 30000,
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
      return {
        success: false,
        error: 'Invalid company name',
        timestamp: new Date().toISOString()
      }
    }

    let page: Page | null = null

    try {
      await this.sleep(12000)

      const browser = await this.getBrowser()
      page = await browser.newPage()

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36')
      await page.setViewport({ width: 1920, height: 1080 })

      const searchUrl = this.getManualSearchUrl(companyName)
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle0', 
        timeout: this.config.timeout 
      })

      try {
        await page.waitForSelector('.search-results, .no-results, .captcha', { 
          timeout: 10000 
        })
      } catch {
        // Continue
      }

      const hasCaptcha = await page.evaluate(() => {
        return document.body.innerText.toLowerCase().includes('captcha') ||
               document.body.innerText.toLowerCase().includes('robot') ||
               document.querySelector('iframe[src*="recaptcha"]') !== null
      })

      if (hasCaptcha) {
        return {
          success: false,
          error: 'CAPTCHA detected - manual intervention required',
          searchUrl,
          timestamp: new Date().toISOString()
        }
      }

      const filings = await page.evaluate(() => {
        const results: Array<{
          filingNumber: string
          debtorName: string
          securedParty: string
          filingDate: string
          collateral: string
          status: 'active' | 'terminated' | 'lapsed'
          filingType: 'UCC-1' | 'UCC-3'
        }> = []
        const resultElements = document.querySelectorAll('.ucc-filing, tr.filing-row, .result-item')
        
        resultElements.forEach((element) => {
          try {
            const filingNumber = element.querySelector('.filing-number, .filing-id')?.textContent?.trim() || ''
            const debtorName = element.querySelector('.debtor-name, .debtor')?.textContent?.trim() || ''
            const securedParty = element.querySelector('.secured-party, .creditor')?.textContent?.trim() || ''
            const filingDate = element.querySelector('.filing-date, .date')?.textContent?.trim() || ''
            const status = element.querySelector('.status')?.textContent?.trim() || 'unknown'
            const collateral = element.querySelector('.collateral')?.textContent?.trim() || ''

            if (filingNumber || debtorName) {
              results.push({
                filingNumber,
                debtorName,
                securedParty,
                filingDate,
                collateral,
                status: status.toLowerCase().includes('active') ? 'active' : 
                       status.toLowerCase().includes('terminated') ? 'terminated' : 
                       status.toLowerCase().includes('lapsed') ? 'lapsed' : 'active',
                filingType: filingNumber.includes('UCC-3') ? 'UCC-3' : 'UCC-1'
              })
            }
          } catch (err) {
            console.error('Error parsing filing element:', err)
          }
        })
        
        return results
      })

      return {
        success: true,
        filings: filings as UCCFiling[],
        searchUrl,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        searchUrl: this.getManualSearchUrl(companyName),
        timestamp: new Date().toISOString()
      }
    } finally {
      // Cleanup page in all cases
      if (page) {
        await page.close().catch(() => {
          // Ignore errors during cleanup
        })
      }
    }
  }

  /**
   * Get manual search URL for Texas
   */
  getManualSearchUrl(companyName: string): string {
    return `${this.config.baseUrl}?searchType=ucc&name=${encodeURIComponent(companyName)}`
  }
}
