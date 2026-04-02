const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const SCREENSHOT_DIR = '/home/claude/bitbit/dogfood-screenshots';
const REPORT_FILE = '/home/claude/bitbit/dogfood-report.md';

// Create screenshot dir
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Pages to test with expected content markers
const TESTS = [
  // Public pages
  { path: '/', name: 'Landing Page', expect: ['BitBit', 'button', 'link'], category: 'public' },
  { path: '/showcase', name: 'Showcase', expect: ['showcase', 'chart', 'data'], category: 'public' },
  { path: '/waitlist', name: 'Waitlist', expect: ['email', 'input', 'waitlist'], category: 'public' },
  { path: '/privacy', name: 'Privacy Policy', expect: ['privacy', 'data', 'policy'], category: 'public' },
  { path: '/terms', name: 'Terms of Service', expect: ['terms', 'service'], category: 'public' },
  { path: '/onboard', name: 'Onboarding', expect: ['onboard', 'get started', 'sign'], category: 'auth' },
  
  // Dashboard pages
  { path: '/dashboard', name: 'Dashboard Main', expect: ['dashboard', 'kpi', 'kanban', 'inbox'], category: 'dashboard' },
  { path: '/dashboard/chat', name: 'AI Chat', expect: ['chat', 'message', 'send', 'input'], category: 'dashboard' },
  { path: '/dashboard/leads', name: 'Leads', expect: ['lead', 'pipeline', 'score', 'discovery'], category: 'dashboard' },
  { path: '/dashboard/invoices', name: 'Invoices', expect: ['invoice', 'create', 'amount', 'pdf'], category: 'dashboard' },
  { path: '/dashboard/contacts', name: 'Contacts', expect: ['contact', 'relationship', 'score', 'name'], category: 'dashboard' },
  { path: '/dashboard/approvals', name: 'Approvals', expect: ['approval', 'pending', 'approve', 'confidence'], category: 'dashboard' },
  { path: '/dashboard/activity', name: 'Activity', expect: ['activity', 'feed', 'recent', 'action'], category: 'dashboard' },
  { path: '/dashboard/meetings', name: 'Meetings', expect: ['meeting', 'schedule', 'transcript'], category: 'dashboard' },
  { path: '/dashboard/channels', name: 'Channels', expect: ['channel', 'connect', 'status', 'integration'], category: 'dashboard' },
  { path: '/dashboard/connections', name: 'Connections', expect: ['connection', 'oauth', 'connect'], category: 'dashboard' },
  { path: '/dashboard/settings', name: 'Settings', expect: ['setting', 'billing', 'appearance', 'automation'], category: 'dashboard' },
  { path: '/dashboard/creator-studio', name: 'Creator Studio', expect: ['content', 'creator', 'schedule', 'generate'], category: 'dashboard' },
  { path: '/dashboard/sentry', name: 'Sentry', expect: ['sentry', 'monitor', 'watch', 'alert'], category: 'dashboard' },
  { path: '/dashboard/portal', name: 'Portal Management', expect: ['portal', 'client', 'manage'], category: 'dashboard' },
  { path: '/dashboard/builder', name: 'Builder', expect: ['builder', 'project', 'build'], category: 'dashboard' },
  { path: '/dashboard/medications', name: 'Medications', expect: ['medication', 'health', 'track'], category: 'dashboard' },
  
  // Portal
  { path: '/portal/login', name: 'Portal Login', expect: ['login', 'email', 'magic', 'portal'], category: 'portal' },
];

