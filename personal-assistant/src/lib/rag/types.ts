/**
 * RAG Infrastructure — Shared Types
 *
 * Types for vector document storage, retrieval, and search across
 * Pinecone + Voyage-3.5 embedding pipeline.
 */

// ─── Document Types ──────────────────────────────────────────────────────────

/** A document to be chunked, embedded, and stored in Pinecone. */
export interface VectorDocument {
  /** Source message ID from channel_messages table */
  messageId: string
  /** Organization namespace */
  orgId: string
  /** Raw text content to embed */
  content: string
  /** Metadata to store alongside the vector */
  metadata: PineconeMetadata
}

/** Metadata stored with each vector in Pinecone. */
export interface PineconeMetadata {
  /** Source message ID */
  message_id: string
  /** Organization ID (also used as Pinecone namespace) */
  org_id: string
  /** Channel type: gmail, outlook, whatsapp, sms, slack, etc. */
  channel: string
  /** Sender name or identifier */
  sender: string
  /** Sender email address */
  sender_email?: string
  /** Email subject line or message preview */
  subject?: string
  /** ISO 8601 timestamp of original message */
  received_at: string
  /** Chunk index within the parent message (0-based) */
  chunk_index: number
  /** Total chunks for this message */
  total_chunks: number
  /** Whether this is from body_full or truncated body */
  is_full_body: boolean
  /** Original chunk text content (stored in metadata for retrieval) */
  content?: string
}

// ─── Search & Retrieval Types ────────────────────────────────────────────────

/** Options for searching the vector store. */
export interface SearchOptions {
  /** Natural language query */
  query: string
  /** Organization ID (Pinecone namespace) */
  orgId: string
  /** Max results to return after reranking */
  topK?: number
  /** Filter by channel type */
  channel?: string
  /** Filter by sender name or email */
  sender?: string
  /** Filter by date range (ISO 8601) */
  dateFrom?: string
  /** Filter by date range (ISO 8601) */
  dateTo?: string
}

/** A chunk retrieved from Pinecone with relevance score. */
export interface RetrievedChunk {
  /** Pinecone vector ID ({message_id}#chunk{N}) */
  id: string
  /** Relevance score (0-1) */
  score: number
  /** Original text content of this chunk */
  content: string
  /** Stored metadata */
  metadata: PineconeMetadata
  /** Formatted citation reference */
  citationRef: string
}

// ─── Embedding Types ─────────────────────────────────────────────────────────

/** Result of an embed-and-upsert batch operation. */
export interface EmbedUpsertResult {
  /** Number of vectors successfully embedded and upserted */
  embedded: number
  /** Number of documents that failed */
  failed: number
  /** Error messages for failed documents */
  errors: string[]
}

/** A text chunk ready for embedding. */
export interface TextChunk {
  /** Chunk text content */
  text: string
  /** Parent document metadata */
  metadata: PineconeMetadata
  /** Deterministic chunk ID: {message_id}#chunk{N} */
  chunkId: string
}
