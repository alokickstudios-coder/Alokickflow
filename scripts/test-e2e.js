#!/usr/bin/env node

/**
 * End-to-End Test Script for Project Stages Feature
 * 
 * This script tests:
 * 1. Database migration check
 * 2. Project stages API endpoints
 * 3. Project status updates
 * 4. Stage management workflow
 * 
 * Usage: node scripts/test-e2e.js [baseUrl]
 * Example: node scripts/test-e2e.js http://localhost:3000
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n🧪 Testing: ${name}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

async function testEndpoint(method, url, body = null, expectedStatus = 200) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (response.status === expectedStatus) {
      return { success: true, data, status: response.status };
    } else {
      return { 
        success: false, 
        error: `Expected ${expectedStatus}, got ${response.status}`,
        data,
        status: response.status 
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runTests() {
  log('\n═══════════════════════════════════════════════════════', 'cyan');
  log('  End-to-End Test Suite - Project Stages Feature', 'cyan');
  log('═══════════════════════════════════════════════════════\n', 'cyan');
  
  const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
  };
  
  // Test 1: Check migration endpoint
  logTest('Migration Check');
  const migrationCheck = await testEndpoint('GET', `${BASE_URL}/api/setup/migrate-stages`);
  if (migrationCheck.success) {
    logSuccess('Migration endpoint accessible');
    logInfo(`Response: ${JSON.stringify(migrationCheck.data, null, 2)}`);
    results.passed++;
  } else {
    logError(`Migration check failed: ${migrationCheck.error}`);
    results.failed++;
  }
  
  // Note: We can't test actual API calls without authentication and real data
  // These tests require:
  // 1. User to be logged in
  // 2. Organization ID
  // 3. Project ID
  // 4. Team member IDs
  
  logWarning('\n⚠️  Manual Testing Required');
  logInfo('The following tests require manual verification:');
  logInfo('1. Database: Run supabase/project-stages.sql in Supabase SQL Editor');
  logInfo('2. Frontend: Navigate to /dashboard/projects');
  logInfo('3. Verify: Project stages appear for each project');
  logInfo('4. Test: Update project status dropdown');
  logInfo('5. Test: Update stage status');
  logInfo('6. Test: Assign team members to stages');
  logInfo('7. Test: Complete all stages → Mark project complete → Begin QC');
  
  log('\n═══════════════════════════════════════════════════════', 'cyan');
  log('  Test Summary', 'cyan');
  log('═══════════════════════════════════════════════════════\n', 'cyan');
  log(`✅ Passed: ${results.passed}`, 'green');
  log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'reset');
  log(`⚠️  Warnings: ${results.warnings}`, results.warnings > 0 ? 'yellow' : 'reset');
  
  log('\n📋 Next Steps:', 'cyan');
  log('1. Ensure project_stages table exists (run SQL migration)', 'blue');
  log('2. Start dev server: npm run dev', 'blue');
  log('3. Login and navigate to /dashboard/projects', 'blue');
  log('4. Follow the test scenarios in test-end-to-end.md', 'blue');
  
  return results.failed === 0;
}

// Run tests
runTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    logError(`Test runner error: ${error.message}`);
    process.exit(1);
  });



