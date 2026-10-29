# AI / PDF Summary Configuration

This document explains which AI is used for BSE announcement PDF analysis, credentials, token limits, and how to change them.

---

## Quick summary

| Item                               | Current value                                 |
| ---------------------------------- | --------------------------------------------- |
| **Provider**                       | [Groq](https://console.groq.com)              |
| **SDK**                            | `groq-sdk` (Node.js)                          |
| **Model**                          | `openai/gpt-oss-120b`                         |
| **API key env**                    | `GROQ_API_KEY`                                |
| **Model env**                      | `GROQ_MODEL`                                  |
| **Per-request output cap**         | `max_tokens: 2000` (in code)                  |
| **Daily free-tier tokens (TPD)**   | **200,000** tokens/day (org-level, Free plan) |
| **Daily free-tier requests (RPD)** | **1,000** requests/day                        |
| **Per-minute tokens (TPM)**        | **8,000** tokens/minute                       |
| **Per-minute requests (RPM)**      | **30** requests/minute                        |

> Exact limits for your org: [Groq Console → Limits](https://console.groq.com/settings/limits)  
> Official docs: [Groq Rate Limits](https://console.groq.com/docs/rate-limits)

---

## Where AI is used in the pipeline

When the frontend clicks **Analyze**, the backend runs:

```text
POST /api/announcements/analyze
        ↓
1. Download PDF (pdfFetchService)
2. Extract text / OCR (pdfExtractService)
3. Chunk + RAG retrieve (ragService, ~600 tokens/chunk)
4. Groq LLM summary (llmService.analyzeAnnouncement)
5. Cache + store result
```

**AI provider for the summary = Groq only.**  
PDF download/OCR are local libraries (`pdf-parse`, `tesseract.js`) — not cloud AI.

Relevant files:

| File                                  | Role                                    |
| ------------------------------------- | --------------------------------------- |
| `src/services/llmService.js`          | Groq client, prompt, `max_tokens: 2000` |
| `src/services/announcementService.js` | Orchestrates PDF → RAG → LLM            |
| `src/config/env.js`                   | Loads `GROQ_API_KEY`, `GROQ_MODEL`      |
| `.env`                                | Actual credentials (local, gitignored)  |
| `.env.example`                        | Template without secrets                |

---

## Credentials (how to change)

### Current env vars (in `bse_backend/.env`)

```env
# Groq LLM Configuration
GROQ_API_KEY=your_key_here          # starts with gsk_...
GROQ_MODEL=openai/gpt-oss-120b
```

### Steps to change API key or model

1. Open [https://console.groq.com/keys](https://console.groq.com/keys)
2. Create / copy a new API key
3. Edit `bse_backend/.env`:

```env
GROQ_API_KEY=gsk_YOUR_NEW_KEY_HERE
GROQ_MODEL=openai/gpt-oss-120b
```

4. Restart the backend:

```bash
cd bse_backend
npm run dev
```

5. Confirm health:

```bash
curl http://localhost:8000/health
```

You should see something like:

```json
{
  "groqConfigured": true,
  "model": "openai/gpt-oss-120b"
}
```

### Optional: switch to another Groq model

Examples that work with the same code (chat completions + JSON mode):

```env
# Current (default in .env)
GROQ_MODEL=openai/gpt-oss-120b

# Smaller / often cheaper / faster alternative
GROQ_MODEL=openai/gpt-oss-20b

# Other option on free plan (check console)
GROQ_MODEL=qwen/qwen3.8-27b

# Older example from .env.example (may not be free-tier eligible anymore)
# GROQ_MODEL=llama-3.3-70b-versatile
```

No code change is required if the model supports Groq chat completions and JSON object mode.  
Only update `GROQ_MODEL` and restart.

---

## Token / rate limits (Free plan — `openai/gpt-oss-120b`)

These are **Groq Free plan** sample limits (as published by Groq). Always verify on your console.

| Limit   | Value   | Meaning                         |
| ------- | ------- | ------------------------------- |
| **TPD** | 200,000 | Tokens per day (input + output) |
| **TPM** | 8,000   | Tokens per minute               |
| **RPD** | 1,000   | Requests per day                |
| **RPM** | 30      | Requests per minute             |

Limits apply per **organization**, not per individual API key.  
Cached tokens generally do not count toward rate limits (per Groq docs).

### App-level token settings (our code)

| Setting                 | Value            | Location                             |
| ----------------------- | ---------------- | ------------------------------------ |
| LLM output `max_tokens` | `2000`           | `src/services/llmService.js`         |
| RAG chunk size          | `~600` tokens    | `announcementService` → `ragService` |
| Chunk overlap           | `~100` tokens    | same                                 |
| Concurrent LLM calls    | `3`              | `MAX_CONCURRENT_LLM_CALLS` in `.env` |
| LLM retries             | `3` with backoff | `llmService.js`                      |

Rough capacity estimate on Free plan:

- If one Analyze call uses ~2,000–4,000 tokens (prompt + PDF context + 2k output),  
  you may get on the order of **~50–100 analyses/day** before hitting **200k TPD** (depends on PDF size).
- You can also hit **1,000 RPD** or **8k TPM** first if you burst requests.

### If you hit rate limits

Groq returns **HTTP 429**. Our service retries with backoff (3 attempts).  
To raise limits: upgrade Groq plan (Developer / higher) in the console.

---

## How to change `max_tokens` (output length)

Edit `bse_backend/src/services/llmService.js`:

```js
const response = await this.groq.chat.completions.create({
  model: config.groq.model,
  messages: [
    /* ... */
  ],
  response_format: { type: "json_object" },
  temperature: 0.1,
  max_tokens: 2000, // ← change this (e.g. 1000 or 4000)
});
```

Restart the backend after changing.

---

## How to change concurrency

In `bse_backend/.env`:

```env
MAX_CONCURRENT_LLM_CALLS=3
MAX_CONCURRENT_PDF_DOWNLOADS=4
```

Lower these if you hit Groq RPM/TPM often.  
Restart the backend after changes.

---

## Security notes

- **Never commit** real `GROQ_API_KEY` to git.
- Keep secrets only in `bse_backend/.env` (already in `.gitignore`).
- Prefer rotating keys in Groq Console if a key was shared or leaked.
- Frontend does **not** hold Groq credentials — Analyze goes only through the backend.

---

## Related env template

See `bse_backend/.env.example`:

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

Update `.env.example` when you standardize a new default model for the team (without putting real keys).

---

## Checklist: replace AI credentials

- [ ] Create new key at https://console.groq.com/keys
- [ ] Set `GROQ_API_KEY` in `bse_backend/.env`
- [ ] Optionally set `GROQ_MODEL`
- [ ] Restart backend (`npm run dev` / `npm start`)
- [ ] Hit `GET /health` → `groqConfigured: true`
- [ ] Click **Analyze** on one announcement in the frontend
- [ ] Confirm usage/limits in Groq Console

---

_Last updated from project config: `GROQ_MODEL=openai/gpt-oss-120b`, Free-plan Groq limits for that model._
