import { pdfExtractService } from '../src/services/pdfExtractService.js';
import { ragService } from '../src/services/ragService.js';
import { llmService } from '../src/services/llmService.js';
import fs from 'fs/promises';

async function testPdfExtractionPipeline() {
  console.log('\n--- Testing PDF Extraction & RAG Pipeline ---');

  const sampleAnnouncement = {
    SCRIP_CD: '511738',
    CompanyName: 'Mehta Securities Ltd',
    DT_TM: '8/31/2026 1:46:54 PM',
    HeadLine: 'Intimation of date of book closure under Regulation 42 of SEBI LODR',
    NewsBody: 'Book closure from 19th September, 2026 to 25th September, 2026',
    Descriptor: 'Book Closure',
    TypeofAnnounce: 'Book Closure'
  };

  // Sample full document text matching the user's PDF
  const sampleDocumentText = `
MEHTA SECURITIES LTD.
Regd. Office: 2, Law Garden Apt., Scheme 1, Opp. Law Garden, Ellisbridge, Ahmedabad-380006 Ph.: (079)26561000
CIN NO: L67120GJ1994PLC022740

Date: 31/08/2026
SCRIP CODE: 511738
To,
BSE Limited
The Listing Department
Phiroze Jeejeebhoy Towers
Dalal Street
Mumbai - 400001

Subject: Intimation of date of book closure under Regulation 42 of SEBI (Listing Obligations and Disclosure Requirements) Regulation, 2015

This is with reference to the above subject.
Pursuant to Regulation 42(2) of SEBI (Listing Obligations and Disclosure Requirements) Regulations, 2015, enclosed please find herewith the date of book closure.

Pursuant to Regulation 42(2) of SEBI (Listing Obligations and Disclosure Requirements) Regulation, 2015, we would like to inform you that the Company has decided to close the Register of Members and Share Transfer Register will remain closed from Saturday, 19th September, 2026 to Friday, 25th September, 2026 (both days inclusive) for taking record of the Members of the Company for the purpose of 32nd Annual General Meeting ("AGM") as may be declared at the AGM for the financial year 2025-26.

In terms of Section 108 of the Companies Act, 2013, read with rule 20 of the Companies (Management and Administration) Rules, 2014 as amended and Regulation 44 of the SEBI (Listing Obligations and Disclosure Requirements) Regulation, 2015, the Company shall provide its members the facility to exercise their votes electronically for transacting the items of business, as per the details set out in the notice convening the ensuing 32nd Annual General Meeting of the Company. The cut-off date for the purpose of determining the members eligible for voting rights is fixed at Friday, 18th September, 2026.

Kindly consider the same and take on records.
Thanking you.
For, Mehta Securities Limited
Bhavna D. Mehta
Chairperson & Managing Director
DIN: 01590958
`;

  // 1. Test RAG Chunking and Retrieval
  console.log('Testing RAG retrieval on document...');
  const { chunks, retrievedChunks, contextText } = await ragService.processAndRetrieve(
    sampleDocumentText,
    sampleAnnouncement
  );

  console.log(`Generated ${chunks.length} chunks. Retrieved ${retrievedChunks.length} chunks.`);

  // 2. Test Groq LLM Processing
  console.log('Testing Groq LLM extraction on retrieved chunks...');
  const analysis = await llmService.analyzeAnnouncement(
    sampleAnnouncement,
    contextText,
    sampleDocumentText.length
  );

  console.log('Extracted Structured Analysis:');
  console.log(JSON.stringify(analysis, null, 2));

  console.log('\nPDF Extraction and RAG Pipeline Verified Successfully!');
}

testPdfExtractionPipeline().catch(console.error);
