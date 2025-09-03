require('dotenv').config();
const cron = require('node-cron');
const { fork } = require('child_process');
const path = require('path');

// Import coordination services
const cronCoordinator = require('../services/cron-coordinator');
const masterCoordinator = require('./master-coordinator');

console.log('🚀 Starting consolidated background workers...');

// Initialize database first
async function initializeDatabase() {
  try {
    console.log('🗄️ Initializing database for workers...');
    
    // DISABLED: Auto-apply perfect schema (manual control for debugging)
    console.log('🚫 Perfect database schema auto-apply DISABLED for workers (manual control)');
    // const { execSync } = require('child_process');
    // try {
    //   execSync('npx prisma db execute --file ./database/perfect-schema.sql --schema ./prisma/schema.prisma', { cwd: '/app' });
    //   console.log('✅ Perfect database schema applied successfully for workers');
    // } catch (migrationError) {
    //   console.warn('⚠️ Workers schema warning:', migrationError.message);
    //   console.log('📝 Continuing with startup - schema may have been previously applied');
    // }
    
    console.log('✅ Database initialized for workers');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    // Continue anyway, some services might work without full DB setup
  }
}

// Set environment variables to avoid port conflicts
process.env.ODDYSSEY_PORT = '3002'; // Changed from 3001 to 3002 to avoid conflict with Oracle
process.env.CRYPTO_PORT = '3003';

// Map of jobs with their schedules and file paths - OPTIMIZED TO PREVENT CONFLICTS
const jobs = {
  oddyssey_scheduler: {
    schedule: '1 0 * * *', // Once daily at 00:01 UTC (match selection)
    script: path.join(__dirname, 'oddyssey-scheduler-process.js'),
    description: 'Oddyssey Scheduler (Match Selection)'
  },
  oddyssey_creator: {
    schedule: '4 0 * * *', // Once daily at 00:04 UTC (cycle creation)
    script: path.join(__dirname, 'oddyssey-creator-process.js'),
    description: 'Oddyssey Creator (Cycle Creation)'
  },
  contract_sync: {
    schedule: '6 0 * * *', // Once daily at 00:06 UTC (2 minutes after cycle creation)
    script: path.join(__dirname, '../sync-contract-matches-to-db.js'),
    description: 'Contract to Database Sync'
  },
  crypto_scheduler: {
    schedule: '5 */30 * * *', // Every 30 minutes at :05 (offset to prevent overlap)
    script: path.join(__dirname, 'crypto-scheduler-process.js'),
    description: 'Crypto Scheduler'
  },
  football_scheduler: {
    schedule: '10 */30 * * *', // Every 30 minutes at :10 (offset)
    script: path.join(__dirname, 'football-scheduler.js'),
    description: 'Football Oracle Scheduler'
  },
  oracle_cron: {
    schedule: '15 */30 * * *', // Every 30 minutes at :15 (offset)
    script: path.join(__dirname, '../oracle/cronjob.js'),
    description: 'Oracle Cron Job'
  },
  fixtures_scheduler: {
    schedule: '0 6 * * *', // Once daily at 6 AM UTC (smart incremental fetching)
    script: path.join(__dirname, 'fixtures-scheduler.js'),
    description: 'Fixtures Scheduler'
  },
  // Oddyssey indexer is now consolidated into the main indexer.js
  // oddyssey_indexer: {
  //   schedule: null, // Runs continuously
  //   script: path.join(__dirname, '../indexer_oddyssey_starter.js'),
  //   description: 'Oddyssey Blockchain Indexer'
  // },
  unified_results_manager: {
    schedule: '*/15 * * * *', // Every 15 minutes (replaces all conflicting jobs)
    script: path.join(__dirname, 'unified-results-cron.js'),
    description: 'Unified Results Manager (Consolidated)'
  },
  slip_evaluator: {
    schedule: '45 */15 * * *', // Every 15 minutes at :45 (offset)
    script: path.join(__dirname, 'slip-evaluator-process.js'),
    description: 'Slip Evaluator (Auto-evaluate resolved cycles)'
  },
  pool_settlement_service: {
    schedule: null, // Runs continuously
    script: path.join(__dirname, 'pool-settlement-service-process.js'),
    description: 'Pool Settlement Service (Oracle Event Listener)'
  },
  oddyssey_oracle_bot: {
    schedule: null, // Runs continuously
    script: path.join(__dirname, 'oddyssey-oracle-bot-process.js'),
    description: 'Oddyssey Oracle Bot (Blockchain Resolution)'
  },
  cycle_health_monitor: {
    schedule: '30 0 * * *', // Once daily at 00:30 UTC (after all cycle operations)
    script: path.join(__dirname, '../scripts/cycle-health-monitor.js'),
    description: 'Cycle Health Monitor'
  },
  cycle_monitor: {
    schedule: null, // Runs continuously via system monitor
    script: path.join(__dirname, '../services/cycle-monitor.js'),
    description: 'Cycle Monitor (Continuous)'
  },
  fixture_mapping_maintainer: {
    schedule: '*/10 * * * *', // Every 10 minutes (self-healing metadata)
    script: path.join(__dirname, 'fixture-mapping-maintainer-cron.js'),
    description: 'Fixture Mapping Maintainer'
  },
  auto_evaluation: {
    schedule: '0,30 * * * *', // Every 30 minutes (at :00 and :30)
    script: path.join(__dirname, 'auto-evaluation-cron.js'),
    description: 'Auto Evaluation (Resolved Cycles)'
  },
  fixture_status_updater: {
    schedule: '*/10 * * * *', // Every 10 minutes (offset from mapping maintainer)
    script: path.join(__dirname, 'fixture-status-updater.js'),
    description: 'Fixture Status Updater (Live Match Status)'
  },
  results_resolver: {
    schedule: '*/20 * * * *', // Every 20 minutes (offset to prevent conflicts)
    script: path.join(__dirname, 'results-resolver-process.js'),
    description: 'Results Resolver (Oddyssey Cycles)'
  },
  airdrop_scheduler: {
    schedule: '0 2 * * *', // Once daily at 2 AM UTC (after main operations)
    script: path.join(__dirname, 'airdrop-scheduler.js'),
    description: 'Airdrop Scheduler (Eligibility Calculation)'
  },
  football_oracle_bot: {
    schedule: null, // Runs continuously
    script: path.join(__dirname, 'football-oracle-bot-process.js'),
    description: 'Football Oracle Bot (Continuous)'
  },
  crypto_oracle_bot: {
    schedule: null, // Runs continuously
    script: path.join(__dirname, 'crypto-oracle-bot-process.js'),
    description: 'Crypto Oracle Bot (Continuous)'
  },
  health_monitoring: {
    schedule: null, // Runs continuously with internal cron schedules
    script: path.join(__dirname, 'health-monitoring-cron.js'),
    description: 'Health Monitoring System (Comprehensive)'
  },
  reputation_sync: {
    schedule: null, // Runs continuously with internal cron schedules
    script: path.join(__dirname, 'reputation-sync-cron.js'),
    description: 'Reputation Sync Service (Rankings & Cleanup)'
  }
};

