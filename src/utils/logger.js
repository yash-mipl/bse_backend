import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const customFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}]: ${stack || message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    process.env.NODE_ENV === 'production' ? winston.format.json() : combine(colorize(), customFormat)
  ),
  transports: [
    new winston.transports.Console()
  ]
});