async function run() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  
  const results = [];
  
  for (const test of TESTS) {
    const page = await context.newPage();
    const result = {
      ...test,
      status: 'unknown',
      httpCode: 0,
      loadTime: 0,
      contentFound: [],
      contentMissing: [],
      jsErrors: [],
      emptyState: false,
      hasRealContent: false,
      screenshot: '',
      notes: '',
    };
    
    // Collect JS errors
    page.on('pageerror', err => {
      result.jsErrors.push(err.message.substring(0, 200));
    });
    
    try {
      const startTime = Date.now();
      const response = await page.goto(`${BASE}${test.path}`, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      result.httpCode = response?.status() || 0;
      
      // Wait for client-side rendering
      await page.waitForTimeout(2000);
      result.loadTime = Date.now() - startTime;
      
      // Take screenshot
      const screenshotName = test.path.replace(/\//g, '_').replace(/^_/, '') || 'root';
      result.screenshot = `${SCREENSHOT_DIR}/${screenshotName}.png`;
      await page.screenshot({ path: result.screenshot, fullPage: false });
      
      // Get all visible text
      const bodyText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || '');
      const bodyHTML = await page.evaluate(() => document.body?.innerHTML?.toLowerCase() || '');
      
      // Check for expected content markers
      for (const marker of test.expect) {
        if (bodyText.includes(marker.toLowerCase()) || bodyHTML.includes(marker.toLowerCase())) {
          result.contentFound.push(marker);
        } else {
          result.contentMissing.push(marker);
        }
      }
      
      // Check for empty states / blank content
      const emptyIndicators = ['no data', 'no items', 'nothing here', 'empty', 'get started', 'no results'];
      const hasEmpty = emptyIndicators.some(ind => bodyText.includes(ind));
      result.emptyState = hasEmpty;
      
      // Check if page has real interactive content (buttons, inputs, cards, tables)
      const interactiveCount = await page.evaluate(() => {
        return {
          buttons: document.querySelectorAll('button').length,
          inputs: document.querySelectorAll('input, textarea').length,
          cards: document.querySelectorAll('[class*="card"], [class*="Card"]').length,
          tables: document.querySelectorAll('table, [class*="table"], [class*="Table"]').length,
          links: document.querySelectorAll('a[href]').length,
          images: document.querySelectorAll('img, svg').length,
          textLength: document.body?.innerText?.length || 0,
        };
      });
      
      result.hasRealContent = interactiveCount.textLength > 100 && 
        (interactiveCount.buttons > 0 || interactiveCount.inputs > 0 || interactiveCount.cards > 0);
      result.interactiveCount = interactiveCount;
      
      // Check for loading spinners still present
      const hasSpinner = await page.evaluate(() => {
        const spinners = document.querySelectorAll('[class*="spinner"], [class*="loading"], [class*="skeleton"], [class*="Skeleton"]');
        return spinners.length;
      });
      result.hasSpinner = hasSpinner;
      
      // Determine overall status
      if (result.httpCode === 200 && result.hasRealContent && result.contentMissing.length === 0) {
        result.status = 'PASS';
      } else if (result.httpCode === 200 && result.hasRealContent) {
        result.status = 'PARTIAL';
      } else if (result.httpCode === 200) {
        result.status = 'WARN';
      } else {
        result.status = 'FAIL';
      }
      
    } catch (err) {
      result.status = 'ERROR';
      result.notes = err.message.substring(0, 200);
    }
    
    await page.close();
    results.push(result);
    
    // Progress output
    const icon = { PASS: '✓', PARTIAL: '◐', WARN: '⚠', FAIL: '✗', ERROR: '!', unknown: '?' }[result.status];
    console.log(`${icon} ${result.name.padEnd(25)} ${result.status.padEnd(8)} ${result.httpCode} ${result.loadTime}ms ${result.jsErrors.length ? '⚡'+result.jsErrors.length+'err' : ''}`);
  }
  
  await browser.close();
  
  // Generate report
  let report = `# BitBit Dogfooding Report\n`;
  report += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  report += `**Environment:** localhost:3000 (dev:noauth mode)\n`;
  report += `**Tester:** Automated Playwright + manual inspection\n\n`;
  
  const pass = results.filter(r => r.status === 'PASS').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const warn = results.filter(r => r.status === 'WARN').length;
  const fail = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR').length;
  
  report += `## Summary\n`;
  report += `- **Total pages tested:** ${results.length}\n`;
  report += `- **PASS:** ${pass}\n`;
  report += `- **PARTIAL:** ${partial}\n`;
  report += `- **WARN:** ${warn}\n`;
  report += `- **FAIL/ERROR:** ${fail}\n\n`;
  
  // Group by category
  for (const cat of ['public', 'auth', 'dashboard', 'portal']) {
    const catResults = results.filter(r => r.category === cat);
    if (catResults.length === 0) continue;
    
    report += `## ${cat.charAt(0).toUpperCase() + cat.slice(1)} Pages\n\n`;
    report += `| Page | Status | HTTP | Load | Content | JS Errors | Empty State | Notes |\n`;
    report += `|------|--------|------|------|---------|-----------|-------------|-------|\n`;
    
    for (const r of catResults) {
      const icon = { PASS: '✅', PARTIAL: '🟡', WARN: '⚠️', FAIL: '❌', ERROR: '💥' }[r.status] || '❓';
      const content = r.contentFound.length + '/' + (r.contentFound.length + r.contentMissing.length);
      const jsErr = r.jsErrors.length > 0 ? `${r.jsErrors.length} errors` : 'clean';
      const empty = r.emptyState ? 'YES' : 'no';
      const notes = r.contentMissing.length > 0 ? `Missing: ${r.contentMissing.join(', ')}` : r.notes || '';
      report += `| ${r.path} | ${icon} ${r.status} | ${r.httpCode} | ${r.loadTime}ms | ${content} | ${jsErr} | ${empty} | ${notes.substring(0, 60)} |\n`;
    }
    report += '\n';
  }
  
  // Detail section for issues
  const issues = results.filter(r => r.status !== 'PASS');
  if (issues.length > 0) {
    report += `## Issues Detail\n\n`;
    for (const r of issues) {
      report += `### ${r.path} (${r.status})\n`;
      if (r.contentMissing.length > 0) report += `- **Missing content markers:** ${r.contentMissing.join(', ')}\n`;
      if (r.jsErrors.length > 0) {
        report += `- **JS Errors:**\n`;
        for (const err of r.jsErrors.slice(0, 3)) {
          report += `  - \`${err.substring(0, 150)}\`\n`;
        }
      }
      if (r.emptyState) report += `- **Empty state detected** (page may lack demo data)\n`;
      if (r.hasSpinner > 0) report += `- **${r.hasSpinner} loading spinners** still visible after 2s wait\n`;
      if (r.interactiveCount) {
        report += `- **Interactive elements:** ${r.interactiveCount.buttons} buttons, ${r.interactiveCount.inputs} inputs, ${r.interactiveCount.cards} cards, text: ${r.interactiveCount.textLength} chars\n`;
      }
      report += `- **Screenshot:** ${r.screenshot}\n\n`;
    }
  }
  
  // Write report
  fs.writeFileSync(REPORT_FILE, report);
  console.log(`\nReport written to: ${REPORT_FILE}`);
  console.log(`Screenshots in: ${SCREENSHOT_DIR}/`);
  
  // Return results as JSON for further processing
  const summary = results.map(r => ({
    path: r.path,
    name: r.name,
    status: r.status,
    httpCode: r.httpCode,
    loadTime: r.loadTime,
    contentFound: r.contentFound,
    contentMissing: r.contentMissing,
    jsErrors: r.jsErrors.length,
    emptyState: r.emptyState,
    hasRealContent: r.hasRealContent,
    interactive: r.interactiveCount,
  }));
  
  fs.writeFileSync('/home/claude/bitbit/dogfood-results.json', JSON.stringify(summary, null, 2));
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
