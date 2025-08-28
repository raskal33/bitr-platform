const cron = require('node-cron');
const OddysseyResultsResolver = require('../services/oddyssey-results-resolver');

class ResultsScheduler {
  constructor() {
    this.isRunning = false;
    this.resolver = null;
    this.resolutionJob = null;
  }

  /**
   * Start the results scheduler
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Results Scheduler is already running');
      return;
    }

    console.log('🚀 Starting Results Scheduler...');

    try {
      // Initialize the results resolver
      this.resolver = new OddysseyResultsResolver();
      
      // Schedule results resolution every 15 minutes
      this.scheduleResultsResolution();
      
      this.isRunning = true;
      console.log('✅ Results Scheduler started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start Results Scheduler:', error);
      throw error;
    }
  }

  /**
   * Stop the results scheduler
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Results Scheduler is not running');
      return;
    }

    if (this.resolutionJob) {
      this.resolutionJob.stop();
    }
    
    this.isRunning = false;
    console.log('🛑 Results Scheduler stopped');
  }

  /**
   * Schedule results resolution
   * Runs every 15 minutes to check for cycles that need resolution
   */
  scheduleResultsResolution() {
    // '*/15 * * * *' = Every 15 minutes
    this.resolutionJob = cron.schedule('*/15 * * * *', async () => {
      if (!this.isRunning) return;
      
      console.log('🔍 Running scheduled results resolution...');
      
      try {
        const results = await this.resolver.resolveAllPendingCycles();
        
        if (results.length === 0) {
          console.log('ℹ️ No cycles needed resolution');
        } else {
          console.log(`✅ Processed ${results.length} cycles`);
          
          // Log results summary
          const successful = results.filter(r => r.success).length;
          const failed = results.filter(r => !r.success).length;
          
          console.log(`   • Successful: ${successful}`);
          console.log(`   • Failed: ${failed}`);
          
          if (failed > 0) {
            console.log('❌ Failed cycles:');
            results.filter(r => !r.success).forEach(r => {
              console.log(`   - Cycle ${r.cycleId}: ${r.error}`);
            });
          }
        }
        
      } catch (error) {
        console.error('❌ Scheduled results resolution failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled results resolution every 15 minutes');
  }

  /**
   * Manual trigger for testing
   */
  async triggerTest() {
    console.log('🧪 Triggering manual results resolution test...');
    
    try {
      const results = await this.resolver.resolveAllPendingCycles();
      console.log(`✅ Manual test completed: ${results.length} cycles processed`);
      return results;
    } catch (error) {
      console.error('❌ Manual test failed:', error);
      throw error;
    }
  }

  /**
   * Get current status
   */
  async getStatus() {
    // Return 'healthy' if scheduler is running and has resolution job
    if (this.isRunning && this.resolutionJob) {
      return 'healthy';
    } else {
      return 'unhealthy';
    }
  }
}

// Create singleton instance
const resultsScheduler = new ResultsScheduler();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down Results Scheduler gracefully...');
  await resultsScheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down Results Scheduler gracefully...');
  await resultsScheduler.stop();
  process.exit(0);
});

// Export for use in other modules
module.exports = resultsScheduler;

// Start if run directly
if (require.main === module) {
  resultsScheduler.start().catch(error => {
    console.error('❌ Failed to start Results Scheduler:', error);
    process.exit(1);
  });
} 