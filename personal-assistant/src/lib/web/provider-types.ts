export interface SearchResult {
  title: string
  url: string
  snippet: string
  score?: number
}

export interface SearchResponse {
  results: SearchResult[]
  answer?: string
}

export interface WebSearchProvider {
  name: string
  isConfigured(): boolean
  search(query: string, maxResults: number, options?: Record<string, unknown>): Promise<SearchResponse>
}

export interface ReadResponse {
  content: string
  title?: string
}

export interface WebReadProvider {
  name: string
  isConfigured(): boolean
  read(url: string): Promise<ReadResponse>
}
