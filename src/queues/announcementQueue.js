import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { announcementService } from '../services/announcementService.js';

class QueueManager {
  constructor() {
    this.useRedis = false;
    this.bullQueue = null;
    this.bullWorker = null;
    this.inMemoryJobs = new Map();
    this.inMemoryQueue = [];
    this.isProcessingMemoryQueue = false;

    this.init();
  }

  async init() {
    try {
      const redisConnection = new IORedis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: () => null // Don't hang if Redis is unavailable
      });

      redisConnection.on('error', (err) => {
        if (!this.useRedis) return;
        logger.warn(`Redis connection failed: ${err.message}. Using asynchronous in-memory queue fallback.`);
        this.useRedis = false;
      });

      // Test connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve(false);
        }, 1500);

        redisConnection.ping().then(() => {
          clearTimeout(timeout);
          resolve(true);
        }).catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
      }).then((connected) => {
        if (connected) {
          this.useRedis = true;
          this.bullQueue = new Queue('bse-announcements', { connection: redisConnection });
          this.bullWorker = new Worker('bse-announcements', async (job) => {
            return await announcementService.processAnnouncement(job.data);
          }, {
            connection: redisConnection,
            concurrency: config.limits.maxConcurrentDownloads
          });

          this.bullWorker.on('completed', (job) => {
            logger.info(`BullMQ Job ${job.id} completed for scrip: ${job.data.SCRIP_CD}`);
          });

          this.bullWorker.on('failed', (job, err) => {
            logger.error(`BullMQ Job ${job?.id} failed: ${err.message}`);
          });

          logger.info('BullMQ + Redis queue initialized successfully.');
        } else {
          logger.info('Redis server not detected. Asynchronous in-memory background worker initialized.');
        }
      });
    } catch (err) {
      logger.info(`Using in-memory queue fallback: ${err.message}`);
    }
  }

  /**
   * Add announcement to async processing queue
   */
  async addJob(announcement) {
    const scripCode = announcement.SCRIP_CD || announcement.scripCode || 'unknown';
    const jobId = `job_${scripCode}_${Date.now()}_${uuidv4().slice(0, 8)}`;

    if (this.useRedis && this.bullQueue) {
      const job = await this.bullQueue.add('analyze-announcement', announcement, {
        jobId,
        removeOnComplete: false,
        removeOnFail: false
      });
      return { jobId: job.id, status: 'queued', provider: 'bullmq' };
    }

    // In-memory async queue fallback
    const jobRecord = {
      jobId,
      scripCode,
      announcement,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      completedAt: null,
      result: null,
      error: null
    };

    this.inMemoryJobs.set(jobId, jobRecord);
    this.inMemoryQueue.push(jobRecord);
    this.triggerMemoryWorker();

    return { jobId, status: 'queued', provider: 'in-memory' };
  }

  /**
   * Process jobs sequentially/concurrently in memory
   */
  async triggerMemoryWorker() {
    if (this.isProcessingMemoryQueue) return;
    this.isProcessingMemoryQueue = true;

    while (this.inMemoryQueue.length > 0) {
      const job = this.inMemoryQueue.shift();
      if (!job) continue;

      try {
        job.status = 'processing';
        job.progress = 20;
        const result = await announcementService.processAnnouncement(job.announcement);
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = new Date().toISOString();
        job.result = result;
      } catch (err) {
        logger.error(`In-memory job ${job.jobId} failed: ${err.message}`);
        job.status = 'failed';
        job.error = err.message;
        job.completedAt = new Date().toISOString();
      }
    }

    this.isProcessingMemoryQueue = false;
  }

  /**
   * Get status of a job by ID
   */
  async getJobStatus(jobId) {
    if (this.useRedis && this.bullQueue) {
      const job = await this.bullQueue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        return {
          jobId: job.id,
          status: state,
          result: job.returnvalue || null,
          failedReason: job.failedReason || null,
          timestamp: job.timestamp
        };
      }
    }

    // Check in-memory store
    if (this.inMemoryJobs.has(jobId)) {
      return this.inMemoryJobs.get(jobId);
    }

    return null;
  }

  /**
   * Get latest job status by scripCode
   */
  async getStatusByScripCode(scripCode) {
    const jobs = Array.from(this.inMemoryJobs.values())
      .filter((j) => String(j.scripCode).trim() === String(scripCode).trim())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return jobs[0] || null;
  }
}

export const queueManager = new QueueManager();
