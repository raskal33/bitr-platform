const coordinatedFixturesScheduler = require('./coordinated-fixtures-scheduler');
const coordinatedOddysseyScheduler = require('./coordinated-oddyssey-scheduler');
const coordinatedResultsScheduler = require('./coordinated-results-scheduler');
const cronCoordinator = require('../services/cron-coordinator');

/**
 * Master Coordinator for all cron job schedulers
 * Manages the lifecycle and coordination of all scheduled tasks
 */
class MasterCoordinator {
  constructor() {
    this.isRunning = false;
    this.schedulers = {
      fixtures: coordinatedFixturesScheduler,
      oddyssey: coordinatedOddysseyScheduler,
      results: coordinatedResultsScheduler
    };
    this.startupOrder = ['fixtures', 'oddyssey', 'results']; // Order matters for dependencies
  }

  /**
   * Start all coordinated schedulers in the correct order
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Master Coordinator is already running');
      return;
    }

    console.log('🚀 Starting Master Coordinator...');

    try {
      // Initialize the coordination system first
      await cronCoordinator.initialize();
      console.log('✅ Cron coordination system initialized');

      // Start schedulers in dependency order
      for (const schedulerName of this.startupOrder) {
        const scheduler = this.schedulers[schedulerName];
        console.log(`🔄 Starting ${schedulerName} scheduler...`);
        
        try {
          await scheduler.start();
          console.log(`✅ ${schedulerName} scheduler started successfully`);
        } catch (error) {
          console.error(`❌ Failed to start ${schedulerName} scheduler:`, error);
          // Continue with other schedulers even if one fails
        }
      }

      this.isRunning = true;
      console.log('🎯 Master Coordinator started successfully');
      
      // Log system status
      await this.logSystemStatus();

    } catch (error) {
      console.error('❌ Failed to start Master Coordinator:', error);
      throw error;
    }
  }

  /**
   * Stop all schedulers in reverse order
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Master Coordinator is not running');
      return;
    }

    console.log('🛑 Stopping Master Coordinator...');

    // Stop schedulers in reverse order
    const stopOrder = [...this.startupOrder].reverse();
    
    for (const schedulerName of stopOrder) {
      const scheduler = this.schedulers[schedulerName];
      console.log(`🔄 Stopping ${schedulerName} scheduler...`);
      
      try {
        await scheduler.stop();
        console.log(`✅ ${schedulerName} scheduler stopped successfully`);
      } catch (error) {
        console.error(`❌ Failed to stop ${schedulerName} scheduler:`, error);
        // Continue stopping other schedulers
      }
    }

    this.isRunning = false;
    console.log('🛑 Master Coordinator stopped');
  }

  /**
   * Restart all schedulers
   */
  async restart() {
    console.log('🔄 Restarting Master Coordinator...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await this.start();
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus() {
    try {
      const coordinationStatus = await cronCoordinator.getSystemStatus();
      const schedulerStatuses = {};

      // Get status from each scheduler
      for (const [name, scheduler] of Object.entries(this.schedulers)) {
        try {
          schedulerStatuses[name] = await scheduler.getStatus();
        } catch (error) {
          schedulerStatuses[name] = {
            error: error.message,
            status: 'error'
          };
        }
      }

      return {
        masterCoordinator: {
          isRunning: this.isRunning,
          startupOrder: this.startupOrder,
          timestamp: new Date().toISOString()
        },
        coordination: coordinationStatus,
        schedulers: schedulerStatuses
      };
    } catch (error) {
      console.error('❌ Failed to get system status:', error);
      return {
        masterCoordinator: {
          isRunning: this.isRunning,
          error: error.message,
          timestamp: new Date().toISOString()
        },
        coordination: { error: error.message },
        schedulers: {}
      };
    }
  }

  /**
   * Get execution history for all jobs
   */
  async getExecutionHistory(limit = 50) {
    try {
      const history = {};

      // Get history from each scheduler
      for (const [name, scheduler] of Object.entries(this.schedulers)) {
        try {
          if (typeof scheduler.getExecutionHistory === 'function') {
            history[name] = await scheduler.getExecutionHistory(limit);
          }
        } catch (error) {
          history[name] = { error: error.message };
        }
      }

      return history;
    } catch (error) {
      console.error('❌ Failed to get execution history:', error);
      return { error: error.message };
    }
  }

  /**
   * Force release locks for all jobs (emergency use)
   */
  async forceReleaseAllLocks() {
    console.log('🚨 Force releasing all locks...');
    
    try {
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

      const results = {};
      for (const jobName of jobNames) {
        try {
          const released = await cronCoordinator.forceReleaseLock(jobName);
          results[jobName] = released ? 'released' : 'no_lock_found';
        } catch (error) {
          results[jobName] = `error: ${error.message}`;
        }
      }

      console.log('🔓 Force release results:', results);
      return results;
    } catch (error) {
      console.error('❌ Failed to force release locks:', error);
      throw error;
    }
  }

  /**
   * Manual trigger methods for testing/emergency
   */
  async triggerFixturesRefresh() {
    console.log('🔧 Manually triggering fixtures refresh...');
    return await this.schedulers.fixtures.manualRefreshFixtures();
  }

  async triggerOddsUpdate() {
    console.log('🔧 Manually triggering odds update...');
    return await this.schedulers.fixtures.manualUpdateOdds();
  }

  async triggerOddysseyNewCycle() {
    console.log('🔧 Manually triggering Oddyssey new cycle...');
    return await this.schedulers.oddyssey.triggerNewCycle();
  }

  async triggerOddysseyMatchSelection() {
    console.log('🔧 Manually triggering Oddyssey match selection...');
    return await this.schedulers.oddyssey.triggerMatchSelection();
  }

  async triggerOddysseyResolution() {
    console.log('🔧 Manually triggering Oddyssey resolution...');
    return await this.schedulers.oddyssey.triggerResolution();
  }

  async triggerResultsFetching() {
    console.log('🔧 Manually triggering results fetching...');
    return await this.schedulers.results.triggerResultsFetch();
  }

  async triggerResultsResolution() {
    console.log('🔧 Manually triggering results resolution...');
    return await this.schedulers.results.triggerTest();
  }

  /**
   * Health check for monitoring systems
   */
  async healthCheck() {
    try {
      const status = await this.getSystemStatus();
      
      // Determine overall health
      let isHealthy = true;
      const issues = [];

      if (!this.isRunning) {
        isHealthy = false;
        issues.push('Master coordinator not running');
      }

      // Check for active locks that might be stuck
      if (status.coordination?.activeLocks?.length > 0) {
        const stuckLocks = status.coordination.activeLocks.filter(lock => {
          const lockAge = Date.now() - new Date(lock.locked_at).getTime();
          return lockAge > 60 * 60 * 1000; // Older than 1 hour
        });

        if (stuckLocks.length > 0) {
          issues.push(`${stuckLocks.length} potentially stuck locks detected`);
        }
      }

      // Check scheduler health
      for (const [name, schedulerStatus] of Object.entries(status.schedulers)) {
        if (schedulerStatus.error) {
          isHealthy = false;
          issues.push(`${name} scheduler error: ${schedulerStatus.error}`);
        }
      }

      return {
        healthy: isHealthy,
        timestamp: new Date().toISOString(),
        issues: issues,
        status: status
      };
    } catch (error) {
      return {
        healthy: false,
        timestamp: new Date().toISOString(),
        issues: [`Health check failed: ${error.message}`],
        error: error.message
      };
    }
  }

  /**
   * Log system status for monitoring
   */
  async logSystemStatus() {
    try {
      const status = await this.getSystemStatus();
      console.log('📊 System Status Summary:');
      console.log(`   • Master Coordinator: ${this.isRunning ? 'Running' : 'Stopped'}`);
      console.log(`   • Active Locks: ${status.coordination?.activeLocks?.length || 0}`);
      console.log(`   • Schedulers: ${Object.keys(status.schedulers).length}`);
      
      // Log any issues
      const healthCheck = await this.healthCheck();
      if (!healthCheck.healthy) {
        console.log('⚠️ Health Issues Detected:');
        healthCheck.issues.forEach(issue => console.log(`   • ${issue}`));
      }
    } catch (error) {
      console.error('❌ Failed to log system status:', error);
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics() {
    try {
      const history = await this.getExecutionHistory(100);
      const metrics = {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        averageExecutionTime: 0,
        jobMetrics: {}
      };

      // Process history from all schedulers
      for (const [schedulerName, schedulerHistory] of Object.entries(history)) {
        if (schedulerHistory.error) continue;

        for (const [jobName, jobHistory] of Object.entries(schedulerHistory)) {
          if (!Array.isArray(jobHistory)) continue;

          const jobMetrics = {
            total: jobHistory.length,
            successful: jobHistory.filter(h => h.status === 'completed').length,
            failed: jobHistory.filter(h => h.status === 'failed').length,
            averageDuration: 0
          };

          // Calculate average duration
          const completedJobs = jobHistory.filter(h => h.status === 'completed' && h.duration_ms);
          if (completedJobs.length > 0) {
            const totalDuration = completedJobs.reduce((sum, h) => sum + h.duration_ms, 0);
            jobMetrics.averageDuration = Math.round(totalDuration / completedJobs.length);
          }

          metrics.jobMetrics[`${schedulerName}.${jobName}`] = jobMetrics;
          metrics.totalJobs += jobMetrics.total;
          metrics.successfulJobs += jobMetrics.successful;
          metrics.failedJobs += jobMetrics.failed;
        }
      }

      // Calculate overall average execution time
      if (metrics.successfulJobs > 0) {
        const totalDuration = Object.values(metrics.jobMetrics)
          .reduce((sum, job) => sum + (job.averageDuration * job.successful), 0);
        metrics.averageExecutionTime = Math.round(totalDuration / metrics.successfulJobs);
      }

      return metrics;
    } catch (error) {
      console.error('❌ Failed to get performance metrics:', error);
      return { error: error.message };
    }
  }
}

// Create singleton instance
const masterCoordinator = new MasterCoordinator();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down Master Coordinator gracefully...');
  await masterCoordinator.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down Master Coordinator gracefully...');
  await masterCoordinator.stop();
  process.exit(0);
});

module.exports = masterCoordinator;

// Start if run directly
if (require.main === module) {
  masterCoordinator.start().catch(error => {
    console.error('❌ Failed to start Master Coordinator:', error);
    process.exit(1);
  });
}