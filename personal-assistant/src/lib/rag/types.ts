/**
 * RAG Infrastructure — Shared Types
 *
 * Types for vector document storage, retrieval, and search across
 * Pinecone + Voyage-3.5 embedding pipeline.
 */

// ─── Document Types ──────────────────────────────────────────────────────────

/** Attachment file for processing */
export interface AttachmentFile {
  /** File buffer content */
  buffer: Buffer
  /** MIME type (e.g., application/pdf, text/plain) */
  mimeType: string
  /** Original filename */
  filename: string
}

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
  /** Optional attachments to extract and embed */
  attachments?: AttachmentFile[]
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
  /** Attachment filename if this chunk is from an attachment */
  attachment_name?: string
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

// ─── Sparse Vector Types ─────────────────────────────────────────────────────

/** Sparse vector for BM25-style hybrid search: token indices + TF-IDF weights. */
export interface SparseVector {
  /** Token indices (hashed token strings mapped to 0-20000) */
  indices: number[]
  /** TF-IDF weights corresponding to indices (0-1 normalized) */
  values: number[]
}

// ─── Conversation Grouping Types ─────────────────────────────────────────────

/** A message in a conversation group (for WhatsApp/SMS/Slack grouping). */
export interface ConversationMessage {
  /** Message content */
  content: string
  /** Sender name/identifier */
  sender: string
  /** Timestamp of message (ISO 8601) */
  timestamp: string
  /** Message ID (for deduplication) */
  messageId: string
}

/** A grouped conversation chunk ready for embedding. */
export interface ConversationChunk {
  /** Formatted conversation text with sender prefixes */
  text: string
  /** Message IDs included in this chunk (for citation) */
  messageIds: string[]
  /** Metadata (from first message in group) */
  metadata: PineconeMetadata
  /** Deterministic chunk ID based on first message */
  chunkId: string
}
