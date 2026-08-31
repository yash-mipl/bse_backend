import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  },
  
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  limits: {
    maxConcurrentDownloads: parseInt(process.env.MAX_CONCURRENT_PDF_DOWNLOADS || '4', 10),
    maxConcurrentLLM: parseInt(process.env.MAX_CONCURRENT_LLM_CALLS || '3', 10),
    fetchTimeoutMs: parseInt(process.env.FETCH_TIMEOUT_MS || '15000', 10),
    fetchMaxRetries: parseInt(process.env.FETCH_MAX_RETRIES || '3', 10),
  },
  
  storage: {
    type: process.env.PERSISTENCE_TYPE || 'json_file',
    dir: path.resolve(process.env.DATA_STORAGE_DIR || './data'),
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/bse_announcements',
  },
  
  http: {
    userAgent: process.env.HTTP_USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  },

  bse: {
    apiUrl:
      process.env.BSE_API_URL ||
      'https://dfws.bseindia.com/DataFeedService/api/DataFeed/Get_CorpAnnouncement/w',
    username: process.env.BSE_USERNAME || '',
    password: process.env.BSE_PASSWORD || '',
    timeoutMs: parseInt(process.env.BSE_API_TIMEOUT_MS || '10000', 10),
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
};
