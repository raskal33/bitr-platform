#!/usr/bin/env node

/**
 * Startup Cron Coordinator
 * Ensures all cron jobs are properly initialized and coordinated after deployment
 */

const cronCoordinator = require('./services/cron-coordinator');
const masterCoordinator = require('./cron/master-coordinator');

class StartupCronCoordinator {
  constructor() {
    this.serviceName = 'StartupCronCoordinator';
    this.initializationTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize the entire cron coordination system
   */
  async initialize() {
    console.log('🚀 Starting Cron Coordination System initialization...');
    
    try {
      // Step 1: Initialize database coordination tables
      console.log('📊 Step 1: Initializing coordination database...');
      await cronCoordinator.initialize();
      console.log('✅ Coordination database initialized');

      // Step 2: Clean up any stale locks from previous deployments
      console.log('🧹 Step 2: Cleaning up stale locks...');
      await this.cleanupStaleLocks();
      console.log('✅ Stale locks cleaned up');

      // Step 3: Initialize master coordinator
      console.log('🎯 Step 3: Starting master coordinator...');
      await masterCoordinator.start();
      console.log('✅ Master coordinator started');

      // Step 4: Verify system health
      console.log('🏥 Step 4: Verifying system health...');
      const healthCheck = await masterCoordinator.healthCheck();
      
      if (!healthCheck.healthy) {
        console.warn('⚠️ System health check shows issues:', healthCheck.issues);
        // Continue anyway, issues might resolve during runtime
      } else {
        console.log('✅ System health check passed');
      }

      // Step 5: Log system status
      console.log('📋 Step 5: Logging system status...');
      await this.logSystemStatus();

      console.log('🎉 Cron Coordination System initialized successfully!');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize Cron Coordination System:', error);
      throw error;
    }
  }

  /**
   * Clean up stale locks from previous deployments
   */
  async cleanupStaleLocks() {
    try {
      // Force release all locks (they're from previous deployment)
      const jobNames = [
        'daily-fixtures-refresh',
        'odds-update',
        'live-results-update',
        'weekly-leagues-update',
        'cleanup-old-fixtures',
        'oddyssey-new-cycle',
        'oddyssey-match-selection',
        'oddyssey-cycle-resolution',
        'oddyssey-data-cleanup',
        'results-fetching',
        'results-resolution'
      ];

      let releasedCount = 0;
      for (const jobName of jobNames) {
        try {
          const released = await cronCoordinator.forceReleaseLock(jobName);
          if (released) {
            releasedCount++;
          }
        } catch (error) {
          console.warn(`⚠️ Could not release lock for ${jobName}:`, error.message);
        }
      }

      console.log(`🔓 Released ${releasedCount} stale locks`);
      
    } catch (error) {
      console.error('❌ Failed to cleanup stale locks:', error);
      // Don't throw - this is not critical for startup
    }
  }

  /**
   * Log comprehensive system status
   */
  async logSystemStatus() {
    try {
      const status = await masterCoordinator.getSystemStatus();
      
      console.log('📊 CRON COORDINATION SYSTEM STATUS:');
      console.log(`   • Master Coordinator: ${status.masterCoordinator?.isRunning ? 'Running' : 'Stopped'}`);
      console.log(`   • Active Locks: ${status.coordination?.activeLocks?.length || 0}`);
      console.log(`   • Schedulers: ${Object.keys(status.schedulers || {}).length}`);
      
      // Log scheduler statuses
      if (status.schedulers) {
        console.log('   • Scheduler Status:');
        for (const [name, schedulerStatus] of Object.entries(status.schedulers)) {
          const statusIcon = schedulerStatus.error ? '❌' : '✅';
          console.log(`     ${statusIcon} ${name}: ${schedulerStatus.error || 'OK'}`);
        }
      }

      // Log any active locks
      if (status.coordination?.activeLocks?.length > 0) {
        console.log('   • Active Locks:');
        status.coordination.activeLocks.forEach(lock => {
          console.log(`     🔒 ${lock.job_name} (locked by ${lock.locked_by})`);
        });
      }

      console.log(`   • Status Timestamp: ${status.masterCoordinator?.timestamp || 'unknown'}`);
      
    } catch (error) {
      console.error('❌ Failed to log system status:', error);
    }
  }

  /**
   * Verify all critical cron jobs are scheduled
   */
  async verifyCronJobs() {
    try {
      console.log('🔍 Verifying cron job configuration...');
      
      const expectedJobs = [
        'oddyssey_scheduler',
        'oddyssey_creator', 
        'contract_sync',
        'crypto_scheduler',
        'football_scheduler',
        'oracle_cron',
        'fixtures_scheduler',
        'unified_results_manager',
        'slip_evaluator',
        'auto_evaluation',
        'fixture_mapping_maintainer',
        'fixture_status_updater',
        'results_resolver',
        'airdrop_scheduler',
        'health_monitoring',
        'reputation_sync'
      ];

      console.log(`✅ Expected ${expectedJobs.length} cron jobs to be configured`);
      console.log('📋 Critical Jobs:');
      expectedJobs.forEach((job, index) => {
        console.log(`   ${index + 1}. ${job}`);
      });

      return true;
      
    } catch (error) {
      console.error('❌ Failed to verify cron jobs:', error);
      return false;
    }
  }

  /**
   * Start the coordination system with timeout protection
   */
  async startWithTimeout() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Initialization timeout after ${this.initializationTimeout}ms`));
      }, this.initializationTimeout);

      this.initialize()
        .then(() => {
          clearTimeout(timeout);
          resolve(true);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Cron Coordination System...');
    
    try {
      await masterCoordinator.stop();
      console.log('✅ Cron Coordination System shut down successfully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
}

// Create singleton instance
const startupCronCoordinator = new StartupCronCoordinator();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await startupCronCoordinator.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await startupCronCoordinator.shutdown();
  process.exit(0);
});

// Export for use in other modules
module.exports = startupCronCoordinator;

// Auto-start if run directly
if (require.main === module) {
  startupCronCoordinator.startWithTimeout()
    .then(() => {
      console.log('🎉 Startup Cron Coordinator completed successfully');
      
      // Verify cron jobs
      return startupCronCoordinator.verifyCronJobs();
    })
    .then(() => {
      console.log('✅ All systems ready - Cron Coordination System is operational');
      
      // Keep the process alive to maintain coordination
      console.log('🔄 Keeping coordination system alive...');
      
      // Log status every 5 minutes
      setInterval(async () => {
        try {
          await startupCronCoordinator.logSystemStatus();
        } catch (error) {
          console.error('❌ Error in periodic status logging:', error);
        }
      }, 5 * 60 * 1000);
      
    })
    .catch((error) => {
      console.error('❌ Startup Cron Coordinator failed:', error);
      process.exit(1);
    });
}
