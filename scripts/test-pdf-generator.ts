/**
 * Test Script: PDF Report Generator
 *
 * Generates a test PDF with sample data to verify the report
 * generator is working correctly.
 *
 * Run with: npx tsx scripts/test-pdf-generator.ts
 */

import { generateAndSaveReport } from '../src/skills/rd-scout/reports/index.js';
import type { ReportData } from '../src/skills/rd-scout/reports/types.js';
import type { CrossReferenceResult } from '../src/skills/rd-scout/analysis/cross-reference.js';
import type { TrendAnalysis } from '../src/skills/rd-scout/trends/types.js';

/**
 * Sample opportunity data for testing
 */
const sampleOpportunities: CrossReferenceResult[] = [
  {
    alibabaProduct: {
      title: 'Electric Face Massager Skin Tightening Device LED Light Therapy Anti-Aging',
      priceMin: 8.50,
      priceMax: 12.00,
      supplier: 'Shenzhen Beauty Tech Co.',
      url: 'https://www.alibaba.com/product/123456',
      image: 'https://via.placeholder.com/100x100?text=Face+Massager',
      category: 'beauty-tools',
      moq: 100,
    },
    amazonMatches: [
      {
        product: {
          name: 'Face Massager with LED Light Therapy - Anti Aging Skin Tightening',
          price: 45.99,
          rating: 4.5,
          url: 'https://www.amazon.com.au/dp/B0ABC123',
          asin: 'B0ABC123',
          rank: 8,
        },
        keywordMatchPercent: 78,
        matchedKeywords: ['face', 'massager', 'led', 'light', 'therapy', 'skin'],
        priceMultiple: 3.83,
      },
    ],
    opportunityScore: 85,
    scoreBreakdown: {
      keywordScore: 35,
      rankScore: 30,
      marginScore: 20,
    },
    bestMatch: {
      product: {
        name: 'Face Massager with LED Light Therapy - Anti Aging Skin Tightening',
        price: 45.99,
        rating: 4.5,
        url: 'https://www.amazon.com.au/dp/B0ABC123',
        asin: 'B0ABC123',
        rank: 8,
      },
      keywordMatchPercent: 78,
      matchedKeywords: ['face', 'massager', 'led', 'light', 'therapy', 'skin'],
      priceMultiple: 3.83,
    },
  },
  {
    alibabaProduct: {
      title: 'Glass Skin Serum Hyaluronic Acid Vitamin C Korean Skincare',
      priceMin: 2.50,
      priceMax: 4.00,
      supplier: 'Guangzhou Cosmetics Factory',
      url: 'https://www.alibaba.com/product/789012',
      image: 'https://via.placeholder.com/100x100?text=Glass+Serum',
      category: 'skincare',
      moq: 500,
    },
    amazonMatches: [
      {
        product: {
          name: 'Korean Glass Skin Serum - Hyaluronic Acid & Vitamin C',
          price: 28.99,
          rating: 4.7,
          url: 'https://www.amazon.com.au/dp/B0DEF456',
          asin: 'B0DEF456',
          rank: 15,
        },
        keywordMatchPercent: 82,
        matchedKeywords: ['glass', 'skin', 'serum', 'hyaluronic', 'vitamin', 'korean'],
        priceMultiple: 7.25,
      },
    ],
    opportunityScore: 78,
    scoreBreakdown: {
      keywordScore: 38,
      rankScore: 20,
      marginScore: 20,
    },
    bestMatch: {
      product: {
        name: 'Korean Glass Skin Serum - Hyaluronic Acid & Vitamin C',
        price: 28.99,
        rating: 4.7,
        url: 'https://www.amazon.com.au/dp/B0DEF456',
        asin: 'B0DEF456',
        rank: 15,
      },
      keywordMatchPercent: 82,
      matchedKeywords: ['glass', 'skin', 'serum', 'hyaluronic', 'vitamin', 'korean'],
      priceMultiple: 7.25,
    },
  },
  {
    alibabaProduct: {
      title: 'Ice Roller Face Massager Cooling Skin Care Tool',
      priceMin: 1.20,
      priceMax: 2.50,
      supplier: 'Yiwu Beauty Tools Co.',
      url: 'https://www.alibaba.com/product/345678',
      image: '',
      category: 'beauty-tools',
      moq: 200,
    },
    amazonMatches: [
      {
        product: {
          name: 'Ice Face Roller Massager - Cooling Skin Care Tool for Puffiness',
          price: 15.99,
          rating: 4.3,
          url: 'https://www.amazon.com.au/dp/B0GHI789',
          asin: 'B0GHI789',
          rank: 42,
        },
        keywordMatchPercent: 71,
        matchedKeywords: ['ice', 'face', 'roller', 'massager', 'skin', 'care'],
        priceMultiple: 6.40,
      },
    ],
    opportunityScore: 65,
    scoreBreakdown: {
      keywordScore: 35,
      rankScore: 10,
      marginScore: 20,
    },
    bestMatch: {
      product: {
        name: 'Ice Face Roller Massager - Cooling Skin Care Tool for Puffiness',
        price: 15.99,
        rating: 4.3,
        url: 'https://www.amazon.com.au/dp/B0GHI789',
        asin: 'B0GHI789',
        rank: 42,
      },
      keywordMatchPercent: 71,
      matchedKeywords: ['ice', 'face', 'roller', 'massager', 'skin', 'care'],
      priceMultiple: 6.40,
    },
  },
];

