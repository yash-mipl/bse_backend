import http from 'node:http';
import https from 'node:https';
import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getKolkataBseTimestamps, resolveBseTimeFilters } from '../utils/bseDateTime.js';

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

  /**
   * Fetch corporate announcements from the external BSE API.
   * @returns {Promise<{ data: Array<Object>, bseApiMs: number }>}
   */
  async fetchCorporateAnnouncements(timeFilters = null) {
    if (!config.bse.username || !config.bse.password) {
      throw new BseServiceError('BSE credentials are not configured on the server.', {
        statusCode: 500,
      });
    }

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
}

export const bseService = new BseService();
