/**
 * Render markdown-ish text for WhatsApp.
 *
 * WhatsApp supports its own inline formatting:
 *   *bold*  _italic_  ~strikethrough~  ```code```
 *
 * We translate common markdown syntax into WhatsApp native where we can, and
 * strip things WhatsApp doesn't render (e.g. heading hashes, markdown link
 * syntax).
 *
 * Rules:
 *   - `**text**` / `__text__` → `*text*`         (markdown bold → WhatsApp bold)
 *   - `*text*` / `_text_`     → left as-is       (already WhatsApp native)
 *   - `~text~`                → left as-is       (already WhatsApp strike)
 *   - ``` ```code``` ```      → left as-is       (already WhatsApp code block)
 *   - leading `#`, `##`, `###` (up to 6) → stripped, text kept
 *   - `[text](url)` → `text (url)`
 *   - leading `- ` / `* ` → `• `                 (nicer bullet; WhatsApp renders fine)
 *   - `\n{3,}` → `\n\n`
 */
export function renderForWhatsApp(text: string): string {
  let out = text;

  // Markdown bold → WhatsApp bold.
  // Order matters: do __...__ first, then **...** (both produce *...*).
  out = out.replace(/__([^_\n]+?)__/g, '*$1*');
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');

  // Headers at line start: strip hashes, keep text.
  out = out.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');

  // Markdown links [text](url) → text (url).
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)');

  // List bullets → • for a cleaner look. Leave `+ ` alone too.
  out = out.replace(/^([ \t]*)[-*+][ \t]+/gm, '$1• ');

  // Collapse 3+ newlines into exactly 2.
  out = out.replace(/\n{3,}/g, '\n\n');

  return out;
}
