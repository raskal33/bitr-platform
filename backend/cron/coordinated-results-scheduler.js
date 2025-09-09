const cron = require('node-cron');
const db = require('../db/db');
const OddysseyResultsResolver = require('../services/oddyssey-results-resolver');
const ResultsFetcherService = require('../services/results-fetcher-service');
const ComprehensiveResultsProcessor = require('../services/comprehensive-results-processor');
const cronCoordinator = require('../services/cron-coordinator');

class CoordinatedResultsScheduler {
  constructor() {
    this.isRunning = false;
    this.resolver = null;
    this.resultsFetcher = null;
    this.resolutionJob = null;
    this.resultsFetchJob = null;
  }

  /**
   * Start the coordinated results scheduler
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Coordinated Results Scheduler is already running');
      return;
    }

    console.log('🚀 Starting Coordinated Results Scheduler...');

    try {
      // Initialize the coordinator
      await cronCoordinator.initialize();

      // Initialize the results resolver, fetcher, and processor
      this.resolver = new OddysseyResultsResolver();
      this.resultsFetcher = new ResultsFetcherService();
      this.resultsProcessor = new ComprehensiveResultsProcessor();
      
      // Schedule coordinated results fetching and resolution
      this.scheduleCoordinatedResultsFetching();
      this.scheduleCoordinatedResultsResolution();
      this.scheduleFinishedFixturesProcessing();
      
      this.isRunning = true;
      console.log('✅ Coordinated Results Scheduler started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start Coordinated Results Scheduler:', error);
      throw error;
    }
  }

  /**
   * Stop the coordinated results scheduler
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ Coordinated Results Scheduler is not running');
      return;
    }

    if (this.resolutionJob) {
      this.resolutionJob.stop();
    }
    
    if (this.resultsFetchJob) {
      this.resultsFetchJob.stop();
    }
    
    this.isRunning = false;
    console.log('🛑 Coordinated Results Scheduler stopped');
  }

  /**
   * Schedule coordinated results fetching
   */
  scheduleCoordinatedResultsFetching() {
    // Run every 30 minutes to fetch new results from API
    this.resultsFetchJob = cron.schedule('*/30 * * * *', async () => {
      if (!this.isRunning) return;
      
      await cronCoordinator.executeWithCoordination(
        'results-fetching',
        () => this.fetchAndSaveResults(),
        {
          dependencies: [], // Independent operation
          lockTimeout: 15 * 60 * 1000, // 15 minutes timeout
          retryAttempts: 2,
          metadata: { 
            description: 'Fetch and save results for completed matches from SportMonks API',
            priority: 'high'
          }
        }
      );
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled coordinated results fetching every 30 minutes');
  }

  /**
   * Schedule coordinated results resolution
   */
  scheduleCoordinatedResultsResolution() {
    // Run every 15 minutes to check for cycles that need resolution
    this.resolutionJob = cron.schedule('*/15 * * * *', async () => {
      if (!this.isRunning) return;
      
      await cronCoordinator.executeWithCoordination(
        'results-resolution',
        () => this.resolveAllPendingCycles(),
        {
          dependencies: ['results-fetching'], // Depends on results being fetched
          lockTimeout: 10 * 60 * 1000, // 10 minutes timeout
          retryAttempts: 2,
          metadata: { 
            description: 'Resolve all pending Oddyssey cycles with available results',
            priority: 'medium'
          }
        }
      );
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled coordinated results resolution every 15 minutes');
  }

  /**
   * Schedule finished fixtures processing
   */
  scheduleFinishedFixturesProcessing() {
    // Run every 5 minutes to process finished fixtures
    this.finishedFixturesJob = cron.schedule('*/5 * * * *', async () => {
      if (!this.isRunning) return;
      
      await cronCoordinator.executeWithCoordination(
        'finished-fixtures-processing',
        () => this.processFinishedFixtures(),
        {
          lockTimeout: 5 * 60 * 1000, // 5 minutes timeout
          retryAttempts: 1,
          metadata: { 
            description: 'Process finished fixtures and save results to all tables',
            priority: 'high'
          }
        }
      );
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled finished fixtures processing every 5 minutes');
  }

  /**
   * Process finished fixtures and save results
   */
  async processFinishedFixtures() {
    console.log('🔍 Starting finished fixtures processing...');
    
    const startTime = Date.now();
    
    try {
      const result = await this.resultsProcessor.processFinishedFixtures();
      
      const executionTime = Date.now() - startTime;
      
      console.log(`✅ Finished fixtures processing completed: ${result.processed} processed, ${result.errors} errors`);
      
      return {
        status: 'success',
        processed: result.processed,
        errors: result.errors,
        executionTime
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('❌ Finished fixtures processing failed:', error);
      
      return {
        status: 'error',
        error: error.message,
        executionTime
      };
    }
  }

  /**
   * Fetch and save results with coordination
   */
  async fetchAndSaveResults() {
    console.log('🔍 Starting coordinated results fetching...');
    
    const startTime = Date.now();
    
    try {
      const result = await this.resultsFetcher.fetchAndSaveResults();
      
      const executionTime = Date.now() - startTime;
      
      // Log cron job execution
      await this.logCronExecution('results-fetching', true, executionTime);
      
      if (result.status === 'success') {
        console.log(`✅ Coordinated results fetching completed: ${result.fetched} fetched, ${result.saved} saved`);
        return result;
      } else if (result.status === 'warning') {
        console.log(`⚠️ Coordinated results fetching completed with warnings: ${result.reason}`);
        return result;
      } else if (result.status === 'skipped') {
        console.log(`⏭️ Coordinated results fetching skipped: ${result.reason}`);
        return result;
      } else {
        console.error(`❌ Coordinated results fetching failed: ${result.error}`);
        throw new Error(result.error);
      }
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Log failed cron job execution
      await this.logCronExecution('results-fetching', false, executionTime, error.message);
      
      console.error('❌ Coordinated results fetching failed:', error);
      throw error;
    }
  }

  /**
   * Resolve all pending cycles with coordination
   */
  async resolveAllPendingCycles() {
    console.log('🔍 Starting coordinated results resolution...');
    
    try {
      const results = await this.resolver.resolveAllPendingCycles();
      
      if (results.length === 0) {
        console.log('ℹ️ No cycles needed resolution');
        return { processed: 0, successful: 0, failed: 0 };
      } else {
        console.log(`✅ Coordinated resolution processed ${results.length} cycles`);
        
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

        return { 
          processed: results.length, 
          successful, 
          failed,
          results 
        };
      }
      
    } catch (error) {
      console.error('❌ Coordinated results resolution failed:', error);
      throw error;
    }
  }

  /**
   * Manual trigger for results fetching with coordination
   */
  async triggerResultsFetch() {
    console.log('🧪 Triggering manual coordinated results fetching...');
    
    return await cronCoordinator.executeWithCoordination(
      'manual-results-fetching',
      () => this.fetchAndSaveResults(),
      {
        dependencies: [],
        lockTimeout: 15 * 60 * 1000,
        retryAttempts: 1,
        metadata: { 
          description: 'Manual results fetching test',
          priority: 'high',
          manual: true
        }
      }
    );
  }

  /**
   * Manual trigger for testing with coordination
   */
  async triggerTest() {
    console.log('🧪 Triggering manual coordinated results resolution test...');
    
    return await cronCoordinator.executeWithCoordination(
      'manual-results-resolution',
      () => this.resolveAllPendingCycles(),
      {
        dependencies: [],
        lockTimeout: 10 * 60 * 1000,
        retryAttempts: 1,
        metadata: { 
          description: 'Manual results resolution test',
          priority: 'medium',
          manual: true
        }
      }
    );
  }

  /**
   * Resolve specific cycle with coordination
   */
  async resolveCycle(cycleId) {
    console.log(`🎯 Resolving specific cycle ${cycleId} with coordination...`);
    
    return await cronCoordinator.executeWithCoordination(
      `resolve-cycle-${cycleId}`,
      async () => {
        const result = await this.resolver.resolveCycle(cycleId);
        return { cycleId, result };
      },
      {
        dependencies: [],
        lockTimeout: 5 * 60 * 1000, // 5 minutes for single cycle
        retryAttempts: 2,
        metadata: { 
          description: `Resolve specific cycle ${cycleId}`,
          priority: 'medium',
          cycleId
        }
      }
    );
  }

  /**
   * Log cron job execution to database for monitoring
   */
  async logCronExecution(jobName, success, executionTimeMs, errorMessage = null) {
    try {
      await db.query(`
        INSERT INTO oracle.cron_job_logs (
          job_name, success, execution_time_ms, error_message
        ) VALUES ($1, $2, $3, $4)
      `, [jobName, success, executionTimeMs, errorMessage]);
    } catch (error) {
      console.error('Failed to log cron execution:', error);
    }
  }

  /**
   * Get current status with coordination info
   */
  async getStatus() {
    const systemStatus = await cronCoordinator.getSystemStatus();
    
    return {
      scheduler: {
        isRunning: this.isRunning,
        lastCheck: new Date().toISOString(),
        schedules: {
          resultsFetching: 'Every 30 minutes',
          resultsResolution: 'Every 15 minutes'
        },
        description: 'Fetches results from API and resolves Oddyssey cycles (coordinated)'
      },
      coordination: systemStatus
    };
  }

  /**
   * Get execution history for results resolution jobs
   */
  async getExecutionHistory(limit = 30) {
    return await cronCoordinator.getExecutionHistory('results-resolution', limit);
  }

  /**
   * Get detailed resolution statistics
   */
  async getResolutionStats() {
    try {
      const history = await this.getExecutionHistory(100);
      
      const stats = {
        totalExecutions: history.length,
        successfulExecutions: history.filter(h => h.status === 'completed').length,
        failedExecutions: history.filter(h => h.status === 'failed').length,
        averageDuration: 0,
        lastExecution: history[0]?.started_at || null,
        totalCyclesProcessed: 0,
        totalCyclesResolved: 0
      };

      // Calculate average duration for completed executions
      const completedExecutions = history.filter(h => h.status === 'completed' && h.duration_ms);
      if (completedExecutions.length > 0) {
        const totalDuration = completedExecutions.reduce((sum, h) => sum + h.duration_ms, 0);
        stats.averageDuration = Math.round(totalDuration / completedExecutions.length);
      }

      // Extract cycle processing stats from metadata
      history.forEach(h => {
        if (h.metadata && typeof h.metadata === 'object') {
          const metadata = typeof h.metadata === 'string' ? JSON.parse(h.metadata) : h.metadata;
          if (metadata.processed) stats.totalCyclesProcessed += metadata.processed;
          if (metadata.successful) stats.totalCyclesResolved += metadata.successful;
        }
      });

      return stats;
    } catch (error) {
      console.error('❌ Failed to get resolution stats:', error);
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        lastExecution: null,
        totalCyclesProcessed: 0,
        totalCyclesResolved: 0,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const coordinatedResultsScheduler = new CoordinatedResultsScheduler();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down Coordinated Results Scheduler gracefully...');
  await coordinatedResultsScheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down Coordinated Results Scheduler gracefully...');
  await coordinatedResultsScheduler.stop();
  process.exit(0);
});

// Export for use in other modules
module.exports = coordinatedResultsScheduler;

// Start if run directly
if (require.main === module) {
  coordinatedResultsScheduler.start().catch(error => {
    console.error('❌ Failed to start Coordinated Results Scheduler:', error);
    process.exit(1);
  });
}