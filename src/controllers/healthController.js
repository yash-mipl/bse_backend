import { config } from '../config/env.js';

export function getHealth(req, res) {
  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'bse-announcement-analyzer',
    environment: config.nodeEnv,
    groqConfigured: Boolean(config.groq.apiKey),
    model: config.groq.model
  });
}
