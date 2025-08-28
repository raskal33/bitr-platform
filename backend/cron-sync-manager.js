const cron = require('node-cron');
const oddysseyScheduler = require('./cron/oddyssey-scheduler');
const fixturesScheduler = require('./cron/fixtures-scheduler');
const resultsScheduler = require('./cron/results-scheduler');
const resultsFetcherCron = require('./cron/results-fetcher-cron');
const cryptoScheduler = require('./cron/crypto-scheduler');
const db = require('./db/db');

class CronSyncManager {
  constructor() {
    this.isRunning = false;
    this.schedulers = {};
    this.jobStatus = {};
    this.syncLog = [];
  }

  /**
   * Initialize and start all cron jobs in the correct order
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ CronSyncManager is already running');
      return;
    }

    console.log('🚀 === STARTING CRON JOB SYNCHRONIZATION ===');
    
    try {
      // 1. Initialize database connection
      await this.initializeDatabase();
      
      // 2. Verify environment variables
      await this.verifyEnvironment();
      
      // 3. Start schedulers in the correct order
      await this.startSchedulersInOrder();
      
      // 4. Set up monitoring and health checks
      this.setupMonitoring();
      
      this.isRunning = true;
      console.log('✅ === CRON SYNCHRONIZATION COMPLETE ===');
      
    } catch (error) {
      console.error('❌ Cron synchronization failed:', error);
      throw error;
    }
  }

  /**
   * Stop all cron jobs gracefully
   */
  async stop() {
    if (!this.isRunning) {
      console.log('⚠️ CronSyncManager is not running');
      return;
    }

    console.log('🛑 === STOPPING CRON JOBS ===');
    
    // Stop schedulers in reverse order
    const schedulerNames = Object.keys(this.schedulers).reverse();
    
    for (const name of schedulerNames) {
      try {
        const scheduler = this.schedulers[name];
        if (scheduler && typeof scheduler.stop === 'function') {
          await scheduler.stop();
          console.log(`✅ Stopped ${name}`);
        }
      } catch (error) {
        console.error(`❌ Error stopping ${name}:`, error.message);
      }
    }
    
    this.isRunning = false;
    console.log('✅ === ALL CRON JOBS STOPPED ===');
  }

  /**
   * Initialize database connection
   */
  async initializeDatabase() {
    console.log('🗄️ Initializing database connection...');
    
    try {
      await db.connect();
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Verify all required environment variables
   */
  async verifyEnvironment() {
    console.log('🔧 Verifying environment variables...');
    
    const requiredVars = [
      'RPC_URL',
      'ODDYSSEY_ADDRESS', 
      'SPORTMONKS_API_TOKEN',
      'DATABASE_URL'
    ];
    
    const missingVars = [];
    
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        missingVars.push(varName);
        console.log(`   ❌ ${varName}: NOT SET`);
      } else {
        console.log(`   ✅ ${varName}: SET`);
      }
    }
    
    if (missingVars.length > 0) {
      console.warn(`⚠️ Missing environment variables: ${missingVars.join(', ')}`);
      console.warn('⚠️ Some cron jobs may not work properly');
    } else {
      console.log('✅ All required environment variables are set');
    }
  }

  /**
   * Start schedulers in the correct order to avoid conflicts
   */
  async startSchedulersInOrder() {
    console.log('📅 Starting schedulers in order...');
    
    // 1. Start Fixtures Scheduler FIRST (provides data for others)
    console.log('1️⃣ Starting Fixtures Scheduler...');
    try {
      await fixturesScheduler.start();
      this.schedulers.fixtures = fixturesScheduler;
      this.jobStatus.fixtures = 'running';
      console.log('✅ Fixtures Scheduler started');
    } catch (error) {
      console.error('❌ Fixtures Scheduler failed:', error.message);
      this.jobStatus.fixtures = 'failed';
    }
    
    // 2. Start Oddyssey Scheduler (depends on fixtures)
    console.log('2️⃣ Starting Oddyssey Scheduler...');
    try {
      await oddysseyScheduler.start();
      this.schedulers.oddyssey = oddysseyScheduler;
      this.jobStatus.oddyssey = 'running';
      console.log('✅ Oddyssey Scheduler started');
    } catch (error) {
      console.error('❌ Oddyssey Scheduler failed:', error.message);
      this.jobStatus.oddyssey = 'failed';
    }
    
    // 3. Start Results Scheduler (depends on both fixtures and oddyssey)
    console.log('3️⃣ Starting Results Scheduler...');
    try {
      await resultsScheduler.start();
      this.schedulers.results = resultsScheduler;
      this.jobStatus.results = 'running';
      console.log('✅ Results Scheduler started');
    } catch (error) {
      console.error('❌ Results Scheduler failed:', error.message);
      this.jobStatus.results = 'failed';
    }
    
    // 4. Start Results Fetcher Cron (for general match results)
    console.log('4️⃣ Starting Results Fetcher Cron...');
    try {
      resultsFetcherCron.initialize();
      this.schedulers.resultsFetcher = resultsFetcherCron;
      this.jobStatus.resultsFetcher = 'running';
      console.log('✅ Results Fetcher Cron started');
    } catch (error) {
      console.error('❌ Results Fetcher Cron failed:', error.message);
      this.jobStatus.resultsFetcher = 'failed';
    }
    
    // 5. Start Crypto Scheduler (for crypto price updates and market resolution)
    console.log('5️⃣ Starting Crypto Scheduler...');
    try {
      const cryptoInstance = new cryptoScheduler();
      await cryptoInstance.start();
      this.schedulers.crypto = cryptoInstance;
      this.jobStatus.crypto = 'running';
      console.log('✅ Crypto Scheduler started');
    } catch (error) {
      console.error('❌ Crypto Scheduler failed:', error.message);
      this.jobStatus.crypto = 'failed';
    }
  }

