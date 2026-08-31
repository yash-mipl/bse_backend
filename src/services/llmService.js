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
   * Build category-specific prompt instructions based on announcement descriptor
   */
  getCategoryInstructions(descriptor = '', announceType = '') {
    const descLower = (descriptor || '').toLowerCase();
    const typeLower = (announceType || '').toLowerCase();

    if (descLower.includes('book closure') || descLower.includes('record date')) {
      return `CATEGORY: Book Closure / Record Date Intimation
SPECIAL INSTRUCTIONS:
- Extract Book Closure start date and end date (and whether both days are inclusive).
- Extract Record Date / Cut-off date for voting or dividend eligibility if specified.
- Identify the explicit purpose (e.g. 32nd Annual General Meeting, Dividend payment, Rights issue).
- Highlight whether e-voting dates or AGM dates are specified.`;
    }

    if (descLower.includes('outcome') || typeLower.includes('outcome') || descLower.includes('board meeting')) {
      return `CATEGORY: Board Meeting Outcome
SPECIAL INSTRUCTIONS:
- Extract all formal decisions, approvals, and resolutions passed by the board.
- Extract any declared dividend (rate, face value, percentage, record date).
- Extract any capital restructuring, fundraising, bonus issue, or stock split.
- Extract appointments, resignations, or changes in Key Managerial Personnel (KMP) / Directors.
- Note meeting start time and conclusion time if listed.`;
    }

    if (descLower.includes('financial result') || descLower.includes('results') || descLower.includes('quarterly')) {
      return `CATEGORY: Financial Results / Earnings
SPECIAL INSTRUCTIONS:
- Extract key financial metrics (Total Income/Revenue, EBITDA, Net Profit/PAT, EPS) for the current period vs previous period/YoY.
- Mention whether results are Audited or Unaudited, Standalone or Consolidated.
- Highlight any exceptional items, qualifications, or modifications in Auditor's Report.`;
    }

    if (descLower.includes('general meeting') || descLower.includes('agm') || descLower.includes('egm')) {
      return `CATEGORY: General Meeting (AGM/EGM) Notice & Proceedings
SPECIAL INSTRUCTIONS:
- Extract Date, Time, and Venue/Mode (VC/OAVM) of the General Meeting.
- Extract cut-off date for remote e-voting and voting window (start date/time to end date/time).
- List key agenda items / special resolutions being proposed.`;
    }

    return `CATEGORY: General Corporate Announcement
SPECIAL INSTRUCTIONS:
- Extract core business intent, obligations, statutory compliances, or material events.
- Highlight any operational, commercial, regulatory, or strategic implications.`;
  }

  /**
   * Generate structured summary and insights using Groq LLM
   */
  async analyzeAnnouncement(announcement, contextText, rawTextLength = 0) {
    const descriptor = announcement.Descriptor || '';
    const typeofAnnounce = announcement.TypeofAnnounce || '';
    const categoryInstructions = this.getCategoryInstructions(descriptor, typeofAnnounce);

    const systemPrompt = `You are a senior financial analyst and compliance expert specializing in Indian stock exchanges (BSE/NSE) and SEBI (Listing Obligations and Disclosure Requirements) Regulations.

Your objective is to analyze corporate filing announcements and attached PDF document excerpts, and produce concise, highly accurate, and structured insights.

Always respond in strictly valid JSON matching the exact schema required. Do NOT include markdown code blocks (such as \`\`\`json) in your final response if possible, or provide clean pure JSON.`;

    const userPrompt = `ANNOUNCEMENT METADATA:
- Scrip Code: ${announcement.SCRIP_CD || 'N/A'}
- Company Name: ${announcement.CompanyName || 'N/A'}
- Announcement Date/Time: ${announcement.DT_TM || 'N/A'}
- Headline: ${announcement.HeadLine || 'N/A'}
- News Body: ${announcement.NewsBody || 'N/A'}
- Descriptor: ${announcement.Descriptor || 'N/A'}
- Announcement Type: ${announcement.TypeofAnnounce || 'N/A'}
- Meeting Date: ${announcement.DateofMeeting || 'N/A'}

${categoryInstructions}

RETRIEVED FILING DOCUMENT EXCERPTS:
"""
${contextText || announcement.NewsBody || 'No filing document text available.'}
"""

Please extract and structure the information into the following JSON schema:
{
  "scripCode": "${announcement.SCRIP_CD || ''}",
  "companyName": "${announcement.CompanyName || ''}",
  "announcementType": "${announcement.TypeofAnnounce || announcement.Descriptor || 'General'}",
  "summary": "A 2-3 line plain-English summary highlighting the core action and purpose.",
  "keyPoints": [
    "Key resolution, fact, decision, or regulation reference",
    "Specific details from the document"
  ],
  "importantDates": [
    "Specific date mentioned in filing with its label, e.g., 'Book Closure: 19th Sep 2026 to 25th Sep 2026'"
  ],
  "materiality": "Low | Medium | High",
  "materialityReasoning": "1-line explanation of why this is Low (routine compliance), Medium (moderate operational update), or High (price-sensitive/major event).",
  "categorySpecificDetails": {
    "descriptor": "${announcement.Descriptor || ''}",
    "extractedDetails": {}
  }
}`;

    logger.info(`Sending analysis request to Groq LLM (Model: ${config.groq.model}) for scrip: ${announcement.SCRIP_CD}...`);

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
          max_tokens: 1500
        });

        const rawContent = response.choices[0]?.message?.content || '{}';
        let parsed;
        try {
          parsed = JSON.parse(rawContent);
        } catch (e) {
          // If JSON wrapped in backticks, clean it
          const cleaned = rawContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
          parsed = JSON.parse(cleaned);
        }

        return {
          scripCode: parsed.scripCode || announcement.SCRIP_CD || '',
          companyName: parsed.companyName || announcement.CompanyName || '',
          announcementType: parsed.announcementType || announcement.TypeofAnnounce || announcement.Descriptor || 'General',
          summary: parsed.summary || 'Summary unavailable.',
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
          importantDates: Array.isArray(parsed.importantDates) ? parsed.importantDates : [],
          materiality: ['Low', 'Medium', 'High'].includes(parsed.materiality) ? parsed.materiality : 'Medium',
          materialityReasoning: parsed.materialityReasoning || '',
          categorySpecificDetails: parsed.categorySpecificDetails || {},
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
      name: `Groq LLM for ${announcement.SCRIP_CD}`
    });

    return result;
  }
}

export const llmService = new LlmService();
