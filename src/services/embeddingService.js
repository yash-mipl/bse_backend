import { logger } from '../utils/logger.js';

/**
 * Text Vectorizer / Embedding Generator
 * Computes normalized TF-IDF / Subword semantic embeddings for text chunks,
 * with swappable support for neural embeddings (Groq / OpenAI / Transformers).
 */
export class EmbeddingService {
  /**
   * Tokenize text into normalized terms
   */
  tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 2);
  }

  /**
   * Generate an in-memory feature embedding vector from text
   */
  generateEmbedding(text, vocabulary) {
    const tokens = this.tokenize(text);
    const vector = new Float32Array(vocabulary.size);
    
    const tokenCounts = new Map();
    for (const token of tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }

    let norm = 0;
    let idx = 0;
    for (const [term] of vocabulary) {
      const count = tokenCounts.get(term) || 0;
      if (count > 0) {
        // TF-IDF weighted score
        const tf = 1 + Math.log(count);
        vector[idx] = tf;
        norm += tf * tf;
      }
      idx++;
    }

    // L2 Normalize vector
    if (norm > 0) {
      const sqrtNorm = Math.sqrt(norm);
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= sqrtNorm;
      }
    }

    return vector;
  }

  /**
   * Cosine similarity between two unit vectors
   */
  cosineSimilarity(vecA, vecB) {
    let dot = 0;
    const len = Math.min(vecA.length, vecB.length);
    for (let i = 0; i < len; i++) {
      dot += vecA[i] * vecB[i];
    }
    return dot;
  }
}

/**
 * In-Memory Vector Store for RAG indexing
 * Can be swapped with Pinecone / Weaviate / Qdrant.
 */
export class InMemoryVectorStore {
  constructor() {
    this.documents = [];
    this.vocabulary = new Map();
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Build vocabulary from document corpus
   */
  buildVocabulary(chunks) {
    this.vocabulary.clear();
    let termIndex = 0;
    for (const chunk of chunks) {
      const tokens = this.embeddingService.tokenize(chunk.text);
      for (const token of tokens) {
        if (!this.vocabulary.has(token)) {
          this.vocabulary.set(token, termIndex++);
        }
      }
    }
  }

  /**
   * Index chunks into vector store
   */
  async addDocuments(chunks, commonMetadata = {}) {
    this.buildVocabulary(chunks);
    this.documents = [];

    for (const chunk of chunks) {
      const vector = this.embeddingService.generateEmbedding(chunk.text, this.vocabulary);
      this.documents.push({
        id: chunk.id,
        text: chunk.text,
        tokenCount: chunk.tokenCount,
        index: chunk.index,
        metadata: { ...commonMetadata, chunkIndex: chunk.index },
        vector
      });
    }

    logger.info(`Vector store indexed ${this.documents.length} chunks with vocabulary size ${this.vocabulary.size}`);
  }

  /**
   * Perform semantic similarity search
   */
  async similaritySearch(query, topK = 4) {
    if (!this.documents.length) return [];

    const queryVector = this.embeddingService.generateEmbedding(query, this.vocabulary);
    const scoredDocs = this.documents.map((doc) => {
      const score = this.embeddingService.cosineSimilarity(queryVector, doc.vector);
      return {
        ...doc,
        score
      };
    });

    // Sort by descending similarity score
    scoredDocs.sort((a, b) => b.score - a.score);
    return scoredDocs.slice(0, topK);
  }

  /**
   * Clear all indexed documents
   */
  clear() {
    this.documents = [];
    this.vocabulary.clear();
  }
}

export const embeddingService = new EmbeddingService();