/**
 * Sample trend data for testing
 */
const sampleTrends: TrendAnalysis[] = [
  {
    keyword: 'glass skin serum',
    currentVolume: 8500,
    previousVolume: 3200,
    percentageChange: 165.6,
    spikeDetected: true,
    confidence: 'HIGH',
    confidenceScore: 92,
    monthlyData: [],
    confidenceReason: 'High volume (8,500) with significant spike (+166%)',
  },
  {
    keyword: 'korean skincare routine',
    currentVolume: 12000,
    previousVolume: 9500,
    percentageChange: 26.3,
    spikeDetected: false,
    confidence: 'MEDIUM',
    confidenceScore: 55,
    monthlyData: [],
    confidenceReason: 'Moderate volume (12,000) with notable spike (+26%)',
  },
  {
    keyword: 'led face massager',
    currentVolume: 3200,
    previousVolume: 1800,
    percentageChange: 77.8,
    spikeDetected: true,
    confidence: 'MEDIUM',
    confidenceScore: 68,
    monthlyData: [],
    confidenceReason: 'Moderate volume (3,200) with notable spike (+78%)',
  },
  {
    keyword: 'ice roller benefits',
    currentVolume: 2100,
    previousVolume: 1500,
    percentageChange: 40.0,
    spikeDetected: false,
    confidence: 'LOW',
    confidenceScore: 35,
    monthlyData: [],
    confidenceReason: 'Lower volume (2,100) or smaller spike (+40%)',
  },
  {
    keyword: 'vitamin c serum australia',
    currentVolume: 5800,
    previousVolume: 2900,
    percentageChange: 100.0,
    spikeDetected: true,
    confidence: 'HIGH',
    confidenceScore: 85,
    monthlyData: [],
    confidenceReason: 'High volume (5,800) with significant spike (+100%)',
  },
];

/**
 * Sample report data
 */
const sampleReportData: ReportData = {
  generatedAt: new Date().toISOString(),
  reportId: 'TEST-001',
  opportunities: sampleOpportunities,
  trends: sampleTrends,
  summary: `- Found ${sampleOpportunities.length} high-margin product opportunities with potential 3x-7x markup
- "Glass skin" products showing significant trend spike (+166%) - recommend prioritizing this category
- LED face massagers gaining traction with strong Amazon demand validation`,
};

/**
 * Run the test
 */
async function main() {
  console.log('='.repeat(60));
  console.log('BitBit PDF Report Generator Test');
  console.log('='.repeat(60));
  console.log('');

  console.log('Test data:');
  console.log(`  - ${sampleOpportunities.length} opportunities`);
  console.log(`  - ${sampleTrends.length} trend keywords`);
  console.log(`  - Report ID: ${sampleReportData.reportId}`);
  console.log('');

  console.log('Generating PDF...');
  const result = await generateAndSaveReport(
    sampleReportData,
    'test-report.pdf',
    '/Users/torrinkay/Desktop/BitBit/data/reports'
  );

  console.log('');
  if (result.success) {
    console.log('SUCCESS!');
    console.log(`  - File: ${result.filePath}`);
    console.log(`  - Size: ${result.sizeBytes} bytes`);
    console.log(`  - Generation time: ${result.generationTimeMs}ms`);
  } else {
    console.log('FAILED!');
    console.log(`  - Error: ${result.error}`);
  }

  console.log('');
  console.log('='.repeat(60));
}

main().catch(console.error);
