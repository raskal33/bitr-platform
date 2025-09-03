const cron = require('node-cron');
const ReputationSyncService = require('../services/reputation-sync-service');

/**
 * Reputation Sync Cron Job
 * Synchronizes reputation data and calculates user rankings
 */
class ReputationSyncCron {
  constructor() {
    this.reputationService = new ReputationSyncService();
    this.isRunning = false;
  }

  /**
   * Start reputation sync cron jobs
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Reputation sync cron is already running');
      return;
    }

    console.log('🏆 Starting reputation sync cron jobs...');

    // Sync reputation data every hour
    cron.schedule('0 * * * *', async () => {
      await this.syncReputationData();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Calculate rankings every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      await this.calculateRankings();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    // Daily reputation cleanup
    cron.schedule('0 3 * * *', async () => {
      await this.cleanupReputationData();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.isRunning = true;
    console.log('✅ Reputation sync cron jobs started');
  }

  /**
   * Sync reputation data
   */
  async syncReputationData() {
    try {
      console.log('🔄 Syncing reputation data...');
      
      const result = await this.reputationService.syncAllUserReputations();
      
      console.log(`✅ Synced reputation for ${result.syncedUsers} users`);
      
    } catch (error) {
      console.error('❌ Reputation sync failed:', error);
    }
  }

  /**
   * Calculate user rankings
   */
  async calculateRankings() {
    try {
      console.log('📊 Calculating user rankings...');
      
      const result = await this.reputationService.calculateGlobalRankings();
      
      console.log(`✅ Calculated rankings for ${result.rankedUsers} users`);
      
    } catch (error) {
      console.error('❌ Rankings calculation failed:', error);
    }
  }

  /**
   * Cleanup old reputation data
   */
  async cleanupReputationData() {
    try {
      console.log('🧹 Cleaning up old reputation data...');
      
      const result = await this.reputationService.cleanupOldData();
      
      console.log(`✅ Cleaned up ${result.deletedRecords} old reputation records`);
      
    } catch (error) {
      console.error('❌ Reputation cleanup failed:', error);
    }
  }

  /**
   * Stop reputation sync
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Reputation sync cron jobs stopped');
  }
}

// Create and start the reputation sync cron
const reputationSyncCron = new ReputationSyncCron();

// Start if run directly
if (require.main === module) {
  reputationSyncCron.start();
  
  // Keep the process alive
  console.log('🏆 Reputation sync cron job started');
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down reputation sync...');
    reputationSyncCron.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down reputation sync...');
    reputationSyncCron.stop();
    process.exit(0);
  });
}

module.exports = reputationSyncCron;
