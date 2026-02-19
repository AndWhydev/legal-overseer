/**
 * Claude Vision invoice extraction
 *
 * Uses Claude's native PDF support + structured outputs for invoice data extraction.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { InvoiceSchema, type Invoice } from '../types.js';
import { createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('OpsOfficer');
// InvoiceJsonSchema available for future structured outputs beta feature

// Claude client - reuse project's client pattern
const anthropic = new Anthropic();

// Extraction prompt
const EXTRACTION_PROMPT = `Extract all invoice data from this PDF document.

For dates, use YYYY-MM-DD format.
For amounts, use numeric values without currency symbols.
Currency should be the 3-letter code (AUD, USD, etc.) - default to AUD if unclear.
For confidence_score: 100 if all fields clear, 90 if minor ambiguity, 70-80 if some fields unclear, below 70 if significant issues.

If a field is not present or cannot be determined, omit it (for optional fields) or use best judgment.
For line_items, capture all visible items. If itemization not clear, create single line item with description "Invoice total" and total amount.

Return only the JSON object, no additional text.`;

export interface ExtractionResult {
  success: boolean;
  invoice?: Invoice;
  confidence: number;
  rawResponse?: string;
  error?: string;
}

/**
 * Extract invoice data from PDF using Claude Vision
 *
 * @param pdfPath - Path to PDF file
 * @returns Extraction result with parsed Invoice or error
 */
export async function extractInvoiceFromPdf(pdfPath: string): Promise<ExtractionResult> {
  try {
    // Read PDF file as base64
    const pdfBuffer = await readFile(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    logger.info(`Extracting invoice from ${pdfPath} (${pdfBuffer.length} bytes)`);

    // Call Claude with PDF document and structured output
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64
            }
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT
          }
        ]
      }]
    });

    // Get text response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return {
        success: false,
        confidence: 0,
        error: 'No text response from Claude'
      };
    }

    const rawJson = textBlock.text;

    // Parse JSON response
    let parsed: unknown;
    try {
      // Handle potential markdown code block wrapping
      const jsonMatch = rawJson.match(/```json\s*([\s\S]*?)\s*```/) ||
                       rawJson.match(/```\s*([\s\S]*?)\s*```/);
      const cleanJson = jsonMatch ? jsonMatch[1] : rawJson;
      parsed = JSON.parse(cleanJson.trim());
    } catch (parseError) {
      logger.error('JSON parse error:', parseError);
      return {
        success: false,
        confidence: 0,
        rawResponse: rawJson,
        error: `Failed to parse JSON response: ${parseError}`
      };
    }

    // Validate with Zod schema
    const validation = InvoiceSchema.safeParse(parsed);

    if (!validation.success) {
      logger.error('Zod validation failed:', validation.error.issues);
      return {
        success: false,
        confidence: 0,
        rawResponse: rawJson,
        error: `Schema validation failed: ${validation.error.issues.map(i => i.message).join(', ')}`
      };
    }

    const invoice = validation.data;

    logger.info(`Extracted invoice ${invoice.invoice_number}, total $${invoice.total}, confidence ${invoice.confidence_score}%`);

    return {
      success: true,
      invoice,
      confidence: invoice.confidence_score
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Extraction error:', errorMessage);
    return {
      success: false,
      confidence: 0,
      error: errorMessage
    };
  }
}

/**
 * Extract invoice data from PDF bytes directly (for in-memory processing)
 *
 * @param pdfBuffer - PDF file buffer
 * @param filename - Original filename for logging
 * @returns Extraction result with parsed Invoice or error
 */
export async function extractInvoiceFromBuffer(
  pdfBuffer: Buffer,
  filename: string
): Promise<ExtractionResult> {
  try {
    const pdfBase64 = pdfBuffer.toString('base64');

    logger.info(`Extracting invoice from ${filename} (${pdfBuffer.length} bytes)`);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64
            }
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT
          }
        ]
      }]
    });

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return {
        success: false,
        confidence: 0,
        error: 'No text response from Claude'
      };
    }

    const rawJson = textBlock.text;
    const jsonMatch = rawJson.match(/```json\s*([\s\S]*?)\s*```/) ||
                     rawJson.match(/```\s*([\s\S]*?)\s*```/);
    const cleanJson = jsonMatch ? jsonMatch[1] : rawJson;
    const parsed = JSON.parse(cleanJson.trim());

    const validation = InvoiceSchema.safeParse(parsed);
    if (!validation.success) {
      return {
        success: false,
        confidence: 0,
        rawResponse: rawJson,
        error: `Schema validation failed: ${validation.error.issues.map(i => i.message).join(', ')}`
      };
    }

    return {
      success: true,
      invoice: validation.data,
      confidence: validation.data.confidence_score
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      confidence: 0,
      error: errorMessage
    };
  }
}
