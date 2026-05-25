/**
 * generate-one-pager.ts — Render the Legal Overseer sales one-pager to
 * a single-page A4 PDF at sales/legal-overseer-one-pager.pdf.
 *
 * Pure pdf-lib (no headless browser needed), so it runs anywhere Node
 * runs. Premium dark-navy and white treatment to match the product and
 * the marketing site.
 *
 * Usage:
 *   npm run sales:one-pager
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

// ---------------------------------------------------------------------------
// Palette (matches the marketing site)
// ---------------------------------------------------------------------------
const NAVY_950 = rgb(0.039, 0.059, 0.122); // #0a0f1f
const NAVY_900 = rgb(0.051, 0.078, 0.157); // #0d1428
const GOLD = rgb(0.78, 0.62, 0.32); // #c79e52
const WHITE = rgb(1, 1, 1);
const INK = rgb(0.07, 0.1, 0.18);
const SLATE = rgb(0.32, 0.37, 0.46);
const LIGHT = rgb(0.95, 0.96, 0.98);
const HAIRLINE = rgb(0.85, 0.87, 0.91);

// A4 in points
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

async function main(): Promise<void> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Helper: convert a "distance from top" to a pdf-lib y coordinate.
  const yFromTop = (top: number) => PAGE_H - top;

  // Text helper anchored from the top.
  function text(
    s: string,
    x: number,
    top: number,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) {
    const font = opts.font ?? reg;
    const size = opts.size ?? 10;
    page.drawText(s, { x, y: yFromTop(top) - size, size, font, color: opts.color ?? INK });
  }

  // Word-wrap helper; returns the number of lines drawn.
  function paragraph(
    s: string,
    x: number,
    top: number,
    maxWidth: number,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; lineGap?: number } = {},
  ): number {
    const font = opts.font ?? reg;
    const size = opts.size ?? 10;
    const lineGap = opts.lineGap ?? 4;
    const words = s.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = trial;
      }
    }
    if (line) lines.push(line);
    lines.forEach((ln, i) => {
      text(ln, x, top + i * (size + lineGap), { font, size, color: opts.color });
    });
    return lines.length;
  }

  // =========================================================================
  // Header band
  // =========================================================================
  const HEADER_H = 132;
  page.drawRectangle({ x: 0, y: yFromTop(HEADER_H), width: PAGE_W, height: HEADER_H, color: NAVY_950 });
  // gold rule under the header
  page.drawRectangle({ x: 0, y: yFromTop(HEADER_H), width: PAGE_W, height: 3, color: GOLD });

  // Shield mark
  const shieldX = MARGIN;
  const shieldTop = 34;
  page.drawRectangle({ x: shieldX, y: yFromTop(shieldTop + 30), width: 30, height: 30, color: NAVY_900, borderColor: GOLD, borderWidth: 1 });
  text('LO', shieldX + 6, shieldTop + 9, { font: bold, size: 13, color: GOLD });

  text('LEGAL OVERSEER', MARGIN + 42, 34, { font: bold, size: 22, color: WHITE });
  text('The AI Paralegal Built for Australian Law Firms', MARGIN + 42, 62, { font: reg, size: 12, color: GOLD });
  paragraph(
    'On-premises AI that drafts, researches and manages your matters end to end — deployed on your own server, so client data never leaves the firm. Every output is reviewed by an admitted lawyer.',
    MARGIN + 42,
    84,
    CONTENT_W - 42,
    { size: 9, color: rgb(0.78, 0.82, 0.9), lineGap: 3 },
  );

  // =========================================================================
  // Problems / solutions
  // =========================================================================
  let top = HEADER_H + 26;
  text('THREE PROBLEMS EVERY FIRM FACES — SOLVED', MARGIN, top, { font: bold, size: 12, color: NAVY_900 });
  page.drawRectangle({ x: MARGIN, y: yFromTop(top + 18), width: 46, height: 2.5, color: GOLD });
  top += 30;

  const problems: { p: string; s: string }[] = [
    {
      p: 'Lawyers are buried in administrative work.',
      s: 'Legal Overseer takes on intake, drafting, research, document chasing, file notes and billing prep — recovering 10+ hours per lawyer each week for fee-earning work.',
    },
    {
      p: 'Skilled paralegal capacity is costly and hard to find.',
      s: 'It works every matter at once, around the clock, with the consistency of your best paralegal — and scales instantly as the firm grows, with no recruitment lag.',
    },
    {
      p: 'Cloud AI tools put privileged client data at risk.',
      s: 'Legal Overseer runs entirely on your own server. Privileged material is redacted locally before any model call, so confidential data stays inside the firm.',
    },
  ];

  for (const { p, s } of problems) {
    // gold bullet
    page.drawCircle({ x: MARGIN + 4, y: yFromTop(top) - 4, size: 3, color: GOLD });
    text(p, MARGIN + 16, top, { font: bold, size: 10.5, color: INK });
    const lines = paragraph(s, MARGIN + 16, top + 15, CONTENT_W - 16, { size: 9.5, color: SLATE, lineGap: 3 });
    top += 15 + lines * (9.5 + 3) + 12;
  }

  // =========================================================================
  // Security story
  // =========================================================================
  top += 2;
  const secBoxTop = top;
  // measure paragraph height first
  const secText =
    'Security by architecture, not by promise. Legal Overseer is deployed on-premises on infrastructure you control — there is no shared cloud and no multi-tenant database. Privileged content is redacted locally before any AI call, backups are AES-256-GCM encrypted with keys you hold, and every action is written to an immutable, hash-chained audit trail. The result is a platform built for ASCR rule 9.1 and the Australian Privacy Act, with data sovereignty guaranteed by design.';
  // draw the tinted box
  const innerW = CONTENT_W - 28;
  // estimate lines
  const tmpLines = (() => {
    const words = secText.split(/\s+/);
    let line = '';
    let count = 0;
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (reg.widthOfTextAtSize(trial, 9.5) > innerW && line) {
        count++;
        line = w;
      } else line = trial;
    }
    if (line) count++;
    return count;
  })();
  const secBoxH = 22 + tmpLines * (9.5 + 3) + 14;
  page.drawRectangle({
    x: MARGIN,
    y: yFromTop(secBoxTop + secBoxH),
    width: CONTENT_W,
    height: secBoxH,
    color: LIGHT,
    borderColor: GOLD,
    borderWidth: 1,
  });
  // gold left accent
  page.drawRectangle({ x: MARGIN, y: yFromTop(secBoxTop + secBoxH), width: 3, height: secBoxH, color: GOLD });
  text('THE SECURITY STORY', MARGIN + 14, secBoxTop + 12, { font: bold, size: 9, color: NAVY_900 });
  paragraph(secText, MARGIN + 14, secBoxTop + 26, innerW, { size: 9.5, color: INK, lineGap: 3 });
  top = secBoxTop + secBoxH + 24;

  // =========================================================================
  // Pricing table
  // =========================================================================
  text('PRICING', MARGIN, top, { font: bold, size: 12, color: NAVY_900 });
  page.drawRectangle({ x: MARGIN, y: yFromTop(top + 18), width: 46, height: 2.5, color: GOLD });
  top += 28;

  const tiers = [
    { name: 'Small Firm', price: '$15,000', per: 'per year', desc: 'Up to 5 lawyers. The full compliance core, on your server.' },
    { name: 'Mid Firm', price: '$35,000', per: 'per year', desc: 'Up to 25 lawyers. Adds analytics, billing & integrations.' },
    { name: 'Enterprise', price: '$75,000+', per: 'per year', desc: '25+ lawyers, multi-office, SSO, REST API & dedicated SLA.' },
  ];
  const colGap = 12;
  const colW = (CONTENT_W - colGap * 2) / 3;
  const cardH = 96;
  tiers.forEach((t, i) => {
    const x = MARGIN + i * (colW + colGap);
    const featured = i === 1;
    page.drawRectangle({
      x,
      y: yFromTop(top + cardH),
      width: colW,
      height: cardH,
      color: featured ? NAVY_950 : WHITE,
      borderColor: featured ? GOLD : HAIRLINE,
      borderWidth: featured ? 1.5 : 1,
    });
    const nameColor = featured ? GOLD : NAVY_900;
    const priceColor = featured ? WHITE : INK;
    const descColor = featured ? rgb(0.78, 0.82, 0.9) : SLATE;
    text(t.name.toUpperCase(), x + 12, top + 14, { font: bold, size: 9, color: nameColor });
    text(t.price, x + 12, top + 30, { font: bold, size: 19, color: priceColor });
    text(t.per, x + 12, top + 52, { font: reg, size: 8.5, color: descColor });
    paragraph(t.desc, x + 12, top + 64, colW - 24, { size: 8, color: descColor, lineGap: 2.5 });
  });
  top += cardH + 8;
  text('All tiers include implementation and support. Annual licence — no per-matter fees.', MARGIN, top, {
    font: reg,
    size: 8,
    color: SLATE,
  });
  top += 22;

  // =========================================================================
  // CTA band (anchored near the bottom)
  // =========================================================================
  const ctaH = 64;
  const ctaTop = Math.max(top, PAGE_H - MARGIN - ctaH);
  page.drawRectangle({ x: MARGIN, y: yFromTop(ctaTop + ctaH), width: CONTENT_W, height: ctaH, color: NAVY_950 });
  page.drawRectangle({ x: MARGIN, y: yFromTop(ctaTop + ctaH), width: 4, height: ctaH, color: GOLD });
  text('Book a 30-minute demo', MARGIN + 20, ctaTop + 18, { font: bold, size: 15, color: WHITE });
  text('See Legal Overseer running on your own matters.', MARGIN + 20, ctaTop + 40, {
    font: reg,
    size: 9.5,
    color: rgb(0.78, 0.82, 0.9),
  });
  // contact block (right-aligned)
  const contactLabel = 'andy@allwebbedup.com.au';
  const cw = bold.widthOfTextAtSize(contactLabel, 11);
  text('GET IN TOUCH', MARGIN + CONTENT_W - cw - 20, ctaTop + 18, { font: reg, size: 8, color: GOLD });
  text(contactLabel, MARGIN + CONTENT_W - cw - 20, ctaTop + 32, { font: bold, size: 11, color: WHITE });

  // =========================================================================
  // Save
  // =========================================================================
  const outPath = resolve(process.cwd(), 'sales/legal-overseer-one-pager.pdf');
  mkdirSync(dirname(outPath), { recursive: true });
  const bytes = await doc.save();
  writeFileSync(outPath, bytes);
  console.log(`Wrote ${outPath} (${(bytes.length / 1024).toFixed(1)} KB, 1 page A4)`);
}

main().catch((err) => {
  console.error('One-pager generation failed:', err);
  process.exit(1);
});
