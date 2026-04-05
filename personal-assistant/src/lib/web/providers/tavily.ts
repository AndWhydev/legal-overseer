import type { WebSearchProvider, SearchResponse } from '../provider-types'

export const tavilyProvider: WebSearchProvider = {
  name: 'tavily',

  isConfigured(): boolean {
    return !!process.env.TAVILY_API_KEY
  },

  async search(query: string, maxResults: number, options?: Record<string, unknown>): Promise<SearchResponse> {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: maxResults,
        search_depth: (options?.search_depth as string) || 'basic',
        include_answer: true,
      }),
    })

    if (!res.ok) {
      throw new Error(`Tavily API error ${res.status}: ${await res.text()}`)
    }

    const data = await res.json()
    return {
      results: (data.results || []).map((r: Record<string, unknown>) => ({
        title: r.title as string,
        url: r.url as string,
        snippet: (r.content as string) || '',
        score: r.score as number | undefined,
      })),
      answer: data.answer || undefined,
    }
  },
}
