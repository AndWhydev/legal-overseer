import type { WebSearchProvider, SearchResponse } from '../provider-types'

export const serperProvider: WebSearchProvider = {
  name: 'serper',

  isConfigured(): boolean {
    return !!process.env.SERPER_API_KEY
  },

  async search(query: string, maxResults: number): Promise<SearchResponse> {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: maxResults }),
    })

    if (!res.ok) {
      throw new Error(`Serper API error ${res.status}: ${await res.text()}`)
    }

    const data = await res.json()
    return {
      results: (data.organic || []).map((r: Record<string, unknown>) => ({
        title: r.title as string,
        url: r.link as string,
        snippet: (r.snippet as string) || '',
      })),
    }
  },
}
