/**
 * Render markdown-ish text for iMessage.
 *
 * iMessage renders markdown as literal characters (e.g. `**bold**` shows the
 * asterisks). This renderer strips common markdown syntax while preserving the
 * text content, and normalizes list bullets to the unicode bullet (•) so they
 * look intentional rather than like leftover markdown.
 *
 * Rules:
 *   - `**text**` / `__text__` → `text`           (bold stripped)
 *   - `*text*`  / `_text_`    → `text`           (italic stripped, won't double-strip)
 *   - leading `#`, `##`, `###` (up to 6) → stripped, text kept
 *   - leading `- `, `* `, `+ ` → `• `            (list bullet normalization)
 *   - `[text](url)` → `text (url)`               (iMessage auto-links bare URLs)
 *   - `\n{3,}` → `\n\n`                          (collapse extra blank lines)
 */
export function renderForIMessage(text: string): string {
  let out = text;

  // --- Bold first (so italic pass doesn't eat one of the two asterisks). ---
  // Match **...** and __...__ non-greedily, requiring non-empty content.
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '$1');
  out = out.replace(/__([^_\n]+?)__/g, '$1');

  // --- Italic. Use single * / _ with non-empty content, avoid crossing newlines. ---
  // Require the delimiter to NOT be adjacent to another of the same char
  // (already consumed above) or to a word character on the outside (for _),
  // which is how common markdown parsers avoid mangling snake_case.
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1$2');
  out = out.replace(/(^|[^A-Za-z0-9_])_([^_\n]+?)_(?![A-Za-z0-9_])/g, '$1$2');

  // --- Headers at line start: up to 6 # followed by at least one space. ---
  out = out.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');

  // --- List bullets at line start: -, *, + followed by a space. ---
  out = out.replace(/^([ \t]*)[-*+][ \t]+/gm, '$1• ');

  // --- Markdown links [text](url) → text (url). ---
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)');

  // --- Collapse 3+ newlines into exactly 2. ---
  out = out.replace(/\n{3,}/g, '\n\n');

  return out;
}
