import { config } from '../config/env.js';
import { bseService, BseServiceError } from '../services/bse.service.js';
import { resolveBseTimeFilters } from '../utils/bseDateTime.js';
import { logger } from '../utils/logger.js';

export class BseController {
  /**
   * POST /api/bse/corporate-announcements
   * Lightweight proxy to the external BSE API.
   * Optional body: { Hr, Min, Sec, Tradedt } — omit for current server time.
   */
  async getCorporateAnnouncements(req, res) {
    const requestStarted = performance.now();

    try {
      let timeFilters = null;

      if (req.body && Object.keys(req.body).length > 0) {
        try {
          timeFilters = resolveBseTimeFilters(req.body);
        } catch (validationError) {
          return res.status(400).json({
            success: false,
            message: validationError.message || 'Invalid time filter values.',
          });
        }
      }

      const { data, bseApiMs } = await bseService.fetchCorporateAnnouncements(timeFilters);
      const backendTotalMs = Math.round(performance.now() - requestStarted);

      if (config.nodeEnv === 'development') {
        const filterNote = timeFilters ? 'custom filters' : 'server time';
        logger.info(
          `BSE proxy timing (${filterNote}) — BSE API: ${bseApiMs} ms | Backend total: ${backendTotalMs} ms`,
        );
      }

      return res.status(200).json({
        success: true,
        data,
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
