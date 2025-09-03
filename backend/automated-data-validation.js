#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('./config');
const db = require('./db/db');

class AutomatedDataValidation {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.poolABI = [
      "function pools(uint256) external view returns (address creator, uint16 odds, bool settled, bool creatorSideWon, bool isPrivate, bool usesBitr, bool filledAbove60, uint8 oracleType, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, bytes32 predictedOutcome, bytes32 result, bytes32 marketId, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, uint256 arbitrationDeadline, string league, string category, string region, uint256 maxBetPerUser)"
    ];
    this.poolContract = new ethers.Contract(config.blockchain.contractAddresses.bitredictPool, this.poolABI, this.provider);
  }

  async runValidation() {
    console.log('🔍 Starting Automated Data Validation...\n');
    
    try {
      // Step 1: Validate all pools
      await this.validateAllPools();
      
      // Step 2: Validate fixture mappings
      await this.validateFixtureMappings();
      
      // Step 3: Fix any issues found
      await this.fixIssues();
      
      // Step 4: Generate health report
      await this.generateHealthReport();
      
      console.log('🎉 Automated data validation completed!');
      
    } catch (error) {
      console.error('❌ Error in automated validation:', error);
    } finally {
      process.exit(0);
    }
  }

  async validateAllPools() {
    console.log('📊 Step 1: Validating all pools...');
    
    const pools = await db.query(`
      SELECT p.pool_id, p.predicted_outcome, p.league, p.category, p.market_id,
             fm.home_team, fm.away_team, fm.league_name, fm.predicted_outcome as fixture_outcome
      FROM oracle.pools p
      LEFT JOIN oracle.fixture_mappings fm ON p.market_id = fm.market_id_hash
      ORDER BY p.pool_id
    `);
    
    console.log(`📋 Found ${pools.rows.length} pools to validate`);
    
    let issues = [];
    
    for (const pool of pools.rows) {
      const poolIssues = await this.validatePool(pool);
      if (poolIssues.length > 0) {
        issues.push({ poolId: pool.pool_id, issues: poolIssues });
      }
    }
    
    this.poolIssues = issues;
    console.log(`🔍 Found ${issues.length} pools with issues`);
  }

  async validatePool(pool) {
    const issues = [];
    
    // Check for missing fixture mapping
    if (!pool.home_team || !pool.away_team) {
      issues.push('Missing fixture mapping');
    }
    
    // Check for league mismatch
    if (pool.league !== pool.league_name && pool.league_name) {
      issues.push(`League mismatch: DB=${pool.league}, Fixture=${pool.league_name}`);
    }
    
    // Check for missing predicted outcome in fixture mapping
    if (pool.predicted_outcome && pool.predicted_outcome.startsWith('0x') && !pool.fixture_outcome) {
      issues.push('Missing decoded predicted outcome in fixture mapping');
    }
    
    // Check for redundant title patterns
    if (pool.fixture_outcome && pool.fixture_outcome.includes(' vs ') && pool.fixture_outcome.includes(' in ')) {
      const teams = pool.fixture_outcome.match(/(.+) vs (.+) in/);
      if (teams && teams[1] === teams[2]) {
        issues.push('Redundant team names in predicted outcome');
      }
    }
    
    return issues;
  }

  async validateFixtureMappings() {
    console.log('\n🏟️ Step 2: Validating fixture mappings...');
    
    const fixtures = await db.query(`
      SELECT * FROM oracle.fixture_mappings
      ORDER BY created_at DESC
    `);
    
    console.log(`📋 Found ${fixtures.rows.length} fixture mappings`);
    
    let issues = [];
    
    for (const fixture of fixtures.rows) {
      const fixtureIssues = this.validateFixture(fixture);
      if (fixtureIssues.length > 0) {
        issues.push({ fixtureId: fixture.id, issues: fixtureIssues });
      }
    }
    
    this.fixtureIssues = issues;
    console.log(`🔍 Found ${issues.length} fixture mappings with issues`);
  }

  validateFixture(fixture) {
    const issues = [];
    
    // Check for missing team names
    if (!fixture.home_team || !fixture.away_team) {
      issues.push('Missing team names');
    }
    
    // Check for missing league
    if (!fixture.league_name) {
      issues.push('Missing league name');
    }
    
    // Check for missing predicted outcome
    if (!fixture.predicted_outcome) {
      issues.push('Missing predicted outcome');
    }
    
    // Check for redundant team names in predicted outcome
    if (fixture.predicted_outcome && fixture.predicted_outcome.includes(' vs ') && fixture.predicted_outcome.includes(' in ')) {
      const teams = fixture.predicted_outcome.match(/(.+) vs (.+) in/);
      if (teams && teams[1] === teams[2]) {
        issues.push('Redundant team names in predicted outcome');
      }
    }
    
    return issues;
  }

  async fixIssues() {
    console.log('\n🔧 Step 3: Fixing issues...');
    
    let fixedCount = 0;
    
    // Fix pool issues
    for (const poolIssue of this.poolIssues) {
      console.log(`\n🔧 Fixing pool ${poolIssue.poolId}:`);
      poolIssue.issues.forEach(issue => console.log(`   - ${issue}`));
      
      const fixed = await this.fixPoolIssues(poolIssue.poolId, poolIssue.issues);
      if (fixed) fixedCount++;
    }
    
    // Fix fixture issues
    for (const fixtureIssue of this.fixtureIssues) {
      console.log(`\n🔧 Fixing fixture ${fixtureIssue.fixtureId}:`);
      fixtureIssue.issues.forEach(issue => console.log(`   - ${issue}`));
      
      const fixed = await this.fixFixtureIssues(fixtureIssue.fixtureId, fixtureIssue.issues);
      if (fixed) fixedCount++;
    }
    
    console.log(`\n✅ Fixed ${fixedCount} issues`);
  }

  async fixPoolIssues(poolId, issues) {
    try {
      // Get pool data
      const poolData = await db.query('SELECT * FROM oracle.pools WHERE pool_id = $1', [poolId]);
      if (poolData.rows.length === 0) return false;
      
      const pool = poolData.rows[0];
      
      // Fix league mismatch
      if (issues.some(issue => issue.includes('League mismatch'))) {
        const fixtureData = await db.query(`
          SELECT league_name FROM oracle.fixture_mappings 
          WHERE market_id_hash = $1
        `, [pool.market_id]);
        
        if (fixtureData.rows.length > 0) {
          await db.query(`
            UPDATE oracle.pools 
            SET league = $1, updated_at = NOW()
            WHERE pool_id = $2
          `, [fixtureData.rows[0].league_name, poolId]);
          
          console.log(`   ✅ Fixed league mismatch`);
        }
      }
      
      // Fix missing decoded predicted outcome
      if (issues.some(issue => issue.includes('Missing decoded predicted outcome'))) {
        const decodedOutcome = await this.decodeHash(pool.predicted_outcome);
        if (decodedOutcome) {
          const fixtureData = await db.query(`
            SELECT home_team, away_team FROM oracle.fixture_mappings 
            WHERE market_id_hash = $1
          `, [pool.market_id]);
          
          if (fixtureData.rows.length > 0) {
            const fixture = fixtureData.rows[0];
            const readableOutcome = this.createReadableOutcome(decodedOutcome, fixture.home_team, fixture.away_team);
            
            await db.query(`
              UPDATE oracle.fixture_mappings 
              SET predicted_outcome = $1
              WHERE market_id_hash = $2
            `, [readableOutcome, pool.market_id]);
            
            console.log(`   ✅ Fixed missing decoded predicted outcome`);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error(`   ❌ Error fixing pool ${poolId}:`, error.message);
      return false;
    }
  }

  async fixFixtureIssues(fixtureId, issues) {
    try {
      // Get fixture data
      const fixtureData = await db.query('SELECT * FROM oracle.fixture_mappings WHERE id = $1', [fixtureId]);
      if (fixtureData.rows.length === 0) return false;
      
      const fixture = fixtureData.rows[0];
      
      // Fix redundant team names
      if (issues.some(issue => issue.includes('Redundant team names'))) {
        const cleanOutcome = this.cleanRedundantTeamNames(fixture.predicted_outcome, fixture.home_team, fixture.away_team);
        
        await db.query(`
          UPDATE oracle.fixture_mappings 
          SET predicted_outcome = $1
          WHERE id = $2
        `, [cleanOutcome, fixtureId]);
        
        console.log(`   ✅ Fixed redundant team names`);
      }
      
      return true;
    } catch (error) {
      console.error(`   ❌ Error fixing fixture ${fixtureId}:`, error.message);
      return false;
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
    
    console.log('📈 Data Health Report:');
    console.log(`   Total Pools: ${stat.total_pools}`);
    console.log(`   With Predicted Outcome: ${stat.pools_with_outcome}/${stat.total_pools} (${Math.round(stat.pools_with_outcome/stat.total_pools*100)}%)`);
    console.log(`   With Odds: ${stat.pools_with_odds}/${stat.total_pools} (${Math.round(stat.pools_with_odds/stat.total_pools*100)}%)`);
    console.log(`   With Creator Stake: ${stat.pools_with_stake}/${stat.total_pools} (${Math.round(stat.pools_with_stake/stat.total_pools*100)}%)`);
    console.log(`   With League: ${stat.pools_with_league}/${stat.total_pools} (${Math.round(stat.pools_with_league/stat.total_pools*100)}%)`);
    console.log(`   With Category: ${stat.pools_with_category}/${stat.total_pools} (${Math.round(stat.pools_with_category/stat.total_pools*100)}%)`);
    console.log(`   BITR Pools: ${stat.bitr_pools}`);
    console.log(`   STT Pools: ${stat.stt_pools}`);
    
    // Check for pools without fixture mappings
    const poolsWithoutFixtures = await db.query(`
      SELECT COUNT(*) as count
      FROM oracle.pools p 
      LEFT JOIN oracle.fixture_mappings fm ON p.market_id = fm.market_id_hash 
      WHERE fm.market_id_hash IS NULL AND p.category = 'football'
    `);
    
    console.log(`   Pools without fixture mappings: ${poolsWithoutFixtures.rows[0].count}`);
  }

  async decodeHash(hash) {
    if (!hash || !hash.startsWith('0x')) return null;
    
    // Test common prediction values
    const testValues = [
      '1', '2', 'x', 'home', 'away', 'draw', 
      'over', 'under', 'o', 'u',
      'btts', 'both teams to score',
      'yes', 'no', 'y', 'n',
      'over_25_goals', 'under_25_goals',
      'over_15_goals', 'under_15_goals',
      'over_35_goals', 'under_35_goals',
      'over_2.5_goals', 'under_2.5_goals',
      'over_1.5_goals', 'under_1.5_goals',
      'over_3.5_goals', 'under_3.5_goals'
    ];
    
    for (const value of testValues) {
      const testHash = ethers.keccak256(ethers.toUtf8Bytes(value));
      if (testHash.toLowerCase() === hash.toLowerCase()) {
        return value;
      }
    }
    
    return null;
  }

  createReadableOutcome(decodedOutcome, homeTeam, awayTeam) {
    if (!homeTeam || !awayTeam) {
      return decodedOutcome;
    }
    
    const outcome = decodedOutcome.toLowerCase();
    
    if (['1', 'home'].includes(outcome)) {
      return `${homeTeam} wins`;
    } else if (['2', 'away'].includes(outcome)) {
      return `${awayTeam} wins`;
    } else if (['x', 'draw'].includes(outcome)) {
      return `Draw between ${homeTeam} and ${awayTeam}`;
    } else if (['o', 'over'].includes(outcome)) {
      return `Over 2.5 goals in ${homeTeam} vs ${awayTeam}`;
    } else if (['u', 'under'].includes(outcome)) {
      return `Under 2.5 goals in ${homeTeam} vs ${awayTeam}`;
    } else if (outcome.includes('over_2.5')) {
      return `Over 2.5 goals in ${homeTeam} vs ${awayTeam}`;
    } else if (outcome.includes('under_2.5')) {
      return `Under 2.5 goals in ${homeTeam} vs ${awayTeam}`;
    } else if (outcome.includes('over_1.5')) {
      return `Over 1.5 goals in ${homeTeam} vs ${awayTeam}`;
    } else if (outcome.includes('under_1.5')) {
      return `Under 1.5 goals in ${homeTeam} vs ${awayTeam}`;
    } else if (outcome.includes('over_3.5')) {
      return `Over 3.5 goals in ${homeTeam} vs ${awayTeam}`;
    } else if (outcome.includes('under_3.5')) {
      return `Under 3.5 goals in ${homeTeam} vs ${awayTeam}`;
    } else if (['btts', 'both_teams_to_score'].includes(outcome)) {
      return `Both teams to score in ${homeTeam} vs ${awayTeam}`;
    } else if (['yes', 'y'].includes(outcome)) {
      return `Yes in ${homeTeam} vs ${awayTeam}`;
    } else if (['no', 'n'].includes(outcome)) {
      return `No in ${homeTeam} vs ${awayTeam}`;
    } else {
      return `${decodedOutcome} in ${homeTeam} vs ${awayTeam}`;
    }
  }

  cleanRedundantTeamNames(predictedOutcome, homeTeam, awayTeam) {
    if (!predictedOutcome || !homeTeam || !awayTeam) return predictedOutcome;
    
    // Remove redundant team names pattern: "Team vs Team in outcome"
    const pattern = new RegExp(`${homeTeam} vs ${awayTeam} in `, 'gi');
    return predictedOutcome.replace(pattern, '');
  }
}

// Run the validation
const validator = new AutomatedDataValidation();
validator.runValidation();
