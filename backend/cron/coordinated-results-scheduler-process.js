require('dotenv').config({ path: '../.env' });
const CoordinatedResultsScheduler = require('./coordinated-results-scheduler');

async function runCoordinatedResultsScheduler() {
  console.log('🚀 Starting Coordinated Results Scheduler (Unified)...');
  
  try {
    const scheduler = new CoordinatedResultsScheduler();
    
    // Start the scheduler
    await scheduler.start();
    
    console.log('✅ Coordinated Results Scheduler started successfully');
    console.log('📅 Unified system handles:');
    console.log('   • Results fetching every 30 minutes');
    console.log('   • Results resolution every 15 minutes');
    console.log('   • Coordinated execution to prevent conflicts');
    
    // Keep the process alive for a short time to complete the operation
    setTimeout(() => {
      console.log('✅ Coordinated Results Scheduler completed');
      process.exit(0);
    }, 5 * 60 * 1000); // 5 minutes timeout
    
  } catch (error) {
    console.error('❌ Coordinated Results Scheduler failed:', error);
    process.exit(1);
  }
}

// Run the unified scheduler
runCoordinatedResultsScheduler();
