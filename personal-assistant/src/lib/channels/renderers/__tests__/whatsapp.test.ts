import { describe, it, expect } from 'vitest';
import { renderForWhatsApp } from '../whatsapp';

describe('renderForWhatsApp', () => {
  describe('bold', () => {
    it('converts **bold** to *bold* (WhatsApp native)', () => {
      expect(renderForWhatsApp('**Messaging & Email**')).toBe('*Messaging & Email*');
    });
    it('converts __bold__ to *bold*', () => {
      expect(renderForWhatsApp('__bold text__')).toBe('*bold text*');
    });
    it('leaves *bold* alone (already native)', () => {
      expect(renderForWhatsApp('*already bold*')).toBe('*already bold*');
    });
    it('handles multiple bold spans', () => {
      expect(renderForWhatsApp('**Other** and **more**')).toBe('*Other* and *more*');
    });
  });

  describe('italic and strikethrough', () => {
    it('leaves _italic_ alone (already native)', () => {
      expect(renderForWhatsApp('an _italic_ word')).toBe('an _italic_ word');
    });
    it('leaves ~strike~ alone (already native)', () => {
      expect(renderForWhatsApp('~struck out~')).toBe('~struck out~');
    });
    it('leaves ```code``` alone (already native)', () => {
      expect(renderForWhatsApp('```const x = 1```')).toBe('```const x = 1```');
    });
  });

  describe('headers', () => {
    it('strips # hashes, keeps text', () => {
      expect(renderForWhatsApp('# Title')).toBe('Title');
    });
    it('strips ## hashes, keeps text', () => {
      expect(renderForWhatsApp('## Subtitle')).toBe('Subtitle');
    });
    it('strips ### hashes, keeps text', () => {
      expect(renderForWhatsApp('### smaller')).toBe('smaller');
    });
  });

  describe('markdown links', () => {
    it('rewrites [text](url) to text (url)', () => {
      expect(renderForWhatsApp('[Google](https://google.com)'))
        .toBe('Google (https://google.com)');
    });
    it('handles a link inside prose', () => {
      expect(renderForWhatsApp('visit [our site](https://bitbit.chat) now'))
        .toBe('visit our site (https://bitbit.chat) now');
    });
  });

  describe('list bullets', () => {
    it('converts `- item` to `• item`', () => {
      expect(renderForWhatsApp('- Gmail (connected)')).toBe('• Gmail (connected)');
    });
    it('converts `* item` to `• item`', () => {
      expect(renderForWhatsApp('* item')).toBe('• item');
    });
    it('converts `+ item` to `• item`', () => {
      expect(renderForWhatsApp('+ item')).toBe('• item');
    });
    it('does not treat *bold* at line start as a bullet', () => {
      // `*bold*` has no space after the opening `*` — must not match bullet rule.
      expect(renderForWhatsApp('*bold*')).toBe('*bold*');
    });
  });

  describe('newline collapse', () => {
    it('collapses 3+ newlines to 2', () => {
      expect(renderForWhatsApp('a\n\n\n\nb')).toBe('a\n\nb');
    });
  });

  describe('full transcript example', () => {
    it('renders the onboarding transcript example', () => {
      const input = [
        '**Messaging & Email**',
        '- Gmail (connected)',
        '- Outlook (connected)',
        '',
        '**Other**',
        '- Telegram',
      ].join('\n');

      const expected = [
        '*Messaging & Email*',
        '• Gmail (connected)',
        '• Outlook (connected)',
        '',
        '*Other*',
        '• Telegram',
      ].join('\n');

      expect(renderForWhatsApp(input)).toBe(expected);
    });
  });
});
