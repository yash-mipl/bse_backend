import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class StorageService {
  constructor() {
    this.storageDir = config.storage.dir;
    this.dbFilePath = path.join(this.storageDir, 'announcements_db.json');
    this.records = new Map();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      try {
        const fileData = await fs.readFile(this.dbFilePath, 'utf-8');
        const list = JSON.parse(fileData);
        if (Array.isArray(list)) {
          for (const item of list) {
            const key = `${item.scripCode}_${item.processedAt}`;
            this.records.set(key, item);
          }
        }
      } catch {
        // File doesn't exist yet, start with empty
        await this.persistToFile();
      }
      this.initialized = true;
      logger.info(`StorageService initialized with ${this.records.size} existing records.`);
    } catch (err) {
      logger.error('Failed to initialize StorageService:', err);
    }
  }

  async persistToFile() {
    try {
      const data = Array.from(this.records.values());
      await fs.writeFile(this.dbFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`Error saving database file: ${err.message}`);
    }
  }

  /**
   * Save or update an announcement analysis record
   */
  async save(record) {
    await this.init();
    const id = record.id || `${record.scripCode}_${Date.now()}`;
    const doc = {
      id,
      ...record,
      updatedAt: new Date().toISOString()
    };
    this.records.set(id, doc);
    await this.persistToFile();
    return doc;
  }

  /**
   * Query records by filter criteria
   */
  async query({ scripCode, descriptor, materiality, startDate, endDate, limit = 50, offset = 0 } = {}) {
    await this.init();
    let list = Array.from(this.records.values());

    if (scripCode) {
      list = list.filter((r) => String(r.scripCode).trim() === String(scripCode).trim());
    }

    if (descriptor) {
      const descLower = descriptor.toLowerCase();
      list = list.filter((r) => 
        (r.categorySpecificDetails?.descriptor || '').toLowerCase().includes(descLower) ||
        (r.announcementType || '').toLowerCase().includes(descLower)
      );
    }

    if (materiality) {
      list = list.filter((r) => r.materiality?.toLowerCase() === materiality.toLowerCase());
    }

    if (startDate) {
      const start = new Date(startDate).getTime();
      list = list.filter((r) => new Date(r.processedAt).getTime() >= start);
    }

    if (endDate) {
      const end = new Date(endDate).getTime();
      list = list.filter((r) => new Date(r.processedAt).getTime() <= end);
    }

    // Sort by latest processedAt descending
    list.sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime());

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return {
      total,
      limit,
      offset,
      records: paginated
    };
  }

  /**
   * Get all records for a specific scripCode
   */
  async getByScripCode(scripCode) {
    return this.query({ scripCode });
  }
}

export const storageService = new StorageService();
