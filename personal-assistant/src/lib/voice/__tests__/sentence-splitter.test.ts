import { describe, it, expect } from 'vitest'
import { createSentenceSplitter, stripMarkdownForSpeech } from '../sentence-splitter'

describe('createSentenceSplitter', () => {
  it('emits one sentence once its terminator + whitespace arrives', () => {
    const s = createSentenceSplitter()
    expect(s.push('Hello world')).toEqual([])
    expect(s.push('. ')).toEqual([])
    expect(s.push('This is longer content. ')).toEqual([
      'Hello world. This is longer content.',
    ])
  })

  it('holds tiny fragments until a longer sentence joins', () => {
    const s = createSentenceSplitter()
    expect(s.push('Hi. ')).toEqual([])
    expect(s.push('What can I help with today? ')).toEqual([
      'Hi. What can I help with today?',
    ])
  })

  it('does not flush on abbreviations ("e.g.", "Mr.", "i.e.") or decimals', () => {
    const s = createSentenceSplitter()
    expect(
      s.push('The invoice, e.g. the one from Mr. Smith for $3.14, is overdue. '),
    ).toEqual(['The invoice, e.g. the one from Mr. Smith for $3.14, is overdue.'])
  })

  it('handles chunked-mid-word streaming input', () => {
    const s = createSentenceSplitter()
    const deltas = ['The total', ' is $1,', '250.', '50 includ', 'ing tax. ']
    const collected: string[] = []
    for (const d of deltas) collected.push(...s.push(d))
    expect(collected).toEqual(['The total is $1,250.50 including tax.'])
  })

  it('holds a trailing short sentence for merge; flush drains it', () => {
    const s = createSentenceSplitter()
    expect(s.push('That is a long enough sentence to emit. ')).toEqual([
      'That is a long enough sentence to emit.',
    ])
    expect(s.push('Ship today? ')).toEqual([])
    expect(s.flush()).toEqual(['Ship today?'])
  })

  it('treats paragraph breaks (\\n\\n) as hard sentence boundaries', () => {
    const s = createSentenceSplitter()
    expect(
      s.push('This is one paragraph\n\nAnd another longer one. '),
    ).toEqual(['This is one paragraph', 'And another longer one.'])
  })

  it('flush() drains remaining buffered text at end of stream', () => {
    const s = createSentenceSplitter()
    expect(s.push('A complete sentence here already. ')).toEqual([
      'A complete sentence here already.',
    ])
    expect(s.push('Tail without terminator')).toEqual([])
    expect(s.flush()).toEqual(['Tail without terminator'])
  })

  it('treats "..." and "?!" as single boundaries', () => {
    const s = createSentenceSplitter()
    expect(s.push('Really large balance outstanding... ')).toEqual([
      'Really large balance outstanding...',
    ])
    expect(s.push('Did you pay already?! ')).toEqual([
      'Did you pay already?!',
    ])
  })

  it('returns empty arrays on empty pushes and flushes', () => {
    const s = createSentenceSplitter()
    expect(s.push('')).toEqual([])
    expect(s.flush()).toEqual([])
  })
})

describe('stripMarkdownForSpeech', () => {
  it('removes bold/italic markers', () => {
    expect(stripMarkdownForSpeech('**bold** and *italic* and _emph_')).toBe(
      'bold and italic and emph',
    )
  })

  it('replaces links with their display text', () => {
    expect(stripMarkdownForSpeech('See [the docs](https://example.com) now')).toBe(
      'See the docs now',
    )
  })

  it('strips headings and list bullets', () => {
    expect(stripMarkdownForSpeech('# Heading\n- Item one\n* Item two')).toBe(
      'Heading Item one Item two',
    )
  })

  it('strips inline and fenced code', () => {
    expect(stripMarkdownForSpeech('Call `fn()` after ```js\nconst x = 1\n```')).toBe(
      'Call fn() after',
    )
  })
})
