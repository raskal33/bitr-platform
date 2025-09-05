#!/usr/bin/env node

/**
 * Perfect Database Setup Script
 * This script initializes the new database with the perfect schema
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

async function setupPerfectDatabase() {
  console.log('🚀 BITREDICT PERFECT DATABASE SETUP\n');
  
  try {
    // Step 1: Verify environment
    console.log('📋 Step 1: Verifying environment...');
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    console.log('✅ DATABASE_URL is configured');
    
    // Step 2: Apply perfect schema (if needed)
    console.log('\n📋 Step 2: Checking perfect database schema...');
    const schemaPath = path.join(__dirname, 'database', 'perfect-schema.sql');
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }
    
    // Check if we need to apply the schema
    try {
      const result = await db.query('SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema IN (\'oracle\', \'oddyssey\', \'analytics\', \'system\', \'crypto\', \'core\', \'airdrop\', \'prediction\', \'public\')');
      const tableCount = result.rows[0].count;
      
      if (tableCount < 60) {
        console.log('📋 Applying perfect database schema...');
        execSync(`npx prisma db execute --file ${schemaPath} --schema ./prisma/schema.prisma`, {
          cwd: __dirname,
          stdio: 'inherit'
        });
        console.log('✅ Perfect schema applied successfully');
      } else {
        console.log('✅ Database already has sufficient tables, skipping schema application');
      }
    } catch (error) {
      console.warn('⚠️ Schema application warning (may already be applied):', error.message);
    }
    
    // Step 3: Sync Prisma schema with database
    console.log('\n📋 Step 3: Syncing Prisma schema with current database...');
    try {
      execSync('npx prisma db pull', {
        cwd: __dirname,
        stdio: 'inherit'
      });
      console.log('✅ Prisma schema synced with database');
    } catch (error) {
      console.warn('⚠️ Prisma sync warning:', error.message);
    }
    
    // Step 4: Generate Prisma client
    console.log('\n📋 Step 4: Generating Prisma client...');
    try {
      execSync('npx prisma generate', {
        cwd: __dirname,
        stdio: 'inherit'
      });
      console.log('✅ Prisma client generated successfully');
    } catch (error) {
      console.warn('⚠️ Prisma client generation warning:', error.message);
    }
    
    // Step 5: Verify database connection
    console.log('\n📋 Step 5: Verifying database connection...');
    const db = require('./db/db');
    await db.connect();
    console.log('✅ Database connection successful');
    
    // Step 6: Verify tables exist
    console.log('\n📋 Step 6: Verifying tables...');
    const expectedTables = [
      // Core schema
      'core.users',
      'core.reputation_actions',
      'core.achievements',
      'core.user_badges',
      'core.community_discussions',
      'core.discussion_replies',
      'core.pool_comments',
      'core.pool_creation_notifications',
      'core.pool_reflections',
      'core.reputation_log',
      'core.social_reactions',
      // Oracle schema
      'oracle.leagues',
      'oracle.fixtures',
      'oracle.fixture_odds',
      'oracle.fixture_results',
      'oracle.football_prediction_markets',
      'oracle.matches',
      'oracle.oddyssey_cycles',
      'oracle.coins',
      'oracle.crypto_price_snapshots',
      'oracle.crypto_prediction_markets',
      'oracle.crypto_market_stats',
      'oracle.crypto_resolution_logs',
      'oracle.football_resolution_logs',
      'oracle.football_market_stats',
      'oracle.referees',
      'oracle.venues',
      'oracle.bookmakers',
      'oracle.countries',
      'oracle.daily_game_matches',
      'oracle.oddyssey_slips',
      'oracle.active_crypto_markets',
      'oracle.blockchain_events',
      'oracle.crypto_coins',
      'oracle.current_oddyssey_cycle',
      'oracle.match_results',
      'oracle.oddyssey_cumulative_stats',
      'oracle.oddyssey_prize_claims',
      'oracle.oddyssey_user_analytics',
      'oracle.oddyssey_user_preferences',
      'oracle.oddyssey_user_stats',
      'oracle.pending_crypto_resolutions',
      'oracle.pool_bets',
      'oracle.pools',
      'oracle.results_fetching_logs',
      'oracle.slip_evaluation_jobs',
      'oracle.system_alerts',
      'oracle.cron_job_logs',
      'oracle.combo_pools',
      'oracle.fixture_mappings',
      'oracle.indexed_blocks',
      'oracle.indexer_state',
      'oracle.monitoring_alerts',
      'oracle.monitoring_metrics',
      'oracle.cycle_health_checks',
      'oracle.cycle_health_reports',
      'oracle.oddyssey_prize_rollovers',
      'oracle.pool_claims',
      'oracle.pool_liquidity_providers',
      'oracle.pool_refunds',
      'oracle.system_health_checks',
      // Oddyssey schema
      'oddyssey.daily_games',
      'oddyssey.oddyssey_slip_selections',
      'oddyssey.slips',
      'oddyssey.slip_entries',
      'oddyssey.game_results',
      'oddyssey.cycle_status',
      'oddyssey.events',
      // Analytics schema
      'analytics.user_analytics',
      'analytics.market_analytics',
      'analytics.staking_events',
      'analytics.pools',
      'analytics.bitr_rewards',
      'analytics.category_stats',
      'analytics.daily_stats',
      'analytics.hourly_activity',
      'analytics.pool_challenge_scores',
      'analytics.user_social_stats',
      // System schema
      'system.config',
      'system.logs',
      'system.cron_locks',
      'system.cron_execution_log',
      'system.health_checks',
      'system.performance_metrics',
      // Crypto schema
      'crypto.crypto_coins',
      // Airdrop schema
      'airdrop.faucet_claims',
      'airdrop.bitr_activities',
      'airdrop.staking_activities',
      'airdrop.transfer_patterns',
      'airdrop.eligibility',
      'airdrop.snapshots',
      'airdrop.snapshot_balances',
      'airdrop.statistics',
      'airdrop.summary_stats',
      // Prediction schema
      'prediction.bets',
      'prediction.pools',
      // Public schema
      'public.betting_cycles',
      'public.leagues',
      'public.matches',
      'public.oracle_submissions',
      'public.predictions',
      'public.seasons',
      'public.teams',
      'public.transactions',
      'public.users',
      // Neon Auth schema
      'neon_auth.users_sync'
    ];
    
    for (const tableName of expectedTables) {
      try {
        const result = await db.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
        console.log(`✅ ${tableName} - OK`);
      } catch (error) {
        console.error(`❌ ${tableName} - ERROR:`, error.message);
        throw new Error(`Table ${tableName} is not accessible`);
      }
    }
    
    // Step 7: Test type casting
    console.log('\n📋 Step 7: Testing type casting...');
    try {
      // Test a query that would have caused type casting issues
      const testQuery = `
        SELECT f.id, fo.fixture_id 
        FROM oracle.fixtures f 
        LEFT JOIN oracle.fixture_odds fo ON f.id = fo.fixture_id 
        LIMIT 1
      `;
      await db.query(testQuery);
      console.log('✅ Type casting test passed');
    } catch (error) {
      console.error('❌ Type casting test failed:', error.message);
      throw new Error('Type casting issues detected');
    }
    
    // Step 8: Insert initial data
    console.log('\n📋 Step 8: Inserting initial data...');
    
    // Insert today's daily game if it doesn't exist
    const today = new Date().toISOString().split('T')[0];
    await db.query(`
      INSERT INTO oddyssey.daily_games (game_date, entry_fee, max_participants, status)
      VALUES ($1, 0.01, 1000, 'active')
      ON CONFLICT (game_date) DO NOTHING
    `, [today]);
    console.log('✅ Daily game for today created');
    
    // Insert system configuration
    await db.query(`
      INSERT INTO system.config (key, value, description) VALUES
      ('sportmonks_api_token', '', 'SportMonks API token for football data'),
      ('coinpaprika_api_key', '', 'Coinpaprika API key for crypto data'),
      ('web3_provider_url', '', 'Web3 provider URL for blockchain interactions'),
      ('admin_wallet_address', '', 'Admin wallet address for contract interactions'),
      ('system_status', 'active', 'System status: active, maintenance, disabled')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log('✅ System configuration initialized');
    
    // Step 9: Final verification
    console.log('\n📋 Step 9: Final verification...');
    
    // Count tables
    const tableCount = await db.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema IN ('oracle', 'oddyssey', 'analytics', 'system', 'crypto', 'core', 'airdrop', 'prediction', 'public', 'neon_auth')
    `);
    
    const configCount = await db.query('SELECT COUNT(*) as count FROM system.config');
    const dailyGameCount = await db.query('SELECT COUNT(*) as count FROM oddyssey.daily_games');
    
    console.log(`✅ Database setup complete!`);
    console.log(`   📊 Total tables: ${tableCount.rows[0].count} (expected: 117+)`);
    console.log(`   ⚙️  System configs: ${configCount.rows[0].count}`);
    console.log(`   🎮 Daily games: ${dailyGameCount.rows[0].count}`);
    
    await db.disconnect();
    console.log('\n🎉 PERFECT DATABASE SETUP COMPLETED SUCCESSFULLY!');
    console.log('\n📋 Next steps:');
    console.log('   1. Deploy to Fly.io: cd backend && fly deploy --app bitredict-backend');
    console.log('   2. Test the API endpoints');
    console.log('   3. Run SportMonks integration');
    
  } catch (error) {
    console.error('\n❌ SETUP FAILED:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check DATABASE_URL is correct');
    console.error('   2. Ensure database is accessible');
    console.error('   3. Verify Prisma is installed: npm install prisma');
    console.error('   4. Check file permissions');
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupPerfectDatabase();
}

module.exports = { setupPerfectDatabase };
