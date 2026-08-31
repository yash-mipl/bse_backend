import Groq from 'groq-sdk';
import { config } from '../src/config/env.js';

async function listModels() {
  const groq = new Groq({ apiKey: config.groq.apiKey });
  const models = await groq.models.list();
  console.log('Available Groq models:');
  models.data.forEach(m => console.log('-', m.id));
}

listModels().catch(console.error);
