const OddysseyManager = require('./services/oddyssey-manager');
const oddysseyScheduler = require('./cron/oddyssey-scheduler');

async function triggerManualCycle() {
  try {
    console.log('🔧 Manually triggering Oddyssey cycle...');
    
    // Initialize the manager
    const oddysseyManager = new OddysseyManager();
    await oddysseyManager.initialize();
    
    // Check if we can start a cycle
    const matches = await oddysseyManager.getDailyMatches();
    console.log(`📊 Found ${matches.length} matches for today`);
    
    if (matches.length < 10) {
      console.error(`❌ Not enough matches (${matches.length}/10) to start a cycle`);
      console.log('💡 This might be due to:');
      console.log('   - No matches after 10:30 AM UTC');
      console.log('   - No real odds available');
      console.log('   - Fixtures not fetched yet');
      return;
    }
    
    // Start the cycle
    console.log('🚀 Starting manual cycle...');
    const result = await oddysseyManager.startDailyCycle();
    
    console.log('✅ Manual cycle started successfully!');
    console.log('📊 Result:', result);
    
  } catch (error) {
    console.error('❌ Failed to trigger manual cycle:', error);
    throw error;
  }
}

// Check command line arguments
const action = process.argv[2];

if (action === 'trigger') {
  triggerManualCycle()
    .then(() => {
      console.log('🎯 Manual cycle trigger complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Manual cycle trigger failed:', error);
      process.exit(1);
    });
} else {
  console.log('🔧 Oddyssey Manual Cycle Trigger');
  console.log('');
  console.log('Usage:');
  console.log('  node manual-cycle-trigger.js trigger  - Start a manual cycle');
  console.log('');
  console.log('Note: This should only be used for testing. Production cycles');
        console.log('are managed automatically by the cron scheduler at 00:05 UTC.');
} 