#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('./config');
const db = require('./db/db');

class AutomatedDataRepair {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.poolABI = [
      "function pools(uint256) external view returns (address creator, uint16 odds, bool settled, bool creatorSideWon, bool isPrivate, bool usesBitr, bool filledAbove60, uint8 oracleType, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, bytes32 predictedOutcome, bytes32 result, bytes32 marketId, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, uint256 arbitrationDeadline, string league, string category, string region, uint256 maxBetPerUser)"
    ];
    this.poolContract = new ethers.Contract(config.blockchain.contractAddresses.bitredictPool, this.poolABI, this.provider);
  }

  async runFullValidation() {
    console.log('🔧 Starting Automated Data Validation & Repair...');
    
    try {
      // Step 1: Fix database schema
      await this.fixDatabaseSchema();
      
      // Step 2: Validate and repair all pools
      await this.validateAndRepairPools();
      
      // Step 3: Validate fixture mappings
      await this.validateFixtureMappings();
      
      // Step 4: Generate health report
      await this.generateHealthReport();
      
      console.log('🎉 Automated data validation & repair completed!');
      
    } catch (error) {
      console.error('❌ Error in automated data repair:', error);
    } finally {
      process.exit(0);
    }
  }

  async fixDatabaseSchema() {
    console.log('\n📝 Step 1: Fixing database schema...');
    
    const schemaFixes = [
      // Change bigint columns to numeric for large numbers
      `ALTER TABLE oracle.pools ALTER COLUMN total_creator_side_stake TYPE NUMERIC(78,0)`,
      `ALTER TABLE oracle.pools ALTER COLUMN max_bettor_stake TYPE NUMERIC(78,0)`,
      `ALTER TABLE oracle.pools ALTER COLUMN total_bettor_stake TYPE NUMERIC(78,0)`,
      `ALTER TABLE oracle.pools ALTER COLUMN total_stake TYPE NUMERIC(78,0)`,
      
      // Add performance indexes
      `CREATE INDEX IF NOT EXISTS idx_pools_market_id ON oracle.pools(market_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pools_creator_address ON oracle.pools(creator_address)`,
      `CREATE INDEX IF NOT EXISTS idx_pools_status ON oracle.pools(status)`,
      `CREATE INDEX IF NOT EXISTS idx_pools_category ON oracle.pools(category)`,
      `CREATE INDEX IF NOT EXISTS idx_pools_created_at ON oracle.pools(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_pools_odds ON oracle.pools(odds)`,
      `CREATE INDEX IF NOT EXISTS idx_pools_use_bitr ON oracle.pools(use_bitr)`
    ];
    
    for (let i = 0; i < schemaFixes.length; i++) {
      const fix = schemaFixes[i];
      try {
        await db.query(fix);
        console.log(`✅ Schema fix ${i + 1} applied`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️ Schema fix ${i + 1} already applied`);
        } else {
          console.error(`❌ Schema fix ${i + 1} failed:`, error.message);
        }
      }
    }
  }

  async validateAndRepairPools() {
    console.log('\n🔍 Step 2: Validating and repairing pools...');
    
    const dbPools = await db.query('SELECT pool_id FROM oracle.pools ORDER BY pool_id');
    console.log(`📊 Found ${dbPools.rows.length} pools to validate`);
    
    let fixedCount = 0;
    let errorCount = 0;
    let issuesFound = [];
    
    for (const dbPool of dbPools.rows) {
      const poolId = parseInt(dbPool.pool_id);
      console.log(`\n🔍 Validating pool ${poolId}...`);
      
      try {
        // Get pool data from blockchain
        const poolIndex = poolId - 1;
        const poolData = await this.poolContract.pools(poolIndex);
        
        // Get current database data
        const currentData = await db.query('SELECT * FROM oracle.pools WHERE pool_id = $1', [poolId]);
        const current = currentData.rows[0];
        
        // Check for data inconsistencies
        const issues = this.detectDataIssues(poolData, current, poolId);
        
        if (issues.length > 0) {
          console.log(`⚠️ Issues found in pool ${poolId}:`);
          issues.forEach(issue => console.log(`   - ${issue}`));
          issuesFound.push({ poolId, issues });
          
          // Repair the data
          await this.repairPoolData(poolData, poolId);
          fixedCount++;
          console.log(`✅ Pool ${poolId} repaired`);
        } else {
          console.log(`✅ Pool ${poolId} data is consistent`);
        }
        
      } catch (error) {
        console.error(`❌ Error validating pool ${poolId}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Pool validation results:`);
    console.log(`   ✅ Fixed: ${fixedCount} pools`);
    console.log(`   ❌ Errors: ${errorCount} pools`);
    console.log(`   🔍 Issues found: ${issuesFound.length} pools`);
  }

  detectDataIssues(poolData, current, poolId) {
    const issues = [];
    
    // Check for missing or incorrect data
    if (!current.predicted_outcome || current.predicted_outcome === '') {
      issues.push('Missing predicted outcome');
    }
    
    if (!current.odds || current.odds === 0) {
      issues.push('Missing or zero odds');
    }
    
    if (!current.creator_stake || current.creator_stake === '0') {
      issues.push('Missing or zero creator stake');
    }
    
    if (!current.league) {
      issues.push('Missing league');
    }
    
    if (!current.category) {
      issues.push('Missing category');
    }
    
    // Check for data mismatches
    if (current.predicted_outcome !== poolData.predictedOutcome) {
      issues.push('Predicted outcome mismatch');
    }
    
    if (parseInt(current.odds) !== Number(poolData.odds)) {
      issues.push('Odds mismatch');
    }
    
    if (current.creator_stake !== poolData.creatorStake.toString()) {
      issues.push('Creator stake mismatch');
    }
    
    return issues;
  }

  async repairPoolData(poolData, poolId) {
    await db.query(`
      UPDATE oracle.pools SET
        predicted_outcome = $1,
        odds = $2,
        creator_stake = $3,
        league = $4,
        category = $5,
        region = $6,
        is_private = $7,
        max_bet_per_user = $8,
        use_bitr = $9,
        total_creator_side_stake = $10,
        max_bettor_stake = $11,
        total_bettor_stake = $12,
        betting_end_time = $13,
        arbitration_deadline = $14,
        updated_at = NOW()
      WHERE pool_id = $15
    `, [
      poolData.predictedOutcome,
      Number(poolData.odds),
      poolData.creatorStake.toString(),
      poolData.league || null,
      poolData.category || null,
      poolData.region || null,
      poolData.isPrivate,
      poolData.maxBetPerUser.toString(),
      poolData.usesBitr,
      poolData.totalCreatorSideStake.toString(),
      poolData.maxBettorStake.toString(),
      poolData.totalBettorStake.toString(),
      poolData.bettingEndTime.toString(),
      poolData.arbitrationDeadline.toString(),
      poolId
    ]);
  }

  async validateFixtureMappings() {
    console.log('\n🏟️ Step 3: Validating fixture mappings...');
    
    const fixtures = await db.query('SELECT * FROM oracle.fixture_mappings');
    console.log(`📊 Found ${fixtures.rows.length} fixture mappings`);
    
    // Check for pools without fixture mappings
    const poolsWithoutFixtures = await db.query(`
      SELECT p.pool_id, p.market_id, p.category 
      FROM oracle.pools p 
      LEFT JOIN oracle.fixture_mappings fm ON p.market_id = fm.market_id_hash 
      WHERE fm.market_id_hash IS NULL AND p.category = 'football'
    `);
    
    if (poolsWithoutFixtures.rows.length > 0) {
      console.log(`⚠️ Found ${poolsWithoutFixtures.rows.length} football pools without fixture mappings:`);
      poolsWithoutFixtures.rows.forEach(pool => {
        console.log(`   - Pool ${pool.pool_id}: ${pool.market_id}`);
      });
    } else {
      console.log('✅ All football pools have fixture mappings');
    }
  }

  async generateHealthReport() {
    console.log('\n📊 Step 4: Generating health report...');
    
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        COUNT(CASE WHEN predicted_outcome != '' THEN 1 END) as pools_with_outcome,
        COUNT(CASE WHEN odds > 0 THEN 1 END) as pools_with_odds,
        COUNT(CASE WHEN creator_stake > 0 THEN 1 END) as pools_with_stake,
        COUNT(CASE WHEN league IS NOT NULL THEN 1 END) as pools_with_league,
        COUNT(CASE WHEN category IS NOT NULL THEN 1 END) as pools_with_category,
        COUNT(CASE WHEN use_bitr = true THEN 1 END) as bitr_pools,
        COUNT(CASE WHEN use_bitr = false THEN 1 END) as stt_pools
      FROM oracle.pools
    `);
    
    const stat = stats.rows[0];
    
    console.log('📈 Pool Data Health Report:');
    console.log(`   Total Pools: ${stat.total_pools}`);
    console.log(`   With Predicted Outcome: ${stat.pools_with_outcome}/${stat.total_pools} (${Math.round(stat.pools_with_outcome/stat.total_pools*100)}%)`);
    console.log(`   With Odds: ${stat.pools_with_odds}/${stat.total_pools} (${Math.round(stat.pools_with_odds/stat.total_pools*100)}%)`);
    console.log(`   With Creator Stake: ${stat.pools_with_stake}/${stat.total_pools} (${Math.round(stat.pools_with_stake/stat.total_pools*100)}%)`);
    console.log(`   With League: ${stat.pools_with_league}/${stat.total_pools} (${Math.round(stat.pools_with_league/stat.total_pools*100)}%)`);
    console.log(`   With Category: ${stat.pools_with_category}/${stat.total_pools} (${Math.round(stat.pools_with_category/stat.total_pools*100)}%)`);
    console.log(`   BITR Pools: ${stat.bitr_pools}`);
    console.log(`   STT Pools: ${stat.stt_pools}`);
    
    // Check for recent pools
    const recentPools = await db.query(`
      SELECT pool_id, created_at, predicted_outcome, odds, creator_stake, league, category
      FROM oracle.pools 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('\n🕒 Recent Pools:');
    recentPools.rows.forEach(pool => {
      console.log(`   Pool ${pool.pool_id}: ${pool.league || 'No League'} - ${pool.category || 'No Category'} - ${pool.odds || 0} odds - ${pool.creator_stake || 0} stake`);
    });
  }
}

// Run the automated repair
const repair = new AutomatedDataRepair();
repair.runFullValidation();
