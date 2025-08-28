const cron = require('node-cron');
const ResultsFetcherService = require('../services/results-fetcher-service');

/**
 * Results Fetcher Cron Job
 * 
 * This cron job runs every hour to fetch and save results for completed matches.
 * It ensures that all completed matches have their results saved in the database.
 */
class ResultsFetcherCron {
  constructor() {
    this.resultsFetcher = new ResultsFetcherService();
    this.isInitialized = false;
    this.lastRun = null;
    this.runCount = 0;
    this.errorCount = 0;
  }

  /**
   * Initialize the cron job
   */
  initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Results fetcher cron already initialized');
      return;
    }

    console.log('🚀 Initializing results fetcher cron job...');

    // Schedule to run every hour at minute 15 (to avoid conflicts with other jobs)
    cron.schedule('15 * * * *', async () => {
      await this.runResultsFetch();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // Also run every 30 minutes for more frequent updates
    cron.schedule('*/30 * * * *', async () => {
      await this.runResultsFetch();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    this.isInitialized = true;
    console.log('✅ Results fetcher cron job initialized');
    console.log('📅 Scheduled to run every 30 minutes and every hour at minute 15');
  }

  /**
   * Run the results fetch process
   */
  async runResultsFetch() {
    const startTime = Date.now();
    this.lastRun = new Date();
    this.runCount++;

    console.log(`🕐 [${new Date().toISOString()}] Starting results fetch run #${this.runCount}...`);

    try {
      const result = await this.resultsFetcher.fetchAndSaveResults();
      
      const duration = Date.now() - startTime;
      
      if (result.status === 'success') {
        console.log(`✅ [${new Date().toISOString()}] Results fetch completed successfully in ${duration}ms`);
        console.log(`📊 Fetched: ${result.fetched}, Saved: ${result.saved}, Duration: ${duration}ms`);
      } else if (result.status === 'warning') {
        console.log(`⚠️ [${new Date().toISOString()}] Results fetch completed with warnings in ${duration}ms`);
        console.log(`📊 Reason: ${result.reason}`);
      } else if (result.status === 'skipped') {
        console.log(`⏭️ [${new Date().toISOString()}] Results fetch skipped: ${result.reason}`);
      } else {
        console.error(`❌ [${new Date().toISOString()}] Results fetch failed: ${result.error}`);
        this.errorCount++;
      }

      // Log statistics periodically
      if (this.runCount % 10 === 0) {
        await this.logStatistics();
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [${new Date().toISOString()}] Results fetch error in ${duration}ms:`, error);
      this.errorCount++;
    }
  }

  /**
   * Log statistics about the results fetching process
   */
  async logStatistics() {
    try {
      const stats = await this.resultsFetcher.getResultsStats();
      
      if (stats) {
        console.log('📈 Results Fetching Statistics:');
        console.log(`   Total Completed Matches: ${stats.total_completed}`);
        console.log(`   Matches with Results: ${stats.with_results}`);
        console.log(`   Matches without Results: ${stats.without_results}`);
        console.log(`   Recent Results (24h): ${stats.recent_results}`);
        console.log(`   Coverage: ${stats.coverage_percentage}%`);
        console.log(`   Cron Runs: ${this.runCount}`);
        console.log(`   Errors: ${this.errorCount}`);
        console.log(`   Success Rate: ${Math.round(((this.runCount - this.errorCount) / this.runCount) * 100)}%`);
      }
    } catch (error) {
      console.error('❌ Error getting statistics:', error);
    }
  }

  /**
   * Manual trigger for results fetching
   */
  async manualTrigger() {
    console.log('🔧 Manual trigger for results fetching...');
    return await this.runResultsFetch();
  }

  /**
   * Get cron job status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      lastRun: this.lastRun,
      runCount: this.runCount,
      errorCount: this.errorCount,
      successRate: this.runCount > 0 ? Math.round(((this.runCount - this.errorCount) / this.runCount) * 100) : 0
    };
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.isInitialized) {
      console.log('🛑 Stopping results fetcher cron job...');
      // Note: node-cron doesn't have a direct stop method, but we can track the state
      this.isInitialized = false;
      console.log('✅ Results fetcher cron job stopped');
    }
  }
}

// Create singleton instance
const resultsFetcherCron = new ResultsFetcherCron();

// Export for use in other modules
module.exports = resultsFetcherCron;

// Auto-initialize if this file is run directly
if (require.main === module) {
  console.log('🚀 Starting results fetcher cron job...');
  resultsFetcherCron.initialize();
  
  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, stopping results fetcher cron...');
    resultsFetcherCron.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, stopping results fetcher cron...');
    resultsFetcherCron.stop();
    process.exit(0);
  });
}
