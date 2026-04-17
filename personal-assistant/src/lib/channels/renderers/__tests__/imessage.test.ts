import { describe, it, expect } from 'vitest';
import { renderForIMessage } from '../imessage';

describe('renderForIMessage', () => {
  describe('bold stripping', () => {
    it('strips **bold** markers', () => {
      expect(renderForIMessage('**Messaging & Email**')).toBe('Messaging & Email');
    });
    it('strips __bold__ markers', () => {
      expect(renderForIMessage('__bold text__')).toBe('bold text');
    });
    it('strips multiple bold spans on one line', () => {
      expect(renderForIMessage('**Other** and **more**')).toBe('Other and more');
    });
    it('strips inline bold in prose', () => {
      expect(renderForIMessage('this is **very** important'))
        .toBe('this is very important');
    });
  });

  describe('italic stripping', () => {
    it('strips *italic* markers', () => {
      expect(renderForIMessage('*italic words*')).toBe('italic words');
    });
    it('strips _italic_ markers', () => {
      expect(renderForIMessage('an _italic_ word')).toBe('an italic word');
    });
    it('leaves snake_case identifiers alone', () => {
      expect(renderForIMessage('use snake_case_names here'))
        .toBe('use snake_case_names here');
    });
    it('does not double-strip bold-then-italic overlap', () => {
      // **bold** should end up as `bold`, not get mangled by the italic pass.
      expect(renderForIMessage('**bold**')).toBe('bold');
    });
    it('leaves bare asterisks in math-ish text alone', () => {
      // 2 * 3 = 6 — not italic.
      expect(renderForIMessage('2 * 3 = 6')).toBe('2 * 3 = 6');
    });
  });

  describe('headers', () => {
    it('strips # H1 markers', () => {
      expect(renderForIMessage('# Title')).toBe('Title');
    });
    it('strips ## H2 markers', () => {
      expect(renderForIMessage('## Subtitle')).toBe('Subtitle');
    });
    it('strips ### H3 markers', () => {
      expect(renderForIMessage('### small')).toBe('small');
    });
    it('handles header lines inside multi-line text', () => {
      const input = '# Title\nbody text\n## Subsection\nmore body';
      expect(renderForIMessage(input)).toBe('Title\nbody text\nSubsection\nmore body');
    });
    it('strips headers with trailing whitespace preserved after text', () => {
      expect(renderForIMessage('##   Subtitle  ')).toBe('Subtitle  ');
    });
    it('ignores # not followed by a space', () => {
      expect(renderForIMessage('#notaheader')).toBe('#notaheader');
    });
  });

  describe('list bullets', () => {
    it('normalizes `- item` to `• item`', () => {
      expect(renderForIMessage('- Gmail (connected)')).toBe('• Gmail (connected)');
    });
    it('normalizes `* item` to `• item`', () => {
      expect(renderForIMessage('* item')).toBe('• item');
    });
    it('normalizes `+ item` to `• item`', () => {
      expect(renderForIMessage('+ item')).toBe('• item');
    });
    it('handles a full bullet list block', () => {
      const input = '- Gmail (connected)\n- Outlook (connected)\n- Telegram';
      expect(renderForIMessage(input))
        .toBe('• Gmail (connected)\n• Outlook (connected)\n• Telegram');
    });
    it('leaves indented list items indented', () => {
      expect(renderForIMessage('  - nested')).toBe('  • nested');
    });
  });

  describe('markdown links', () => {
    it('rewrites [text](url) to text (url)', () => {
      expect(renderForIMessage('[Google](https://google.com)'))
        .toBe('Google (https://google.com)');
    });
    it('handles a link in the middle of prose', () => {
      expect(renderForIMessage('check out [our site](https://bitbit.chat) today'))
        .toBe('check out our site (https://bitbit.chat) today');
    });
    it('leaves bare URLs alone', () => {
      expect(renderForIMessage('visit https://bitbit.chat for more'))
        .toBe('visit https://bitbit.chat for more');
    });
  });

  describe('newline collapse', () => {
    it('collapses 3+ newlines to 2', () => {
      expect(renderForIMessage('a\n\n\n\nb')).toBe('a\n\nb');
    });
    it('leaves double newlines alone', () => {
      expect(renderForIMessage('a\n\nb')).toBe('a\n\nb');
    });
  });

  describe('full transcript example', () => {
    it('renders the example from the onboarding transcript', () => {
      const input = [
        '**Messaging & Email**',
        '- Gmail (connected)',
        '- Outlook (connected)',
        '',
        '**Other**',
        '- Telegram',
      ].join('\n');

      const expected = [
        'Messaging & Email',
        '• Gmail (connected)',
        '• Outlook (connected)',
        '',
        'Other',
        '• Telegram',
      ].join('\n');

      expect(renderForIMessage(input)).toBe(expected);
    });
  });
});
