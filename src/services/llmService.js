import Groq from 'groq-sdk';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';

export class LlmService {
  constructor() {
    this.groq = new Groq({
      apiKey: config.groq.apiKey
    });
  }

  /**
   * Build comprehensive prompt following the institutional Indian stock market analyst guidelines
   */
  buildPrompt(announcement, documentText) {
    const scripCode = announcement.SCRIP_CD || announcement.scripCode || 'N/A';
    const companyName = announcement.CompanyName || announcement.companyName || 'N/A';
    const dtTm = announcement.DT_TM || announcement.dateTime || 'N/A';
    const headLine = announcement.HeadLine || announcement.headline || 'N/A';
    const newsSub = announcement.NewsSub || announcement.subject || 'N/A';
    const newsBody = announcement.NewsBody || announcement.description || 'N/A';
    const descriptor = announcement.Descriptor || 'N/A';
    const criticalNews = announcement.CriticalNews || 'N/A';
    const typeofAnnounce = announcement.TypeofAnnounce || 'N/A';
    const typeofMeeting = announcement.TypeofMeeting || 'N/A';
    const dateofMeeting = announcement.DateofMeeting || 'N/A';
    const attachmentUrl = announcement.ATTACHMENTURL || announcement.attachmentUrl || 'N/A';


    const systemPrompt = `You are an Indian stock market corporate announcement analyst.

Your task is to analyze a BSE corporate announcement and convert it into a fast, factual, decision-support summary for a trader or investor.

IMPORTANT RULES:
1. Use only the information provided in the BSE announcement and attached document text.
2. Do not invent, assume, estimate, or hallucinate facts, numbers, financial impact, margins, or company information.
3. Do not give Buy, Sell, Hold, Target Price, or expected stock-price movement.
4. Focus on information that could matter to a stock market participant.
5. Remove repetitive regulatory/legal wording unless it is important to understanding the event.
6. If the attachment/document provides more detailed information than the headline, prioritize the document.
7. Preserve important numbers exactly as stated, including:
   - Rupee values, Order values, Revenue, EBITDA, PAT / Profit / Loss, Percentages, Growth rates, Margins, Shareholding, Acquisition values, Dividend amounts, Quantities, Capacity, Dates, Timelines.
8. Clearly distinguish facts from AI interpretation.
9. If information required for proper interpretation is missing, explicitly mention it under "missing_information".
10. Keep the language concise, simple and suitable for someone who wants to understand the announcement within seconds.
11. Do not repeat the same information across multiple sections unnecessarily.
12. If there is not enough information to determine sentiment or materiality confidently, select Neutral or Medium/Low as appropriate and explain why.

OUTPUT FORMAT:
Return ONLY valid JSON matching the exact schema. Do not use markdown backticks.`;

    const userPrompt = `BSE ANNOUNCEMENT DATA

Scrip Code:
${scripCode}

Company Name:
${companyName}

Announcement Date & Time:
${dtTm}

Headline:
${headLine}

Subject:
${newsSub}

Announcement Description:
${newsBody}

Descriptor:
${descriptor}

Critical News:
${criticalNews}

Announcement Type:
${typeofAnnounce}

Meeting Type:
${typeofMeeting}

Meeting Date:
${dateofMeeting}

Attachment URL:
${attachmentUrl}

ATTACHMENT / DOCUMENT CONTENT

${documentText || newsBody || 'No attachment text available.'}

--------------------------------------------------

STEP 1: CLASSIFY THE ANNOUNCEMENT
Select the most appropriate category from:
Financial Results | Order Win / Contract | Acquisition / Merger | Investment / Divestment | Fund Raising | Dividend | Buyback | Bonus / Stock Split | Board Meeting | Management Change | Promoter / Shareholding Change | Regulatory / Legal | Credit Rating | Capacity Expansion | New Product / Business Launch | Partnership / Agreement | Loan / Debt | Related Party Transaction | Corporate Restructuring | Operational Update | Insolvency / Default | Other

STEP 2: DETERMINE SENTIMENT
Select only one: Positive | Negative | Neutral | Mixed

STEP 3: DETERMINE MATERIALITY
Select: High | Medium | Low

STEP 4: EXTRACT KEY NUMBERS
Extract only important numerical information explicitly available in the announcement (metric, value, context).

STEP 5: EXPLAIN WHY IT MATTERS
Briefly explain the potential business significance (1-3 sentences).

STEP 6: IDENTIFY POSITIVE FACTORS, RISKS AND MISSING INFORMATION
positive_factors, risks_or_concerns, missing_information (as concise arrays).

STEP 7: CREATE A ONE-LINE TRADER SUMMARY
Create a short summary (<30 words) containing the most important event and numbers.

OUTPUT SCHEMA:
{
  "company_name": "${companyName}",
  "scrip_code": "${scripCode}",
  "category": "Category Name",
  "quick_view": {
    "sentiment": "Positive | Negative | Neutral | Mixed",
    "materiality": "High | Medium | Low",
    "headline_summary": "Under 15 words headline summary",
    "key_numbers_short": "Compact numbers e.g. ₹450 Cr | 24 Months or N/A"
  },
  "summary": "2-4 sentences plain English factual summary",
  "key_points": [
    "Key fact or resolution"
  ],
  "key_numbers": [
    {
      "metric": "Metric name",
      "value": "Exact value with currency/units",
      "context": "Brief context"
    }
  ],
  "why_it_matters": "1-3 sentences explaining business significance",
  "positive_factors": [
    "Favourable factor"
  ],
  "risks_or_concerns": [
    "Risk or limitation"
  ],
  "missing_information": [
    "Missing relevant context"
  ],
  "important_dates": [
    {
      "event": "Event name",
      "date": "Date mentioned"
    }
  ],
  "ai_assessment": "Concise assessment",
  "confidence": {
    "level": "High | Medium | Low",
    "reason": "Reason for confidence level"
  },
  "one_line_summary": "Under 30 words fast summary for trader"
}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Generate structured summary and insights using Groq LLM
   */
  async analyzeAnnouncement(announcement, documentText, rawTextLength = 0) {
    const scripCode = announcement.SCRIP_CD || announcement.scripCode || 'N/A';
    const companyName = announcement.CompanyName || announcement.companyName || 'N/A';
    const { systemPrompt, userPrompt } = this.buildPrompt(announcement, documentText);

    logger.info(`Sending analysis request to Groq LLM (Model: ${config.groq.model}) for scrip: ${scripCode} (${companyName})...`);

    const result = await retryWithBackoff(async (attempt) => {
      try {
        const response = await this.groq.chat.completions.create({
          model: config.groq.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 2000
        });

        const rawContent = response.choices[0]?.message?.content || '{}';
        let parsed;
        try {
          parsed = JSON.parse(rawContent);
        } catch (e) {
          const cleaned = rawContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
          parsed = JSON.parse(cleaned);
        }

        return {
          company_name: parsed.company_name || companyName,
          scrip_code: parsed.scrip_code || scripCode,
          category: parsed.category || announcement.Descriptor || announcement.TypeofAnnounce || 'Other',
          quick_view: {
            sentiment: ['Positive', 'Negative', 'Neutral', 'Mixed'].includes(parsed.quick_view?.sentiment)
              ? parsed.quick_view.sentiment
              : 'Neutral',
            materiality: ['High', 'Medium', 'Low'].includes(parsed.quick_view?.materiality)
              ? parsed.quick_view.materiality
              : 'Medium',
            headline_summary: parsed.quick_view?.headline_summary || announcement.HeadLine || '',
            key_numbers_short: parsed.quick_view?.key_numbers_short || 'N/A'
          },
          summary: parsed.summary || 'Summary unavailable.',
          key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
          key_numbers: Array.isArray(parsed.key_numbers) ? parsed.key_numbers : [],
          why_it_matters: parsed.why_it_matters || '',
          positive_factors: Array.isArray(parsed.positive_factors) ? parsed.positive_factors : [],
          risks_or_concerns: Array.isArray(parsed.risks_or_concerns) ? parsed.risks_or_concerns : [],
          missing_information: Array.isArray(parsed.missing_information) ? parsed.missing_information : [],
          important_dates: Array.isArray(parsed.important_dates) ? parsed.important_dates : [],
          ai_assessment: parsed.ai_assessment || '',
          confidence: {
            level: ['High', 'Medium', 'Low'].includes(parsed.confidence?.level) ? parsed.confidence.level : 'Medium',
            reason: parsed.confidence?.reason || ''
          },
          one_line_summary: parsed.one_line_summary || '',

          // Backward compatibility mappings for frontend
          companyName: parsed.company_name || companyName,
          scripCode: parsed.scrip_code || scripCode,
          materiality: parsed.quick_view?.materiality || 'Medium',
          sentiment: parsed.quick_view?.sentiment || 'Neutral',
          rawTextLength: rawTextLength,
          processedAt: new Date().toISOString()
        };
      } catch (err) {
        logger.error(`Groq API error on attempt ${attempt}: ${err.message}`);
        throw err;
      }
    }, {
      retries: 3,
      delayMs: 2000,
      factor: 2,
      name: `Groq LLM for ${scripCode}`
    });

    return result;
  }
}

export const llmService = new LlmService();
