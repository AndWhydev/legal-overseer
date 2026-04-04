# ADR-0001: pgvector Entity Graph Over Pinecone for Knowledge Storage

## Status

Accepted

## Context

BitBit's memory retrieval was limited to flat vector search via Pinecone (Voyage-3.5, 1024d) with no relationship awareness. The system couldn't answer "How does Steve's project relate to Maya's delay?" because memories were stored as isolated documents with no entity connections or temporal edges.

Three storage options were evaluated for the new entity knowledge graph:

1. **Keep Pinecone** (existing) and add a separate Postgres graph layer
2. **pgvector in Supabase** (co-located with existing data)
3. **Neo4j or dedicated graph DB** (purpose-built)

## Decision Drivers

- Co-located graph+vector queries in a single SQL statement
- No additional external service or billing
- Bi-temporal edge model (valid_from/valid_until) requires relational storage
- BitBit's scale is thousands of entities, not millions (pgvector handles this easily)
- Supabase includes pgvector at no extra cost

## Decision

Use **pgvector in Supabase** for the entity knowledge graph. Keep Pinecone for channel_messages search (existing pipeline, not migrated).

## Rationale

The killer feature is co-located queries. With pgvector:

```sql
SELECT en.name, en.properties, ee.relation_type,
       en.embedding <=> $query_embedding AS distance
FROM entity_nodes en
JOIN entity_edges ee ON ee.target_id = en.id
WHERE ee.source_id = $steve_id
  AND ee.valid_until IS NULL
  AND en.embedding <=> $query_embedding < 0.5
ORDER BY distance LIMIT 10;
```

With Pinecone, this requires two round-trips (vector search + graph lookup) plus client-side join, adding 100ms+ latency.

## Consequences

### Positive
- Graph traversal + vector similarity in one query (~20ms vs ~150ms with Pinecone)
- Single database for graph + vectors + application data
- HNSW indexes (m=16, ef_construction=64) provide good recall at BitBit's scale
- Transactional consistency between edges and embeddings

### Negative
- pgvector has lower throughput than Pinecone at billion-scale (irrelevant for BitBit)
- Two vector systems in parallel during transition (pgvector for entities, Pinecone for messages)
- Must manage HNSW index parameters manually

## Implementation Notes

- Dual vector columns: `embedding vector(768)` (Google multimodal) + `text_embedding vector(1024)` (Voyage)
- `match_entity_nodes` RPC function for cosine similarity (Supabase JS doesn't support `<=>` operator)
- HNSW indexes with `vector_cosine_ops` in extensions schema
