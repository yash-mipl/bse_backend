import { logger } from './logger.js';

/**
 * Execute an async operation with exponential backoff retry.
 * @param {Function} fn Function returning a promise
 * @param {Object} options Options: retries, delayMs, factor, onRetry
 * @returns {Promise<any>}
 */
export async function retryWithBackoff(fn, {
  retries = 3,
  delayMs = 1000,
  factor = 2,
  maxDelayMs = 10000,
  name = 'operation',
  shouldRetry = (err) => true
} = {}) {
  let attempt = 0;
  let currentDelay = delayMs;

  while (attempt <= retries) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt++;
      if (attempt > retries || !shouldRetry(err)) {
        throw err;
      }

      logger.warn(`Retryable error in ${name} (attempt ${attempt}/${retries}): ${err.message}. Retrying in ${currentDelay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay * factor, maxDelayMs);
    }
  }
}
