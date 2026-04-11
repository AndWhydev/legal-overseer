/**
 * Chess Master Report HTML Template
 *
 * Generates HTML markup for the PDF report with inline CSS styling.
 * Designed for A4 format with professional business aesthetics.
 *
 * Sections:
 * 1. Header - Branding and generation date
 * 2. Executive Summary - Key findings
 * 3. Top Opportunities - Product opportunities table
 * 4. Trending Keywords - SEO trend data
 * 5. Footer - Attribution
 */

import type { ReportData } from './types.js';
import type { CrossReferenceResult } from '../analysis/cross-reference.js';
import type { TrendAnalysis, ConfidenceLevel } from '../trends/types.js';

/**
 * Brand colors for consistent styling
 * Using neutral business palette as CheekyGlo brand colors not specified
 */
const COLORS = {
  primary: '#2563eb', // Blue
  secondary: '#64748b', // Slate
  success: '#22c55e', // Green
  warning: '#f59e0b', // Amber
  danger: '#ef4444', // Red
  dark: '#1e293b', // Slate 800
  light: '#f8fafc', // Slate 50
  border: '#e2e8f0', // Slate 200
  text: '#334155', // Slate 700
  muted: '#94a3b8', // Slate 400
};

/**
 * Generate inline CSS styles for the report
 * All styles must be inline for PDF generation compatibility
 */
function getStyles(): string {
  return `
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 12px;
        line-height: 1.5;
        color: ${COLORS.text};
        background: white;
        padding: 20px;
      }

      .report-container {
        max-width: 210mm;
        margin: 0 auto;
      }

      /* Header Styles */
      .header {
        text-align: center;
        padding-bottom: 20px;
        border-bottom: 3px solid ${COLORS.primary};
        margin-bottom: 24px;
      }

      .header h1 {
        font-size: 28px;
        font-weight: 700;
        color: ${COLORS.dark};
        margin-bottom: 8px;
        letter-spacing: -0.5px;
      }

      .header .subtitle {
        font-size: 14px;
        color: ${COLORS.secondary};
        margin-bottom: 4px;
      }

      .header .generated-at {
        font-size: 11px;
        color: ${COLORS.muted};
      }

      /* Section Styles */
      .section {
        margin-bottom: 28px;
        page-break-inside: avoid;
      }

      .section-title {
        font-size: 16px;
        font-weight: 600;
        color: ${COLORS.dark};
        margin-bottom: 12px;
        padding-bottom: 6px;
        border-bottom: 2px solid ${COLORS.border};
      }

      /* Executive Summary */
      .summary-box {
        background: ${COLORS.light};
        border-left: 4px solid ${COLORS.primary};
        padding: 16px;
        border-radius: 0 4px 4px 0;
      }

      .summary-box ul {
        margin: 0;
        padding-left: 20px;
      }

      .summary-box li {
        margin-bottom: 8px;
        color: ${COLORS.text};
      }

      .summary-box li:last-child {
        margin-bottom: 0;
      }

      /* Table Styles */
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }

      th {
        background: ${COLORS.dark};
        color: white;
        padding: 10px 8px;
        text-align: left;
        font-weight: 600;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      td {
        padding: 10px 8px;
        border-bottom: 1px solid ${COLORS.border};
        vertical-align: middle;
      }

      tr:nth-child(even) {
        background: ${COLORS.light};
      }

      tr:hover {
        background: #f1f5f9;
      }

      /* Product Image Thumbnail */
      .product-image {
        width: 40px;
        height: 40px;
        object-fit: cover;
        border-radius: 4px;
        border: 1px solid ${COLORS.border};
      }

      .product-placeholder {
        width: 40px;
        height: 40px;
        background: ${COLORS.light};
        border-radius: 4px;
        border: 1px solid ${COLORS.border};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: ${COLORS.muted};
      }

      /* Score Badge */
      .score-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: 600;
        font-size: 11px;
      }

      .score-excellent {
        background: #dcfce7;
        color: #166534;
      }

      .score-good {
        background: #fef9c3;
        color: #854d0e;
      }

      .score-moderate {
        background: #fee2e2;
        color: #991b1b;
      }

      /* Trend Indicators */
      .trend-up {
        color: ${COLORS.success};
        font-weight: 600;
      }

      .trend-down {
        color: ${COLORS.danger};
        font-weight: 600;
      }

      .trend-neutral {
        color: ${COLORS.muted};
      }

      /* Confidence Badge */
      .confidence-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .confidence-high {
        background: #dcfce7;
        color: #166534;
      }

      .confidence-medium {
        background: #fef9c3;
        color: #854d0e;
      }

      .confidence-low {
        background: #f3f4f6;
        color: #6b7280;
      }

      /* Links */
      a {
        color: ${COLORS.primary};
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      /* Footer */
      .footer {
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid ${COLORS.border};
        text-align: center;
        color: ${COLORS.muted};
        font-size: 10px;
      }

      .footer .brand {
        font-weight: 600;
        color: ${COLORS.secondary};
      }

      /* Empty State */
      .empty-state {
        text-align: center;
        padding: 24px;
        color: ${COLORS.muted};
        font-style: italic;
      }

      /* Price */
      .price {
        font-weight: 600;
        color: ${COLORS.dark};
      }

      .margin-positive {
        color: ${COLORS.success};
      }

      .margin-negative {
        color: ${COLORS.danger};
      }

      /* Truncate long text */
      .truncate {
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Print-specific */
      @media print {
        body {
          padding: 0;
        }

        .section {
          page-break-inside: avoid;
        }
      }
    </style>
  `;
}

