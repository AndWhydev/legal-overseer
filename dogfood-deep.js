const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:3000';

// Focus on the pages that need deeper inspection
const TESTS = [
  // Timeout pages - try with longer timeout  
  { path: '/dashboard/channels', name: 'Channels' },
  { path: '/dashboard/connections', name: 'Connections' },
  { path: '/dashboard/settings', name: 'Settings' },
  { path: '/dashboard/portal', name: 'Portal Mgmt' },
  { path: '/dashboard/builder', name: 'Builder' },
  { path: '/dashboard/medications', name: 'Medications' },
  { path: '/onboard', name: 'Onboarding' },
  { path: '/portal/login', name: 'Portal Login' },
];

// Pages that loaded but need content deep-dive
const CONTENT_TESTS = [
  { path: '/dashboard', name: 'Dashboard Main' },
  { path: '/dashboard/leads', name: 'Leads' },
  { path: '/dashboard/invoices', name: 'Invoices' },
  { path: '/dashboard/contacts', name: 'Contacts' },
  { path: '/dashboard/approvals', name: 'Approvals' },
  { path: '/dashboard/meetings', name: 'Meetings' },
  { path: '/dashboard/creator-studio', name: 'Creator Studio' },
  { path: '/dashboard/chat', name: 'AI Chat' },
  { path: '/dashboard/sentry', name: 'Sentry' },
  { path: '/dashboard/activity', name: 'Activity' },
  { path: '/', name: 'Landing Page' },
  { path: '/showcase', name: 'Showcase' },
];

async function run() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  console.log('=== PHASE 1: Retry timed-out pages with 60s timeout ===\n');
  
  for (const test of TESTS) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message.substring(0, 100)));
    
    try {
      const resp = await page.goto(`${BASE}${test.path}`, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      await page.waitForTimeout(3000);
      
      const status = resp?.status() || 0;
      const title = await page.title();
      const text = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
      const elements = await page.evaluate(() => ({
        buttons: document.querySelectorAll('button').length,
        inputs: document.querySelectorAll('input, textarea').length,
        cards: document.querySelectorAll('[class*="card"], [class*="Card"]').length,
        textLen: document.body?.innerText?.length || 0,
        headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.innerText.substring(0, 60)),
      }));
      
      await page.screenshot({ 
        path: `/home/claude/bitbit/dogfood-screenshots/${test.path.replace(/\//g, '_').replace(/^_/, '')}_retry.png`,
        fullPage: false 
      });
      
      console.log(`${test.name.padEnd(20)} HTTP ${status} | ${elements.buttons} buttons, ${elements.inputs} inputs, ${elements.cards} cards | ${elements.textLen} chars`);
      console.log(`  Title: ${title}`);
      console.log(`  Headings: ${elements.headings.slice(0, 5).join(' | ')}`);
      console.log(`  JS errors: ${errors.length}`);
      if (errors.length > 0) console.log(`  First error: ${errors[0]}`);
      console.log(`  Text preview: ${text.substring(0, 150).replace(/\n/g, ' ')}`);
      console.log('');
    } catch (err) {
      console.log(`${test.name.padEnd(20)} TIMEOUT/ERROR: ${err.message.substring(0, 100)}`);
      console.log(`  JS errors: ${errors.length}`);
      if (errors.length > 0) console.log(`  First error: ${errors[0]}`);
      console.log('');
    }
    
    await context.close();
  }
  
  console.log('\n=== PHASE 2: Deep content inspection of loaded pages ===\n');
  
  for (const test of CONTENT_TESTS) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message.substring(0, 100)));
    
    try {
      await page.goto(`${BASE}${test.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);
      
      const analysis = await page.evaluate(() => {
        const body = document.body;
        const text = body?.innerText || '';
        
        // Check for empty state indicators
        const emptyStates = text.match(/no\s+(data|items|results|contacts|leads|invoices|meetings|activity|approvals)/gi) || [];
        const emptyCards = [...document.querySelectorAll('[class*="empty"], [class*="Empty"], [class*="placeholder"], [class*="no-data"]')];
        
        // Check for real data vs skeleton/placeholder
        const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"], [class*="shimmer"], [class*="loading"]');
        
        // Get all visible sections/tabs
        const sections = [...document.querySelectorAll('[role="tabpanel"], section, [class*="tab-content"]')].map(
          s => s.innerText?.substring(0, 100) || ''
        );
        
        // Check sidebar/nav
        const navItems = [...document.querySelectorAll('nav a, [class*="sidebar"] a, [class*="nav"] a')].map(
          a => a.innerText?.trim()
        ).filter(Boolean);
        
        // Tables with data
        const tables = [...document.querySelectorAll('table')].map(t => ({
          rows: t.querySelectorAll('tbody tr').length,
          headers: [...t.querySelectorAll('th')].map(h => h.innerText?.trim()).join(', ')
        }));
        
        // Charts/visualizations
        const charts = document.querySelectorAll('canvas, [class*="chart"], [class*="Chart"], svg[class*="recharts"]');
        
        // Buttons that matter
        const ctaButtons = [...document.querySelectorAll('button')].map(b => b.innerText?.trim()).filter(t => t.length > 0 && t.length < 50);
        
        return {
          textLength: text.length,
          textPreview: text.substring(0, 300).replace(/\n+/g, ' | '),
          emptyStates: emptyStates,
          emptyCards: emptyCards.length,
          skeletons: skeletons.length,
          sections: sections.slice(0, 3),
          navItems: navItems.slice(0, 15),
          tables: tables,
          charts: charts.length,
          ctaButtons: ctaButtons.slice(0, 10),
          headings: [...document.querySelectorAll('h1,h2,h3')].map(h => h.innerText?.substring(0, 80)).slice(0, 8),
        };
      });
      
      const icon = analysis.emptyStates.length > 0 ? '⚠' : analysis.textLength > 200 ? '✓' : '?';
      console.log(`${icon} ${test.name.padEnd(20)} ${analysis.textLength} chars | ${analysis.charts} charts | ${analysis.skeletons} skeletons`);
      console.log(`  Headings: ${analysis.headings.join(' | ')}`);
      if (analysis.tables.length > 0) console.log(`  Tables: ${analysis.tables.map(t => `${t.rows} rows (${t.headers})`).join('; ')}`);
      if (analysis.emptyStates.length > 0) console.log(`  ⚠ EMPTY STATES: ${analysis.emptyStates.join(', ')}`);
      if (analysis.skeletons > 0) console.log(`  ⚠ ${analysis.skeletons} loading skeletons still visible`);
      console.log(`  CTA buttons: ${analysis.ctaButtons.slice(0, 8).join(', ')}`);
      console.log(`  Nav items: ${analysis.navItems.slice(0, 10).join(', ')}`);
      console.log(`  JS errors: ${errors.length}${errors.length ? ' - ' + errors[0] : ''}`);
      console.log('');
      
    } catch (err) {
      console.log(`✗ ${test.name.padEnd(20)} ERROR: ${err.message.substring(0, 100)}`);
      console.log('');
    }
    
    await context.close();
  }
  
  await browser.close();
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
