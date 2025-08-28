const cron = require('node-cron');
const SportMonksService = require('../services/sportmonks');

/**
 * Fixture Status Updater Cron Job
 * 
 * This cron job runs every 10 minutes to update fixture status for live matches.
 * It ensures that fixture status is updated independently of results fetching.
 */
class FixtureStatusUpdaterCron {
  constructor() {
    this.sportMonksService = new SportMonksService();
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
      console.log('⚠️ Fixture status updater cron already initialized');
      return;
    }

    console.log('🚀 Initializing fixture status updater cron job...');

    // Schedule to run every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
      await this.runStatusUpdate();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    this.isInitialized = true;
    console.log('✅ Fixture status updater cron job initialized');
    console.log('📅 Scheduled to run every 10 minutes');
  }

  /**
   * Run the fixture status update process
   */
  async runStatusUpdate() {
    const startTime = Date.now();
    
    try {
      console.log('🔄 Starting fixture status update...');
      
      const result = await this.sportMonksService.updateFixtureStatus();
      
      const duration = Date.now() - startTime;
      this.runCount++;
      
      console.log(`✅ Fixture status update completed in ${duration}ms: ${result.updated} fixtures updated`);
      
      // Log successful operation
      await this.logOperation('status_update', result.updated, true, duration);
      
    } catch (error) {
      console.error('❌ Error in fixture status update:', error);
      this.errorCount++;
      
      // Log failed operation
      await this.logOperation('status_update', 0, false, Date.now() - startTime, error.message);
    }
  }

  /**
   * Log operation to database for monitoring
   */
  async logOperation(operationType, fixtureCount, success, processingTimeMs, errorMessage = null) {
    try {
      const db = require('../db/db');
      await db.query(`
        INSERT INTO oracle.results_fetching_logs (
          operation_type, fixture_count, success, processing_time_ms, error_message
        ) VALUES ($1, $2, $3, $4, $5)
      `, [operationType, fixtureCount, success, processingTimeMs, errorMessage]);
    } catch (error) {
      console.error('Failed to log operation:', error);
    }
  }

  /**
   * Get statistics about the cron job
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      lastRun: this.lastRun,
      runCount: this.runCount,
      errorCount: this.errorCount,
      successRate: this.runCount > 0 ? ((this.runCount - this.errorCount) / this.runCount * 100).toFixed(2) : 0
    };
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.isInitialized) {
      console.log('🛑 Stopping fixture status updater cron job...');
      this.isInitialized = false;
      console.log('✅ Fixture status updater cron job stopped');
    }
  }
}

// Create singleton instance
const fixtureStatusUpdaterCron = new FixtureStatusUpdaterCron();

// Export for use in other modules
module.exports = fixtureStatusUpdaterCron;

// Auto-initialize if this file is run directly
if (require.main === module) {
  console.log('🚀 Starting fixture status updater cron job...');
  fixtureStatusUpdaterCron.initialize();
  
  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, stopping fixture status updater cron...');
    fixtureStatusUpdaterCron.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, stopping fixture status updater cron...');
    fixtureStatusUpdaterCron.stop();
    process.exit(0);
  });
}
