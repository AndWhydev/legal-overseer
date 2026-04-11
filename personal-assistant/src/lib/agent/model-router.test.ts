import { describe, it, expect } from 'vitest'
import { selectModel } from './model-router'

describe('selectModel', () => {
  describe('synthesis selection', () => {
    it('selects synthesis for 2+ complex-reasoning triggers', () => {
      const result = selectModel('Help me plan and design the next quarter')

      expect(result.purpose).toBe('synthesis')
      expect(result.reasoning).toContain('trigger')
    })

    it('selects synthesis for strategy + plan', () => {
      const result = selectModel('What strategy and plan should we follow?')

      expect(result.purpose).toBe('synthesis')
    })

    it('selects synthesis for analyze + compare', () => {
      const result = selectModel('Analyze and compare the market trends')

      expect(result.purpose).toBe('synthesis')
    })

    it('selects synthesis for evaluate + prioritize', () => {
      const result = selectModel('Evaluate and prioritize these options')

      expect(result.purpose).toBe('synthesis')
    })

    it('selects synthesis for long prompts (>500 words)', () => {
      const longPrompt = Array(600).fill('word').join(' ')

      const result = selectModel(longPrompt)

      expect(result.purpose).toBe('synthesis')
      expect(result.reasoning).toContain('word')
    })

    it('selects synthesis for multi-instruction prompts', () => {
      const multiLine = `First, do this.
      Second, do that.
      Third, consider this aspect.
      Fourth, analyze the result.
      This is a complex multi-instruction task with many steps and considerations that requires careful planning and analysis to ensure all aspects are properly addressed and integrated together.`

      const result = selectModel(multiLine)

      expect(result.purpose).toBe('synthesis')
    })

    it('selects synthesis for prompts with 2+ questions (>100 words)', () => {
      const prompt = `What are the best practices for API design?
        And how should we handle versioning?
        This is a longer prompt to meet the word count requirement.`

      const result = selectModel(prompt)

      expect(result.purpose).toBe('synthesis')
    })

    it('requires at least 2 triggers', () => {
      const result = selectModel('Plan something')

      expect(result.purpose).not.toBe('synthesis')
    })
  })

  describe('classification selection', () => {
    it('selects classification for classify + categorize', () => {
      const result = selectModel('Classify and categorize these items')

      expect(result.purpose).toBe('classification')
    })

    it('selects classification for triage + filter', () => {
      const result = selectModel('Triage and filter these tickets')

      expect(result.purpose).toBe('classification')
    })

    it('selects classification for short simple query with 1 trigger', () => {
      const result = selectModel('Is this valid?')

      expect(result.purpose).toBe('classification')
      expect(result.reasoning).toContain('Short')
    })
  })

  describe('conversation selection (default)', () => {
    it('selects conversation by default', () => {
      const result = selectModel('Hello world')

      expect(result.purpose).toBe('conversation')
      expect(result.reasoning).toContain('Default')
    })

    it('selects conversation for standard queries', () => {
      const result = selectModel('Get the user data')

      expect(result.purpose).toBe('conversation')
    })

    it('returns conversation for empty prompt', () => {
      const result = selectModel('')

      expect(result.purpose).toBe('conversation')
    })
  })

  describe('context parameter', () => {
    it('includes context in selection', () => {
      const result = selectModel('analyze data', 'Compare quarterly revenue trends')

      expect(result.purpose).toBe('synthesis')
    })

    it('combines prompt and context for keyword matching', () => {
      const result = selectModel('Check this', 'Please evaluate the strategy')

      expect(result.purpose).toBe('synthesis')
    })
  })

  describe('edge cases', () => {
    it('handles case-insensitive keyword matching', () => {
      const result = selectModel('PLAN the strategy')

      expect(result.purpose).toBe('synthesis')
    })

    it('returns model string for all purposes', () => {
      const synth = selectModel('Plan the strategy')
      const cls = selectModel('Classify and categorize')
      const conv = selectModel('Hello')

      expect(typeof synth.model).toBe('string')
      expect(typeof cls.model).toBe('string')
      expect(typeof conv.model).toBe('string')
    })
  })
})
