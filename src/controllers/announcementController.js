import { announcementService } from '../services/announcementService.js';
import { queueManager } from '../queues/announcementQueue.js';
import { storageService } from '../services/storageService.js';
import { logger } from '../utils/logger.js';

export class AnnouncementController {
  /**
   * POST /api/announcements/analyze
   * Synchronous analysis of single announcement or small array
   */
  async analyze(req, res, next) {
    try {
      const payload = req.body;
      const forceRefresh = req.query.refresh === 'true' || req.body.forceRefresh === true;

      if (!payload) {
        return res.status(400).json({ error: 'Request body is required' });
      }

      // If array is provided, process as batch
      if (Array.isArray(payload)) {
        if (payload.length === 0) {
          return res.status(400).json({ error: 'Announcement array cannot be empty' });
        }
        const batchResult = await announcementService.processBatch(payload, { forceRefresh });
        return res.status(200).json(batchResult);
      }

      // Single announcement object
      const result = await announcementService.processAnnouncement(payload, { forceRefresh });
      return res.status(200).json(result);
    } catch (err) {
      logger.error(`Error in /api/announcements/analyze: ${err.message}`);
      return res.status(500).json({
        error: 'Failed to analyze announcement',
        message: err.message
      });
    }
  }

  /**
   * POST /api/announcements/analyze-batch
   * Process an array of announcements with concurrency control
   */
  async analyzeBatch(req, res, next) {
    try {
      const payload = req.body;
      const forceRefresh = req.query.refresh === 'true' || req.body.forceRefresh === true;

      const announcements = Array.isArray(payload) ? payload : payload.announcements;

      if (!Array.isArray(announcements) || announcements.length === 0) {
        return res.status(400).json({
          error: 'Invalid payload: Array of announcements is required (or { announcements: [...] })'
        });
      }

      const result = await announcementService.processBatch(announcements, { forceRefresh });
      return res.status(200).json(result);
    } catch (err) {
      logger.error(`Error in /api/announcements/analyze-batch: ${err.message}`);
      return res.status(500).json({
        error: 'Failed to process batch',
        message: err.message
      });
    }
  }

  /**
   * POST /api/announcements/queue
   * Async queue processing
   */
  async queueAnnouncement(req, res, next) {
    try {
      const payload = req.body;
      if (!payload || (!payload.SCRIP_CD && !payload.scripCode)) {
        return res.status(400).json({ error: 'Valid announcement object with SCRIP_CD is required' });
      }

      const jobInfo = await queueManager.addJob(payload);
      return res.status(202).json({
        message: 'Announcement successfully enqueued for processing',
        ...jobInfo,
        statusUrl: `/api/announcements/jobs/${jobInfo.jobId}`
      });
    } catch (err) {
      logger.error(`Error in /api/announcements/queue: ${err.message}`);
      return res.status(500).json({
        error: 'Failed to queue announcement',
        message: err.message
      });
    }
  }

  /**
   * GET /api/announcements/jobs/:jobId
   * Check status of queued job
   */
  async getJobStatus(req, res, next) {
    try {
      const { jobId } = req.params;
      const job = await queueManager.getJobStatus(jobId);

      if (!job) {
        return res.status(404).json({ error: `Job with ID '${jobId}' not found` });
      }

      return res.status(200).json(job);
    } catch (err) {
      logger.error(`Error checking job status: ${err.message}`);
      return res.status(500).json({ error: 'Failed to retrieve job status', message: err.message });
    }
  }

  /**
   * GET /api/announcements/:scripCode/status
   * Get latest processing status for a company scrip code
   */
  async getScripStatus(req, res, next) {
    try {
      const { scripCode } = req.params;
      const status = await queueManager.getStatusByScripCode(scripCode);

      if (!status) {
        // Also check if existing record exists in storage
        const history = await storageService.getByScripCode(scripCode);
        if (history.total > 0) {
          return res.status(200).json({
            scripCode,
            status: 'completed',
            latestResult: history.records[0]
          });
        }
        return res.status(404).json({ error: `No active or recent jobs found for scrip code: ${scripCode}` });
      }

      return res.status(200).json(status);
    } catch (err) {
      logger.error(`Error checking scrip status: ${err.message}`);
      return res.status(500).json({ error: 'Failed to retrieve scrip status', message: err.message });
    }
  }

  /**
   * GET /api/announcements/history
   * Query past analyses by scripCode, descriptor, materiality, or date range
   */
  async getHistory(req, res, next) {
    try {
      const { scripCode, descriptor, materiality, startDate, endDate, limit, offset } = req.query;

      const results = await storageService.query({
        scripCode,
        descriptor,
        materiality,
        startDate,
        endDate,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      return res.status(200).json(results);
    } catch (err) {
      logger.error(`Error querying history: ${err.message}`);
      return res.status(500).json({ error: 'Failed to query announcement history', message: err.message });
    }
  }
}

export const announcementController = new AnnouncementController();
