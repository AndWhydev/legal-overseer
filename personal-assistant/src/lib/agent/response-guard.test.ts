import { describe, it, expect } from 'vitest'
import { detectLeak, scrubLeaks, humanize, guardAndHumanize } from './response-guard'

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

  describe('humanize', () => {
    it('strips AI openers', () => {
      expect(humanize('Certainly! Here are the results.')).toBe('Here are the results.')
      expect(humanize('Of course! Let me check.')).toBe('Let me check.')
      expect(humanize('Absolutely! Three emails came in.')).toBe('Three emails came in.')
      expect(humanize('Great question! The invoice is overdue.')).toBe('The invoice is overdue.')
      expect(humanize("I'd be happy to help! Checking now.")).toBe('Checking now.')
    })

    it('strips AI fillers', () => {
      expect(humanize("It's important to note that Steve owes us.")).toBe('Steve owes us.')
      expect(humanize("Furthermore, the deadline is Friday.")).toBe('The deadline is Friday.')
      expect(humanize("Additionally, Maya confirmed.")).toBe('Maya confirmed.')
    })

    it('strips forbidden tail phrases', () => {
      expect(humanize('Done. Let me know if you need anything else.')).toBe('Done.')
      expect(humanize('Invoice sent. Is there anything else I can help with?')).toBe('Invoice sent.')
      expect(humanize("All sorted. Don't hesitate to ask if you need more.")).toBe('All sorted.')
      expect(humanize("Updated. Feel free to reach out.")).toBe('Updated.')
      expect(humanize("Handled. Happy to help!")).toBe('Handled.')
    })

    it('enforces collective voice', () => {
      expect(humanize('Your tasks are up to date.')).toBe('Our tasks are up to date.')
      expect(humanize('Your inbox has 3 new messages.')).toBe('Our inbox has 3 new messages.')
      expect(humanize('Your pipeline is at $15K.')).toBe('Our pipeline is at $15K.')
      expect(humanize("You've got 5 leads.")).toBe("We've got 5 leads.")
      expect(humanize('You have 3 overdue invoices.')).toBe('We have 3 overdue invoices.')
    })

    it('removes self-referential framing', () => {
      expect(humanize('I checked the inbox.')).toBe('Checked the inbox.')
      expect(humanize("I've searched for Steve.")).toBe('Searched for Steve.')
      expect(humanize('I found 3 matching emails.')).toBe('Found 3 matching emails.')
    })

    it('removes em-dashes', () => {
      expect(humanize('Steve—the one from Brisbane—sent an email.')).toBe('Steve, the one from Brisbane, sent an email.')
    })

    it('tames excessive exclamation marks', () => {
      expect(humanize('Done!!!')).toBe('Done!')
    })

    it('preserves clean text', () => {
      const clean = 'Three emails came in. Two are noise, one from Steve needs a reply.'
      expect(humanize(clean)).toBe(clean)
    })

    it('handles empty input', () => {
      expect(humanize('')).toBe('')
    })

    it('handles combined issues', () => {
      const input = "Certainly! I've searched your inbox. Furthermore, your tasks are all done. Let me know if you need anything!"
      const expected = "Searched our inbox. Our tasks are all done."
      expect(humanize(input)).toBe(expected)
    })
  })

  describe('guardAndHumanize', () => {
    it('combines leak scrubbing and humanization', () => {
      const input = 'Certainly! As Claude, I checked your inbox.'
      const result = guardAndHumanize(input)
      expect(result).not.toContain('Certainly')
      expect(result).not.toContain('Claude')
      expect(result).toContain('BitBit')
      expect(result).toContain('our inbox')
    })
  })
})
