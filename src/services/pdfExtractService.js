import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import { logger } from '../utils/logger.js';

export class PdfExtractService {
  /**
   * Extract text from PDF buffer with automatic OCR fallback.
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<{ text: string, numPages: number, method: 'native' | 'ocr', info: any }>}
   */
  async extractText(pdfBuffer) {
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      throw new Error('Invalid PDF buffer provided for extraction');
    }

    try {
      // Step 1: Attempt native digital text extraction via pdf-parse
      logger.info('Attempting native PDF text extraction with pdf-parse...');
      const parseResult = await pdfParse(pdfBuffer, {
        max: 0, // Extract all pages
      });

      const extractedText = (parseResult.text || '').trim();
      const numPages = parseResult.numpages || 1;

      // Quality evaluation: Check if extracted text is substantial
      // Many BSE scanned PDFs return 0 characters or only a few whitespace/garbage characters
      const cleanChars = extractedText.replace(/\s+/g, '');
      const isSufficientText = cleanChars.length >= 80;

      if (isSufficientText) {
        logger.info(`Native extraction succeeded: ${extractedText.length} characters extracted from ${numPages} page(s).`);
        return {
          text: extractedText,
          numPages,
          method: 'native',
          info: parseResult.info || {}
        };
      }

      logger.warn(`Native text extraction yielded only ${cleanChars.length} characters. Triggering OCR fallback...`);
      const ocrText = await this.performOcr(pdfBuffer, numPages);

      return {
        text: ocrText.trim() || extractedText,
        numPages,
        method: 'ocr',
        info: parseResult.info || {}
      };

    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('password')) {
        throw new Error('PDF is password protected and cannot be extracted');
      }

      logger.warn(`pdf-parse failed (${err.message}). Attempting OCR fallback directly...`);
      try {
        const ocrText = await this.performOcr(pdfBuffer, 1);
        return {
          text: ocrText.trim(),
          numPages: 1,
          method: 'ocr',
          info: {}
        };
      } catch (ocrErr) {
        throw new Error(`Failed to extract text from PDF: ${err.message}. OCR error: ${ocrErr.message}`);
      }
    }
  }

  /**
   * Run OCR on PDF content using Tesseract.js
   * @param {Buffer} pdfBuffer 
   * @param {number} numPages 
   * @returns {Promise<string>}
   */
  async performOcr(pdfBuffer, numPages = 1) {
    logger.info(`Starting Tesseract OCR process for document...`);
    let worker = null;
    try {
      worker = await createWorker('eng');
      // Pass the buffer directly to tesseract
      const { data } = await worker.recognize(pdfBuffer);
      logger.info(`OCR extraction completed. Extracted ${data.text ? data.text.length : 0} characters.`);
      return data.text || '';
    } catch (err) {
      logger.error(`OCR processing failed: ${err.message}`);
      // Return empty string on OCR failure rather than crashing if we had partial text
      return '';
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
    }
  }
}

export const pdfExtractService = new PdfExtractService();
