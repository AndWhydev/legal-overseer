/**
 * Test-utterance detector tests.
 *
 * Covers the pattern table, disqualifiers, voice-mode lift, ack selection,
 * and the threshold gate. Real-world fixtures taken from the Apr-17
 * conversation that motivated the detector.
 */

import { describe, it, expect } from 'vitest'

import {
  detectTestUtterance,
  TEST_UTTERANCE_THRESHOLD,
} from '../test-utterance-detector'

describe('detectTestUtterance', () => {
  describe('positive cases — should ack', () => {
    const positives: Array<[string, { voiceMode?: boolean }?]> = [
      ['Testing, testing'],
      ['testing testing'],
      ['Testing, testing, testing'],
      ['Testing, testing, testing the voice mode'],
      ['mic check'],
      ['Mic check'],
      ['microphone check'],
      ['sound check'],
      ['check, check'],
      ['check check one two'],
      ['1 2 3'],
      ['one two three'],
      ['Can you hear me?'],
      ['can you hear me'],
      ['do you read me'],
      ['Is this thing on?'],
      ['Is this on?'],
      ['is anything working'],
      ['testing the voice mode'],
      ['testing voice', { voiceMode: true }],
    ]

    it.each(positives)('acks %j', (message, opts) => {
      const result = detectTestUtterance(message, opts)
      expect(result.isTestUtterance).toBe(true)
      expect(result.confidence).toBeGreaterThanOrEqual(TEST_UTTERANCE_THRESHOLD)
      expect(result.suggestedAck).toBeTruthy()
      expect(result.matchedLabels.length).toBeGreaterThan(0)
    })
  })

  describe('negative cases — should NOT ack', () => {
    const negatives: string[] = [
      '',
      'hello',
      'send an invoice to Maya',
      'Can you hear me on the zoom call for the 3pm? I need you to take notes.',
      'testing our staging deploy broke, can you fix it?',
      "I'm testing whether the invoice goes through",
      'check the calendar for tomorrow',
      'find the draft email about pricing',
      'Did you hear back from Steve?',
      'hello@example.com just emailed me',
      'can you look at https://example.com',
      'testing the voice mode but also please send a message to Tor',
    ]

    it.each(negatives)('does not ack %j', message => {
      const result = detectTestUtterance(message)
      expect(result.isTestUtterance).toBe(false)
      expect(result.suggestedAck).toBeUndefined()
    })
  })

  describe('voice-mode lift', () => {
    it('lifts weak matches when voiceMode is set', () => {
      const withoutVoice = detectTestUtterance('hello hello')
      const withVoice = detectTestUtterance('hello hello', { voiceMode: true })
      expect(withVoice.confidence).toBeGreaterThan(withoutVoice.confidence)
    })

    it('does not lift when there are no pattern matches', () => {
      const result = detectTestUtterance('send an invoice to Maya', { voiceMode: true })
      expect(result.confidence).toBe(0)
      expect(result.isTestUtterance).toBe(false)
    })

    it('does not push score above 1.0', () => {
      const result = detectTestUtterance('Testing, testing, testing', { voiceMode: true })
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('disqualifiers', () => {
    it('drops confidence when message contains a request verb', () => {
      const result = detectTestUtterance('testing, testing, can you send that email')
      expect(result.isTestUtterance).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('drops confidence when message is long', () => {
      const long = 'testing testing ' + 'a'.repeat(100)
      const result = detectTestUtterance(long)
      expect(result.isTestUtterance).toBe(false)
    })

    it('drops confidence when message contains a URL', () => {
      const result = detectTestUtterance('testing testing https://example.com')
      expect(result.isTestUtterance).toBe(false)
    })
  })

  describe('ack selection', () => {
    it('uses voice-friendly ack when voiceMode is true', () => {
      const result = detectTestUtterance('Testing, testing', { voiceMode: true })
      expect(result.suggestedAck).toBe('Loud and clear.')
    })

    it('uses voice-friendly ack for mic-check labels regardless of voiceMode', () => {
      const result = detectTestUtterance('mic check')
      expect(result.suggestedAck).toBe('Loud and clear.')
    })

    it('falls back to non-voice ack otherwise', () => {
      const result = detectTestUtterance('Testing, testing')
      expect(result.suggestedAck).toBe('Got you — mic check received.')
    })
  })

  describe('input hardening', () => {
    it('handles undefined gracefully', () => {
      const result = detectTestUtterance(undefined as unknown as string)
      expect(result.isTestUtterance).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('handles whitespace-only input', () => {
      const result = detectTestUtterance('   \n\t   ')
      expect(result.isTestUtterance).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('trims leading/trailing whitespace before matching', () => {
      const result = detectTestUtterance('  Testing, testing  ')
      expect(result.isTestUtterance).toBe(true)
    })
  })
})
