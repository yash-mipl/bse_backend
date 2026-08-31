import { Router } from 'express';
import { announcementController } from '../controllers/announcementController.js';

const router = Router();

// Synchronous analysis of single announcement or array
router.post('/analyze', (req, res, next) => announcementController.analyze(req, res, next));

// Batch processing endpoint with concurrency limits
router.post('/analyze-batch', (req, res, next) => announcementController.analyzeBatch(req, res, next));

// Asynchronous queue endpoint (BullMQ)
router.post('/queue', (req, res, next) => announcementController.queueAnnouncement(req, res, next));

// Job status endpoint
router.get('/jobs/:jobId', (req, res, next) => announcementController.getJobStatus(req, res, next));

// Query status by scrip code
router.get('/:scripCode/status', (req, res, next) => announcementController.getScripStatus(req, res, next));

// Query historical analyses
router.get('/history', (req, res, next) => announcementController.getHistory(req, res, next));

export default router;
