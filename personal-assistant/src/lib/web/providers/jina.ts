import type { WebReadProvider, ReadResponse } from '../provider-types'

export const jinaProvider: WebReadProvider = {
  name: 'jina',

  isConfigured(): boolean {
    return true
  },

  async read(url: string): Promise<ReadResponse> {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/markdown',
      },
    })

    if (!res.ok) {
      throw new Error(`Jina Reader error ${res.status}: ${await res.text()}`)
    }

    const content = await res.text()
    const titleMatch = content.match(/^#\s+(.+)$/m)
    return {
      content,
      title: titleMatch?.[1] || undefined,
    }
  },
}
