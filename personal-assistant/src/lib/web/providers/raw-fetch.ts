import * as cheerio from 'cheerio'
import type { WebReadProvider, ReadResponse } from '../provider-types'

export const rawFetchProvider: WebReadProvider = {
  name: 'raw-fetch',

  isConfigured(): boolean {
    return true
  },

  async read(url: string): Promise<ReadResponse> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BitBit/1.0 (web reader)',
      },
    })

    if (!res.ok) {
      throw new Error(`Fetch error ${res.status}: ${await res.text()}`)
    }

    const html = await res.text()
    const $ = cheerio.load(html)

    $('script, style, nav, footer, header, aside, [role="navigation"], [role="banner"]').remove()

    const title = $('title').text().trim() || $('h1').first().text().trim() || undefined
    const content = $('body').text().replace(/\s+/g, ' ').trim()

    return { content, title }
  },
}
