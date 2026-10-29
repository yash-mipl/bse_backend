import { config } from '../config/env.js';
import { bseService, BseServiceError } from '../services/bse.service.js';
import { resolveBseTimeFilters } from '../utils/bseDateTime.js';
import { logger } from '../utils/logger.js';

export class BseController {
  /**
   * POST /api/bse/corporate-announcements
   * Lightweight proxy to the external BSE API.
   * Optional body: { Hr, Min, Sec, Tradedt, fallbackMinutes } — omit time for server clock.
   */
  async getCorporateAnnouncements(req, res) {
    const requestStarted = performance.now();

    try {
      let timeFilters = null;
      let fallbackMinutes = 0;

      if (req.body && Object.keys(req.body).length > 0) {
        const { fallbackMinutes: rawFallback, ...filterBody } = req.body;

        if (rawFallback !== undefined && rawFallback !== null && rawFallback !== '') {
          const parsed = Number.parseInt(String(rawFallback), 10);
          if (Number.isNaN(parsed) || parsed < 0 || parsed > 10) {
            return res.status(400).json({
              success: false,
              message: 'fallbackMinutes must be an integer between 0 and 10.',
            });
          }
          fallbackMinutes = parsed;
        }

        if (Object.keys(filterBody).length > 0) {
          try {
            timeFilters = resolveBseTimeFilters(filterBody);
          } catch (validationError) {
            return res.status(400).json({
              success: false,
              message: validationError.message || 'Invalid time filter values.',
            });
          }
        }
      }

      const { data, bseApiMs, fromCache } = await bseService.fetchCorporateAnnouncements(
        timeFilters,
        { fallbackMinutes },
      );
      const backendTotalMs = Math.round(performance.now() - requestStarted);

      if (config.nodeEnv === 'development') {
        const filterNote = timeFilters ? 'custom filters' : 'server time';
        const cacheNote = fromCache ? 'cache hit' : 'live';
        logger.info(
          `BSE proxy timing (${filterNote}, ${cacheNote}, fb=${fallbackMinutes}) — BSE API: ${bseApiMs} ms | Backend total: ${backendTotalMs} ms`,
        );
      }

      return res.status(200).json({
        success: true,
        data,
        meta: {
          fromCache: Boolean(fromCache),
          bseApiMs,
          backendTotalMs,
        },
      });
    } catch (error) {
      const statusCode = error instanceof BseServiceError ? error.statusCode : 502;
      const message =
        error instanceof BseServiceError
          ? error.message
          : 'Unable to fetch corporate announcements from BSE';

      logger.error(`Error in /api/bse/corporate-announcements: ${error.message}`);

      return res.status(statusCode).json({
        success: false,
        message,
      });
    }
  }
}

export const bseController = new BseController();
