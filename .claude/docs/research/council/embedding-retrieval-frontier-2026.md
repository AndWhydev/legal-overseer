# Embedding & Retrieval Frontier Research for BitBit RAG Infrastructure

> **Council Role**: ML Infrastructure Lead
> **Date**: 2026-03-15
> **Scope**: Business communications (email, WhatsApp, SMS, Slack) retrieval
> **Status**: Complete

---

## Table of Contents

1. [Frontier Embedding Models](#1-frontier-embedding-models)
2. [Late Interaction Models (ColBERT family)](#2-late-interaction-models)
3. [RAPTOR — Hierarchical Summarization](#3-raptor)
4. [HyDE — Hypothetical Document Embeddings](#4-hyde)
5. [Matryoshka Embeddings](#5-matryoshka-embeddings)
6. [Contextual Compression](#6-contextual-compression)
7. [Multi-Vector Representations](#7-multi-vector-representations)
8. [Bleeding-Edge Papers (2025-2026)](#8-bleeding-edge-papers)
9. [Chunking Strategies for Email/Conversations](#9-chunking-strategies)
10. [Reranking Models](#10-reranking-models)
11. [Hybrid Search Architecture](#11-hybrid-search-architecture)
12. [Recommendations for BitBit](#12-recommendations-for-bitbit)

---

## 1. Frontier Embedding Models

### Voyage-3.5 / Voyage-3.5-lite (May 2025) — RECOMMENDED

The current leader for API-based embeddings. Voyage AI (now part of Anthropic's ecosystem) consistently tops benchmarks.

**Key Numbers:**
| Metric | voyage-3.5 | voyage-3.5-lite | OpenAI-v3-large | Cohere-v4 |
|--------|-----------|----------------|-----------------|-----------|
| Avg NDCG@10 (8 domains, 100 datasets) | **Best** | -1.9% vs 3.5 | -8.26% | -1.63% |
| Dimensions | 256–2048 | 256–2048 | 3072 | 256–1536 |
| Context length | 32K tokens | 32K tokens | 8K tokens | 128K tokens |
| Price per 1M tokens | $0.06 | $0.02 | $0.13 | $0.10 |
| Quantization | float32/int8/binary | float32/int8/binary | float only | float/int8/binary |

**Instruction-following**: Voyage models accept task-specific prefixes (`query:`, `document:`) for asymmetric retrieval. This is critical for email search where queries ("what did Andy say about the invoice?") are semantically different from documents (raw email text).

**Binary rescoring**: voyage-3.5 achieves 6.38% improvement via binary-first search + float rescore — this is a production-ready two-stage pipeline pattern.

**Cost efficiency**: At int8/2048 dims, voyage-3.5 achieves 83% vector DB cost reduction vs OpenAI-v3-large while outperforming it by 8.26%. Binary 1024-dim achieves 99% cost reduction.

**Domains tested**: Technical docs, code, law, finance, web reviews, multilingual (26 languages), long documents, and **conversations** — directly relevant to BitBit's use case.

### Cohere Embed v4 (2025)

**Key differentiators:**
- **Multimodal**: Text + image in same embedding space. Could embed email attachments (invoices, screenshots) alongside text.
- **128K context**: Can embed entire email threads in one pass — no chunking needed for most threads.
- **Matryoshka dimensions**: 256, 512, 1024, 1536.
- **MTEB score**: 65.2 (vs OpenAI-v3-large 64.6, BGE-M3 63.0).
- **Cross-lingual**: 35% improvement over v3 — relevant for multilingual business comms.
- **Price**: $0.10/1M tokens.

**For BitBit**: The 128K context window is compelling for ingesting entire email threads as single documents, avoiding chunking artifacts. The multimodal capability could embed invoice PDFs and screenshots shared in WhatsApp.

### Jina Embeddings v4 (June 2025)

**Architecture**: 3.8B parameters, Qwen2-VL backbone. Supports both single-vector (2048-dim, truncatable to 128) and **multi-vector** (128-dim per token, ColBERT-style late interaction).

**Key features:**
- **Dual-mode**: Same model produces single-vector OR multi-vector embeddings. Use single-vector for bulk search, multi-vector for precision reranking.
- **Task-specific LoRA adapters**: retrieval.query, retrieval.passage, text-matching, code — 60M params each, activated at inference time.
- **Late chunking**: Built into the API — embeds full document, then extracts chunk embeddings preserving cross-chunk context.
- **MMTEB score**: 66.49 (v3 was 58.58, +14%).
- **Multi-vector advantage**: 7-10% better than single-vector on visual/complex tasks.
- **89 languages** with strong multilingual performance.

**For BitBit**: The dual single/multi-vector mode is uniquely powerful — use cheap single-vector for initial retrieval, then multi-vector for precision on the top-k. Late chunking is purpose-built for email threads.

### Gemini Embedding (March 2025)

**Key features:**
- **Multimodal**: Text, images, video, audio, documents in unified space.
- **3072 dimensions** (truncatable via MRL).
- **100+ languages**.
- **MTEB(Code) #1**: Borda rank 175.5 vs text-embedding-005's 63.3.
- **Free tier**: Generous for prototyping.

**For BitBit**: Interesting for embedding voice messages (WhatsApp audio) alongside text, but less proven for pure text retrieval vs Voyage/Jina.

### Qwen3 Embedding (June 2025) — Best Open-Source

**Key features:**
- **MTEB multilingual #1**: Score 70.58 (8B model).
- **Model sizes**: 0.6B, 4B, 8B — can self-host the smaller models on Fly.io.
- **100+ languages** including programming languages.
- **Instruction-following**: Structured task instructions like `Instruct: <task>\nQuery: <query>`.

**For BitBit**: Best option if self-hosting is desired. The 0.6B model could run on existing Fly.io infrastructure for real-time embedding at minimal cost.

### Nomic Embed Text V2 (2025)

**Key features:**
- **First MoE embedding model**: 8 experts, top-2 routing, 305M active / 475M total params.
- **Matryoshka support** for dimension flexibility.
- **Fully open-source** (Apache 2.0).
- **1.6B contrastive training pairs**.

**For BitBit**: Good cost-efficiency option for self-hosting. MoE architecture could adapt to different message types naturally.

### Arctic Embed v2.0 (Snowflake)

**Key features:**
- **Apache 2.0** licensed, sizes from 22M to 335M params.
- **Multilingual**: 74 languages.
- **1024-dim vectors**.
- Strong on MIRACL and CLEF multilingual benchmarks.

**For BitBit**: Viable open-source alternative, but Qwen3 or Nomic V2 are stronger choices for self-hosting.

### BGE-M3 (BAAI) — Triple Hybrid Pioneer

**Unique value**: Single model produces dense, sparse, AND multi-vector embeddings simultaneously.

**Key features:**
- **Three retrieval modes in one model**: Dense (semantic), sparse (BM25-like lexical), multi-vector (ColBERT-like token matching).
- **100+ languages**, 8192 token context.
- **Enterprise adoption**: 78% report 2x retrieval accuracy gains (per BAAI surveys).
- **Available on NVIDIA NIM** for production deployment.

**For BitBit**: Extremely interesting as a single-model solution. One embedding call gives you dense + sparse + multi-vector, enabling hybrid search without separate BM25 infrastructure. However, each individual mode is not as strong as specialized models (Voyage for dense, ColBERT for multi-vector).

---

## 2. Late Interaction Models (ColBERT Family)

### Why This Matters for Business Communications

Late interaction (ColBERT-style) models embed every token independently, then compute relevance via MaxSim (maximum similarity across all token pairs). This is **transformative for business email** because:

- **Name matching**: "Did Sarah mention the Q4 budget?" — token-level matching can find "Sarah" and "Q4 budget" independently, even in long emails where they appear far apart.
- **Date matching**: "What happened on March 3rd?" — individual date tokens get matched precisely rather than being averaged away in a single vector.
- **Entity precision**: Invoice numbers, phone numbers, addresses — all preserved as individual token representations.

### ColBERTv2

**Architecture**: Residual compression + denoised supervision. 6-10x space reduction over ColBERT v1.

**Key insight**: Each document is represented by ~N vectors (one per token), enabling MaxSim matching. This means a 200-token email produces 200 vectors, not 1.

**Limitation**: Storage scales with document length. A corpus of 1M emails averaging 200 tokens = 200M vectors.

### Jina ColBERT v2

- **89 languages** (critical for multilingual business comms).
- **8192 token context**.
- **User-controlled output dimensions**.
- Presented at ECIR 2026 workshop on Late Interaction and Multi-Vector Retrieval.

### Theoretical Justification (ICLR 2026)

A landmark paper by Weller et al. — *"On the Theoretical Limitations of Embedding-Based Retrieval"* — formally proves that **single-vector embeddings are fundamentally limited**:

**Key theorems:**
- For dimension d, there exists a binary relevance matrix that **cannot be captured** by single-vector embeddings. This is a geometric impossibility, not a training limitation.
- The LIMIT benchmark: With just 46 documents, SOTA single-vector models achieve only ~20% recall@100. Cross-encoders achieve 100%. ColBERT (ModernColBERT) achieves 83.5%.
- **Dimensionality requirements**: d=512 handles ~500K docs, d=768 handles ~1.7M docs, d=1024 handles ~4M docs, d=4096 handles ~250M docs.
- **Multi-modal query distributions**: When relevant documents span different semantic clusters (e.g., "find emails about both invoices and project delays"), single vectors fail catastrophically. Multi-vector models handle this naturally.

**Implication for BitBit**: Business queries often have multi-modal relevance patterns ("find all emails from Andy about either invoices or the website redesign"). Single vectors will miss relevant results; late interaction models won't.

### ModernColBERT

Modernized ColBERT implementation achieving 83.5% recall@2 on LIMIT vs <3% for single-vector models — a **28x improvement** in precision for diverse queries.

---

## 3. RAPTOR — Hierarchical Summarization

### How It Works

RAPTOR recursively:
1. Embeds text chunks
2. Clusters similar chunks (via UMAP + Gaussian Mixture Models)
3. Summarizes each cluster
4. Embeds the summaries
5. Repeats, building a tree from leaves (raw text) to root (highest-level summary)

At query time, retrieval traverses the tree — broad queries hit high-level summaries, specific queries hit leaf chunks.

### Performance

- **QuALITY benchmark**: +20% absolute accuracy improvement over flat RAG (coupled with GPT-4).
- **Multi-step reasoning**: Excels when answers require synthesizing information across distant parts of a document.

### Application to Email Threads

RAPTOR is **moderately well-suited** for email threads:

**Strengths:**
- Thread hierarchies naturally map to RAPTOR's tree structure: individual messages → thread summary → conversation topic → project overview.
- Cross-thread synthesis: "What was the overall consensus on the redesign?" can hit a cluster summary spanning 20 emails.

**Weaknesses:**
- **Flat tree problem**: Research shows RAPTOR often produces shallow trees for shorter documents. Email threads (typically 2-15 messages) may not generate deep enough hierarchies.
- **Temporal context loss**: RAPTOR's clustering is purely semantic — it loses chronological ordering, which is critical for email threads.
- **Computational cost**: Each tree requires multiple LLM calls for summarization. For 100K emails, this is expensive.
- **Staleness**: Trees must be rebuilt when new emails arrive in a thread.

### Recent Improvements (2025)

- Graph-topological approaches reduce summary nodes by 76%, making RAPTOR more practical.
- Semantic chunking + adaptive graph clustering (Frontiers, 2025) addresses flat tree limitations.
- Peak accuracy: 65.5% on QuALITY.

### Recommendation for BitBit

Use RAPTOR **selectively** — build hierarchical summaries for long-running projects (50+ messages) or client accounts, not for individual short email threads. Consider a **lazy RAPTOR** approach: build trees on-demand when a query can't be satisfied by flat retrieval.

---

## 4. HyDE — Hypothetical Document Embeddings

### How It Works

1. User query: "What did we agree about the payment terms?"
2. LLM generates a hypothetical answer: "We agreed on net-30 payment terms with a 2% early payment discount for the AllWebUp project..."
3. This hypothetical document is embedded and used for similarity search instead of the query.

### Benchmarks

| Metric | Standard RAG | HyDE |
|--------|-------------|------|
| Helpfulness (dev support) | 3.5 | 4.2 (+20%) |
| Correctness (dev support) | 3.4 | 4.1 (+21%) |
| Coverage (unseen questions) | 80% | 100% |
| Latency overhead | Baseline | +43-60% |

### HyPE (Related Technique)

HyPE (Hypothetical Passage Embeddings) reverses the idea — generates hypothetical queries for each passage at indexing time. Improved precision by up to 42% and recall by 45%.

### Strengths for Business Communications

- **Vocabulary bridging**: Query "payment schedule" finds emails mentioning "net-30", "invoice terms", "billing cycle" — because the LLM-generated hypothetical contains these synonyms.
- **Conversational queries**: Natural language questions map better to hypothetical documents than to sparse email text.
- **Zero-shot**: Works without fine-tuning on business comms data.

### Weaknesses

- **Latency**: 43-60% overhead from the LLM generation step. For real-time chat interfaces, this may be unacceptable.
- **Hallucination risk**: If the hypothetical answer is semantically distant from actual corpus content, retrieval fails. Worse with small LLMs (Gemma 1B/4B showed high hallucination rates).
- **Token cost**: Every query requires an LLM call to generate the hypothesis.

### Recommendation for BitBit

Use HyDE as an **optional augmentation** for complex/broad queries, not as the default retrieval path. Implement as a fallback: if initial dense retrieval returns low-confidence results, retry with HyDE. Use Claude Haiku for hypothesis generation to keep latency and cost low.

**Better variant**: Use **HyPE** (hypothetical queries per passage) at indexing time — front-load the LLM cost, zero runtime overhead. Generate 3-5 hypothetical questions for each email/message at ingestion time.

---

## 5. Matryoshka Embeddings

### Production Status (2026)

Matryoshka Representation Learning (MRL) is now **standard** in all frontier embedding models. Every major model supports variable-dimension output:

| Model | Full Dim | Min Dim | MRL Training |
|-------|----------|---------|-------------|
| Voyage-3.5 | 2048 | 256 | Yes |
| Cohere Embed v4 | 1536 | 256 | Yes |
| Jina v4 | 2048 | 128 | Yes |
| Gemini Embedding | 3072 | Variable | Yes |
| Qwen3 Embedding | Varies | 1 | Yes |
| Nomic V2 | Variable | Variable | Yes |

### Production Architecture Pattern

The recommended two-tier pattern is now proven in production:

```
Tier 1 (In-memory, fast):
  Binary-quantized MRL embeddings @ 256-512 dims
  → 32x memory savings from binary quantization
  → 8x savings from MRL truncation
  → Total: 256x storage reduction
  → Sub-millisecond ANN search

Tier 2 (On-disk, accurate):
  Full float32 embeddings @ 2048 dims
  → Used for reranking top-k from Tier 1
  → High precision, low throughput needed
```

**Real-world result**: 80% latency reduction with negligible accuracy loss (Vespa production deployment).

### Recommendation for BitBit

Implement the two-tier MRL pattern from day one:
- **Hot tier**: Binary 512-dim for sub-5ms initial retrieval
- **Warm tier**: Float32 2048-dim for reranking top-50
- This gives Pinecone-competitive speed with 99% storage savings

---

## 6. Contextual Compression

### Anthropic's Contextual Retrieval (September 2024)

**The approach**: Before embedding each chunk, prepend a context prefix generated by Claude that explains the chunk's role within the full document.

**Example**:
- Raw chunk: "The invoice total was $4,200 including the rush fee."
- Contextualized: "This chunk is from an email thread between Tor and Andy about the AllWebUp website redesign project, discussing the final invoice for Phase 2 work. The invoice total was $4,200 including the rush fee."

**Performance improvements:**
| Method | Top-20 Retrieval Failure Rate |
|--------|------------------------------|
| Baseline | 5.7% |
| + Contextual Embeddings | 3.7% (-35%) |
| + Contextual Embeddings + BM25 | 2.9% (-49%) |
| + Contextual Embeddings + BM25 + Reranking | 1.9% (-67%) |

**Cost optimization**: Claude's prompt caching loads the full document once ($1.50/1M cached tokens), then generates context for each chunk referencing the cache. For a 10-chunk document, the document is read once, not 10 times.

**Hybrid implementation details:**
- BM25 weight: 0.25 (sparse), Dense weight: 1.0 (semantic)
- Fusion: Reciprocal Rank Fusion (RRF) to merge ranked lists
- Context prefix: typically 50-100 tokens per chunk

### LLMLingua / LLMLingua-2 (Microsoft Research)

**Purpose**: Compress retrieved context before passing to LLM, reducing token costs.

| Version | Compression | Performance Retention | Speed |
|---------|-------------|----------------------|-------|
| LLMLingua | 20x | 98.5% | Baseline |
| LLMLingua-2 | 20x | 95-98% | 3-6x faster |

LLMLingua-2 treats compression as token classification (keep/discard) rather than perplexity-based removal. Faster and more predictable.

### RECOMP

Two modes:
- **Extractive**: Filters irrelevant sentences from retrieved passages.
- **Abstractive**: Generates a concise summary fusing multiple retrieved documents.

### Recommendation for BitBit

1. **Contextual Retrieval**: Implement Anthropic's approach — it's purpose-built for Claude and uses prompt caching efficiently. Prepend context to every email chunk at ingestion time.
2. **LLMLingua-2**: Use for compressing retrieved context before the final LLM call, especially when retrieving 10+ chunks. Save 60-80% on generation tokens.
3. **RECOMP abstractive**: Use for multi-email synthesis — when the agent needs to summarize a client's history across 50+ emails, compress first.

---

## 7. Multi-Vector Representations

### The Case for Multi-Vector Email Embeddings

An email naturally has multiple semantic facets:
- **Header metadata**: From, To, CC, Date, Subject
- **Body content**: The actual message
- **Quoted replies**: Previous messages in thread
- **Signatures**: Contact info, legal disclaimers
- **Attachments**: Referenced files

Embedding an email as a single vector forces all these facets into one point in embedding space. Multi-vector approaches preserve each facet.

### MUVERA (Google, 2025)

Converts multi-vector sets into Fixed Dimensional Encodings (FDEs) — single vectors whose inner product approximates multi-vector similarity.

**Performance:**
- 90% lower latency vs prior multi-vector search
- 10% improved recall on BEIR
- 2-5x fewer candidates needed for same recall
- 8x faster search (MUVERA-only), 7x with reranking

### LEMUR (January 2026) — State of the Art

Learns to convert multi-vector to single-vector via supervised regression. Fundamentally better than MUVERA.

**Performance (MS MARCO, ColBERTv2, 80% recall@100):**
| Method | QPS | Relative Speed |
|--------|-----|----------------|
| **LEMUR** | **799** | **1x** |
| MUVERA | 150 | 5.3x slower |
| IGP | 62 | 12.9x slower |
| PLAID | 13 | 61x slower |

**Critical advantage**: MUVERA fails on non-ColBERTv2 embeddings (can't exceed 60% recall). LEMUR works across all multi-vector models.

**Deployment**: 1024-dim LEMUR embeddings outperform MUVERA's 10,240-dim FDEs — 10x compression with better accuracy. Compatible with standard ANNS (Faiss, ScANN, HNSW).

**Training**: Processes 1,000+ documents/second for indexing. Can work without access to real queries — uses corpus documents as training signal.

### Recommendation for BitBit

Embed each email/message as multi-vector (via Jina v4 or ColBERT), then use LEMUR to convert to single-vector for efficient ANN search. Rerank top-50 with exact MaxSim. This gives you token-level precision with single-vector speed.

---

## 8. Bleeding-Edge Papers (2025-2026)

### A-RAG: Agentic Retrieval-Augmented Generation (February 2026)

**Architecture**: Exposes three hierarchical retrieval tools to the LLM agent:
1. `keyword_search` — Exact lexical matching (entity names, dates, IDs)
2. `semantic_search` — Dense vector cosine similarity at sentence level
3. `chunk_read` — Full chunk content retrieval with context tracking

The agent autonomously decides which tool to use per query, iterating in a ReAct loop.

**Benchmarks (GPT-5-mini backbone):**
| Dataset | A-RAG | Naive RAG | Improvement |
|---------|-------|-----------|-------------|
| MuSiQue | 74.1% | 52.8% | +21.3% |
| HotpotQA | 94.5% | 81.2% | +13.3% |
| 2WikiMultiHop | 89.7% | 50.2% | **+39.5%** |

**Key insight**: The agent retrieves **fewer tokens** than naive RAG while achieving higher accuracy — hierarchical interfaces drive context efficiency.

**For BitBit**: This is the most aligned architecture with BitBit's agentic platform. The agent decides whether to do keyword search ("find emails from Andy"), semantic search ("what was the agreement about pricing"), or read full context. Direct mapping to BitBit's agent framework.

### ICLR 2026: Theoretical Limitations of Embedding-Based Retrieval

(Covered in Section 2 above.) The key finding: **single-vector retrieval is provably insufficient** for diverse query distributions. This validates the multi-vector approach for BitBit.

**Specific failure thresholds:**
- d=512 embeddings can represent top-k subsets for ~500K documents
- d=1024 for ~4M documents
- Beyond these, single-vector retrieval is geometrically impossible for certain queries

### LinearRAG (ICLR 2026)

Relation-free graph construction for efficient GraphRAG. Reduces indexing cost to 0.1% of Microsoft's original GraphRAG while maintaining quality. Relevant for building knowledge graphs over email corpora without expensive entity extraction.

### Reconstructing Context (NAACL 2025)

Comparative evaluation of chunking strategies. Key finding: **fixed 200-word chunks matched or beat semantic chunking** across retrieval and answer generation tasks. The computational cost of semantic chunking isn't justified by consistent gains.

### RAG Stack Engineering Survey (November 2025)

Comprehensive review of 2018-2025 RAG architectures and trust frameworks. Key finding: the winning production pattern is **hybrid retrieval (dense + sparse) → cross-encoder reranking → contextual compression → generation**.

### BGE-M3 Unified Retrieval

Single model producing dense + sparse + multi-vector embeddings simultaneously. 78% of enterprise adopters report 2x retrieval accuracy gains. Available on NVIDIA NIM for production deployment.

---

## 9. Chunking Strategies for Email/Conversations

### The Email Chunking Problem

Emails are unique documents:
- **Thread structure**: Reply chains with quoted text
- **Metadata density**: From, To, CC, Date, Subject are all retrievable signals
- **Short form**: Average business email is 50-200 words — often below minimum chunk sizes
- **Mixed content**: Greetings, substance, signatures, legal disclaimers
- **Temporal ordering**: Chronology matters for understanding context

### Strategy Comparison

| Strategy | Pros | Cons | Email Suitability |
|----------|------|------|-------------------|
| **Fixed-size (200 words)** | Simple, fast, competitive (NAACL 2025) | Breaks mid-sentence | Low — splits email metadata from body |
| **Semantic chunking** | Preserves topic boundaries | Expensive, inconsistent gains | Medium — good for long emails, overkill for short ones |
| **Message-level** | Natural boundary, preserves metadata | Short messages waste embedding capacity | **High** — each email/message is one chunk |
| **Thread-level** | Full context preserved | Exceeds typical context windows for long threads | Medium — good with 128K models (Cohere v4) |
| **Late chunking (Jina)** | Preserves cross-chunk context | Requires long-context model | **High** — purpose-built for this |
| **Contextual chunking (Anthropic)** | Adds document-level context to each chunk | LLM cost per chunk | **High** — explicitly designed for isolated chunks |

### Recommended Strategy for BitBit

**Hybrid approach — Message as Atomic Unit + Contextual Enrichment:**

```
For each incoming message (email/WhatsApp/SMS/Slack):

1. ATOMIC UNIT: Treat each individual message as one chunk.
   - Preserve: sender, recipients, timestamp, channel, thread_id, subject
   - Strip: quoted text (already indexed from original message), signatures
   - Result: Clean message body + structured metadata

2. CONTEXTUAL PREFIX (Anthropic-style):
   - Use Claude Haiku to generate a 50-100 token prefix:
     "This is a WhatsApp message from Andy Taleb to Tor on 2026-03-15
      in the 'Website Redesign' thread, discussing Phase 2 deliverables.
      Previous messages in this thread discussed timeline and budget."
   - Prepend to message body before embedding

3. THREAD SUMMARY (RAPTOR-lite):
   - For threads with 5+ messages, generate a thread summary
   - Embed the summary as a separate "meta-chunk"
   - Links to all constituent message chunks via thread_id

4. METADATA VECTORS:
   - Store structured metadata as filterable fields (not embedded):
     channel, sender, org_id, thread_id, timestamp, has_attachment
   - Enable pre-filtering before vector search

5. HYPOTHETICAL QUERIES (HyPE):
   - At ingestion, generate 3-5 questions this message could answer
   - Embed these as additional vectors pointing to the message
   - Zero-cost at query time, dramatically improves recall
```

### Late Chunking for Long Emails

For emails exceeding 500 tokens, use **late chunking** (Jina v4 API):
1. Feed entire email (including headers) to the long-context model
2. Model produces token-level embeddings with full document context
3. Extract chunk embeddings from the token sequence
4. Each chunk embedding carries the context of the full email

This preserves the relationship between "Dear Andy" at the top and "Please find attached invoice" at the bottom — something naive chunking destroys.

---

## 10. Reranking Models

### Why Reranking Matters

Initial retrieval (ANN search) is fast but imprecise. Reranking applies a cross-encoder that sees query + document together for much higher precision.

### Top Models (2026)

| Model | Type | Latency (50 docs) | Multilingual | Best For |
|-------|------|-------------------|-------------|----------|
| **Cohere Rerank 4** | API | ~600ms | 100+ languages | Enterprise, broad coverage |
| **Voyage Rerank 2.5** | API | ~595ms | Good | Precision-critical domains |
| **Jina Reranker v2** | Open-source | Depends on hardware | 89 languages | Self-hosted, privacy |
| **mxbai-rerank-v2** | Open-source | Fast | Multilingual | Best open-source overall |
| **Zerank 2** | API | Fast | Good | Best overall (benchmark leader) |

### Production Parameters

- Rerank **50 documents** for chat applications (speed priority)
- Rerank **100-200 documents** for comprehensive search
- 50 documents reranked in ~1.5 seconds with modern cross-encoders
- **25% reduced token usage** from better reranking (less irrelevant context)

### Recommendation for BitBit

Use **Cohere Rerank 4** for production (best multilingual, API simplicity) with **Jina Reranker v2** as self-hosted fallback. Rerank top-50 candidates from hybrid search.

---

## 11. Hybrid Search Architecture

### The Production-Proven Pipeline

```
Query → [HyDE (optional)] → Parallel Retrieval:
  ├── BM25/Sparse (exact keyword matching)
  ├── Dense Vector (semantic similarity)
  └── Multi-vector/ColBERT (token-level matching)
       ↓
  Reciprocal Rank Fusion (RRF)
       ↓
  Cross-Encoder Reranking (top 50-100)
       ↓
  Contextual Compression (LLMLingua-2)
       ↓
  LLM Generation (Claude)
```

### Fusion Strategy

**Reciprocal Rank Fusion (RRF)** is the proven standard:
```
RRF_score(d) = Σ 1/(k + rank_i(d))
```
Where k=60 is the standard constant. This handles incompatible score scales between BM25 and vector similarity.

**Weight ratio**: Dense 1.0 : Sparse 0.25 (Anthropic's recommended ratio for contextual retrieval).

### A-RAG Enhancement

Instead of static parallel retrieval, let the agent choose retrieval strategy per query:
- "Find Andy's emails" → `keyword_search("Andy")`
- "What was the budget discussion?" → `semantic_search("budget discussion project")`
- Need more context → `chunk_read(chunk_id)`

This is more token-efficient and more accurate than brute-force parallel retrieval.

---

## 12. Recommendations for BitBit

### Tier 1: Core Embedding Stack

| Component | Recommended | Rationale |
|-----------|-------------|-----------|
| **Primary embeddings** | **Voyage-3.5** ($0.06/1M tokens) | Best retrieval quality, conversation-tested, Anthropic ecosystem |
| **Self-hosted fallback** | **Qwen3 Embedding 0.6B** | Can run on Fly.io, MTEB #1 for open-source |
| **Multi-vector** | **Jina v4** (multi-vector mode) | Dual single/multi-vector from one model |
| **Reranker** | **Cohere Rerank 4** | Fastest API reranker, 100+ languages |

### Tier 2: Retrieval Architecture

| Component | Recommended | Rationale |
|-----------|-------------|-----------|
| **Hybrid search** | Dense (Voyage) + Sparse (BM25) + Multi-vector (Jina) | Triple-retrieval maximizes recall |
| **Fusion** | RRF with dense:sparse 4:1 weighting | Anthropic-proven ratio |
| **Contextual enrichment** | Anthropic Contextual Retrieval | -67% retrieval failure with reranking |
| **Compression** | LLMLingua-2 | 20x compression, 95-98% quality retention |

### Tier 3: Advanced Patterns

| Pattern | When to Use | Expected Gain |
|---------|-------------|---------------|
| **HyPE** (hypothetical queries at indexing) | All messages at ingestion | +42% precision, zero query-time cost |
| **Late chunking** (Jina v4) | Long emails (500+ tokens) | Preserves cross-chunk context |
| **RAPTOR summaries** | Threads with 5+ messages | Enables high-level "what was the consensus?" queries |
| **A-RAG agent loop** | Complex multi-hop queries | +21-40% accuracy over naive RAG |
| **LEMUR** | Multi-vector → single-vector conversion | 61x faster than PLAID with same recall |

### Tier 4: Storage Strategy (Matryoshka)

```
Layer 1 — Hot (in-memory):
  Binary 512-dim Voyage-3.5 embeddings
  Sub-5ms ANN search
  ~0.5 KB per document

Layer 2 — Warm (SSD):
  Float32 2048-dim Voyage-3.5 embeddings
  Used for reranking top-50
  ~8 KB per document

Layer 3 — Cold (archive):
  Multi-vector Jina v4 (128-dim × N tokens)
  Used for precision queries on specific entities/dates
  ~50-200 KB per document (varies with length)
```

### Estimated Costs (100K messages)

| Component | Monthly Cost |
|-----------|-------------|
| Voyage-3.5 embeddings (ingestion) | ~$6 (100K × 200 tokens avg) |
| Voyage-3.5 embeddings (queries) | ~$3 (50K queries × 50 tokens avg) |
| Cohere Rerank 4 | ~$10 (50K queries × 50 docs) |
| Claude Haiku (contextual prefixes) | ~$5 (100K × 150 tokens) |
| HyPE query generation | ~$8 (100K × 5 queries × 100 tokens) |
| Vector DB storage | Depends on provider |
| **Total embedding/retrieval** | **~$32/month** |

### Implementation Priority

1. **Phase 1** — Foundation: Voyage-3.5 embeddings + BM25 hybrid + Cohere Rerank 4 + Contextual chunking
2. **Phase 2** — Precision: Add multi-vector (Jina v4) + LEMUR conversion + HyPE indexing
3. **Phase 3** — Intelligence: A-RAG agent loop + RAPTOR thread summaries + LLMLingua-2 compression
4. **Phase 4** — Optimization: Matryoshka tiered storage + self-hosted Qwen3 0.6B for real-time + binary rescoring

---

## Key Sources

### Embedding Models
- [Voyage-3.5 announcement](https://blog.voyageai.com/2025/05/20/voyage-3-5/) — Voyage AI
- [Voyage-3-large benchmarks](https://blog.voyageai.com/2025/01/07/voyage-3-large/) — Voyage AI
- [Cohere Embed v4](https://docs.cohere.com/changelog/embed-multimodal-v4) — Cohere
- [Jina Embeddings v4](https://jina.ai/news/jina-embeddings-v4-universal-embeddings-for-multimodal-multilingual-retrieval/) — Jina AI
- [Jina Embeddings v4 paper](https://arxiv.org/abs/2506.18902) — arXiv
- [Gemini Embedding paper](https://arxiv.org/html/2503.07891v1) — arXiv
- [Qwen3 Embedding paper](https://arxiv.org/abs/2506.05176) — arXiv
- [Nomic Embed Text V2 MoE](https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe) — Hugging Face
- [Arctic Embed v2.0 paper](https://arxiv.org/html/2405.05374v1) — arXiv
- [BGE-M3](https://huggingface.co/BAAI/bge-m3) — Hugging Face
- [Best Open-Source Embedding Models 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models) — BentoML

### Late Interaction / Multi-Vector
- [Late Interaction Overview: ColBERT, ColPali, ColQwen](https://weaviate.io/blog/late-interaction-overview) — Weaviate
- [ColBERTv2 paper](https://arxiv.org/abs/2112.01488) — arXiv
- [Jina ColBERT v2](https://jina.ai/news/jina-colbert-v2-multilingual-late-interaction-retriever-for-embedding-and-reranking/) — Jina AI
- [LIR Workshop @ ECIR 2026](https://arxiv.org/html/2511.00444) — arXiv
- [ICLR 2026: Theoretical Limitations of Embedding-Based Retrieval](https://arxiv.org/abs/2508.21038) — arXiv (Weller et al.)
- [MUVERA: Multi-Vector Retrieval via Fixed Dimensional Encodings](https://research.google/blog/muvera-making-multi-vector-retrieval-as-fast-as-single-vector-search/) — Google Research
- [LEMUR: Learned Multi-Vector Retrieval](https://arxiv.org/abs/2601.21853) — arXiv (January 2026)

### Retrieval Patterns
- [RAPTOR paper](https://arxiv.org/abs/2401.18059) — arXiv
- [RAPTOR + semantic chunking + adaptive graph clustering](https://www.frontiersin.org/journals/computer-science/articles/10.3389/fcomp.2025.1710121/full) — Frontiers
- [HyDE: Precise Zero-Shot Dense Retrieval](https://arxiv.org/abs/2212.10496) — arXiv
- [A-RAG: Hierarchical Retrieval Interfaces](https://arxiv.org/abs/2602.03442) — arXiv (February 2026)
- [Agentic RAG Survey](https://arxiv.org/abs/2501.09136) — arXiv (January 2025)
- [Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — Anthropic

### Chunking & Compression
- [Late Chunking paper](https://arxiv.org/abs/2409.04701) — arXiv
- [Late Chunking vs Contextual Retrieval](https://medium.com/kx-systems/late-chunking-vs-contextual-retrieval-the-math-behind-rags-context-problem-d5a26b9bbd38) — KX Systems
- [Reconstructing Context: Evaluating Chunking Strategies](https://arxiv.org/abs/2504.19754) — arXiv (NAACL 2025)
- [LLMLingua Prompt Compression Survey](https://github.com/ZongqianLi/Prompt-Compression-Survey) — NAACL 2025
- [Best Chunking Strategies for RAG 2026](https://www.firecrawl.dev/blog/best-chunking-strategies-rag) — Firecrawl

### Surveys & Overviews
- [RAG Comprehensive Survey: Architectures, Enhancements, Robustness](https://arxiv.org/abs/2506.00054) — arXiv (May 2025)
- [Enterprise RAG for Structured Data](https://arxiv.org/abs/2507.12425) — arXiv (July 2025)
- [Engineering the RAG Stack](https://arxiv.org/html/2601.05264v1) — arXiv (November 2025)
- [Reranking Models Guide 2026](https://www.zeroentropy.dev/articles/ultimate-guide-to-choosing-the-best-reranking-model-in-2025) — ZeroEntropy
- [Hybrid Search Done Right](https://ashutoshkumars1ngh.medium.com/hybrid-search-done-right-fixing-rag-retrieval-failures-using-bm25-hnsw-reciprocal-rank-fusion-a73596652d22) — Medium

### Reranking
- [Cohere Rerank 4](https://www.hpcwire.com/bigdatawire/this-just-in/cohere-introduces-rerank-4/) — BigDATAwire
- [Reranker Leaderboard](https://agentset.ai/rerankers) — Agentset
- [Top 7 Rerankers for RAG](https://www.analyticsvidhya.com/blog/2025/06/top-rerankers-for-rag/) — Analytics Vidhya
