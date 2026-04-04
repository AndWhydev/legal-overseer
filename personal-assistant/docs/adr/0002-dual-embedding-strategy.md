# ADR-0002: Dual Embedding Strategy (Google 768d + Voyage 1024d)

## Status

Accepted

## Context

The entity knowledge graph needs vector embeddings for similarity search. BitBit already uses Voyage-3.5 (1024d) for channel message embeddings in Pinecone. The Cognitive Memory OS design calls for format-agnostic retrieval that can eventually handle text, PDFs, images, and other modalities.

## Decision

Dual vector columns on entity_nodes:
- **Primary**: Google text-embedding-004 (768d) for format-agnostic, multimodal-ready embedding
- **Secondary**: Voyage-3.5 (1024d) for high-precision text retrieval

## Rationale

Google's embedding model supports multimodal inputs (text, images, PDFs) in a shared vector space, enabling future "find the invoice Steve sent" queries that retrieve both the PDF attachment and the email discussing it. Voyage-3.5 remains the stronger pure-text model, so it's kept as a secondary for text-heavy search paths.

pgvector supports multiple vector columns natively, so this costs nothing architecturally.

## Consequences

### Positive
- Future-proof for multimodal ingestion
- No precision sacrifice on text workload (Voyage fallback)
- Embedding model choice is a config option, not a schema change

### Negative
- GOOGLE_API_KEY not yet configured (768d column is NULL, Voyage works as fallback)
- Two embedding API calls per entity node (cost: negligible at current scale)
- Two HNSW indexes consume more storage
