/**
 * File Type Validation Module
 *
 * Validates media files using magic bytes (not file extensions)
 * to ensure uploaded files are actually the format they claim to be.
 *
 * Key principle: Extensions lie, magic bytes don't.
 */

import { fileTypeFromFile } from 'file-type';
import { access } from 'fs/promises';

/**
 * Allowed video MIME types for content QA
 */
export const ALLOWED_VIDEO_MIMES = [
  'video/mp4',
  'video/quicktime', // .mov
  'video/webm',
  'video/x-msvideo', // .avi
] as const;

/**
 * Allowed image MIME types for content QA
 */
export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Result of file type validation
 */
export interface FileValidation {
  /** Whether the file is a valid media type */
  valid: boolean;
  /** Detected MIME type (null if unrecognized) */
  mimeType: string | null;
  /** Media category (video, image, or unknown) */
  mediaType: 'video' | 'image' | 'unknown';
  /** Error message if validation failed */
  error?: string;
}

/**
 * Validate a media file by checking its magic bytes.
 *
 * Uses file-type library to read the first few bytes of the file
 * and determine its actual format, regardless of file extension.
 *
 * @param filePath - Path to the media file to validate
 * @returns Validation result with MIME type and media category
 *
 * @example
 * ```typescript
 * const result = await validateMediaFile('/path/to/video.mp4');
 * if (result.valid) {
 *   console.log(`Valid ${result.mediaType}: ${result.mimeType}`);
 * } else {
 *   console.error(`Invalid file: ${result.error}`);
 * }
 * ```
 */
export async function validateMediaFile(filePath: string): Promise<FileValidation> {
  // Check if file exists and is accessible
  try {
    await access(filePath);
  } catch {
    return {
      valid: false,
      mimeType: null,
      mediaType: 'unknown',
      error: `File not found or inaccessible: ${filePath}`,
    };
  }

  // Detect file type from magic bytes
  const fileType = await fileTypeFromFile(filePath);

  if (!fileType) {
    return {
      valid: false,
      mimeType: null,
      mediaType: 'unknown',
      error: 'Unable to detect file type from magic bytes',
    };
  }

  const { mime } = fileType;

  // Check if it's an allowed video type
  if ((ALLOWED_VIDEO_MIMES as readonly string[]).includes(mime)) {
    return {
      valid: true,
      mimeType: mime,
      mediaType: 'video',
    };
  }

  // Check if it's an allowed image type
  if ((ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime)) {
    return {
      valid: true,
      mimeType: mime,
      mediaType: 'image',
    };
  }

  // Detected a file type, but it's not in our allowed list
  return {
    valid: false,
    mimeType: mime,
    mediaType: 'unknown',
    error: `Unsupported media type: ${mime}`,
  };
}
