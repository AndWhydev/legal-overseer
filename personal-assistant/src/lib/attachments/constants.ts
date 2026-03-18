// ---------------------------------------------------------------------------
// Attachment validation constants
// ---------------------------------------------------------------------------

/** Allowed MIME types for file uploads */
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
])

/** Maximum file size in bytes (10MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Maximum number of files per message */
export const MAX_FILES_PER_MESSAGE = 5

/** Blocked file extensions (executables and scripts) */
export const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.sh', '.bat', '.cmd', '.com', '.msi', '.dll', '.scr', '.ps1',
])

/** Signed upload URL expiry in seconds (2 hours) */
export const UPLOAD_URL_EXPIRY = 7200

/** Signed download URL expiry in seconds (1 hour) */
export const DOWNLOAD_URL_EXPIRY = 3600

/** Supabase Storage bucket name */
export const STORAGE_BUCKET = 'chat-attachments'

/** Human-readable MIME type labels for error messages */
const ALLOWED_EXTENSIONS_DISPLAY = [
  '.jpg/.jpeg', '.png', '.gif', '.webp', '.pdf', '.docx', '.txt', '.csv',
].join(', ')

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate a file before upload.
 * Checks size, MIME type, and extension against blocklist.
 */
export function validateFile(
  filename: string,
  mimeType: string,
  size: number,
): ValidationResult {
  // Check file size
  if (size > MAX_FILE_SIZE) {
    const limitMB = MAX_FILE_SIZE / (1024 * 1024)
    const fileMB = (size / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `File size ${fileMB}MB exceeds the ${limitMB}MB limit`,
    }
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      error: `File type "${mimeType}" is not allowed. Accepted types: ${ALLOWED_EXTENSIONS_DISPLAY}`,
    }
  }

  // Check for blocked extensions
  const ext = filename.includes('.')
    ? '.' + filename.split('.').pop()!.toLowerCase()
    : ''
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File extension "${ext}" is blocked for security reasons`,
    }
  }

  return { valid: true }
}
