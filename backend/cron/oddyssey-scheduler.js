const cron = require('node-cron');
const OddysseyManager = require('../services/oddyssey-manager');
const OddysseyMatchSelector = require('../services/oddyssey-match-selector');
const SportMonksService = require('../services/sportmonks');

class OddysseyScheduler {
  constructor() {
    this.oddysseyManager = new OddysseyManager();
    this.oddysseyMatchSelector = new OddysseyMatchSelector();
    this.sportMonks = new SportMonksService();
    this.isRunning = false;
  }

  /**
   * Start all Oddyssey-related cron jobs
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  OddysseyScheduler is already running');
      return;
    }

    console.log('🚀 Starting OddysseyScheduler with 1-day strategy...');

    // Initialize the services
    this.oddysseyManager.initialize().catch(error => {
      console.error('❌ Failed to initialize OddysseyManager:', error);
    });

    // Schedule daily cycle start at 00:04 UTC (12:04 AM)
    // This gives 12 hour buffer before first match (13:00 UTC minimum)
    this.scheduleNewCycle();

    // Schedule Oddyssey match selection at 00:01 UTC (for match selection)
    // This runs before cycle creation to ensure we have fresh data
    this.scheduleMatchSelection();

    // Schedule cycle resolution checks every hour during result periods
    this.scheduleResolutionCheck();

    // Schedule data cleanup weekly
    this.scheduleDataCleanup();

    this.isRunning = true;
    console.log('✅ OddysseyScheduler started successfully');
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
    console.log('🛑 OddysseyScheduler stopped');
  }

  /**
   * Schedule new daily cycle creation
   * Runs daily at 00:04 UTC
   */
  scheduleNewCycle() {
    // '4 0 * * *' = At 00:04 AM UTC every day
    this.newCycleJob = cron.schedule('4 0 * * *', async () => {
      console.log('⏰ Running daily cycle creation job...');
      
      try {
        const result = await this.oddysseyManager.startDailyCycle();
        console.log(`✅ Daily cycle created successfully:`, result);
        
        // Send notification if webhook configured
        await this.sendNotification('cycle_started', result);
        
      } catch (error) {
        console.error('❌ Failed to create daily cycle:', error);
        
        // Send error notification
        await this.sendNotification('cycle_start_failed', { error: error.message });
        
        // Retry in 1 hour if failed
        setTimeout(async () => {
          console.log('🔄 Retrying daily cycle creation...');
          try {
            await this.oddysseyManager.startDailyCycle();
            console.log('✅ Daily cycle created on retry');
          } catch (retryError) {
            console.error('❌ Retry also failed:', retryError);
          }
        }, 60 * 60 * 1000); // 1 hour
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled daily cycle creation at 00:04 UTC');
  }

  /**
   * Schedule Oddyssey match selection
   * Runs daily at 00:01 UTC (select matches for current day)
   */
  scheduleMatchSelection() {
    // '1 0 * * *' = At 00:01 UTC every day (select matches for current day)
    this.matchSelectionJob = cron.schedule('1 0 * * *', async () => {
      console.log('⏰ Running Oddyssey match selection job for CURRENT DAY...');
      
      try {
        // Calculate today's date (current day)
        const today = new Date();
        const todayDate = today.toISOString().split('T')[0];
        
        console.log(`🎯 Selecting and persisting matches for today: ${todayDate}`);
        
        // Use PersistentDailyGameManager to select and persist matches for today
        const persistentManager = new (require('../services/persistent-daily-game-manager'))();
        const result = await persistentManager.selectAndPersistDailyMatches(todayDate);
        
        console.log(`✅ Match selection completed for today (${todayDate}):`);
        console.log(`   Matches selected: ${result.matchCount}`);
        console.log(`   Overwrite protected: ${result.overwriteProtected}`);
        
        // Send notification if webhook configured
        await this.sendNotification('matches_selected', result);
        
      } catch (error) {
        console.error('❌ Failed to select Oddyssey matches for today:', error);
        
        // Send error notification
        await this.sendNotification('match_selection_failed', { error: error.message });
        
        // Retry in 30 minutes if failed
        setTimeout(async () => {
          console.log('🔄 Retrying Oddyssey match selection for today...');
          try {
            const today = new Date();
            const todayDate = today.toISOString().split('T')[0];
            
            const persistentManager = new (require('../services/persistent-daily-game-manager'))();
            const result = await persistentManager.selectAndPersistDailyMatches(todayDate);
            console.log(`✅ Oddyssey match selection completed on retry for ${todayDate}`);
          } catch (retryError) {
            console.error('❌ Retry also failed:', retryError);
          }
        }, 30 * 60 * 1000); // 30 minutes
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled Oddyssey match selection at 00:01 UTC (for current day)');
  }

  /**
   * Schedule cycle resolution checks
   * Runs every hour from 22:00 to 06:00 UTC (when matches typically finish)
   */
  scheduleResolutionCheck() {
    // '0 22-23,0-6 * * *' = Every hour from 22:00 to 06:00 UTC
    this.resolutionJob = cron.schedule('0 22-23,0-6 * * *', async () => {
      console.log('⏰ Running cycle resolution check...');
      
      try {
        const needsResolution = await this.checkIfCycleNeedsResolution();
        
        if (needsResolution) {
          console.log('✅ Cycle ready for resolution, triggering...');
          await this.oddysseyManager.resolveDailyCycle();
          
          // Send notification
          await this.sendNotification('cycle_resolved', { timestamp: new Date() });
        } else {
          console.log('⏳ Cycle not ready for resolution yet');
        }
        
      } catch (error) {
        console.error('❌ Error in resolution check:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled cycle resolution checks (22:00-06:00 UTC)');
  }

  /**
   * Schedule data cleanup
   * Runs weekly on Sunday at 03:00 UTC
   */
  scheduleDataCleanup() {
    // '0 3 * * 0' = At 03:00 AM UTC every Sunday
    this.cleanupJob = cron.schedule('0 3 * * 0', async () => {
      console.log('⏰ Running Oddyssey data cleanup...');
      
      try {
        const db = require('../db/db');
        // Clean up old cycles (keep last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const result = await db.query(`
          DELETE FROM oracle.oddyssey_cycles 
          WHERE created_at < $1
        `, [thirtyDaysAgo]);
        
        console.log(`✅ Cleaned up ${result.rowCount} old cycles`);
        
        // Clean up old match selections (keep last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const matchResult = await db.query(`
          DELETE FROM oracle.daily_game_matches 
          WHERE game_date < $1
        `, [sevenDaysAgo.toISOString().split('T')[0]]);
        
        console.log(`✅ Cleaned up ${matchResult.rowCount} old match selections`);
        
      } catch (error) {
        console.error('❌ Error in data cleanup:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Scheduled data cleanup on Sundays at 03:00 UTC');
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
        console.log('ℹ️  No active cycle found');
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
        console.log(`ℹ️  Cycle ${cycle.cycle_id} ended recently, waiting for match completion`);
        return false;
      }

      // Check if matches have results available
      let matches = [];
      try {
        if (cycle.matches_data && cycle.matches_data !== 'null') {
          matches = JSON.parse(cycle.matches_data);
        } else {
          console.log(`ℹ️ Cycle ${cycle.cycle_id} has no matches data`);
          return false;
        }
      } catch (parseError) {
        console.error(`❌ Error parsing matches data for cycle ${cycle.cycle_id}:`, parseError);
        return false;
      }
      
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
        data: data
      };

      const axios = require('axios');
      await axios.post(webhookUrl, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`📡 Notification sent: ${eventType}`);

    } catch (error) {
      console.error('❌ Failed to send notification:', error);
      // Don't throw - notifications are not critical
    }
  }

  /**
   * Manual trigger for new cycle (for testing/emergency)
   */
  async triggerNewCycle() {
    console.log('🔧 Manually triggering new cycle...');
    try {
      const result = await this.oddysseyManager.startDailyCycle();
      console.log('✅ Manual cycle creation successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Manual cycle creation failed:', error);
      throw error;
    }
  }

  /**
   * Manual trigger for cycle resolution (for testing/emergency)
   */
  async triggerResolution() {
    console.log('🔧 Manually triggering cycle resolution...');
    try {
      const result = await this.oddysseyManager.resolveDailyCycle();
      console.log('✅ Manual cycle resolution successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Manual cycle resolution failed:', error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  async getStatus() {
    // Check if all required jobs are scheduled
    const hasNewCycle = this.newCycleJob ? true : false;
    const hasMatchSelection = this.matchSelectionJob ? true : false;
    const hasResolution = this.resolutionJob ? true : false;
    const hasCleanup = this.cleanupJob ? true : false;
    
    // Return 'healthy' if all jobs are scheduled and scheduler is running
    if (this.isRunning && hasNewCycle && hasMatchSelection && hasResolution && hasCleanup) {
      return 'healthy';
    } else {
      return 'unhealthy';
    }
  }
}

// Export singleton instance
const oddysseyScheduler = new OddysseyScheduler();

module.exports = oddysseyScheduler; 