#!/usr/bin/env node

/**
 * Test Cycle Monitor
 * 
 * Tests the cycle monitoring system to ensure it's working correctly
 */

require('dotenv').config();
const CycleMonitor = require('../services/cycle-monitor');

async function testCycleMonitor() {
  console.log('🧪 Testing Cycle Monitor...');
  
  const cycleMonitor = new CycleMonitor();
  
  try {
    // Test 1: Manual health check
    console.log('\n📋 Test 1: Manual Health Check');
    const healthCheck = await cycleMonitor.performCycleHealthCheck();
    console.log('✅ Health check completed');
    console.log(`   Status: ${healthCheck.status}`);
    console.log(`   Issues: ${healthCheck.issues.length}`);
    
    if (healthCheck.issues.length > 0) {
      console.log('\n   Issues found:');
      healthCheck.issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}`);
      });
    }

    // Test 2: Current cycle status
    console.log('\n📋 Test 2: Current Cycle Status');
    const currentStatus = await cycleMonitor.getCurrentCycleStatus();
    console.log('✅ Current cycle status retrieved');
    console.log(`   Status: ${currentStatus.status}`);
    if (currentStatus.cycleId) {
      console.log(`   Cycle ID: ${currentStatus.cycleId}`);
      console.log(`   Created: ${currentStatus.createdAt}`);
      console.log(`   Resolved: ${currentStatus.isResolved}`);
      console.log(`   Has Transaction: ${currentStatus.hasTransaction}`);
    }

    // Test 3: Missing cycles check
    console.log('\n📋 Test 3: Missing Cycles Check');
    const missingCycles = await cycleMonitor.checkForMissingCycles();
    console.log(`✅ Missing cycles check completed: ${missingCycles.length} missing cycles found`);
    
    if (missingCycles.length > 0) {
      missingCycles.forEach(cycle => {
        console.log(`   - Cycle ${cycle.cycleId} (expected: ${cycle.expectedDate})`);
      });
    }

    // Test 4: Off-schedule creation check
    console.log('\n📋 Test 4: Off-Schedule Creation Check');
    const offScheduleCycles = await cycleMonitor.checkOffScheduleCreation();
    console.log(`✅ Off-schedule check completed: ${offScheduleCycles.length} off-schedule cycles found`);
    
    if (offScheduleCycles.length > 0) {
      offScheduleCycles.forEach(cycle => {
        console.log(`   - Cycle ${cycle.cycleId} created at ${cycle.hourCreated}:${cycle.minuteCreated} UTC on ${cycle.dateCreated}`);
      });
    }

    // Test 5: Failed transactions check
    console.log('\n📋 Test 5: Failed Transactions Check');
    const failedTransactions = await cycleMonitor.checkFailedTransactions();
    console.log(`✅ Failed transactions check completed: ${failedTransactions.length} cycles without transaction hashes`);
    
    if (failedTransactions.length > 0) {
      failedTransactions.forEach(cycle => {
        console.log(`   - Cycle ${cycle.cycleId} created at ${cycle.createdAt} (no tx hash)`);
      });
    }

    // Test 6: Delayed resolutions check
    console.log('\n📋 Test 6: Delayed Resolutions Check');
    const delayedResolutions = await cycleMonitor.checkDelayedResolutions();
    console.log(`✅ Delayed resolutions check completed: ${delayedResolutions.length} cycles with delayed resolution`);
    
    if (delayedResolutions.length > 0) {
      delayedResolutions.forEach(cycle => {
        console.log(`   - Cycle ${cycle.cycleId} delayed by ${cycle.delayHours} hours`);
      });
    }

    // Test 7: Recent failures check
    console.log('\n📋 Test 7: Recent Failures Check');
    const recentFailures = await cycleMonitor.checkRecentFailures();
    console.log('✅ Recent failures check completed');
    
    if (recentFailures) {
      console.log(`   - Issue: ${recentFailures.issue}`);
      console.log(`   - Date: ${recentFailures.date}`);
      console.log(`   - Expected: ${recentFailures.expectedTime}`);
    } else {
      console.log('   - No recent failures detected');
    }

    console.log('\n🎉 All tests completed successfully!');
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log(`   Overall Status: ${healthCheck.status}`);
    console.log(`   Total Issues: ${healthCheck.issues.length}`);
    console.log(`   Missing Cycles: ${missingCycles.length}`);
    console.log(`   Off-Schedule: ${offScheduleCycles.length}`);
    console.log(`   Failed Transactions: ${failedTransactions.length}`);
    console.log(`   Delayed Resolutions: ${delayedResolutions.length}`);
    console.log(`   Recent Failures: ${recentFailures ? 1 : 0}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run test if called directly
if (require.main === module) {
  testCycleMonitor()
    .then(() => {
      console.log('\n✅ Cycle monitor test completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Cycle monitor test failed:', error);
      process.exit(1);
    });
}

module.exports = testCycleMonitor;
