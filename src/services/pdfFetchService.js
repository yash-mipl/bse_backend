import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';
import { cacheService } from './cacheService.js';

export class PdfFetchService {
  constructor() {
    this.client = axios.create({
      timeout: config.limits.fetchTimeoutMs,
      maxRedirects: 5,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': config.http.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.bseindia.com/',
        'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1'
      }
    });
  }

  /**
   * Fetch PDF from URL or local file path, with caching and retry logic.
   * @param {string} url - Target PDF URL or local file path
   * @returns {Promise<{ buffer: Buffer, sourceUrl: string, sizeBytes: number }>}
   */
  async fetchPdf(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Valid attachment URL is required');
    }

    const trimmedUrl = url.trim();

    // 1. Check if it's a local file path (for testing / offline evaluation)
    if (trimmedUrl.startsWith('file://') || trimmedUrl.startsWith('/') || trimmedUrl.startsWith('./') || trimmedUrl.endsWith('.pdf')) {
      const localPath = trimmedUrl.replace(/^file:\/\//, '');
      try {
        const stats = await fs.stat(localPath);
        if (stats.isFile()) {
          const buffer = await fs.readFile(localPath);
          logger.info(`Loaded PDF from local path: ${localPath} (${buffer.length} bytes)`);
          return {
            buffer,
            sourceUrl: trimmedUrl,
            sizeBytes: buffer.length
          };
        }
      } catch (err) {
        // If not a local file, proceed to network fetch
      }
    }

    // 2. Check Cache
    const cachedBuffer = await cacheService.getCachedPdf(trimmedUrl);
    if (cachedBuffer) {
      logger.info(`Cache HIT for PDF: ${trimmedUrl} (${cachedBuffer.length} bytes)`);
      return {
        buffer: cachedBuffer,
        sourceUrl: trimmedUrl,
        sizeBytes: cachedBuffer.length
      };
    }

    logger.info(`Cache MISS. Fetching PDF from: ${trimmedUrl}`);

    // 3. Download via Axios with exponential backoff retry
    const buffer = await retryWithBackoff(async (attempt) => {
      try {
        const response = await this.client.get(trimmedUrl);

        const contentType = response.headers['content-type'] || '';
        const dataBuffer = Buffer.from(response.data);

        // Validation check for PDF magic bytes "%PDF-"
        const isPdfMagicBytes = dataBuffer.slice(0, 5).toString('ascii').startsWith('%PDF');

        if (!isPdfMagicBytes && !contentType.toLowerCase().includes('pdf') && !contentType.toLowerCase().includes('octet-stream')) {
          // If response is HTML, it could be a BSE anti-bot or redirect interstitial
          const responseSnippet = dataBuffer.slice(0, 200).toString('utf-8');
          if (responseSnippet.toLowerCase().includes('<html')) {
            throw new Error(`Received HTML instead of PDF from BSE server (Status: ${response.status}). Anti-bot or invalid URL.`);
          }
          throw new Error(`Unexpected Content-Type: ${contentType}. File signature does not match PDF.`);
        }

        if (dataBuffer.length === 0) {
          throw new Error('Downloaded PDF is 0 bytes (empty response).');
        }

        return dataBuffer;
      } catch (err) {
        if (err.response) {
          const status = err.response.status;
          if (status === 403 || status === 429) {
            throw new Error(`Rate-limited or blocked by BSE server (HTTP ${status})`);
          }
          if (status === 404) {
            throw new Error(`PDF not found at URL (HTTP 404)`);
          }
        }
        throw err;
      }
    }, {
      retries: config.limits.fetchMaxRetries,
      delayMs: 1500,
      factor: 2,
      name: `Download ${trimmedUrl}`,
      shouldRetry: (err) => !err.message.includes('404') && !err.message.includes('password')
    });

    // 4. Save to cache
    await cacheService.saveCachedPdf(trimmedUrl, buffer);
    logger.info(`Successfully downloaded and cached PDF from ${trimmedUrl} (${buffer.length} bytes)`);

    return {
      buffer,
      sourceUrl: trimmedUrl,
      sizeBytes: buffer.length
    };
  }
}

export const pdfFetchService = new PdfFetchService();
