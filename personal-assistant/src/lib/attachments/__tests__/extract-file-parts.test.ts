import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractFilePartAttachments, type FilePart } from '../extract-file-parts'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Supabase mock factory
// ---------------------------------------------------------------------------

function createMockSupabase(overrides?: {
  uploadError?: Error | null
  insertError?: Error | null
  insertData?: { id: string } | null
  removeError?: Error | null
}) {
  const {
    uploadError = null,
    insertError = null,
    insertData = null,
    removeError = null,
  } = overrides || {}

  // Track calls for assertions
  const uploadCalls: Array<{ path: string; data: unknown; options: unknown }> = []
  const insertCalls: Array<Record<string, unknown>> = []
  const removeCalls: Array<string[]> = []

  const mockSingle = vi.fn().mockResolvedValue({
    data: insertData || { id: 'generated-uuid' },
    error: insertError,
  })

  const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })

  const mockInsert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    insertCalls.push(row)
    // When generating the ID, use the id from the row if present
    if (!insertError && !insertData) {
      mockSingle.mockResolvedValue({
        data: { id: row.id || 'generated-uuid' },
        error: null,
      })
    }
    return { select: mockSelect }
  })

  const mockFrom = vi.fn().mockReturnValue({
    insert: mockInsert,
  })

  const mockUpload = vi.fn().mockImplementation(
    (path: string, data: unknown, options: unknown) => {
      uploadCalls.push({ path, data, options })
      return Promise.resolve({
        data: uploadError ? null : { path },
        error: uploadError,
      })
    }
  )

  const mockRemove = vi.fn().mockImplementation((paths: string[]) => {
    removeCalls.push(paths)
    return Promise.resolve({
      data: removeError ? null : { message: 'ok' },
      error: removeError,
    })
  })

  const mockStorageFrom = vi.fn().mockReturnValue({
    upload: mockUpload,
    remove: mockRemove,
  })

  return {
    supabase: {
      from: mockFrom,
      storage: { from: mockStorageFrom },
    } as unknown as Parameters<typeof extractFilePartAttachments>[1],
    mocks: {
      from: mockFrom,
      insert: mockInsert,
      select: mockSelect,
      single: mockSingle,
      upload: mockUpload,
      remove: mockRemove,
      storageFrom: mockStorageFrom,
    },
    calls: {
      upload: uploadCalls,
      insert: insertCalls,
      remove: removeCalls,
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal base64 data URL for a 1x1 red PNG pixel. */
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_1X1_BASE64}`

/** Create a text/plain data URL. */
function textDataUrl(text: string): string {
  return `data:text/plain;base64,${Buffer.from(text).toString('base64')}`
}

function makeFilePart(overrides: Partial<FilePart> = {}): FilePart & { type: 'file' } {
  return {
    type: 'file',
    mediaType: 'image/png',
    url: PNG_DATA_URL,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Reset mocks
// ---------------------------------------------------------------------------

afterEach(() => vi.restoreAllMocks())

// Stub crypto.randomUUID for deterministic IDs
let uuidCounter = 0
beforeEach(() => {
  uuidCounter = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => `00000000-0000-0000-0000-${String(++uuidCounter).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`
  )
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractFilePartAttachments', () => {
  const orgId = 'org-123'
  const userId = 'user-456'

  describe('when no file parts are present', () => {
    it('returns empty arrays for text-only parts', async () => {
      const { supabase } = createMockSupabase()
      const parts = [{ type: 'text', text: 'hello' }]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toEqual([])
      expect(result.errors).toEqual([])
    })

    it('returns empty arrays for empty parts', async () => {
      const { supabase } = createMockSupabase()

      const result = await extractFilePartAttachments([], supabase, orgId, userId)

      expect(result.attachmentIds).toEqual([])
      expect(result.errors).toEqual([])
    })
  })

  describe('data URL file parts', () => {
    it('uploads a PNG data URL and creates an attachment record', async () => {
      const { supabase, calls } = createMockSupabase()
      const parts = [
        { type: 'text', text: 'Look at this image' },
        makeFilePart({ filename: 'screenshot.png' }),
      ]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(1)
      expect(result.errors).toHaveLength(0)

      // Verify storage upload was called
      expect(calls.upload).toHaveLength(1)
      expect(calls.upload[0].path).toMatch(/^org-123\/unthreaded\//)
      expect(calls.upload[0].path).toMatch(/screenshot\.png$/)
      expect(calls.upload[0].options).toEqual({
        contentType: 'image/png',
        upsert: false,
      })

      // Verify attachment record was created
      expect(calls.insert).toHaveLength(1)
      expect(calls.insert[0]).toMatchObject({
        org_id: orgId,
        user_id: userId,
        filename: 'screenshot.png',
        mime_type: 'image/png',
        status: 'ready',
      })
    })

    it('uses threadId in storage path when provided', async () => {
      const { supabase, calls } = createMockSupabase()
      const parts = [makeFilePart()]

      await extractFilePartAttachments(parts, supabase, orgId, userId, 'thread-789')

      expect(calls.upload[0].path).toMatch(/^org-123\/thread-789\//)
      expect(calls.insert[0].thread_id).toBe('thread-789')
    })

    it('derives filename from MIME type when not provided', async () => {
      const { supabase, calls } = createMockSupabase()
      const parts = [makeFilePart({ filename: undefined })]

      await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(calls.insert[0].filename).toBe('upload-1.png')
    })

    it('handles multiple file parts', async () => {
      const { supabase } = createMockSupabase()
      const parts = [
        makeFilePart({ filename: 'img1.png' }),
        makeFilePart({ filename: 'img2.png' }),
        makeFilePart({
          mediaType: 'text/plain',
          url: textDataUrl('hello world'),
          filename: 'notes.txt',
        }),
      ]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(3)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects files with disallowed MIME types', async () => {
      const { supabase } = createMockSupabase()
      const parts = [
        makeFilePart({
          mediaType: 'application/javascript',
          url: textDataUrl('alert("hi")'),
          filename: 'script.js',
        }),
      ]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(0)
    })

    it('handles storage upload failure gracefully', async () => {
      const { supabase } = createMockSupabase({
        uploadError: new Error('Storage unavailable'),
      })
      const parts = [makeFilePart({ filename: 'test.png' })]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(0)
      // Should not have an error in the errors array (logged + skipped)
    })

    it('handles DB insert failure and cleans up storage', async () => {
      const { supabase, calls } = createMockSupabase({
        insertError: new Error('DB error'),
        insertData: null,
      })

      // Fix the mock to return error properly
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabase as any).from = vi.fn().mockReturnValue({ insert: mockInsert })

      const parts = [makeFilePart({ filename: 'test.png' })]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(0)
      // Should attempt to clean up the uploaded file
      expect(calls.remove).toHaveLength(1)
    })

    it('sanitizes special characters in filenames', async () => {
      const { supabase, calls } = createMockSupabase()
      const parts = [makeFilePart({ filename: 'my file (1).png' })]

      await extractFilePartAttachments(parts, supabase, orgId, userId)

      // Storage path should have sanitized filename
      expect(calls.upload[0].path).toMatch(/my_file__1_\.png$/)
      // But the DB record should keep the original filename
      expect(calls.insert[0].filename).toBe('my file (1).png')
    })

    it('rejects malformed data URLs', async () => {
      const { supabase } = createMockSupabase()
      const parts = [makeFilePart({ url: 'data:not-a-valid-data-url' })]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(0)
    })
  })

  describe('HTTP URL file parts', () => {
    it('creates an attachment record for an HTTP URL', async () => {
      const { supabase, calls } = createMockSupabase()
      const parts = [
        makeFilePart({
          mediaType: 'image/jpeg',
          url: 'https://example.com/photo.jpg',
          filename: 'photo.jpg',
        }),
      ]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(1)

      // Should NOT upload to storage (it's an external URL)
      expect(calls.upload).toHaveLength(0)

      // Should create an attachment record with the URL as source_url (not storage_path)
      expect(calls.insert[0]).toMatchObject({
        org_id: orgId,
        user_id: userId,
        filename: 'photo.jpg',
        mime_type: 'image/jpeg',
        storage_path: null,
        source_url: 'https://example.com/photo.jpg',
        status: 'ready',
        size: 0,
      })
    })

    it('rejects HTTP URLs with disallowed MIME types', async () => {
      const { supabase } = createMockSupabase()
      const parts = [
        makeFilePart({
          mediaType: 'application/x-executable',
          url: 'https://example.com/malware.exe',
          filename: 'malware.exe',
        }),
      ]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(0)
    })
  })

  describe('unsupported URL schemes', () => {
    it('skips file parts with unsupported URL schemes', async () => {
      const { supabase } = createMockSupabase()
      const parts = [
        makeFilePart({
          url: 'ftp://example.com/file.png',
        }),
      ]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(0)
    })
  })

  describe('filtering', () => {
    it('ignores non-file parts in the parts array', async () => {
      const { supabase } = createMockSupabase()
      const parts = [
        { type: 'text', text: 'Hello' },
        { type: 'reasoning', reasoning: 'thinking...' },
        makeFilePart({ filename: 'real-file.png' }),
        { type: 'tool-call', toolCallId: '123', toolName: 'search', args: {} },
      ]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(1)
    })

    it('skips file parts missing required fields', async () => {
      const { supabase } = createMockSupabase()
      const parts = [
        { type: 'file' }, // Missing url and mediaType
        { type: 'file', url: PNG_DATA_URL }, // Missing mediaType
        { type: 'file', mediaType: 'image/png' }, // Missing url
        makeFilePart(), // Valid
      ]

      const result = await extractFilePartAttachments(
        parts as Array<{ type: string; [key: string]: unknown }>,
        supabase,
        orgId,
        userId,
      )

      expect(result.attachmentIds).toHaveLength(1)
    })
  })

  describe('mixed scenarios', () => {
    it('processes a mix of data URLs and HTTP URLs', async () => {
      const { supabase, calls } = createMockSupabase()
      const parts = [
        { type: 'text', text: 'Check these files' },
        makeFilePart({ filename: 'screenshot.png' }),
        makeFilePart({
          mediaType: 'application/pdf',
          url: 'https://example.com/report.pdf',
          filename: 'report.pdf',
        }),
      ]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      expect(result.attachmentIds).toHaveLength(2)
      // Only the data URL should be uploaded to storage
      expect(calls.upload).toHaveLength(1)
      // Both should have DB records
      expect(calls.insert).toHaveLength(2)
    })

    it('continues processing when one file fails', async () => {
      const { supabase, mocks } = createMockSupabase()

      // Make the first upload fail, second succeed
      let uploadCount = 0
      mocks.upload.mockImplementation((path: string, data: unknown, options: unknown) => {
        uploadCount++
        if (uploadCount === 1) {
          return Promise.resolve({ data: null, error: new Error('First upload failed') })
        }
        return Promise.resolve({ data: { path }, error: null })
      })

      const parts = [
        makeFilePart({ filename: 'fail.png' }),
        makeFilePart({ filename: 'succeed.png' }),
      ]

      const result = await extractFilePartAttachments(parts, supabase, orgId, userId)

      // Only second file should succeed
      expect(result.attachmentIds).toHaveLength(1)
      expect(result.errors).toHaveLength(0) // Failures are logged, not errors
    })
  })
})
