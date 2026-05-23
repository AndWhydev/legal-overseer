/**
 * .docx → plain text extraction.
 *
 * Wraps `mammoth` so the rest of the intake pipeline can read .docx
 * files the same way it reads .md (one string of body text).
 *
 * Mammoth converts the document XML into normalised text and drops
 * styling — exactly what the LLM parser wants.
 */

import { readFile } from 'node:fs/promises';
import mammoth from 'mammoth';

/**
 * Extract plain text from a .docx file.
 *
 * @param path - Absolute path to the .docx file
 * @returns Concatenated body text (paragraphs separated by \n\n)
 */
export async function extractTextFromDocx(path: string): Promise<string> {
  const buffer = await readFile(path);
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}
