// ---------------------------------------------------------------------------
// HTML -> Elementor JSON Converter
// ---------------------------------------------------------------------------
// Best-effort converter that parses common HTML patterns into Elementor's
// section > column > widget JSON structure for import into WordPress sites
// running Elementor.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Elementor JSON Types
// ---------------------------------------------------------------------------

export interface ElementorWidget {
  id: string
  elType: 'widget'
  widgetType: string
  settings: Record<string, unknown>
  elements: []
}

export interface ElementorColumn {
  id: string
  elType: 'column'
  settings: Record<string, unknown>
  elements: ElementorWidget[]
}

export interface ElementorSection {
  id: string
  elType: 'section'
  settings: Record<string, unknown>
  elements: ElementorColumn[]
}

export type ElementorDocument = ElementorSection[]

// ---------------------------------------------------------------------------
// ID generation (Elementor uses 7-char hex IDs)
// ---------------------------------------------------------------------------

let idCounter = 0

function generateElementorId(): string {
  idCounter++
  const base = Date.now().toString(16) + idCounter.toString(16)
  return base.slice(-7).padStart(7, '0')
}

/** Reset the counter (useful for deterministic tests) */
export function resetIdCounter(): void {
  idCounter = 0
}

// ---------------------------------------------------------------------------
// CSS Variable Resolution
// ---------------------------------------------------------------------------

interface CSSVars {
  [key: string]: string
}

function extractCSSVariables(html: string): CSSVars {
  const vars: CSSVars = {}
  // Match :root { --var-name: value; } blocks
  const rootMatch = html.match(/:root\s*\{([^}]+)\}/)
  if (!rootMatch) return vars

  const declarations = rootMatch[1]
  const varRegex = /--([\w-]+)\s*:\s*([^;]+)/g
  let match: RegExpExecArray | null
  while ((match = varRegex.exec(declarations)) !== null) {
    vars[`--${match[1]}`] = match[2].trim()
  }
  return vars
}

function resolveCSSVar(value: string, vars: CSSVars): string {
  return value.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_full, name: string, fallback?: string) => {
    return vars[name] ?? fallback?.trim() ?? ''
  })
}

// ---------------------------------------------------------------------------
// Inline Style Extraction
// ---------------------------------------------------------------------------

interface ExtractedStyles {
  background_color?: string
  color?: string
  padding?: { unit: string; top: string; right: string; bottom: string; left: string }
  margin?: { unit: string; top: string; right: string; bottom: string; left: string }
}

function extractInlineStyles(styleAttr: string, vars: CSSVars): ExtractedStyles {
  const styles: ExtractedStyles = {}
  const resolved = resolveCSSVar(styleAttr, vars)

  const bgMatch = resolved.match(/background(?:-color)?\s*:\s*([^;]+)/)
  if (bgMatch) styles.background_color = bgMatch[1].trim()

  const colorMatch = resolved.match(/(?:^|;\s*)color\s*:\s*([^;]+)/)
  if (colorMatch) styles.color = colorMatch[1].trim()

  const paddingMatch = resolved.match(/padding\s*:\s*([^;]+)/)
  if (paddingMatch) {
    const parts = paddingMatch[1].trim().split(/\s+/)
    styles.padding = parseBoxModel(parts)
  }

  const marginMatch = resolved.match(/margin\s*:\s*([^;]+)/)
  if (marginMatch) {
    const parts = marginMatch[1].trim().split(/\s+/)
    styles.margin = parseBoxModel(parts)
  }

  return styles
}

function parseBoxModel(parts: string[]): { unit: string; top: string; right: string; bottom: string; left: string } {
  const extract = (v: string) => v.replace(/[a-z%]+$/i, '')
  const unitMatch = parts[0]?.match(/[a-z%]+$/i)
  const unit = unitMatch ? unitMatch[0] : 'px'

  if (parts.length === 1) {
    const v = extract(parts[0])
    return { unit, top: v, right: v, bottom: v, left: v }
  }
  if (parts.length === 2) {
    const v = extract(parts[0])
    const h = extract(parts[1])
    return { unit, top: v, right: h, bottom: v, left: h }
  }
  if (parts.length === 3) {
    return { unit, top: extract(parts[0]), right: extract(parts[1]), bottom: extract(parts[2]), left: extract(parts[1]) }
  }
  return { unit, top: extract(parts[0]), right: extract(parts[1]), bottom: extract(parts[2]), left: extract(parts[3]) }
}

