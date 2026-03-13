import { describe, it, expect } from 'vitest'
import { detectLeak, scrubLeaks } from './response-guard'

describe('response-guard', () => {
  describe('detectLeak', () => {
    it('detects "claude" mention', () => {
      const result = detectLeak('I am Claude, an AI assistant.')
      expect(result.leaked).toBe(true)
      expect(result.patterns.length).toBeGreaterThan(0)
    })

    it('detects "anthropic" mention', () => {
      const result = detectLeak('I was made by Anthropic.')
      expect(result.leaked).toBe(true)
    })

    it('detects "openai" mention', () => {
      const result = detectLeak('OpenAI created me.')
      expect(result.leaked).toBe(true)
    })

    it('detects GPT model names', () => {
      const result = detectLeak('I am based on GPT-4.')
      expect(result.leaked).toBe(true)
    })

    it('detects "system prompt" phrase', () => {
      const result = detectLeak('My system prompt tells me to be helpful.')
      expect(result.leaked).toBe(true)
    })

    it('detects "my instructions" phrase', () => {
      const result = detectLeak('According to my instructions, I should help.')
      expect(result.leaked).toBe(true)
    })

    it('detects "i was told/instructed/programmed to"', () => {
      expect(detectLeak('I was instructed to respond this way.').leaked).toBe(true)
      expect(detectLeak('I was told to be helpful.').leaked).toBe(true)
      expect(detectLeak('I was programmed to assist users.').leaked).toBe(true)
    })

    it('detects "as an ai language model"', () => {
      expect(detectLeak('As an AI language model, I cannot browse the web.').leaked).toBe(true)
      expect(detectLeak('As an AI model, I have limitations.').leaked).toBe(true)
    })

    it('detects "my training/guidelines/rules say"', () => {
      expect(detectLeak('My training says I should be helpful.').leaked).toBe(true)
      expect(detectLeak('My guidelines require me to be safe.').leaked).toBe(true)
      expect(detectLeak('My rules tell me not to do that.').leaked).toBe(true)
    })

    it('detects "I\'m a language model"', () => {
      expect(detectLeak("I'm a language model trained by data.").leaked).toBe(true)
      expect(detectLeak('I am a large language model.').leaked).toBe(true)
    })

    it('detects "my creators/developers/makers at/is/are"', () => {
      expect(detectLeak('My creators at Anthropic designed me.').leaked).toBe(true)
      expect(detectLeak('My developers are working on improvements.').leaked).toBe(true)
      expect(detectLeak('My maker is a tech company.').leaked).toBe(true)
    })

    it('returns clean for normal text', () => {
      const result = detectLeak('Here is the quarterly report for Q3. Revenue is up 15%.')
      expect(result.leaked).toBe(false)
      expect(result.patterns).toEqual([])
    })

    it('reports multiple simultaneous leaks', () => {
      const result = detectLeak('I am Claude, made by Anthropic. As an AI language model, I have limits.')
      expect(result.leaked).toBe(true)
      expect(result.patterns.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('scrubLeaks', () => {
    it('replaces Claude with BitBit', () => {
      expect(scrubLeaks('I am Claude.')).toBe('I am BitBit.')
    })

    it('replaces Anthropic with BitBit', () => {
      expect(scrubLeaks('Made by Anthropic.')).toBe('Made by BitBit.')
    })

    it('replaces OpenAI with BitBit', () => {
      expect(scrubLeaks('OpenAI builds AI.')).toBe('BitBit builds AI.')
    })

    it('replaces GPT model names with BitBit', () => {
      expect(scrubLeaks('Based on GPT-4.')).toBe('Based on BitBit.')
      expect(scrubLeaks('Using GPT-3.5-turbo.')).toBe('Using BitBit.')
    })

    it('preserves surrounding text', () => {
      const input = 'Hello, I am Claude and I help with tasks.'
      const result = scrubLeaks(input)
      expect(result).toBe('Hello, I am BitBit and I help with tasks.')
    })

    it('handles multiple replacements in one string', () => {
      const input = 'Claude was made by Anthropic, not by OpenAI.'
      const result = scrubLeaks(input)
      expect(result).toBe('BitBit was made by BitBit, not by BitBit.')
    })

    it('returns clean text unchanged', () => {
      const clean = 'Here is your report for today.'
      expect(scrubLeaks(clean)).toBe(clean)
    })

    it('scrubs case-insensitively (lowercase)', () => {
      expect(scrubLeaks('I am claude.')).toBe('I am BitBit.')
      expect(scrubLeaks('made by anthropic')).toBe('made by BitBit')
    })

    it('scrubs case-insensitively (uppercase)', () => {
      expect(scrubLeaks('I am CLAUDE.')).toBe('I am BitBit.')
      expect(scrubLeaks('ANTHROPIC made me.')).toBe('BitBit made me.')
    })
  })
})
