const cron = require('node-cron');
const guidedFetcher = require('./guidedFetcher');
const OddysseyOracle = require('./oddyssey-oracle');
const fixturesScheduler = require('../cron/fixtures-scheduler');
const db = require('../db/db');

class OracleCronService {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
  }

  async start() {
    if (this.isRunning) {
      console.log('Oracle Cron Service is already running');
      return;
    }

    // Check if Oracle private key is configured
    if (!process.env.ORACLE_SIGNER_PRIVATE_KEY) {
      console.log('⚠️ Oracle private key not configured, Oracle Cron Service will not start');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Oracle Cron Service...');

    try {
      // Connect to database with timeout
      console.log('📡 Connecting to database...');
      await Promise.race([
        db.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timeout')), 30000))
      ]);
      console.log('✅ Database connected');

      // Start the guided fetcher with timeout
      console.log('🎯 Starting GuidedFetcher...');
      await Promise.race([
        guidedFetcher.start(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('GuidedFetcher start timeout')), 30000))
      ]);
      console.log('✅ GuidedFetcher started');

      // Start fixtures scheduler with timeout
      console.log('📅 Starting FixturesScheduler...');
      await Promise.race([
        fixturesScheduler.start(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('FixturesScheduler start timeout')), 30000))
      ]);
      console.log('✅ FixturesScheduler started');

      // Schedule cron jobs
      console.log('⏰ Scheduling cron jobs...');
      this.scheduleCronJobs();
      console.log('✅ Cron jobs scheduled');

      console.log('✅ Oracle Cron Service started successfully');
      
      // Setup graceful shutdown handlers
      process.on('SIGTERM', async () => {
        console.log('🛑 Received SIGTERM, shutting down gracefully...');
        await this.stop();
        process.exit(0);
      });

      process.on('SIGINT', async () => {
        console.log('🛑 Received SIGINT, shutting down gracefully...');
        await this.stop();
        process.exit(0);
      });
      
    } catch (error) {
      console.error('❌ Failed to start Oracle Cron Service:', error.message);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    
    // Stop all cron jobs
    this.jobs.forEach(job => {
      if (job && typeof job.destroy === 'function') {
        job.destroy();
      } else if (job && typeof job.stop === 'function') {
        job.stop();
      } else {
        console.warn('⚠️ Cron job does not have destroy or stop method:', job);
      }
    });
    this.jobs = [];
    
    // Stop guided fetcher
    await guidedFetcher.stop();
    
    // Stop fixtures scheduler
    await fixturesScheduler.stop();
    
    console.log('Oracle Cron Service stopped');
  }

  scheduleCronJobs() {
    // 1. Start new Oddyssey cycle daily at 00:04 UTC (handled by consolidated workers)
    const startCycleJob = cron.schedule('0 2 * * *', async () => {
      if (!this.isRunning) return;
      
      console.log('🎯 Starting new Oddyssey cycle...');
      try {
        await this.startNewOddysseyDaily();
      } catch (error) {
        console.error('❌ Failed to start new Oddyssey cycle:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // 2. Resolve completed cycles every hour
    const resolveCycleJob = cron.schedule('0 * * * *', async () => {
      if (!this.isRunning) return;
      
      console.log('🔍 Checking for cycles to resolve...');
      try {
        await this.resolveCompletedCycles();
      } catch (error) {
        console.error('❌ Failed to resolve cycles:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // 3. Health check every 5 minutes
    const healthCheckJob = cron.schedule('*/5 * * * *', async () => {
      if (!this.isRunning) return;
      
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('❌ Health check failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // 4. Database cleanup daily at 02:00 UTC
    const cleanupJob = cron.schedule('0 2 * * *', async () => {
      if (!this.isRunning) return;
      
      console.log('🧹 Performing database cleanup...');
      try {
        await this.performDatabaseCleanup();
      } catch (error) {
        console.error('❌ Database cleanup failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    this.jobs = [startCycleJob, resolveCycleJob, healthCheckJob, cleanupJob];
    console.log('📅 Scheduled 4 cron jobs');
  }

  async startNewOddysseyDaily() {
    console.log('🎯 Starting new Oddyssey cycle via unified oracle...');

    try {
      // Initialize the unified oracle
      const oddysseyOracle = new OddysseyOracle();
      await oddysseyOracle.initialize();
      
      // Start new cycle using backend match selection
      const success = await oddysseyOracle.startNewCycle();
      
      if (success) {
        console.log('✅ Successfully started Oddyssey cycle');
      } else {
        console.log('⚠️ Failed to start Oddyssey cycle - not enough matches or other issues');
      }
      
    } catch (error) {
      console.error('❌ Failed to start Oddyssey cycle:', error);
    }
  }

  async resolveCompletedCycles() {
    try {
      console.log('🔍 Checking for cycles to resolve via unified oracle...');
      
      // Initialize the unified oracle
      const oddysseyOracle = new OddysseyOracle();
      await oddysseyOracle.initialize();
      
      // Get current cycle status
      const status = await oddysseyOracle.getStatus();
      console.log(`📊 Current cycle: ${status.currentCycleId}`);
      
      // Check if current cycle needs resolution
      // This is a simplified check - in production you'd want more sophisticated logic
      const currentCycleId = status.currentCycleId;
      if (currentCycleId > 0) {
        console.log(`🏁 Attempting to resolve cycle ${currentCycleId}...`);
        
        const success = await oddysseyOracle.resolveCurrentCycle();
        
        if (success) {
          console.log(`✅ Successfully resolved cycle ${currentCycleId}`);
        } else {
          console.log(`⚠️ Failed to resolve cycle ${currentCycleId} - matches may not be complete`);
        }
      } else {
        console.log('📝 No active cycle to resolve');
      }
      
    } catch (error) {
      console.error('❌ Failed to resolve completed cycles:', error);
    }
  }

  async resolveCycle(gameDate) {
    console.log(`🎯 Resolving cycle for ${gameDate}`);

    try {
      // Get match results for this cycle
      const query = `
        SELECT dgm.match_id, fr.outcome_1x2, fr.outcome_ou25
        FROM oracle.daily_game_matches dgm
        JOIN oracle.fixtures f ON dgm.match_id = f.id
        JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE dgm.game_date = $1
        ORDER BY dgm.id
      `;

      const result = await db.query(query, [gameDate]);
      const matchResults = result.rows;

      if (matchResults.length !== 10) {
        console.log(`⚠️ Expected 10 match results, got ${matchResults.length}. Skipping.`);
        return;
      }

      // Format results for blockchain
      const formattedResults = matchResults.map(match => ({
        moneyline: this.mapMoneylineResult(match.outcome_1x2),
        overUnder: this.mapOverUnderResult(match.outcome_ou25)
      }));

      // Resolve the cycle on blockchain
      await resolveCurrentOddysseyCycle(formattedResults);

      // Mark as resolved in database
      await db.query(
        'INSERT INTO oddyssey.game_results (game_date, total_pool, winners) VALUES ($1, $2, $3)',
        [gameDate, 0, '[]'] // Placeholder values - will be updated by indexer
      );

      console.log(`✅ Successfully resolved cycle for ${gameDate}`);
    } catch (error) {
      console.error(`❌ Failed to resolve cycle for ${gameDate}:`, error);
    }
  }

  mapMoneylineResult(outcome1x2) {
    switch (outcome1x2) {
      case '1': return 1; // HomeWin
      case 'X': return 2; // Draw
      case '2': return 3; // AwayWin
      default: return 0; // NotSet
    }
  }

  mapOverUnderResult(outcomeOu25) {
    switch (outcomeOu25) {
      case 'Over': return 1; // Over
      case 'Under': return 2; // Under
      default: return 0; // NotSet
    }
  }

  async performHealthCheck() {
    try {
      // Check database connection
      await db.query('SELECT 1');
      
      // Check if guided fetcher is running
      if (!guidedFetcher.isRunning) {
        console.log('⚠️ GuidedFetcher is not running, restarting...');
        await guidedFetcher.start();
      }

      // Log basic stats
      const stats = await db.getDailyStats(new Date().toISOString().split('T')[0]);
      if (stats) {
        console.log(`📊 Today's stats: ${stats.total_slips} slips, ${stats.unique_players} players`);
      }
    } catch (error) {
      console.error('❌ Health check failed:', error);
    }
  }

  async performDatabaseCleanup() {
    try {
      // Clean up old event logs (keep last 30 days)
      const cleanupQuery = `
        DELETE FROM core.reputation_log 
        WHERE created_at < NOW() - INTERVAL '30 days'
      `;
      
      const result = await db.query(cleanupQuery);
      console.log(`🧹 Cleaned up ${result.rowCount} old reputation log entries`);
    } catch (error) {
      console.error('❌ Database cleanup failed:', error);
    }
  }
}

// Initialize and start if run directly
const oracleCronService = new OracleCronService();

if (require.main === module) {
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await oracleCronService.stop();
    await db.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await oracleCronService.stop();
    await db.disconnect();
    process.exit(0);
  });

  // Start the service
  oracleCronService.start().catch(error => {
    console.error('Failed to start Oracle Cron Service:', error);
    process.exit(1);
  });
}

module.exports = oracleCronService; 