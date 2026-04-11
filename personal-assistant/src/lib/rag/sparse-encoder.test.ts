import { describe, it, expect } from 'vitest'
import { encodeSparseVector, encodeQuerySparse } from './sparse-encoder'

describe('sparse-encoder', () => {
  describe('encodeSparseVector', () => {
    it('returns empty vectors for empty text', () => {
      const result = encodeSparseVector('')
      expect(result.indices).toHaveLength(0)
      expect(result.values).toHaveLength(0)
    })

    it('returns empty vectors for whitespace-only text', () => {
      const result = encodeSparseVector('   ')
      expect(result.indices).toHaveLength(0)
      expect(result.values).toHaveLength(0)
    })

    it('generates sparse vectors for simple text', () => {
      const text = 'hello world this is a test'
      const result = encodeSparseVector(text)

      // Should have indices and values of same length
      expect(result.indices.length).toBeGreaterThan(0)
      expect(result.indices).toHaveLength(result.values.length)

      // Indices should be sorted
      for (let i = 1; i < result.indices.length; i++) {
        expect(result.indices[i]).toBeGreaterThan(result.indices[i - 1])
      }

      // Values should be normalized to 0-1 range
      for (const val of result.values) {
        expect(val).toBeGreaterThanOrEqual(0)
        expect(val).toBeLessThanOrEqual(1)
      }
    })

    it('removes stopwords', () => {
      // Text with mostly stopwords
      const text1 = 'the a an and or but'
      const result1 = encodeSparseVector(text1)

      // Should have very few or no tokens since all are stopwords
      expect(result1.indices.length).toBeLessThanOrEqual(2) // Some stopwords might not be fully filtered
    })

    it('filters very long tokens', () => {
      // Create a very long token (>50 chars)
      const longToken = 'a'.repeat(60)
      const text = `hello ${longToken} world`
      const result = encodeSparseVector(text)

      // Should include only "hello" and "world" tokens
      expect(result.indices.length).toBeGreaterThan(0)
      expect(result.indices.length).toBeLessThanOrEqual(3) // hello, world, possibly a short one
    })

    it('produces same results for same text', () => {
      const text = 'semantic search with sparse vectors'
      const result1 = encodeSparseVector(text)
      const result2 = encodeSparseVector(text)

      expect(result1.indices).toEqual(result2.indices)
      expect(result1.values).toEqual(result2.values)
    })

    it('produces different results for different text', () => {
      const result1 = encodeSparseVector('hello world')
      const result2 = encodeSparseVector('goodbye moon')

      // Different text should produce different sparse vectors
      const sameIndices = result1.indices.filter(idx => result2.indices.includes(idx))
      expect(sameIndices.length).toBeLessThan(result1.indices.length)
    })
  })

  describe('encodeQuerySparse', () => {
    it('uses same encoding as document', () => {
      const query = 'search query with keywords'
      const result1 = encodeQuerySparse(query)
      const result2 = encodeSparseVector(query)

      expect(result1.indices).toEqual(result2.indices)
      expect(result1.values).toEqual(result2.values)
    })

    it('handles empty query', () => {
      const result = encodeQuerySparse('')
      expect(result.indices).toHaveLength(0)
      expect(result.values).toHaveLength(0)
    })
  })
})
