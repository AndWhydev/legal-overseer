import { describe, it, expect } from 'vitest'
import { splitIntoBubbles } from '../gateway-handler'

describe('splitIntoBubbles', () => {
  it('splits on blank lines', () => {
    expect(splitIntoBubbles('first\n\nsecond\n\nthird')).toEqual(['first', 'second', 'third'])
  })
  it('handles multiple blank lines', () => {
    expect(splitIntoBubbles('hello\n\n\n\nworld')).toEqual(['hello', 'world'])
  })
  it('splits long bubbles on newlines', () => {
    const long = 'this is a really long line that exceeds eighty characters and has a newline break\nfollowed by another'
    expect(splitIntoBubbles(long)).toEqual([
      'this is a really long line that exceeds eighty characters and has a newline break',
      'followed by another',
    ])
  })
  it('keeps short bubbles with newlines intact', () => {
    expect(splitIntoBubbles('short\nline')).toEqual(['short\nline'])
  })
  it('caps at 6 bubbles', () => {
    const input = Array.from({ length: 8 }, (_, i) => `b${i + 1}`).join('\n\n')
    const result = splitIntoBubbles(input)
    expect(result.length).toBe(6)
    expect(result[5]).toBe('b6\nb7\nb8')
  })
  it('filters empty', () => {
    expect(splitIntoBubbles('\n\nhello\n\n\n\n')).toEqual(['hello'])
  })
  it('trims whitespace', () => {
    expect(splitIntoBubbles('  hello  \n\n  world  ')).toEqual(['hello', 'world'])
  })
})
