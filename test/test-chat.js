import Groq from 'groq-sdk';
import { config } from '../src/config/env.js';

async function testChat() {
  const groq = new Groq({ apiKey: config.groq.apiKey });
  const candidates = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];

  for (const model of candidates) {
    try {
      console.log(`Testing model: ${model}...`);
      const res = await groq.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'Respond with JSON: {"status": "ok"}' }],
        response_format: { type: 'json_object' }
      });
      console.log(` SUCCESS with ${model}:`, res.choices[0]?.message?.content);
      return model;
    } catch (e) {
      console.log(`❌ Failed with ${model}:`, e.message);
    }
  }
}

testChat();
