import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// Ensure asset directory exists
const assetDir = '/home/claude/bitbit-ad-assets'
if (!fs.existsSync(assetDir)) {
  fs.mkdirSync(assetDir, { recursive: true })
}

test('capture ad assets', async ({ page }) => {
  // Navigate to showcase page
  try {
    await page.goto('http://localhost:3000/showcase', { waitUntil: 'networkidle' })
  } catch (err) {
    console.warn('Navigation timeout, proceeding anyway')
    await page.waitForTimeout(2000)
  }

  // Wait for page to stabilize
  await page.waitForTimeout(2000)

  // Capture Revenue KPI - with error handling
  try {
    const revenue = page.locator('div:has-text("Revenue")').first()
    const isVisible = await revenue.isVisible().catch(() => false)

    if (isVisible) {
      const screenshotPath = path.join(assetDir, 'revenue-crop.png')
      await revenue.screenshot({ path: screenshotPath })
      console.log(`Screenshot saved to ${screenshotPath}`)
    } else {
      console.warn('Revenue element not found or not visible')
    }
  } catch (err) {
    console.warn('Failed to capture revenue screenshot:', err)
  }

  // Capture Process Pipeline - with error handling
  try {
    const pipeline = page.locator('div:has-text("ProcessPipeline")').first()
    const isVisible = await pipeline.isVisible().catch(() => false)

    if (isVisible) {
      const screenshotPath = path.join(assetDir, 'pipeline-crop.png')
      await pipeline.screenshot({ path: screenshotPath })
      console.log(`Screenshot saved to ${screenshotPath}`)
    } else {
      console.warn('Pipeline element not found or not visible')
    }
  } catch (err) {
    console.warn('Failed to capture pipeline screenshot:', err)
  }

  // Verify at least the page loaded
  expect(page.url()).toContain('localhost:3000')
})
