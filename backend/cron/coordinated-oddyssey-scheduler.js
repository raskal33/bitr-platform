const cron = require('node-cron');
const OddysseyManager = require('../services/oddyssey-manager');
const OddysseyMatchSelector = require('../services/oddyssey-match-selector');
const SportMonksService = require('../services/sportmonks');
const cronCoordinator = require('../services/cron-coordinator');

class CoordinatedOddysseyScheduler {
  constructor() {
    this.oddysseyManager = new OddysseyManager();
    this.oddysseyMatchSelector = new OddysseyMatchSelector();
    this.sportMonks = new SportMonksService();
    this.isRunning = false;
  }

  /**
   * Start all coordinated Oddyssey-related cron jobs
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Coordinated OddysseyScheduler is already running');
      return;
    }

    console.log('🚀 Starting Coordinated OddysseyScheduler...');

    try {
      // Initialize the coordinator
      await cronCoordinator.initialize();

      // Initialize the services
      await this.oddysseyManager.initialize();

      // Schedule coordinated cron jobs
      this.scheduleCoordinatedJobs();

      this.isRunning = true;
      console.log('✅ Coordinated OddysseyScheduler started successfully');
    } catch (error) {
      console.error('❌ Failed to start Coordinated OddysseyScheduler:', error);
      throw error;
    }
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    if (this.newCycleJob) this.newCycleJob.stop();
    if (this.matchSelectionJob) this.matchSelectionJob.stop();
    if (this.resolutionJob) this.resolutionJob.stop();
    if (this.cleanupJob) this.cleanupJob.stop();
    
    this.isRunning = false;
    console.log('🛑 Coordinated OddysseyScheduler stopped');
  }

  /**
   * Schedule all coordinated Oddyssey jobs
   */
  scheduleCoordinatedJobs() {
    // DISABLED: Using regular oddyssey-scheduler instead
    console.log('⏰ Coordinated Oddyssey scheduler DISABLED - using regular scheduler');
    
    /*
    // 1. Match selection at 00:50 UTC (select matches for the day)
    this.matchSelectionJob = cron.schedule('50 0 * * *', async () => {
      if (!this.isRunning) return;

      await cronCoordinator.executeWithCoordination(
        'oddyssey-match-selection',
        () => this.selectMatches(),
        {
          dependencies: ['daily-fixtures-refresh'], // Wait for fixtures to be refreshed
          lockTimeout: 20 * 60 * 1000, // 20 minutes timeout
          retryAttempts: 2,
          metadata: { 
            description: 'Select daily matches for Oddyssey',
            priority: 'high'
          }
        }
      );
    }, {
      scheduled: true,
      timezone: "UTC"
    });
    */

    /*
    // 2. New cycle creation at 00:52 UTC (depends on fixtures being available)
    this.newCycleJob = cron.schedule('52 0 * * *', async () => {
      if (!this.isRunning) return;

      await cronCoordinator.executeWithCoordination(
        'oddyssey-new-cycle',
        () => this.createNewCycle(),
        {
          dependencies: ['daily-fixtures-refresh'], // Wait for fixtures to be refreshed
          lockTimeout: 30 * 60 * 1000, // 30 minutes timeout
          retryAttempts: 3,
          metadata: { 
            description: 'Create new Oddyssey daily cycle',
            priority: 'high'
          }
        }
      );
    }, {
      scheduled: true,
      timezone: "UTC"
    });
    */

    // 3. Additional match validation at 03:43 UTC (for cleanup/validation)
    this.matchValidationJob = cron.schedule('43 3 * * *', async () => {
      if (!this.isRunning) return;

      await cronCoordinator.executeWithCoordination(
        'oddyssey-match-selection',
        () => this.selectMatches(),
        {
          dependencies: [], // No dependencies for cleanup job
          lockTimeout: 20 * 60 * 1000, // 20 minutes timeout
          retryAttempts: 2,
          metadata: { 
            description: 'Additional Oddyssey checks and cleanup',
            priority: 'medium'
          }
        }
      );
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // 3. Cycle resolution checks every hour during result periods
    this.resolutionJob = cron.schedule('0 22-23,0-6 * * *', async () => {
      if (!this.isRunning) return;

      await cronCoordinator.executeWithCoordination(
        'oddyssey-cycle-resolution',
        () => this.checkAndResolveCycle(),
        {
          dependencies: [], // Independent operation
          lockTimeout: 15 * 60 * 1000, // 15 minutes timeout
          retryAttempts: 2,
          metadata: { 
            description: 'Check and resolve completed Oddyssey cycles',
            priority: 'medium'
          }
        }
      );
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // 4. Data cleanup weekly on Sunday at 03:00 UTC
    this.cleanupJob = cron.schedule('0 3 * * 0', async () => {
      if (!this.isRunning) return;

      await cronCoordinator.executeWithCoordination(
        'oddyssey-data-cleanup',
        () => this.cleanupOldData(),
        {
          dependencies: ['cleanup-old-fixtures'], // Wait for fixtures cleanup
          lockTimeout: 20 * 60 * 1000, // 20 minutes timeout
          retryAttempts: 2,
          metadata: { 
            description: 'Cleanup old Oddyssey data',
            priority: 'low'
          }
        }
      );
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('⏰ Coordinated Oddyssey scheduler DISABLED');
    console.log('   • Using regular oddyssey-scheduler instead');
    console.log('   • Match selection: 00:01 UTC');
    console.log('   • New cycle creation: 00:04 UTC');
  }

  /**
   * Create new daily cycle with coordination
   */
  async createNewCycle() {
    console.log('🔄 Starting coordinated cycle creation...');
    
    try {
      const result = await this.oddysseyManager.startDailyCycle();
      console.log(`✅ Coordinated cycle creation successful:`, result);
      
      // Send notification if webhook configured
      await this.sendNotification('cycle_started', result);
      
      return result;
    } catch (error) {
      console.error('❌ Coordinated cycle creation failed:', error);
      
      // Send error notification
      await this.sendNotification('cycle_start_failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Select matches with coordination
   */
  async selectMatches() {
    console.log('🎯 Starting coordinated match selection...');
    
    try {
      // Get oddyssey fixtures from existing 7-day data
      console.log('📊 Getting oddyssey fixtures from existing 7-day data...');
      const oddysseyFixtures = await this.sportMonks.fetchOddysseyFixtures();
      console.log(`✅ Retrieved ${oddysseyFixtures.length} fixtures for oddyssey`);
      
      // Select matches for today using 1-day strategy
      console.log('🎯 Selecting Oddyssey matches for 1-day strategy...');
      const selections = await this.oddysseyMatchSelector.selectDailyMatches();
      
      // Get current cycle ID for linking
      const currentCycleId = await this.oddysseyManager.oddysseyContract.dailyCycleId();
      
      // Save selections to database with cycle ID
      await this.oddysseyMatchSelector.saveOddysseyMatches(selections, Number(currentCycleId));
      
      console.log(`✅ Coordinated match selection completed:`);
      console.log(`   Today (${selections.today.date}): ${selections.today.matches.length} matches`);
      console.log(`   Tomorrow (${selections.tomorrow.date}): ${selections.tomorrow.matches.length} matches`);
      
      // Send notification if webhook configured
      await this.sendNotification('matches_selected', selections);
      
      return selections;
    } catch (error) {
      console.error('❌ Coordinated match selection failed:', error);
      
      // Send error notification
      await this.sendNotification('match_selection_failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check and resolve cycle with coordination
   */
  async checkAndResolveCycle() {
    console.log('🔍 Starting coordinated cycle resolution check...');
    
    try {
      const needsResolution = await this.checkIfCycleNeedsResolution();
      
      if (needsResolution) {
        console.log('✅ Cycle ready for resolution, triggering...');
        const result = await this.oddysseyManager.resolveDailyCycle();
        
        // Send notification
        await this.sendNotification('cycle_resolved', { 
          timestamp: new Date(),
          result 
        });
        
        return { resolved: true, result };
      } else {
        console.log('⏳ Cycle not ready for resolution yet');
        return { resolved: false };
      }
    } catch (error) {
      console.error('❌ Coordinated cycle resolution check failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup old data with coordination
   */
  async cleanupOldData() {
    console.log('🧹 Starting coordinated Oddyssey data cleanup...');
    
    try {
      const db = require('../db/db');
      
      // Clean up old cycles (keep last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const cycleResult = await db.query(`
        DELETE FROM oracle.oddyssey_cycles 
        WHERE created_at < $1
        RETURNING cycle_id
      `, [thirtyDaysAgo]);
      
      console.log(`🧹 Cleaned up ${cycleResult.rowCount} old cycles`);
      
      // Clean up old match selections (keep last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const matchResult = await db.query(`
        DELETE FROM oracle.daily_game_matches 
        WHERE game_date < $1
        RETURNING id
      `, [sevenDaysAgo.toISOString().split('T')[0]]);
      
      console.log(`🧹 Cleaned up ${matchResult.rowCount} old match selections`);
      
      // Clean up old slips (keep last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const slipResult = await db.query(`
        DELETE FROM oracle.oddyssey_slips 
        WHERE placed_at < $1
        RETURNING slip_id
      `, [ninetyDaysAgo]);
      
      console.log(`🧹 Cleaned up ${slipResult.rowCount} old slips`);
      
      console.log('✅ Coordinated Oddyssey cleanup completed');
      
      return {
        cleanedCycles: cycleResult.rowCount,
        cleanedMatches: matchResult.rowCount,
        cleanedSlips: slipResult.rowCount
      };
    } catch (error) {
      console.error('❌ Coordinated Oddyssey cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Check if current cycle needs resolution
   */
  async checkIfCycleNeedsResolution() {
    try {
      const db = require('../db/db');
      
      // Get current cycle info
      const cycleQuery = `
        SELECT 
          cycle_id,
          is_resolved,
          matches_data,
          cycle_end_time,
          created_at
        FROM oracle.current_oddyssey_cycle
      `;
      
      const result = await db.query(cycleQuery);
      
      if (result.rows.length === 0) {
        console.log('ℹ️ No active cycle found');
        return false;
      }

      const cycle = result.rows[0];
      
      // Already resolved
      if (cycle.is_resolved) {
        return false;
      }

      // Check if enough time has passed since cycle end
      const now = new Date();
      const cycleEndTime = new Date(cycle.cycle_end_time);
      const timeSinceEnd = now - cycleEndTime;
      
      // Wait at least 2 hours after cycle end before attempting resolution
      if (timeSinceEnd < 2 * 60 * 60 * 1000) {
        console.log(`ℹ️ Cycle ${cycle.cycle_id} ended recently, waiting for match completion`);
        return false;
      }

      // Check if matches have results available
      const matches = JSON.parse(cycle.matches_data);
      const resultsAvailable = await this.checkMatchResultsAvailability(matches);
      
      if (resultsAvailable >= 8) { // At least 8 out of 10 matches have results
        console.log(`✅ Cycle ${cycle.cycle_id} ready for resolution (${resultsAvailable}/10 results available)`);
        return true;
      } else {
        console.log(`⏳ Cycle ${cycle.cycle_id} waiting for more results (${resultsAvailable}/10 available)`);
        return false;
      }

    } catch (error) {
      console.error('❌ Error checking cycle resolution status:', error);
      return false;
    }
  }

  /**
   * Check how many matches have results available
   */
  async checkMatchResultsAvailability(matches) {
    try {
      const db = require('../db/db');
      const fixtureIds = matches.map(m => m.id);
      
      const query = `
        SELECT COUNT(*) as completed_count
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = ANY($1)
          AND (f.status = 'FT' OR fr.fixture_id IS NOT NULL)
      `;
      
      const result = await db.query(query, [fixtureIds]);
      return parseInt(result.rows[0].completed_count) || 0;

    } catch (error) {
      console.error('❌ Error checking match results availability:', error);
      return 0;
    }
  }

  /**
   * Send notifications for important events
   */
  async sendNotification(eventType, data) {
    try {
      const webhookUrl = process.env.ODDYSSEY_WEBHOOK_URL;
      
      if (!webhookUrl) {
        return; // No webhook configured
      }

      const payload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data: data,
        coordinated: true
      };

      const axios = require('axios');
      await axios.post(webhookUrl, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`📡 Coordinated notification sent: ${eventType}`);

    } catch (error) {
      console.error('❌ Failed to send coordinated notification:', error);
      // Don't throw - notifications are not critical
    }
  }

  /**
   * Manual trigger methods for testing/emergency
   */
  async triggerNewCycle() {
    console.log('🔧 Manually triggering coordinated new cycle...');
    return await cronCoordinator.executeWithCoordination(
      'manual-oddyssey-new-cycle',
      () => this.createNewCycle(),
      {
        dependencies: [],
        lockTimeout: 30 * 60 * 1000,
        retryAttempts: 1,
        metadata: { 
          description: 'Manual Oddyssey cycle creation',
          priority: 'high',
          manual: true
        }
      }
    );
  }

  async triggerMatchSelection() {
    console.log('🔧 Manually triggering coordinated match selection...');
    return await cronCoordinator.executeWithCoordination(
      'manual-oddyssey-match-selection',
      () => this.selectMatches(),
      {
        dependencies: [],
        lockTimeout: 20 * 60 * 1000,
        retryAttempts: 1,
        metadata: { 
          description: 'Manual Oddyssey match selection',
          priority: 'high',
          manual: true
        }
      }
    );
  }

  async triggerResolution() {
    console.log('🔧 Manually triggering coordinated cycle resolution...');
    return await cronCoordinator.executeWithCoordination(
      'manual-oddyssey-resolution',
      () => this.checkAndResolveCycle(),
      {
        dependencies: [],
        lockTimeout: 15 * 60 * 1000,
        retryAttempts: 1,
        metadata: { 
          description: 'Manual Oddyssey cycle resolution',
          priority: 'medium',
          manual: true
        }
      }
    );
  }

  /**
   * Get scheduler status
   */
  async getStatus() {
    const systemStatus = await cronCoordinator.getSystemStatus();
    
    return {
      scheduler: {
        isRunning: this.isRunning,
        jobs: {
          newCycle: this.newCycleJob ? 'scheduled' : 'not scheduled',
          matchSelection: this.matchSelectionJob ? 'scheduled' : 'not scheduled',
          resolution: this.resolutionJob ? 'scheduled' : 'not scheduled',
          cleanup: this.cleanupJob ? 'scheduled' : 'not scheduled'
        }
      },
      coordination: systemStatus
    };
  }

  /**
   * Get execution history for all Oddyssey jobs
   */
  async getExecutionHistory(limit = 20) {
    const jobNames = [
      'oddyssey-new-cycle',
      'oddyssey-match-selection',
      'oddyssey-cycle-resolution',
      'oddyssey-data-cleanup'
    ];

    const history = {};
    for (const jobName of jobNames) {
      history[jobName] = await cronCoordinator.getExecutionHistory(jobName, limit);
    }

    return history;
  }
}

// Export singleton instance
const coordinatedOddysseyScheduler = new CoordinatedOddysseyScheduler();

module.exports = coordinatedOddysseyScheduler;