  /**
   * Set up monitoring and health checks
   */
  setupMonitoring() {
    console.log('🔍 Setting up monitoring...');
    
    // Health check every 5 minutes
    this.healthCheckJob = cron.schedule('*/5 * * * *', async () => {
      await this.performHealthCheck();
    }, {
      scheduled: true,
      timezone: "UTC"
    });
    
    // Status report every hour
    this.statusReportJob = cron.schedule('0 * * * *', async () => {
      await this.generateStatusReport();
    }, {
      scheduled: true,
      timezone: "UTC"
    });
    
    console.log('✅ Monitoring setup complete');
  }

  /**
   * Perform health check on all cron jobs
   */
  async performHealthCheck() {
    const healthStatus = {
      timestamp: new Date().toISOString(),
      database: 'unknown',
      schedulers: {}
    };
    
    // Check database connectivity
    try {
      await db.query('SELECT 1');
      healthStatus.database = 'healthy';
    } catch (error) {
      healthStatus.database = 'unhealthy';
      console.error('❌ Database health check failed:', error.message);
    }
    
    // Check each scheduler
    for (const [name, scheduler] of Object.entries(this.schedulers)) {
      try {
        if (scheduler && typeof scheduler.getStatus === 'function') {
          const status = await scheduler.getStatus();
          healthStatus.schedulers[name] = status;
        } else {
          healthStatus.schedulers[name] = 'unknown';
        }
      } catch (error) {
        healthStatus.schedulers[name] = 'error';
        console.error(`❌ Health check failed for ${name}:`, error.message);
      }
    }
    
    // Log health status
    this.syncLog.push(healthStatus);
    
    // Keep only last 100 entries
    if (this.syncLog.length > 100) {
      this.syncLog = this.syncLog.slice(-100);
    }
    
    // Log summary
    const healthyCount = Object.values(healthStatus.schedulers).filter(s => s === 'healthy').length;
    const totalCount = Object.keys(healthStatus.schedulers).length;
    
    if (healthyCount === totalCount && healthStatus.database === 'healthy') {
      console.log('✅ All cron jobs healthy');
    } else {
      console.warn(`⚠️ Cron health: ${healthyCount}/${totalCount} schedulers healthy, DB: ${healthStatus.database}`);
    }
  }

  /**
   * Generate status report
   */
  async generateStatusReport() {
    console.log('📊 === CRON STATUS REPORT ===');
    
    const report = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      schedulers: {},
      recentErrors: this.syncLog.filter(log => 
        Object.values(log.schedulers).some(status => status === 'error')
      ).length
    };
    
    // Get status from each scheduler
    for (const [name, scheduler] of Object.entries(this.schedulers)) {
      try {
        if (scheduler && typeof scheduler.getStatus === 'function') {
          report.schedulers[name] = await scheduler.getStatus();
        } else {
          report.schedulers[name] = 'unknown';
        }
      } catch (error) {
        report.schedulers[name] = 'error';
      }
    }
    
    console.log('📋 Scheduler Status:');
    for (const [name, status] of Object.entries(report.schedulers)) {
      const icon = status === 'healthy' ? '✅' : status === 'error' ? '❌' : '⚠️';
      console.log(`   ${icon} ${name}: ${status}`);
    }
    
    console.log(`📈 Uptime: ${Math.floor(report.uptime / 3600)}h ${Math.floor((report.uptime % 3600) / 60)}m`);
    console.log(`⚠️ Recent errors: ${report.recentErrors}`);
    console.log('📊 === END STATUS REPORT ===');
  }

  /**
   * Get current status of all cron jobs
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobStatus: this.jobStatus,
      lastHealthCheck: this.syncLog.length > 0 ? this.syncLog[this.syncLog.length - 1] : null,
      uptime: process.uptime()
    };
  }

  /**
   * Manual trigger for testing
   */
  async triggerTest() {
    console.log('🧪 Triggering test for all schedulers...');
    
    for (const [name, scheduler] of Object.entries(this.schedulers)) {
      try {
        console.log(`🧪 Testing ${name}...`);
        if (scheduler && typeof scheduler.triggerTest === 'function') {
          await scheduler.triggerTest();
          console.log(`✅ ${name} test completed`);
        } else {
          console.log(`⚠️ ${name} has no test function`);
        }
      } catch (error) {
        console.error(`❌ ${name} test failed:`, error.message);
      }
    }
  }
}

// Create singleton instance
const cronSyncManager = new CronSyncManager();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down cron jobs gracefully...');
  await cronSyncManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down cron jobs gracefully...');
  await cronSyncManager.stop();
  process.exit(0);
});

// Export for use in other modules
module.exports = cronSyncManager;

// Start if run directly
if (require.main === module) {
  cronSyncManager.start().catch(error => {
    console.error('❌ Failed to start CronSyncManager:', error);
    process.exit(1);
  });
} 