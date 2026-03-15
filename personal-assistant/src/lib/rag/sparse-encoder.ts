/**
 * Sparse Vector Encoder for BM25-style Hybrid Search
 *
 * Generates sparse vectors (token indices + TF-IDF weights) for use in Pinecone hybrid search.
 * Works alongside dense embeddings for better keyword matching and recall.
 *
 * Strategy:
 * - Tokenize text: split by whitespace, lowercase, remove punctuation
 * - Calculate term frequencies (TF) for each token
 * - Compute inverse document frequency (IDF) as a simple heuristic
 * - Use hash function to map tokens to indices (0-20000 range)
 * - Output: { indices: number[], values: number[] } format for Pinecone
 */

/**
 * Simple hash function to map token strings to consistent indices.
 * Uses a hash-based approach to distribute tokens across the index space.
 */
function tokenHash(token: string, indexSpace: number = 20000): number {
  let hash = 0
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash) % indexSpace
}

/**
 * Tokenize text: split by whitespace/punctuation, lowercase, filter stopwords.
 */
function tokenize(text: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
  ])

  // Split by whitespace and common punctuation, lowercase
  const tokens = text
    .toLowerCase()
    .split(/[\s!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]+/) // Split by whitespace or punctuation
    .filter(token => token.length > 0 && token.length < 50) // Filter empty, too long
    .filter(token => !stopwords.has(token)) // Remove stopwords

  return tokens
}

/**
 * Calculate term frequencies from a list of tokens.
 * Returns a map of token -> count.
 */
function calculateTermFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()

  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1)
  }

  return tf
}

/**
 * Compute TF-IDF weights for tokens.
 * Uses a simple IDF heuristic: log(1 + 1/tf) to penalize very common tokens.
 *
 * @param tokenFrequencies Term frequency map
 * @param totalTokens Total number of tokens in the text
 * @returns Map of token -> TF-IDF weight
 */
function calculateTfIdfWeights(
  tokenFrequencies: Map<string, number>,
  totalTokens: number
): Map<string, number> {
  const weights = new Map<string, number>()

  for (const [token, freq] of tokenFrequencies) {
    // TF: normalized term frequency
    const tf = freq / Math.max(totalTokens, 1)

    // IDF: simple heuristic (penalizes very common tokens)
    const idf = Math.log(1 + 1 / freq)

    // TF-IDF: combine both scores
    const tfidf = tf * idf

    weights.set(token, tfidf)
  }

  // Normalize weights to 0-1 range for better Pinecone compatibility
  const weightsArray = Array.from(weights.values())
  const maxWeight = weightsArray.length > 0 ? Math.max(...weightsArray) : 1

  const normalized = new Map<string, number>()
  weights.forEach((weight, token) => {
    normalized.set(token, weight / maxWeight)
  })

  return normalized
}

/**
 * Generate a sparse vector from text.
 *
 * Process:
 * 1. Tokenize the text
 * 2. Calculate term frequencies
 * 3. Compute TF-IDF weights
 * 4. Map tokens to indices using hash function
 * 5. Return sparse vector format: { indices, values }
 *
 * @param text The text to encode
 * @returns Sparse vector: { indices: number[], values: number[] }
 */
export function encodeSparseVector(text: string): { indices: number[]; values: number[] } {
  if (!text || text.trim().length === 0) {
    return { indices: [], values: [] }
  }

  // Step 1: Tokenize
  const tokens = tokenize(text)

  if (tokens.length === 0) {
    return { indices: [], values: [] }
  }

  // Step 2: Calculate term frequencies
  const tf = calculateTermFrequencies(tokens)

  // Step 3: Compute TF-IDF weights
  const weights = calculateTfIdfWeights(tf, tokens.length)

  // Step 4: Map tokens to indices and build sparse vector
  const indexToWeight = new Map<number, number>()

  weights.forEach((weight, token) => {
    const index = tokenHash(token)
    // If multiple tokens hash to same index, take max weight (collision handling)
    const currentWeight = indexToWeight.get(index) ?? 0
    indexToWeight.set(index, Math.max(currentWeight, weight))
  })

  // Step 5: Build final sparse vector
  const indices = Array.from(indexToWeight.keys()).sort((a, b) => a - b)
  const values = indices.map(idx => {
    const val = indexToWeight.get(idx)
    return val ?? 0
  })

  return { indices, values }
}

/**
 * Generate sparse vector for a query string.
 * Similar to encodeSparseVector but can handle query-specific logic if needed.
 *
 * @param query The query text
 * @returns Sparse vector: { indices: number[], values: number[] }
 */
export function encodeQuerySparse(query: string): { indices: number[]; values: number[] } {
  // For queries, we use the same encoding as documents
  // In advanced BM25 implementations, you might boost rare terms differently
  return encodeSparseVector(query)
}
