const cron = require('node-cron');
const cronCoordinator = require('../services/cron-coordinator');
const SportMonksService = require('../services/sportmonks');

/**
 * Coordinated Fixtures Scheduler
 * Manages fixture fetching, odds updates, and cleanup with proper coordination
 */
class CoordinatedFixturesScheduler {
  constructor() {
    this.isRunning = false;
    this.jobs = new Map();
    this.sportmonksService = new SportMonksService();
    this.serviceName = 'CoordinatedFixturesScheduler';
  }

  /**
   * Start all coordinated fixture jobs
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Coordinated Fixtures Scheduler is already running');
      return;
    }

    console.log('🚀 Starting Coordinated Fixtures Scheduler...');

    try {
      // Schedule daily fixtures refresh
      this.scheduleJob('daily-fixtures-refresh', '0 6 * * *', async () => {
        return await this.manualRefreshFixtures();
      });

      // Schedule odds updates
      this.scheduleJob('odds-update', '*/30 * * * *', async () => {
        return await this.manualUpdateOdds();
      });

      // Schedule live results update
      this.scheduleJob('live-results-update', '*/10 * * * *', async () => {
        return await this.updateLiveResults();
      });

      // Schedule weekly leagues update
      this.scheduleJob('weekly-leagues-update', '0 0 * * 0', async () => {
        return await this.updateLeagues();
      });

      // Schedule cleanup of old fixtures
      this.scheduleJob('cleanup-old-fixtures', '0 2 * * *', async () => {
        return await this.cleanupOldFixtures();
      });

      this.isRunning = true;
      console.log('✅ Coordinated Fixtures Scheduler started successfully');

    } catch (error) {
      console.error('❌ Failed to start Coordinated Fixtures Scheduler:', error);
      throw error;
    }
  }

  /**
   * Stop all fixture jobs
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Coordinated Fixtures Scheduler is not running');
      return;
    }

    console.log('🛑 Stopping Coordinated Fixtures Scheduler...');

    // Stop all cron jobs
    for (const [jobName, job] of this.jobs) {
      try {
        job.destroy();
        console.log(`✅ Stopped job: ${jobName}`);
      } catch (error) {
        console.error(`❌ Failed to stop job ${jobName}:`, error);
      }
    }

    this.jobs.clear();
    this.isRunning = false;
    console.log('🛑 Coordinated Fixtures Scheduler stopped');
  }

  /**
   * Schedule a coordinated job
   */
  scheduleJob(jobName, schedule, jobFunction) {
    const job = cron.schedule(schedule, async () => {
      await this.executeCoordinatedJob(jobName, jobFunction);
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.jobs.set(jobName, job);
    job.start();
    console.log(`📅 Scheduled ${jobName}: ${schedule}`);
  }

  /**
   * Execute a job with coordination
   */
  async executeCoordinatedJob(jobName, jobFunction) {
    const lockAcquired = await cronCoordinator.acquireLock(jobName, 60); // 60 minute timeout
    
    if (!lockAcquired) {
      console.log(`⏭️ Skipping ${jobName} - already running or locked`);
      return;
    }

    const startTime = Date.now();
    let status = 'failed';
    let error = null;

    try {
      console.log(`🔄 Starting coordinated job: ${jobName}`);
      
      const result = await jobFunction();
      
      status = 'completed';
      const duration = Date.now() - startTime;
      
      console.log(`✅ Completed ${jobName} in ${duration}ms`);
      
      // Log execution
      await cronCoordinator.logExecution(jobName, status, duration, null, result);
      
    } catch (err) {
      error = err;
      const duration = Date.now() - startTime;
      
      console.error(`❌ Failed ${jobName} after ${duration}ms:`, err.message);
      
      // Log execution with error
      await cronCoordinator.logExecution(jobName, status, duration, err.message);
      
    } finally {
      // Always release the lock
      await cronCoordinator.releaseLock(jobName);
    }
  }

  /**
   * Manual fixtures refresh
   */
  async manualRefreshFixtures() {
    console.log('📅 Starting daily fixtures refresh...');
    
    try {
      // Get fixtures for next 7 days
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      
      const fixtures = await this.sportmonksService.fetchFixtures(
        new Date().toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      
      console.log(`✅ Refreshed ${fixtures.length} fixtures`);
      
      return {
        success: true,
        fixturesCount: fixtures.length,
        message: 'Daily fixtures refresh completed'
      };
      
    } catch (error) {
      console.error('❌ Fixtures refresh failed:', error);
      throw error;
    }
  }

  /**
   * Manual odds update
   */
  async manualUpdateOdds() {
    console.log('💰 Starting odds update...');
    
    try {
      // Update odds for upcoming fixtures (next 24 hours)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const result = await this.sportmonksService.updateOddsForUpcomingFixtures(
        new Date().toISOString().split('T')[0],
        tomorrow.toISOString().split('T')[0]
      );
      
      console.log(`✅ Updated odds for ${result.updatedCount} fixtures`);
      
      return {
        success: true,
        updatedCount: result.updatedCount,
        message: 'Odds update completed'
      };
      
    } catch (error) {
      console.error('❌ Odds update failed:', error);
      throw error;
    }
  }

  /**
   * Update live results
   */
  async updateLiveResults() {
    console.log('⚽ Starting live results update...');
    
    try {
      // Get live and recently finished fixtures
      const result = await this.sportmonksService.fetchLiveResults();
      
      console.log(`✅ Updated ${result.length} live results`);
      
      return {
        success: true,
        resultsCount: result.length,
        message: 'Live results update completed'
      };
      
    } catch (error) {
      console.error('❌ Live results update failed:', error);
      throw error;
    }
  }

  /**
   * Update leagues data
   */
  async updateLeagues() {
    console.log('🏆 Starting leagues update...');
    
    try {
      const leagues = await this.sportmonksService.fetchLeagues();
      
      console.log(`✅ Updated ${leagues.length} leagues`);
      
      return {
        success: true,
        leaguesCount: leagues.length,
        message: 'Leagues update completed'
      };
      
    } catch (error) {
      console.error('❌ Leagues update failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup old fixtures
   */
  async cleanupOldFixtures() {
    console.log('🧹 Starting fixtures cleanup...');
    
    try {
      // Remove fixtures older than 30 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const result = await this.sportmonksService.cleanupOldFixtures(cutoffDate);
      
      console.log(`✅ Cleaned up ${result.deletedCount} old fixtures`);
      
      return {
        success: true,
        deletedCount: result.deletedCount,
        message: 'Fixtures cleanup completed'
      };
      
    } catch (error) {
      console.error('❌ Fixtures cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  async getStatus() {
    try {
      const jobStatuses = {};
      
      for (const [jobName] of this.jobs) {
        const lockStatus = await cronCoordinator.getLockStatus(jobName);
        jobStatuses[jobName] = {
          scheduled: true,
          locked: lockStatus.isLocked,
          lastRun: lockStatus.lastExecution
        };
      }
      
      return {
        isRunning: this.isRunning,
        jobCount: this.jobs.size,
        jobs: jobStatuses,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        isRunning: this.isRunning,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get execution history
   */
  async getExecutionHistory(limit = 50) {
    try {
      const history = {};
      
      for (const [jobName] of this.jobs) {
        history[jobName] = await cronCoordinator.getExecutionHistory(jobName, limit);
      }
      
      return history;
      
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = new CoordinatedFixturesScheduler();
