import { InMemoryVectorStore } from './embeddingService.js';
import { chunkText } from '../utils/textChunker.js';
import { logger } from '../utils/logger.js';

export class RagService {
  /**
   * Index document chunks into vector store and retrieve the most relevant chunks for the announcement.
   * @param {string} rawText - Extracted text from filing PDF
   * @param {Object} announcement - BSE announcement metadata
   * @param {Object} options - Retrieval options (topK, maxTokens)
   * @returns {Promise<{ chunks: Array<any>, retrievedChunks: Array<any>, contextText: string }>}
   */
  async processAndRetrieve(rawText, announcement, { topK = 4, maxTokens = 600, overlapTokens = 100 } = {}) {
    // 1. Chunk the extracted text
    const chunks = chunkText(rawText, { maxTokens, overlapTokens });

    if (chunks.length === 0) {
      logger.warn(`No text chunks generated for announcement scrip: ${announcement.SCRIP_CD}`);
      return {
        chunks: [],
        retrievedChunks: [],
        contextText: rawText || announcement.NewsBody || ''
      };
    }

    // If document is small (1 or 2 chunks), use all chunks directly
    if (chunks.length <= 2) {
      const contextText = chunks.map((c) => c.text).join('\n\n--- Next Section ---\n\n');
      return {
        chunks,
        retrievedChunks: chunks,
        contextText
      };
    }

    // 2. Index chunks into vector store
    const vectorStore = new InMemoryVectorStore();
    await vectorStore.addDocuments(chunks, {
      scripCode: announcement.SCRIP_CD,
      companyName: announcement.CompanyName
    });

    // 3. Construct targeted RAG query using announcement metadata
    const queryParts = [
      announcement.HeadLine || '',
      announcement.Descriptor || '',
      announcement.TypeofAnnounce || '',
      announcement.NewsBody || '',
      announcement.CompanyName || ''
    ].filter(Boolean);

    const query = queryParts.join(' ');
    logger.info(`Performing RAG retrieval with query: "${query.slice(0, 100)}..." across ${chunks.length} chunks`);

    const retrieved = await vectorStore.similaritySearch(query, topK);

    // Fallback: If similarity scores are 0 or query is sparse, guarantee initial chunk is included (usually contains letterhead/subject)
    const retrievedIds = new Set(retrieved.map((r) => r.id));
    if (!retrievedIds.has(0) && chunks.length > 0) {
      retrieved.unshift(chunks[0]);
    }

    // Sort retrieved chunks back into document flow order
    retrieved.sort((a, b) => a.index - b.index);

    const contextText = retrieved
      .map((r) => `[Excerpt ${r.index + 1}]:\n${r.text}`)
      .join('\n\n--- Next Section ---\n\n');

    return {
      chunks,
      retrievedChunks: retrieved,
      contextText
    };
  }
}

export const ragService = new RagService();
