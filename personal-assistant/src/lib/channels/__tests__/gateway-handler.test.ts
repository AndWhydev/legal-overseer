import { describe, it, expect } from 'vitest';
import { splitIntoBubbles } from '../gateway-handler';
import { renderForIMessage } from '../renderers/imessage';

describe('splitIntoBubbles', () => {
  // --- Preserved from the old suite (still valid under the new algorithm) ---

  it('splits on blank lines', () => {
    expect(splitIntoBubbles('first\n\nsecond\n\nthird')).toEqual(['first', 'second', 'third']);
  });

  it('handles multiple blank lines', () => {
    expect(splitIntoBubbles('hello\n\n\n\nworld')).toEqual(['hello', 'world']);
  });

  it('keeps short bubbles with internal newlines intact', () => {
    expect(splitIntoBubbles('short\nline')).toEqual(['short\nline']);
  });

  it('filters empty paragraphs', () => {
    expect(splitIntoBubbles('\n\nhello\n\n\n\n')).toEqual(['hello']);
  });

  it('trims whitespace around paragraphs', () => {
    expect(splitIntoBubbles('  hello  \n\n  world  ')).toEqual(['hello', 'world']);
  });

  // --- New algorithm: list-aware, 350-char soft cap, 3-bubble hard cap. ---

  it('keeps a list as a single bubble (never splits mid-list)', () => {
    const input = '• a\n• b\n• c';
    expect(splitIntoBubbles(input)).toEqual(['• a\n• b\n• c']);
  });

  it('handles the rendered transcript example: prose + list + prose → 3 bubbles', () => {
    // Raw agent output with markdown…
    const raw = "**Hi.** Here's your stuff:\n\n- a\n- b\n- c\n\nAnything else?";
    // …passed through the iMessage renderer first (as gateway-handler does).
    const rendered = renderForIMessage(raw);
    expect(rendered).toBe("Hi. Here's your stuff:\n\n• a\n• b\n• c\n\nAnything else?");

    expect(splitIntoBubbles(rendered)).toEqual([
      "Hi. Here's your stuff:",
      '• a\n• b\n• c',
      'Anything else?',
    ]);
  });

  it('merges consecutive list paragraphs into a single bubble', () => {
    const input = '• a\n• b\n\n• c\n• d';
    expect(splitIntoBubbles(input)).toEqual(['• a\n• b\n\n• c\n• d']);
  });

  it('recognizes numbered lists', () => {
    const input = '1. first\n2. second\n3. third';
    expect(splitIntoBubbles(input)).toEqual(['1. first\n2. second\n3. third']);
  });

  it('recognizes `- ` bullets as a list (short-circuit when rendering skipped)', () => {
    const input = '- a\n- b\n- c';
    expect(splitIntoBubbles(input)).toEqual(['- a\n- b\n- c']);
  });

  it('does not treat a paragraph with a non-list line as a list', () => {
    const input = 'intro line\n• stray bullet\nfollow up';
    // Mixed content → kept as one prose paragraph (not a list).
    expect(splitIntoBubbles(input)).toEqual([input]);
  });

  it('splits a long prose paragraph on sentence boundaries', () => {
    const sentence = 'This is a moderately long sentence that adds a good chunk of bulk to the overall paragraph length. ';
    // Build a paragraph >350 chars.
    const input = sentence.repeat(5).trim();
    expect(input.length).toBeGreaterThan(350);

    const result = splitIntoBubbles(input);
    // We expect multiple sentence-based bubbles (capped at MAX_BUBBLES=3 below).
    expect(result.length).toBeGreaterThan(1);
    expect(result.length).toBeLessThanOrEqual(3);
    // Every sentence terminator should still be attached to its sentence
    // (no bubble should START with a punctuation mark).
    for (const b of result) {
      expect(b).not.toMatch(/^\.|^!|^\?/);
    }
    // Reassembling produces the original (modulo whitespace).
    expect(result.join(' ').replace(/\s+/g, ' ')).toBe(input.replace(/\s+/g, ' '));
  });

  it('merges a very short trailing sentence with its neighbour', () => {
    // Long sentences + one very short sentence — short one should merge back.
    const longSentence =
      'This is a long sentence that should easily exceed the minimum merge threshold and stand on its own as a bubble without much trouble. ';
    const shortSentence = 'Hi.';
    // Force length>350 so the sentence splitter actually runs.
    const padded = (longSentence + longSentence + longSentence + shortSentence).trim();
    expect(padded.length).toBeGreaterThan(350);

    const result = splitIntoBubbles(padded);
    // The short sentence should never appear as a bubble on its own.
    for (const b of result) {
      expect(b).not.toBe('Hi.');
    }
  });

  it('caps at 3 bubbles, collapsing trailing paragraphs into the third', () => {
    const input = ['one', 'two', 'three', 'four', 'five', 'six'].join('\n\n');
    const result = splitIntoBubbles(input);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('one');
    expect(result[1]).toBe('two');
    expect(result[2]).toBe('three\n\nfour\n\nfive\n\nsix');
  });

  it('leaves short outputs untouched by the 3-bubble cap', () => {
    expect(splitIntoBubbles('alpha\n\nbeta')).toEqual(['alpha', 'beta']);
  });
});
