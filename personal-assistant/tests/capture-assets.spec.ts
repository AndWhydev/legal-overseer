import { test } from '@playwright/test';

test('capture ad assets', async ({ page }) => {
  await page.goto('http://localhost:3000/showcase');
  await page.waitForTimeout(2000);

  // Capture Revenue KPI
  const revenue = page.locator('div:has-text("Revenue")').first();
  await revenue.screenshot({ path: '/home/claude/bitbit-ad-assets/revenue-crop.png' });

  // Capture Process Pipeline
  const pipeline = page.locator('div:has-text("ProcessPipeline")').first();
  await pipeline.screenshot({ path: '/home/claude/bitbit-ad-assets/pipeline-crop.png' });
});
