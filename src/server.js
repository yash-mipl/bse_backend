import app from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { storageService } from './services/storageService.js';
import { cacheService } from './services/cacheService.js';

async function startServer() {
  try {
    // Initialize storage and cache
    await storageService.init();
    await cacheService.init();

    const server = app.listen(config.port, () => {
      logger.info(`====================================================`);
      logger.info(` BSE Announcement Analyzer Service`);
      logger.info(` Environment: ${config.nodeEnv}`);
      logger.info(` Port:        ${config.port}`);
      logger.info(` Health:      http://localhost:${config.port}/health`);
      logger.info(` BSE Feed:    http://localhost:${config.port}/api/bse/corporate-announcements`);
      logger.info(` Analyze API: http://localhost:${config.port}/api/announcements/analyze`);
      logger.info(` LLM Model:   ${config.groq.model}`);
      logger.info(`====================================================`);
    });

    const handleShutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
