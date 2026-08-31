import pLimit from 'p-limit';
import { pdfFetchService } from './pdfFetchService.js';
import { pdfExtractService } from './pdfExtractService.js';
import { ragService } from './ragService.js';
import { llmService } from './llmService.js';
import { cacheService } from './cacheService.js';
import { storageService } from './storageService.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class AnnouncementService {
  constructor() {
    this.downloadLimit = pLimit(config.limits.maxConcurrentDownloads);
    this.llmLimit = pLimit(config.limits.maxConcurrentLLM);
  }

  /**
   * Process a single BSE announcement object end-to-end
   * @param {Object} announcement - BSE announcement object
   * @param {Object} options - { forceRefresh: boolean }
   * @returns {Promise<Object>} Structured analysis response
   */
  async processAnnouncement(announcement, { forceRefresh = false } = {}) {
    const scripCode = String(announcement.SCRIP_CD || announcement.scripCode || '').trim();
    const attachmentUrl = (announcement.ATTACHMENTURL || announcement.attachmentUrl || '').trim();
    const companyName = announcement.CompanyName || announcement.companyName || 'Unknown';

    if (!scripCode) {
      throw new Error('SCRIP_CD is required for processing');
    }

    logger.info(`Starting analysis for Scrip: ${scripCode} (${companyName}) | URL: ${attachmentUrl || 'None'}`);

    // Step 1: Check cached result unless forceRefresh is set
    if (!forceRefresh && attachmentUrl) {
      const cached = await cacheService.getCachedResult(scripCode, attachmentUrl);
      if (cached) {
        logger.info(`Cache HIT for analysis result: ${scripCode} - ${attachmentUrl}`);
        return {
          ...cached,
          fromCache: true
        };
      }
    }

    let rawText = '';
    let extractionMethod = 'none';
    let numPages = 0;

    // Step 2: Fetch and extract PDF if attachment URL is present
    if (attachmentUrl) {
      try {
        const { buffer } = await this.downloadLimit(() => pdfFetchService.fetchPdf(attachmentUrl));
        const extraction = await pdfExtractService.extractText(buffer);
        rawText = extraction.text;
        extractionMethod = extraction.method;
        numPages = extraction.numPages;
      } catch (err) {
        logger.warn(`PDF fetch/extraction failed for ${scripCode} (${err.message}). Falling back to NewsBody metadata.`);
        rawText = announcement.NewsBody || announcement.HeadLine || '';
      }
    } else {
      rawText = announcement.NewsBody || announcement.HeadLine || '';
    }

    // Step 3: RAG Processing (Chunking & Contextual Semantic Retrieval)
    const { contextText } = await ragService.processAndRetrieve(rawText, announcement, {
      topK: 4,
      maxTokens: 600,
      overlapTokens: 100
    });

    // Step 4: AI Analysis & Extraction via Groq LLM (with concurrency limiting)
    const analysis = await this.llmLimit(() => 
      llmService.analyzeAnnouncement(announcement, contextText, rawText.length)
    );

    const result = {
      ...analysis,
      extractionMethod,
      numPages,
      attachmentUrl: attachmentUrl || undefined,
      fromCache: false
    };

    // Step 5: Save to Cache & Persistent DB
    if (attachmentUrl) {
      await cacheService.saveCachedResult(scripCode, attachmentUrl, result);
    }
    await storageService.save(result);

    logger.info(`Completed analysis for Scrip: ${scripCode} - Materiality: ${result.materiality}`);
    return result;
  }

  /**
   * Process a batch array of BSE announcements with concurrency control
   * @param {Array<Object>} announcements - List of announcement objects
   * @param {Object} options - Options
   * @returns {Promise<{ total: number, successful: number, failed: number, results: Array<any>, errors: Array<any> }>}
   */
  async processBatch(announcements, options = {}) {
    if (!Array.isArray(announcements) || announcements.length === 0) {
      throw new Error('An array of announcements is required for batch processing');
    }

    logger.info(`Starting batch processing of ${announcements.length} announcements...`);
    const limit = pLimit(config.limits.maxConcurrentDownloads);

    const tasks = announcements.map((item, index) => {
      return limit(async () => {
        try {
          const result = await this.processAnnouncement(item, options);
          return {
            index,
            scripCode: item.SCRIP_CD || item.scripCode,
            status: 'success',
            data: result
          };
        } catch (err) {
          logger.error(`Failed processing announcement at index ${index} (Scrip: ${item.SCRIP_CD}): ${err.message}`);
          return {
            index,
            scripCode: item.SCRIP_CD || item.scripCode,
            status: 'failed',
            error: err.message
          };
        }
      });
    });

    const executionResults = await Promise.all(tasks);

    const successful = executionResults.filter((r) => r.status === 'success');
    const failed = executionResults.filter((r) => r.status === 'failed');

    return {
      total: announcements.length,
      successfulCount: successful.length,
      failedCount: failed.length,
      results: executionResults.map((r) => r.status === 'success' ? r.data : { scripCode: r.scripCode, error: r.error, failed: true })
    };
  }
}

export const announcementService = new AnnouncementService();
