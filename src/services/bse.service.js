import http from 'node:http';
import https from 'node:https';
import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  getKolkataBseTimestamps,
  getKolkataBseTimestampsForMinuteOffset,
} from '../utils/bseDateTime.js';

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

export class BseServiceError extends Error {
  constructor(message, { isTimeout = false, statusCode = 502 } = {}) {
    super(message);
    this.name = 'BseServiceError';
    this.isTimeout = isTimeout;
    this.statusCode = statusCode;
  }
}

function cacheKeyForFilters(timeFilters) {
  const filters = timeFilters ?? getKolkataBseTimestamps();
  return `${filters.Tradedt}|${filters.Hr}|${filters.Min}|${filters.Sec}`;
}

export class BseService {
  constructor() {
    this.client = axios.create({
      timeout: config.bse.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      httpAgent,
      httpsAgent,
    });

    /** @type {Map<string, { data: Array<Object>, fetchedAt: number }>} */
    this.responseCache = new Map();
    /** @type {Map<string, Promise<{ data: Array<Object>, bseApiMs: number, fromCache: boolean }>>} */
    this.inflight = new Map();
  }

  buildRequestPayload(timeFilters = null) {
    const timestamps = timeFilters ?? getKolkataBseTimestamps();

    return {
      Username: config.bse.username,
      Password: config.bse.password,
      ...timestamps,
    };
  }

  /**
   * Pass through BSE array responses directly. Only normalize the known empty/error shapes.
   * @param {unknown} payload
   * @returns {Array<Object>}
   */
  normalizeAnnouncements(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (
      payload &&
      typeof payload === 'object' &&
      typeof payload.Error_Msg === 'string' &&
      payload.Error_Msg.toLowerCase().includes('no record found')
    ) {
      return [];
    }

    if (
      payload &&
      typeof payload === 'object' &&
      typeof payload.Error_Msg === 'string'
    ) {
      throw new BseServiceError('Unable to fetch corporate announcements from BSE', {
        statusCode: 502,
      });
    }

    throw new BseServiceError('Unexpected response format received from BSE.', {
      statusCode: 502,
    });
  }

  getFreshCache(key) {
    const cached = this.responseCache.get(key);
    if (!cached) return null;

    const ageMs = Date.now() - cached.fetchedAt;
    if (ageMs > config.bse.cacheTtlMs) return null;

    return cached;
  }

  /**
   * Single BSE POST for one timestamp snapshot.
   * @returns {Promise<{ data: Array<Object>, bseApiMs: number }>}
   */
  async fetchOnce(timeFilters = null) {
    const requestBody = this.buildRequestPayload(timeFilters);
    const bseStarted = performance.now();

    try {
      const response = await this.client.post(config.bse.apiUrl, requestBody);
      const bseApiMs = Math.round(performance.now() - bseStarted);

      return {
        data: this.normalizeAnnouncements(response.data),
        bseApiMs,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new BseServiceError('Unable to fetch corporate announcements from BSE', {
            isTimeout: true,
            statusCode: 504,
          });
        }

        logger.error(
          `BSE API request failed: ${error.response?.status ?? 'network error'} - ${error.message}`,
        );

        throw new BseServiceError('Unable to fetch corporate announcements from BSE', {
          statusCode: 502,
        });
      }

      if (error instanceof BseServiceError) {
        throw error;
      }

      logger.error(`Unexpected BSE service error: ${error.message}`);
      throw new BseServiceError('Unable to fetch corporate announcements from BSE', {
        statusCode: 502,
      });
    }
  }

  /**
   * Fetch corporate announcements from BSE with short TTL cache + in-flight coalesce.
   * Optional minute fallbacks run server-side so the frontend only waits for one round-trip.
   * @param {{ Hr: string, Min: string, Sec: string, Tradedt: string } | null} timeFilters
   * @param {{ fallbackMinutes?: number }} [options]
   * @returns {Promise<{ data: Array<Object>, bseApiMs: number, fromCache: boolean }>}
   */
  async fetchCorporateAnnouncements(timeFilters = null, { fallbackMinutes = 0 } = {}) {
    if (!config.bse.username || !config.bse.password) {
      throw new BseServiceError('BSE credentials are not configured on the server.', {
        statusCode: 500,
      });
    }

    const primaryFilters = timeFilters ?? getKolkataBseTimestamps();
    const cacheKey = `${cacheKeyForFilters(primaryFilters)}|fb:${fallbackMinutes}`;

    const fresh = this.getFreshCache(cacheKey);
    if (fresh) {
      return { data: fresh.data, bseApiMs: 0, fromCache: true };
    }

    const existing = this.inflight.get(cacheKey);
    if (existing) {
      return existing;
    }

    const promise = this.fetchWithFallbacks(primaryFilters, fallbackMinutes)
      .then((result) => {
        this.responseCache.set(cacheKey, {
          data: result.data,
          fetchedAt: Date.now(),
        });
        return { ...result, fromCache: false };
      })
      .finally(() => {
        this.inflight.delete(cacheKey);
      });

    this.inflight.set(cacheKey, promise);
    return promise;
  }

  async fetchWithFallbacks(primaryFilters, fallbackMinutes) {
    let totalBseMs = 0;
    const first = await this.fetchOnce(primaryFilters);
    totalBseMs += first.bseApiMs;

    if (first.data.length > 0 || fallbackMinutes <= 0) {
      return { data: first.data, bseApiMs: totalBseMs };
    }

    for (let offset = -1; offset >= -fallbackMinutes; offset -= 1) {
      const filters = getKolkataBseTimestampsForMinuteOffset(offset);
      const result = await this.fetchOnce(filters);
      totalBseMs += result.bseApiMs;

      if (result.data.length > 0) {
        return { data: result.data, bseApiMs: totalBseMs };
      }
    }

    return { data: [], bseApiMs: totalBseMs };
  }
}

export const bseService = new BseService();
