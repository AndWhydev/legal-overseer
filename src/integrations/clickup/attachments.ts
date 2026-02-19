/**
 * ClickUp Attachment Upload Module
 *
 * Provides direct API access for uploading file attachments to ClickUp tasks.
 * Uses the ClickUp REST API since the MCP server doesn't support attachments.
 *
 * @see https://clickup.com/api/clickupreference/operation/CreateTaskAttachment/
 */

import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('ClickUpAttachments');

/**
 * ClickUp API base URL
 */
const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

/**
 * Get API key from environment
 */
function getApiKey(): string | undefined {
  return process.env.CLICKUP_API_KEY;
}

/**
 * Result from attachment upload operation
 */
export interface AttachmentUploadResult {
  /** Whether upload succeeded */
  success: boolean;

  /** ClickUp attachment ID if successful */
  attachmentId?: string;

  /** Attachment URL if successful */
  attachmentUrl?: string;

  /** Error message if failed */
  error?: string;

  /** HTTP status code from API response */
  statusCode?: number;
}

/**
 * ClickUp attachment response structure
 */
interface ClickUpAttachmentResponse {
  id: string;
  version: string;
  date: number;
  title: string;
  extension: string;
  thumbnail_small?: string;
  thumbnail_medium?: string;
  thumbnail_large?: string;
  url: string;
  url_w_query?: string;
  hidden?: boolean;
  parent_id?: string;
  size?: number;
  total_comments?: number;
  resolved_comments?: number;
  parent?: {
    id: string;
    type: number;
  };
  user?: {
    id: number;
    username: string;
    email: string;
    color: string;
    initials: string;
    profilePicture?: string;
  };
}

/**
 * Check if ClickUp API is configured for direct access
 *
 * @returns true if CLICKUP_API_KEY is set
 */
export function isClickUpApiConfigured(): boolean {
  return Boolean(getApiKey());
}

/**
 * Upload an attachment to a ClickUp task
 *
 * Uses the ClickUp REST API directly with multipart/form-data encoding.
 *
 * @param taskId - The ClickUp task ID to attach file to
 * @param file - File buffer to upload
 * @param filename - Filename for the attachment (e.g., 'report.pdf')
 * @returns Promise resolving to upload result
 *
 * @example
 * ```typescript
 * const pdfBuffer = await generatePDF(reportData);
 * const result = await uploadAttachment(
 *   'abc123',
 *   pdfBuffer,
 *   'chess-master-report.pdf'
 * );
 *
 * if (result.success) {
 *   console.log(`Uploaded: ${result.attachmentUrl}`);
 * }
 * ```
 */
export async function uploadAttachment(
  taskId: string,
  file: Buffer,
  filename: string
): Promise<AttachmentUploadResult> {
  const apiKey = getApiKey();

  if (!apiKey) {
    return {
      success: false,
      error: 'ClickUp API key not configured. Set CLICKUP_API_KEY environment variable.',
    };
  }

  if (!taskId) {
    return {
      success: false,
      error: 'Task ID is required',
    };
  }

  if (!file || file.length === 0) {
    return {
      success: false,
      error: 'File buffer is empty',
    };
  }

  const url = `${CLICKUP_API_BASE}/task/${taskId}/attachment`;

  logger.info(`Uploading attachment "${filename}" (${file.length} bytes) to task ${taskId}`);

  try {
    // Build multipart form data manually since Node.js fetch doesn't natively support File
    const boundary = `----FormBoundary${Date.now()}`;
    const contentType = getContentType(filename);

    // Construct multipart body
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="attachment"; filename="${filename}"\r\n` +
          `Content-Type: ${contentType}\r\n\r\n`
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const statusCode = response.status;

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Upload failed (${statusCode}): ${errorText}`);

      return {
        success: false,
        error: `ClickUp API error: ${statusCode} - ${errorText}`,
        statusCode,
      };
    }

    const data = (await response.json()) as ClickUpAttachmentResponse;

    logger.info(`Attachment uploaded successfully: ${data.id}`);

    return {
      success: true,
      attachmentId: data.id,
      attachmentUrl: data.url,
      statusCode,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Upload error: ${errorMessage}`);

    return {
      success: false,
      error: `Failed to upload attachment: ${errorMessage}`,
    };
  }
}

/**
 * Get content type for file based on extension
 */
function getContentType(filename: string): string {
  const extension = filename.toLowerCase().split('.').pop();

  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    csv: 'text/csv',
    txt: 'text/plain',
    json: 'application/json',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  return contentTypes[extension || ''] || 'application/octet-stream';
}

/**
 * Upload a PDF report to a ClickUp task with standard naming
 *
 * Convenience function for uploading Chess Master Reports.
 *
 * @param taskId - The ClickUp task ID
 * @param pdf - PDF buffer
 * @param reportId - Report ID for filename (e.g., 'RPT-001')
 * @returns Promise resolving to upload result
 */
export async function uploadReportPDF(
  taskId: string,
  pdf: Buffer,
  reportId: string
): Promise<AttachmentUploadResult> {
  const filename = `chess-master-report-${reportId}.pdf`;
  return uploadAttachment(taskId, pdf, filename);
}
