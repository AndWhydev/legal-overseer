import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  transcribeVoiceNote,
  transcribeFromUrl,
  getFallbackMessage,
} from '../voice-transcription'

describe('voice-transcription', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('transcribeVoiceNote', () => {
    it('transcribes audio buffer successfully', async () => {
      const audioBuffer = Buffer.from('fake audio data')
      process.env.OPENAI_API_KEY = 'sk-test-key'

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'Hello, this is a test message',
          duration: 2.5,
          language: 'en',
        }),
      })

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg')

      expect(result.success).toBe(true)
      expect(result.text).toBe('Hello, this is a test message')
      expect(result.duration).toBe(2.5)
      expect(result.language).toBe('en')
      expect(result.error).toBeUndefined()

      // Verify API was called correctly
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-key',
          }),
        }),
      )
    })

    it('returns failed result when API key is missing', async () => {
      delete process.env.OPENAI_API_KEY
      const audioBuffer = Buffer.from('fake audio data')

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.duration).toBeNull()
      expect(result.language).toBeNull()
      expect(result.error).toContain('OPENAI_API_KEY')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns failed result for empty buffer', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const audioBuffer = Buffer.from('')

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toContain('Empty')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns failed result for oversized audio', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const oversized = Buffer.alloc(26 * 1024 * 1024) // 26 MB > 25 MB limit

      const result = await transcribeVoiceNote(oversized, 'audio/ogg')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toContain('exceeds')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('handles API error responses gracefully', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const audioBuffer = Buffer.from('fake audio data')

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      })

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toContain('401')
      expect(result.error).toContain('Invalid API key')
    })

    it('handles empty transcription response', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const audioBuffer = Buffer.from('fake audio data')

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: '   ', // Whitespace only
          duration: 1.0,
          language: 'en',
        }),
      })

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toContain('empty transcription')
    })

    it('handles network timeout', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const audioBuffer = Buffer.from('fake audio data')

      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      fetchMock.mockRejectedValueOnce(abortError)

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toContain('timeout')
    })

    it('handles network errors', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const audioBuffer = Buffer.from('fake audio data')

      fetchMock.mockRejectedValueOnce(new Error('Network error'))

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toContain('Network error')
    })

    it('supports language hint option', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const audioBuffer = Buffer.from('fake audio data')

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'Hola, esto es una prueba',
          duration: 2.0,
          language: 'es',
        }),
      })

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg', {
        language: 'es',
      })

      expect(result.success).toBe(true)
      expect(result.text).toBe('Hola, esto es una prueba')
      expect(result.language).toBe('es')
    })

    it('supports prompt option', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const audioBuffer = Buffer.from('fake audio data')

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'John Smith called about the invoice',
          duration: 3.5,
          language: 'en',
        }),
      })

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg', {
        prompt: 'Names: John Smith, Jane Doe. Topics: invoice, payment',
      })

      expect(result.success).toBe(true)
      expect(result.text).toBe('John Smith called about the invoice')
    })

    it('detects file extension from common MIME types', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'

      const mimeTypes = [
        { mime: 'audio/ogg', ext: 'ogg' },
        { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
        { mime: 'audio/mpeg', ext: 'mp3' },
        { mime: 'audio/mp4', ext: 'm4a' },
        { mime: 'audio/wav', ext: 'wav' },
        { mime: 'audio/webm', ext: 'webm' },
      ]

      for (const { mime } of mimeTypes) {
        vi.clearAllMocks()
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            text: 'test',
            duration: 1,
            language: 'en',
          }),
        })

        await transcribeVoiceNote(Buffer.from('test'), mime)

        expect(fetchMock).toHaveBeenCalledOnce()
      }
    })

    it('handles Uint8Array input', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const audioBuffer = new Uint8Array([1, 2, 3, 4, 5])

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'test',
          duration: 1,
          language: 'en',
        }),
      })

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg')

      expect(result.success).toBe(true)
      expect(result.text).toBe('test')
    })

    it('returns null for missing duration/language in response', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'
      const audioBuffer = Buffer.from('fake audio data')

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: 'test message',
          // Missing duration and language
        }),
      })

      const result = await transcribeVoiceNote(audioBuffer, 'audio/ogg')

      expect(result.success).toBe(true)
      expect(result.text).toBe('test message')
      expect(result.duration).toBeNull()
      expect(result.language).toBeNull()
    })
  })

  describe('transcribeFromUrl', () => {
    it('downloads and transcribes audio from URL', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'

      const audioBuffer = Buffer.from('fake audio data')
      let callCount = 0

      fetchMock.mockImplementation(async (url: string) => {
        callCount++
        if (url === 'https://example.com/audio.ogg') {
          return {
            ok: true,
            headers: new Map([['content-type', 'audio/ogg']]),
            arrayBuffer: async () => audioBuffer,
          }
        }
        // Second call to Whisper API
        return {
          ok: true,
          json: async () => ({
            text: 'Downloaded and transcribed',
            duration: 2.0,
            language: 'en',
          }),
        }
      })

      const result = await transcribeFromUrl('https://example.com/audio.ogg')

      expect(result.success).toBe(true)
      expect(result.text).toBe('Downloaded and transcribed')
      expect(result.duration).toBe(2.0)
      expect(result.language).toBe('en')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('includes authorization header when provided', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'

      fetchMock.mockImplementation(async (url: string, options: Record<string, unknown> = {}) => {
        if ((options.headers as Record<string, string>)?.Authorization === 'Bearer whatsapp-token') {
          return {
            ok: true,
            headers: new Map([['content-type', 'audio/ogg']]),
            arrayBuffer: async () => Buffer.from('test'),
          }
        }
        return {
          ok: true,
          json: async () => ({
            text: 'test',
            duration: 1,
            language: 'en',
          }),
        }
      })

      const result = await transcribeFromUrl(
        'https://graph.facebook.com/media/123',
        'whatsapp-token'
      )

      expect(result.success).toBe(true)
      const firstCall = fetchMock.mock.calls[0]
      expect(firstCall[1]).toHaveProperty('headers')
      expect((firstCall[1] as Record<string, unknown>).headers).toHaveProperty(
        'Authorization',
        'Bearer whatsapp-token'
      )
    })

    it('returns failed result for empty URL', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'

      const result = await transcribeFromUrl('')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toContain('Empty')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('handles download failure gracefully', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      })

      const result = await transcribeFromUrl('https://example.com/missing.ogg')

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toContain('404')
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('handles download timeout', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'

      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      fetchMock.mockRejectedValueOnce(abortError)

      const result = await transcribeFromUrl('https://example.com/slow.ogg')

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })

    it('passes through language and prompt options', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'

      fetchMock.mockImplementation(async (url: string) => {
        if (!url.includes('openai')) {
          return {
            ok: true,
            headers: new Map([['content-type', 'audio/ogg']]),
            arrayBuffer: async () => Buffer.from('test'),
          }
        }
        return {
          ok: true,
          json: async () => ({
            text: 'test',
            duration: 1,
            language: 'fr',
          }),
        }
      })

      const result = await transcribeFromUrl('https://example.com/audio.ogg', undefined, {
        language: 'fr',
        prompt: 'Names: Pierre, Marie',
      })

      expect(result.success).toBe(true)
      expect(result.language).toBe('fr')
    })
  })

  describe('getFallbackMessage', () => {
    it('returns fallback message without reason', () => {
      const message = getFallbackMessage(false)
      expect(message).toBe('[Voice note]')
    })

    it('returns fallback message with reason', () => {
      const message = getFallbackMessage(true)
      expect(message).toBe('[Voice note - transcription unavailable]')
    })

    it('returns simple message by default', () => {
      const message = getFallbackMessage()
      expect(message).toBe('[Voice note]')
    })
  })
})