/**
 * Format date for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get score badge class based on opportunity score
 */
function getScoreBadgeClass(score: number): string {
  if (score >= 80) return 'score-excellent';
  if (score >= 60) return 'score-good';
  return 'score-moderate';
}

/**
 * Get confidence badge class
 */
function getConfidenceBadgeClass(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH':
      return 'confidence-high';
    case 'MEDIUM':
      return 'confidence-medium';
    default:
      return 'confidence-low';
  }
}

/**
 * Format trend percentage with arrow indicator
 */
function formatTrendChange(change: number): string {
  const arrow = change > 0 ? '\u2191' : change < 0 ? '\u2193' : '\u2192';
  const cssClass = change > 0 ? 'trend-up' : change < 0 ? 'trend-down' : 'trend-neutral';
  const sign = change > 0 ? '+' : '';
  return `<span class="${cssClass}">${arrow} ${sign}${change.toFixed(1)}%</span>`;
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-AU');
}

/**
 * Render header section
 */
function renderHeader(data: ReportData): string {
  const title = data.title || 'Chess Master Report';
  return `
    <div class="header">
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">Market Research & Product Opportunities</div>
      <div class="generated-at">Generated ${formatDate(data.generatedAt)} | Report ID: ${escapeHtml(data.reportId)}</div>
    </div>
  `;
}

/**
 * Render executive summary section
 */
function renderExecutiveSummary(summary: string): string {
  // Split summary into bullet points if not already formatted
  const lines = summary.split('\n').filter((line) => line.trim());
  const bullets = lines.map((line) => line.replace(/^[-*]\s*/, '').trim());

  return `
    <div class="section">
      <h2 class="section-title">Executive Summary</h2>
      <div class="summary-box">
        <ul>
          ${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('\n          ')}
        </ul>
      </div>
    </div>
  `;
}

/**
 * Render opportunities table section
 */
