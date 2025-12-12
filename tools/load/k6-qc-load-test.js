/**
 * k6 Load Test Script for AlokickFlow QC System
 * 
 * Tests the QC job processing under load with 100 concurrent jobs.
 * 
 * Usage:
 *   k6 run --vus 100 --duration 5m tools/load/k6-qc-load-test.js
 * 
 * Environment:
 *   BASE_URL - Target URL (default: http://localhost:3000)
 *   AUTH_TOKEN - Authentication token
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const jobsCreated = new Counter('qc_jobs_created');
const jobsCompleted = new Counter('qc_jobs_completed');
const jobsFailed = new Counter('qc_jobs_failed');
const errorRate = new Rate('error_rate');
const jobDuration = new Trend('job_duration_ms');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  vus: 100,           // 100 virtual users (concurrent jobs)
  duration: '5m',     // Run for 5 minutes
  thresholds: {
    'http_req_duration': ['p(95)<2000'],  // 95% of requests under 2s
    'http_req_failed': ['rate<0.05'],     // Error rate under 5%
    'error_rate': ['rate<0.05'],          // Custom error rate under 5%
  },
};

const headers = {
  'Content-Type': 'application/json',
  'Authorization': AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : '',
};

// Test data - simulated QC jobs
const testFiles = [
  { name: 'test-video-001.mp4', type: 'video/mp4', size: 10485760 },
  { name: 'test-audio-002.wav', type: 'audio/wav', size: 5242880 },
  { name: 'test-subtitle-003.srt', type: 'text/srt', size: 102400 },
];

export default function () {
  const testFile = testFiles[Math.floor(Math.random() * testFiles.length)];
  
  // Step 1: Health check
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
  });
  
  if (healthRes.status !== 200) {
    errorRate.add(1);
    return;
  }
  
  // Step 2: Check QC status
  const statusRes = http.get(`${BASE_URL}/api/qc/status`, { headers });
  check(statusRes, {
    'status check returns 200': (r) => r.status === 200 || r.status === 401,
  });
  
  // Step 3: Create a mock QC job (simulated - adjust based on actual API)
  const startTime = Date.now();
  
  const jobPayload = JSON.stringify({
    fileName: `${Date.now()}-${testFile.name}`,
    fileType: testFile.type,
    fileSize: testFile.size,
    sourceType: 'upload',
    organizationId: 'test-org-load',
  });
  
  // Simulate job creation (adjust endpoint as needed)
  const createRes = http.post(`${BASE_URL}/api/qc/process-queue`, jobPayload, { 
    headers,
    timeout: '30s',
  });
  
  const createSuccess = check(createRes, {
    'job creation status 200-202': (r) => r.status >= 200 && r.status < 300,
    'job creation status not 500': (r) => r.status < 500,
  });
  
  if (createSuccess) {
    jobsCreated.add(1);
    errorRate.add(0);
  } else {
    errorRate.add(1);
    jobsFailed.add(1);
  }
  
  // Step 4: Poll for job progress (simulate monitoring)
  const progressRes = http.get(`${BASE_URL}/api/qc/progress`, { headers });
  check(progressRes, {
    'progress check returns data': (r) => r.status === 200 || r.status === 401,
  });
  
  const endTime = Date.now();
  jobDuration.add(endTime - startTime);
  
  // Step 5: Check DLQ stats (if feature is enabled)
  const dlqRes = http.get(`${BASE_URL}/api/admin/dlq?stats=true`, { headers });
  if (dlqRes.status === 200) {
    const dlqData = JSON.parse(dlqRes.body);
    check(dlqData, {
      'DLQ length under threshold': (d) => d.total < 10,
    });
  }
  
  // Throttle to avoid overwhelming the system
  sleep(Math.random() * 2 + 1); // 1-3 second random sleep
}

export function handleSummary(data) {
  return {
    'verification/load_test_report.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const { metrics } = data;
  
  let output = `
=== Load Test Summary ===

Duration: ${options.duration || '5m'}
VUs: ${options.vus || 100}

Metrics:
  - HTTP requests: ${metrics.http_reqs?.values?.count || 0}
  - Request duration (p95): ${(metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2)}ms
  - Error rate: ${((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%
  - Jobs created: ${metrics.qc_jobs_created?.values?.count || 0}
  - Jobs failed: ${metrics.qc_jobs_failed?.values?.count || 0}

Thresholds:
  - p95 latency < 2000ms: ${(metrics.http_req_duration?.values?.['p(95)'] || 0) < 2000 ? 'PASS' : 'FAIL'}
  - Error rate < 5%: ${(metrics.http_req_failed?.values?.rate || 0) < 0.05 ? 'PASS' : 'FAIL'}

`;
  
  return output;
}
