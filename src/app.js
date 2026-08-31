import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import announcementRoutes from './routes/announcementRoutes.js';
import bseRoutes from './routes/bse.routes.js';
import healthRoutes from './routes/healthRoutes.js';

const app = express();

// Middlewares
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.cors.origins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// API Routes
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/bse', bseRoutes);

// Welcome / Root route
app.get('/', (req, res) => {
  res.json({
    service: 'BSE Corporate Announcement Analyzer API',
    version: '1.0.0',
    documentation: {
      health: 'GET /health',
      corporateAnnouncements: 'POST /api/bse/corporate-announcements',
      analyze: 'POST /api/announcements/analyze',
      analyzeBatch: 'POST /api/announcements/analyze-batch',
      queueAsync: 'POST /api/announcements/queue',
      jobStatus: 'GET /api/announcements/jobs/:jobId',
      scripStatus: 'GET /api/announcements/:scripCode/status',
      history: 'GET /api/announcements/history'
    }
  });
});

// 404 Not Found Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled Express Error: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

export default app;
