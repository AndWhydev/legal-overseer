import { describe, it, expect, vi, afterEach } from 'vitest'
import { categorizeMedia, isVoiceMemoMime, downloadSendblueMedia } from '../sendblue-media'

describe('sendblue-media', () => {
  afterEach(() => vi.restoreAllMocks())

  describe('categorizeMedia', () => {
    it('audio', () => { expect(categorizeMedia('audio/x-caf')).toBe('audio'); expect(categorizeMedia('audio/mpeg')).toBe('audio') })
    it('image', () => { expect(categorizeMedia('image/jpeg')).toBe('image'); expect(categorizeMedia('image/png')).toBe('image') })
    it('video', () => expect(categorizeMedia('video/mp4')).toBe('video'))
    it('document', () => expect(categorizeMedia('application/pdf')).toBe('document'))
    it('unknown', () => expect(categorizeMedia('application/octet-stream')).toBe('unknown'))
  })

  describe('isVoiceMemoMime', () => {
    it('true for audio', () => expect(isVoiceMemoMime('audio/x-caf')).toBe(true))
    it('false for image', () => expect(isVoiceMemoMime('image/jpeg')).toBe(false))
  })

  describe('downloadSendblueMedia', () => {
    it('null for empty URL', async () => expect(await downloadSendblueMedia('')).toBeNull())

    it('downloads with correct metadata', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, headers: new Headers({ 'content-type': 'audio/x-caf' }),
        arrayBuffer: () => Promise.resolve(Buffer.from('audio').buffer),
      }))
      const r = await downloadSendblueMedia('https://cdn.sendblue.co/voice.caf')
      expect(r).not.toBeNull()
      expect(r!.mimeType).toBe('audio/x-caf')
      expect(r!.category).toBe('audio')
    })

    it('null on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
      expect(await downloadSendblueMedia('https://cdn.sendblue.co/missing.jpg')).toBeNull()
    })
  })
})