// Function to run a job safely
function runJob(jobName, jobConfig) {
  console.log(`📅 Starting ${jobConfig.description}...`);
  
  const child = fork(jobConfig.script, [], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: {
      ...process.env,
      ODDYSSEY_PORT: '3002', // Fixed: Use correct port
      CRYPTO_PORT: '3003'    // Fixed: Use correct port
    }
  });
  
  child.on('exit', (code) => {
    if (code === 0) {
      console.log(`✅ ${jobConfig.description} completed successfully`);
    } else {
      console.error(`❌ ${jobConfig.description} failed with code ${code}`);
    }
  });
  
  child.on('error', (error) => {
    console.error(`💥 ${jobConfig.description} error:`, error.message);
  });
  
  // Only set timeout for non-continuous processes (scheduled jobs)
  // Continuous processes like indexers should run indefinitely
  if (jobConfig.schedule !== null) {
    // Set different timeouts based on job type
    let timeoutMinutes = 10; // Default 10 minutes
    
    // Heavy operations that need more time
    if (jobName === 'oracle_cron' || jobName === 'unified_results_manager') {
      timeoutMinutes = 30; // 30 minutes for heavy operations
    } else if (jobName === 'fixtures_scheduler' || jobName === 'airdrop_scheduler') {
      timeoutMinutes = 20; // 20 minutes for fixtures fetching and airdrop calculations
    } else if (jobName === 'results_resolver' || jobName === 'auto_evaluation') {
      timeoutMinutes = 15; // 15 minutes for results processing
    }
    
    // Kill child process after timeout to prevent hanging (for scheduled jobs only)
    setTimeout(() => {
      if (!child.killed) {
        console.warn(`⏰ ${jobConfig.description} timeout after ${timeoutMinutes} minutes, killing process`);
        child.kill('SIGTERM');
        
        // Force kill if SIGTERM doesn't work after 30 seconds
        setTimeout(() => {
          if (!child.killed) {
            console.warn(`💀 Force killing ${jobConfig.description} after SIGTERM timeout`);
            child.kill('SIGKILL');
          }
        }, 30000);
      }
    }, timeoutMinutes * 60 * 1000);
  } else {
    // For continuous processes, restart them if they exit unexpectedly
    child.on('exit', (code) => {
      if (code !== 0) {
        console.log(`🔄 Restarting continuous process: ${jobConfig.description} (exit code: ${code})`);
        setTimeout(() => {
          runJob(jobName, jobConfig);
        }, 5000); // Wait 5 seconds before restarting
      }
    });
  }
}

// Initialize database and then schedule all jobs
async function startWorkers() {
  try {
    // Initialize coordination system first
    console.log('🎯 Initializing cron coordination system...');
    await cronCoordinator.initialize();
    console.log('✅ Cron coordination system initialized');
    
    // Initialize database first
    await initializeDatabase();
    
    // Schedule all jobs
    Object.entries(jobs).forEach(([jobName, jobConfig]) => {
      if (jobConfig.schedule === null) {
        // For continuous processes like indexers
        console.log(`🔄 Starting continuous process: ${jobConfig.description}`);
        runJob(jobName, jobConfig);
      } else {
        // For scheduled cron jobs
        console.log(`⏰ Scheduling ${jobConfig.description} with cron: ${jobConfig.schedule}`);
        
        cron.schedule(jobConfig.schedule, () => {
          runJob(jobName, jobConfig);
        }, {
          scheduled: true,
          timezone: "UTC"
        });
      }
    });
    
    console.log('✅ All workers scheduled successfully');
  } catch (error) {
    console.error('❌ Error starting workers:', error);
  }
}

// Start workers
startWorkers();

// Check if Oracle private key is configured
if (!process.env.ORACLE_SIGNER_PRIVATE_KEY) {
  console.log('📊 Skipping immediate Oracle Cron Job run (private key not configured)');
} else {
  console.log('✅ Oracle private key configured, Oracle Cron Job will run as scheduled');
}

// Keep the process alive
console.log('✅ Consolidated workers started successfully');
console.log(`📊 Active jobs: ${Object.keys(jobs).length}`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
}); 