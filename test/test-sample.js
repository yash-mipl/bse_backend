import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const API_BASE = 'http://localhost:8000';

async function runTests() {
  console.log('\n--- Starting BSE Announcement Analyzer Verification ---\n');

  try {
    // Test 1: Health Endpoint
    console.log('[1/5] Testing GET /health ...');
    const healthRes = await axios.get(`${API_BASE}/health`);
    console.log('Health Status:', healthRes.data);

    // Test 2: Process Single Announcement (Mehta Securities Book Closure)
    console.log('\n[2/5] Testing POST /api/announcements/analyze (Single Book Closure)...');
    const sampleData = JSON.parse(await fs.readFile('./sample_data/sample_announcements.json', 'utf-8'));
    const singleAnnouncement = sampleData[0];

    const singleRes = await axios.post(`${API_BASE}/api/announcements/analyze`, singleAnnouncement);
    console.log('Single Analysis Result:');
    console.log(JSON.stringify(singleRes.data, null, 2));

    // Test 3: Process Batch Announcements
    console.log('\n[3/5] Testing POST /api/announcements/analyze-batch (Batch Analysis)...');
    const batchRes = await axios.post(`${API_BASE}/api/announcements/analyze-batch`, sampleData);
    console.log(`Batch processed: ${batchRes.data.successfulCount}/${batchRes.data.total} successful`);
    console.log('Sample Batch Item 2:');
    console.log(JSON.stringify(batchRes.data.results[1], null, 2));

    // Test 4: Queue Async Processing
    console.log('\n[4/5] Testing POST /api/announcements/queue (Async BullMQ/Worker Queue)...');
    const queueRes = await axios.post(`${API_BASE}/api/announcements/queue`, singleAnnouncement);
    console.log('Queue Response:', queueRes.data);

    // Wait 2 seconds for worker to process
    console.log('Waiting for queue worker to finish job...');
    await new Promise((r) => setTimeout(r, 3000));

    const jobStatusRes = await axios.get(`${API_BASE}/api/announcements/jobs/${queueRes.data.jobId}`);
    console.log('Job Status Response:');
    console.log(JSON.stringify(jobStatusRes.data, null, 2));

    // Test 5: Historical Query
    console.log('\n[5/5] Testing GET /api/announcements/history (Persistence Query)...');
    const historyRes = await axios.get(`${API_BASE}/api/announcements/history?scripCode=511738`);
    console.log(`History records found for Scrip 511738: ${historyRes.data.total}`);

    console.log('\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! \n');
  } catch (err) {
    console.error('Test failed with error:', err.response?.data || err.message);
    process.exit(1);
  }
}

runTests();
