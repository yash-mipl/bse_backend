# BSE Announcement Analyzer & Insights Backend Service

A high-performance Node.js & Express.js backend service that ingests BSE-style corporate announcement JSON data, downloads PDF filings, extracts text with OCR fallback, indexes chunks into a vector store, performs contextual RAG retrieval, and generates AI-powered structured summaries, materiality ratings, and key business insights via Groq LLM.

---

##  Key Features

- **Resilient PDF Downloader**: Handles HTTP redirects, anti-bot User-Agent spoofing, custom headers (`Referer`, `Accept`), content-type validation, and exponential backoff retry.
- **Dual-Mode Text Extraction**: Fast native extraction with `pdf-parse`, with automatic OCR fallback via `tesseract.js` for scanned or image-based filings.
- **RAG Vector Search & Chunking**: Recursive text splitting (~500–800 tokens with overlap), TF-IDF vectorizer, and in-memory cosine similarity vector store (swappable for Pinecone/Weaviate).
- **Adaptive LLM Extraction (Groq)**: Dynamic prompt engineering tailored to announcement categories (e.g. *Book Closure*, *Board Meeting Outcome*, *Financial Results*, *General Meetings*).
- **Concurrency-Controlled Batch Processing**: Uses `p-limit` to handle batch ingestion without triggering BSE rate limits or LLM API rate spikes.
- **Queue-Based Async Processing**: Built with BullMQ + Redis for asynchronous processing with job status polling and fallback support.
- **Multi-Tier Caching**: Caches downloaded PDFs and analysis results by SHA-256 hash to eliminate duplicate processing.
- **Persistent Storage**: Stores analyses with query support by `scripCode`, `descriptor`, `materiality`, and date ranges.

---

##  Project Structure

```
├── .env                          # Configuration & API keys
├── package.json                  # Dependencies & scripts
├── data/                         # Persistent storage & cache directory
│   ├── cache/                    # Disk cache for PDFs and JSON results
│   └── announcements_db.json     # Saved announcement analyses
├── src/
│   ├── config/
│   │   └── env.js                # Environment config loader
│   ├── controllers/
│   │   ├── announcementController.js  # Main endpoint handlers
│   │   └── healthController.js        # Health check handler
│   ├── models/
│   ├── queues/
│   │   └── announcementQueue.js       # BullMQ + in-memory worker queue
│   ├── routes/
│   │   ├── announcementRoutes.js      # /api/announcements routes
│   │   └── healthRoutes.js            # /health routes
│   ├── services/
│   │   ├── announcementService.js     # Orchestration pipeline
│   │   ├── cacheService.js            # Multi-tier hash caching
│   │   ├── embeddingService.js        # Vector store & embeddings
│   │   ├── llmService.js              # Groq LLM client & prompt engine
│   │   ├── pdfExtractService.js       # pdf-parse + OCR fallback
│   │   ├── pdfFetchService.js         # PDF downloader & validator
│   │   ├── ragService.js              # Context-guided RAG retriever
│   │   └── storageService.js          # Persistent JSON/DB storage
│   ├── utils/
│   │   ├── logger.js                  # Winston structured logging
│   │   ├── retry.js                   # Exponential backoff utility
│   │   └── textChunker.js             # Token-aware text chunker
│   ├── app.js                         # Express application setup
│   └── server.js                      # Server startup & graceful shutdown
└── test/
    ├── test-sample.js                 # Complete end-to-end test suite
    └── test-pdf-pipeline.js           # PDF & RAG pipeline unit test
```

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure `.env`
```env
PORT=8000
NODE_ENV=development

# Groq LLM Configuration
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b

# Redis (Optional)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Concurrency Limits
MAX_CONCURRENT_PDF_DOWNLOADS=4
MAX_CONCURRENT_LLM_CALLS=3
```

### 3. Start the Server
```bash
# Production mode
npm start

# Development mode (with live reload)
npm run dev
```

---

## 📡 API Endpoints

### 1. Single Announcement Analysis
**`POST /api/announcements/analyze`**

**Request Body:**
```json
{
  "SCRIP_CD": "511738",
  "CompanyName": "Mehta Securities Ltd",
  "DT_TM": "8/31/2026 1:46:54 PM",
  "HeadLine": "Intimation of date of book closure under Regulation 42 of SEBI LODR",
  "NewsBody": "Book closure from 19th September, 2026 to 25th September, 2026...",
  "Descriptor": "Book Closure",
  "TypeofAnnounce": "Book Closure",
  "DateofMeeting": "8/31/2026 12:00:00 AM",
  "ATTACHMENTURL": "https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=....pdf"
}
```

**Response (`200 OK`):**
```json
{
  "scripCode": "511738",
  "companyName": "Mehta Securities Ltd",
  "announcementType": "Book Closure",
  "summary": "Mehta Securities Ltd announced a book closure from 19-Sep-2026 to 25-Sep-2026 (inclusive) to record members for its 32nd AGM, with a voting cut-off date of 18-Sep-2026.",
  "keyPoints": [
    "Regulation 42(2) of SEBI LODR 2015 invoked for book closure.",
    "Register of Members closed 19 Sep 2026 – 25 Sep 2026 (both days inclusive).",
    "Cut-off date for voting eligibility: 18 Sep 2026."
  ],
  "importantDates": [
    "Book Closure: 19 Sep 2026 to 25 Sep 2026 (both days inclusive)",
    "Voting Cut-off / Record Date: 18 Sep 2026"
  ],
  "materiality": "Low",
  "materialityReasoning": "Routine compliance disclosure; no immediate price-sensitive impact.",
  "categorySpecificDetails": {
    "descriptor": "Book Closure",
    "extractedDetails": {
      "startDate": "2026-09-19",
      "endDate": "2026-09-25",
      "inclusive": true,
      "cutOffDate": "2026-09-18",
      "purpose": "32nd Annual General Meeting (FY 2025-26)"
    }
  },
  "rawTextLength": 1899,
  "processedAt": "2026-08-31T08:56:57.316Z"
}
```

---

### 2. Batch Analysis (Concurrency-Controlled)
**`POST /api/announcements/analyze-batch`**

**Request Body:**
```json
[
  { "SCRIP_CD": "511738", "CompanyName": "Mehta Securities Ltd", ... },
  { "SCRIP_CD": "540174", "CompanyName": "Southern Infoconsultants Ltd", ... }
]
```

---

### 3. Asynchronous Queue Processing
**`POST /api/announcements/queue`**

**Response (`202 Accepted`):**
```json
{
  "message": "Announcement successfully enqueued for processing",
  "jobId": "job_511738_1788166619207_168d514e",
  "status": "queued",
  "statusUrl": "/api/announcements/jobs/job_511738_1788166619207_168d514e"
}
```

**Check Status: `GET /api/announcements/jobs/:jobId`** or **`GET /api/announcements/:scripCode/status`**

---

### 4. Query Historical Analyses
**`GET /api/announcements/history?scripCode=511738&materiality=Low`**

---

### 5. Health Check
**`GET /health`**

---

## 🧪 Running Tests
```bash
npm run test:sample
```
