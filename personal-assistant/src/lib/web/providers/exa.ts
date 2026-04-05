import type { WebSearchProvider, SearchResponse } from '../provider-types'

export const exaProvider: WebSearchProvider = {
  name: 'exa',

  isConfigured(): boolean {
    return !!process.env.EXA_API_KEY
  },

  async search(query: string, maxResults: number): Promise<SearchResponse> {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.EXA_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        num_results: maxResults,
        use_autoprompt: true,
      }),
    })

    if (!res.ok) {
      throw new Error(`Exa API error ${res.status}: ${await res.text()}`)
    }

    const data = await res.json()
    return {
      results: (data.results || []).map((r: Record<string, unknown>) => ({
        title: (r.title as string) || '',
        url: r.url as string,
        snippet: (r.text as string) || (r.highlights as string[])?.join(' ') || '',
        score: r.score as number | undefined,
      })),
    }
  },
}