function renderOpportunitiesTable(opportunities: CrossReferenceResult[]): string {
  if (opportunities.length === 0) {
    return `
      <div class="section">
        <h2 class="section-title">Top Opportunities</h2>
        <div class="empty-state">No opportunities found matching criteria</div>
      </div>
    `;
  }

  const rows = opportunities
    .slice(0, 15) // Limit to top 15 for PDF readability
    .map((opp) => {
      const product = opp.alibabaProduct;
      const bestMatch = opp.bestMatch;
      const amazonRank = bestMatch ? `#${bestMatch.product.rank}` : 'N/A';
      const priceMultiple = bestMatch ? `${bestMatch.priceMultiple.toFixed(1)}x` : 'N/A';
      const marginClass = bestMatch && bestMatch.priceMultiple >= 2 ? 'margin-positive' : '';

      // Product image or placeholder
      const imageHtml = product.image
        ? `<img src="${escapeHtml(product.image)}" alt="Product" class="product-image" />`
        : `<div class="product-placeholder">No img</div>`;

      return `
        <tr>
          <td>${imageHtml}</td>
          <td class="truncate">
            <a href="${escapeHtml(product.url)}" target="_blank">${escapeHtml(product.title.substring(0, 60))}${product.title.length > 60 ? '...' : ''}</a>
          </td>
          <td class="price">$${product.priceMin.toFixed(2)}${product.priceMax > product.priceMin ? ` - $${product.priceMax.toFixed(2)}` : ''}</td>
          <td class="${marginClass}">${priceMultiple}</td>
          <td>${amazonRank}</td>
          <td><span class="score-badge ${getScoreBadgeClass(opp.opportunityScore)}">${opp.opportunityScore}</span></td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="section">
      <h2 class="section-title">Top Opportunities</h2>
      <table>
        <thead>
          <tr>
            <th style="width: 50px;">Image</th>
            <th>Product Name</th>
            <th>Alibaba Price</th>
            <th>Margin Est.</th>
            <th>Amazon Rank</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render trending keywords section
 */
function renderTrendingKeywords(trends: TrendAnalysis[]): string {
  // Filter to only show spikes or high-volume keywords
  const relevantTrends = trends
    .filter((t) => t.spikeDetected || t.currentVolume >= 1000)
    .slice(0, 12); // Limit for readability

  if (relevantTrends.length === 0) {
    return `
      <div class="section">
        <h2 class="section-title">Trending Keywords</h2>
        <div class="empty-state">No significant trends detected</div>
      </div>
    `;
  }

  const rows = relevantTrends
    .map((trend) => {
      return `
        <tr>
          <td><strong>${escapeHtml(trend.keyword)}</strong></td>
          <td>${formatNumber(trend.currentVolume)}</td>
          <td>${formatTrendChange(trend.percentageChange)}</td>
          <td><span class="confidence-badge ${getConfidenceBadgeClass(trend.confidence)}">${trend.confidence}</span></td>
          <td>${trend.spikeDetected ? '<span class="trend-up">SPIKE</span>' : '-'}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="section">
      <h2 class="section-title">Trending Keywords</h2>
      <table>
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Search Volume</th>
            <th>% Change</th>
            <th>Confidence</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render footer section
 */
function renderFooter(): string {
  return `
    <div class="footer">
      <span class="brand">Generated by BitBit R&D Scout</span>
      <br />
      Automated market research and opportunity identification for CheekyGlo
    </div>
  `;
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Render complete HTML report from report data
 *
 * Generates a complete HTML document with inline styles suitable
 * for PDF conversion via Puppeteer.
 *
 * @param data - Report data including opportunities and trends
 * @returns Complete HTML string ready for PDF conversion
 *
 * @example
 * ```typescript
 * const html = renderReportHTML({
 *   generatedAt: new Date().toISOString(),
 *   reportId: 'RPT-001',
 *   opportunities: crossRefResults,
 *   trends: trendAnalysis,
 *   summary: '- Found 15 high-margin opportunities\n- Glass skin products trending'
 * });
 * ```
 */
export function renderReportHTML(data: ReportData): string {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chess Master Report - ${formatDate(data.generatedAt)}</title>
  ${getStyles()}
</head>
<body>
  <div class="report-container">
    ${renderHeader(data)}
    ${renderExecutiveSummary(data.summary)}
    ${renderOpportunitiesTable(data.opportunities)}
    ${renderTrendingKeywords(data.trends)}
    ${renderFooter()}
  </div>
</body>
</html>
  `.trim();

  return html;
}
