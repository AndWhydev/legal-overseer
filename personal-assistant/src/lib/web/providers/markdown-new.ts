import type { WebReadProvider, ReadResponse } from '../provider-types'

export const markdownNewProvider: WebReadProvider = {
  name: 'markdown-new',

  isConfigured(): boolean {
    return true
  },

  async read(url: string): Promise<ReadResponse> {
    const res = await fetch(`https://markdown.new/${url}`, {
      headers: {
        'Accept': 'text/markdown',
      },
    })

    if (!res.ok) {
      throw new Error(`markdown.new error ${res.status}: ${await res.text()}`)
    }

    const content = await res.text()
    const titleMatch = content.match(/^#\s+(.+)$/m)
    return {
      content,
      title: titleMatch?.[1] || undefined,
    }
  },
}
