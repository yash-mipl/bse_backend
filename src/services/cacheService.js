import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

export class CacheService {
  constructor(cacheDir = './data/cache') {
    this.cacheDir = path.resolve(cacheDir);
    this.memoryCache = new Map();
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.mkdir(path.join(this.cacheDir, 'pdfs'), { recursive: true });
      await fs.mkdir(path.join(this.cacheDir, 'results'), { recursive: true });
    } catch (err) {
      logger.error('Failed to create cache directories:', err);
    }
  }

  /**
   * Compute a deterministic hash key from URL or string
   */
  generateKey(input) {
    return crypto.createHash('sha256').update(String(input || '')).digest('hex');
  }

  /**
   * Check if PDF buffer is already cached
   */
  async getCachedPdf(url) {
    const key = this.generateKey(url);
    if (this.memoryCache.has(`pdf_${key}`)) {
      return this.memoryCache.get(`pdf_${key}`);
    }

    const filePath = path.join(this.cacheDir, 'pdfs', `${key}.pdf`);
    try {
      const buffer = await fs.readFile(filePath);
      this.memoryCache.set(`pdf_${key}`, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  /**
   * Cache PDF buffer on disk and in memory
   */
  async saveCachedPdf(url, buffer) {
    const key = this.generateKey(url);
    this.memoryCache.set(`pdf_${key}`, buffer);

    const filePath = path.join(this.cacheDir, 'pdfs', `${key}.pdf`);
    try {
      await fs.writeFile(filePath, buffer);
    } catch (err) {
      logger.warn(`Failed to write PDF to disk cache: ${err.message}`);
    }
  }

  /**
   * Get cached analysis result for announcement
   */
  async getCachedResult(scripCode, attachmentUrl) {
    const key = this.generateKey(`${scripCode}_${attachmentUrl}`);
    if (this.memoryCache.has(`result_${key}`)) {
      return this.memoryCache.get(`result_${key}`);
    }

    const filePath = path.join(this.cacheDir, 'results', `${key}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      this.memoryCache.set(`result_${key}`, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Save cached analysis result
   */
  async saveCachedResult(scripCode, attachmentUrl, result) {
    const key = this.generateKey(`${scripCode}_${attachmentUrl}`);
    this.memoryCache.set(`result_${key}`, result);

    const filePath = path.join(this.cacheDir, 'results', `${key}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify(result, null, 2), 'utf-8');
    } catch (err) {
      logger.warn(`Failed to write result to disk cache: ${err.message}`);
    }
  }
}

export const cacheService = new CacheService();
