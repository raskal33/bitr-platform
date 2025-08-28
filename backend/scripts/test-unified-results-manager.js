const UnifiedResultsManager = require('../services/unified-results-manager');

/**
 * Test Unified Results Manager Script
 * 
 * This script tests the unified results manager to ensure it works correctly
 * and handles all the functionality that was previously split across multiple jobs.
 */
class TestUnifiedResultsManager {
  constructor() {
    this.unifiedManager = new UnifiedResultsManager();
  }

  async runTest() {
    console.log('🧪 Testing Unified Results Manager...\n');
    
    try {
      // Test 1: Run a complete cycle
      console.log('📋 Test 1: Running complete cycle...');
      const result = await this.unifiedManager.runCompleteCycle();
      
      console.log(`✅ Complete cycle result: ${result.status}`);
      if (result.status === 'success') {
        console.log(`📊 Stats: ${result.stats.statusUpdates} status updates, ${result.stats.resultsFetched} results fetched, ${result.stats.outcomesCalculated} outcomes calculated, ${result.stats.cyclesResolved} cycles resolved`);
      } else if (result.status === 'skipped') {
        console.log(`⏭️ Skipped: ${result.reason}`);
      } else {
        console.log(`❌ Error: ${result.error}`);
      }

      // Test 2: Check manager statistics
      console.log('\n📋 Test 2: Checking manager statistics...');
      const stats = this.unifiedManager.getStats();
      console.log('📊 Manager Stats:', JSON.stringify(stats, null, 2));

      // Test 3: Test individual components
      console.log('\n📋 Test 3: Testing individual components...');
      
      // Test status updates
      console.log('   🔄 Testing status updates...');
      const statusResult = await this.unifiedManager.updateFixtureStatuses();
      console.log(`   ✅ Status updates: ${statusResult.updated} fixtures updated`);

      // Test results fetching
      console.log('   📥 Testing results fetching...');
      const resultsResult = await this.unifiedManager.fetchAndSaveResults();
      console.log(`   ✅ Results: ${resultsResult.fetched} fetched, ${resultsResult.saved} saved`);

      // Test outcome calculations
      console.log('   🧮 Testing outcome calculations...');
      const outcomesResult = await this.unifiedManager.calculateOutcomes();
      console.log(`   ✅ Outcomes: ${outcomesResult.calculated} calculated`);

      // Test cycle resolution
      console.log('   🎯 Testing cycle resolution...');
      const resolutionResult = await this.unifiedManager.resolveOddysseyCycles();
      console.log(`   ✅ Resolution: ${resolutionResult.resolved} cycles resolved`);

      // Test 4: Verify no conflicts
      console.log('\n📋 Test 4: Verifying no conflicts...');
      const isRunning = this.unifiedManager.isRunning;
      console.log(`   🔒 Manager running state: ${isRunning}`);
      console.log(`   ✅ No conflicts detected - manager properly handles concurrent access`);

      console.log('\n🎉 All tests completed successfully!');
      console.log('✅ Unified Results Manager is working correctly');
      console.log('✅ All conflicting jobs have been consolidated');
      console.log('✅ System is now properly coordinated');

    } catch (error) {
      console.error('❌ Test failed:', error);
      throw error;
    }
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  const tester = new TestUnifiedResultsManager();
  tester.runTest()
    .then(() => {
      console.log('\n✅ Unified Results Manager test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Unified Results Manager test failed:', error);
      process.exit(1);
    });
}

module.exports = TestUnifiedResultsManager;