// ---------------------------------------------------------------------------
// HTML Parsing Helpers
// ---------------------------------------------------------------------------

function getStyleAttr(tag: string): string {
  const match = tag.match(/style\s*=\s*"([^"]*)"/)
  return match ? match[1] : ''
}

function getAttr(tag: string, attr: string): string {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'i'))
  return match ? match[1] : ''
}

function isButtonElement(tag: string): boolean {
  const cls = getAttr(tag, 'class').toLowerCase()
  return cls.includes('btn') || cls.includes('button')
}

// ---------------------------------------------------------------------------
// Element -> Widget converters
// ---------------------------------------------------------------------------

function headingToWidget(tagName: string, innerHtml: string, vars: CSSVars, fullTag: string): ElementorWidget {
  const sizeMap: Record<string, string> = {
    h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
  }
  const style = extractInlineStyles(getStyleAttr(fullTag), vars)
  const settings: Record<string, unknown> = {
    title: innerHtml.replace(/<[^>]+>/g, '').trim(),
    header_size: sizeMap[tagName.toLowerCase()] ?? 'h2',
    align: 'left',
  }
  if (style.color) settings.title_color = style.color

  return {
    id: generateElementorId(),
    elType: 'widget',
    widgetType: 'heading',
    settings,
    elements: [],
  }
}

function textToWidget(innerHtml: string, vars: CSSVars, fullTag: string): ElementorWidget {
  const style = extractInlineStyles(getStyleAttr(fullTag), vars)
  const settings: Record<string, unknown> = { editor: innerHtml.trim() }
  if (style.color) settings.text_color = style.color

  return {
    id: generateElementorId(),
    elType: 'widget',
    widgetType: 'text-editor',
    settings,
    elements: [],
  }
}

function imageToWidget(tag: string): ElementorWidget {
  const src = getAttr(tag, 'src')
  const alt = getAttr(tag, 'alt')

  return {
    id: generateElementorId(),
    elType: 'widget',
    widgetType: 'image',
    settings: {
      image: { url: src, alt },
    },
    elements: [],
  }
}

function buttonToWidget(tag: string, innerHtml: string): ElementorWidget {
  const href = getAttr(tag, 'href')
  const text = innerHtml.replace(/<[^>]+>/g, '').trim()

  return {
    id: generateElementorId(),
    elType: 'widget',
    widgetType: 'button',
    settings: {
      text,
      link: { url: href, is_external: href.startsWith('http') },
    },
    elements: [],
  }
}

function listToWidget(fullHtml: string): ElementorWidget {
  return {
    id: generateElementorId(),
    elType: 'widget',
    widgetType: 'text-editor',
    settings: { editor: fullHtml.trim() },
    elements: [],
  }
}

function formToWidget(fullHtml: string): ElementorWidget {
  // Elementor Pro forms need the Pro plugin; use HTML widget as placeholder
  return {
    id: generateElementorId(),
    elType: 'widget',
    widgetType: 'html',
    settings: { html: fullHtml.trim() },
    elements: [],
  }
}

function htmlFallbackWidget(html: string): ElementorWidget {
  return {
    id: generateElementorId(),
    elType: 'widget',
    widgetType: 'html',
    settings: { html: html.trim() },
    elements: [],
  }
}

// ---------------------------------------------------------------------------
// Block-level HTML -> widgets
// ---------------------------------------------------------------------------

function parseBlocksToWidgets(html: string, vars: CSSVars): ElementorWidget[] {
  const widgets: ElementorWidget[] = []

  // Strip <style> and <script> blocks (process only visible content)
  const cleaned = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

  // Match top-level block elements
  const blockRegex = /<(h[1-6]|p|img|a|ul|ol|form|div|nav|header|footer|main|article|aside)(\s[^>]*)?\/?>([\s\S]*?)<\/\1>|<(img)(\s[^>]*)?\s*\/?>/gi

  let match: RegExpExecArray | null
  while ((match = blockRegex.exec(cleaned)) !== null) {
    const fullMatch = match[0]
    const tagName = (match[1] ?? match[4] ?? '').toLowerCase()
    const attrsStr = match[2] ?? match[5] ?? ''
    const fullTag = `<${tagName}${attrsStr}>`
    const inner = match[3] ?? ''

    if (/^h[1-6]$/.test(tagName)) {
      widgets.push(headingToWidget(tagName, inner, vars, fullTag))
    } else if (tagName === 'p') {
      widgets.push(textToWidget(inner, vars, fullTag))
    } else if (tagName === 'img') {
      widgets.push(imageToWidget(fullTag))
    } else if (tagName === 'a' && isButtonElement(fullTag)) {
      widgets.push(buttonToWidget(fullTag, inner))
    } else if (tagName === 'ul' || tagName === 'ol') {
      widgets.push(listToWidget(fullMatch))
    } else if (tagName === 'form') {
      widgets.push(formToWidget(fullMatch))
    } else {
      // For div, nav, header, footer, etc. -- recurse or use HTML widget
      const innerWidgets = parseBlocksToWidgets(inner, vars)
      if (innerWidgets.length > 0) {
        widgets.push(...innerWidgets)
      } else if (inner.trim()) {
        widgets.push(htmlFallbackWidget(fullMatch))
      }
    }
  }

  // If no block elements matched, treat entire content as text
  if (widgets.length === 0 && cleaned.trim()) {
    widgets.push(htmlFallbackWidget(cleaned))
  }

  return widgets
}

// ---------------------------------------------------------------------------
// Main converter
// ---------------------------------------------------------------------------

/**
 * Convert an HTML string to an Elementor-compatible JSON document.
 *
 * This is a best-effort converter -- it handles common patterns (headings,
 * paragraphs, images, buttons, lists, forms) and falls back to HTML widgets
 * for anything it doesn't specifically recognise.
 */
export function htmlToElementorJson(html: string): ElementorDocument {
  const vars = extractCSSVariables(html)
  const sections: ElementorSection[] = []

  // Try to split by <section> or <div class="section"> blocks
  const sectionRegex = /<(?:section|div)(\s[^>]*class\s*=\s*"[^"]*section[^"]*"[^>]*|\s[^>]*)?\s*>([\s\S]*?)<\/(?:section|div)>/gi
  const sectionMatches = [...html.matchAll(sectionRegex)]

  if (sectionMatches.length > 0) {
    for (const m of sectionMatches) {
      const attrsStr = m[1] ?? ''
      const sectionHtml = m[2] ?? ''
      const style = extractInlineStyles(getStyleAttr(`<div${attrsStr}>`), vars)

      const widgets = parseBlocksToWidgets(sectionHtml, vars)
      if (widgets.length === 0) continue

      const sectionSettings: Record<string, unknown> = {
        layout: 'full_width',
        gap: 'default',
      }
      if (style.background_color) sectionSettings.background_color = style.background_color
      if (style.padding) sectionSettings.padding = style.padding

      sections.push({
        id: generateElementorId(),
        elType: 'section',
        settings: sectionSettings,
        elements: [
          {
            id: generateElementorId(),
            elType: 'column',
            settings: { _column_size: 100 },
            elements: widgets,
          },
        ],
      })
    }
  }

  // If no sections found, wrap everything in a single section
  if (sections.length === 0) {
    // Strip <html>, <head>, <body> wrappers to get content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    const content = bodyMatch ? bodyMatch[1] : html

    const widgets = parseBlocksToWidgets(content, vars)
    if (widgets.length > 0) {
      sections.push({
        id: generateElementorId(),
        elType: 'section',
        settings: { layout: 'full_width', gap: 'default' },
        elements: [
          {
            id: generateElementorId(),
            elType: 'column',
            settings: { _column_size: 100 },
            elements: widgets,
          },
        ],
      })
    }
  }

  return sections
}

// ---------------------------------------------------------------------------
// Serialiser
// ---------------------------------------------------------------------------

/**
 * Serialize an ElementorDocument to the `_elementor_data` meta value format.
 * This JSON string is what WordPress stores in postmeta for Elementor to render.
 */
export function elementorJsonToMeta(doc: ElementorDocument): string {
  return JSON.stringify(doc)
}
