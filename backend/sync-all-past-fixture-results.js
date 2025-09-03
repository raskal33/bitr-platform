'use strict';
const db = require('./db/db');

class AllPastFixtureResultsSync {
  constructor() {
    this.syncedCount = 0;
    this.errorCount = 0;
    this.skippedCount = 0;
  }

  async syncAllPastFixtureResults() {
    console.log('🔄 Syncing ALL past fixture results to match_results table...');
    
    try {
      // Get all fixtures with results that need to be synced
      const fixturesResult = await db.query(`
        SELECT 
          f.id as fixture_id,
          f.home_team,
          f.away_team,
          f.match_date,
          f.status,
          f.result_info,
          mr.match_id as existing_match_result
        FROM oracle.fixtures f
        LEFT JOIN oracle.match_results mr ON f.id::VARCHAR = mr.match_id::VARCHAR
        WHERE f.result_info IS NOT NULL
        AND f.status IN ('FT', 'AET', 'PEN', 'FT_PEN')
        AND mr.match_id IS NULL
        ORDER BY f.match_date DESC
      `);
      
      console.log(`📊 Found ${fixturesResult.rows.length} fixtures with results to sync`);
      
      if (fixturesResult.rows.length === 0) {
        console.log('✅ No fixtures need syncing - all are up to date!');
        return;
      }
      
      // Process in batches to avoid memory issues
      const batchSize = 50;
      for (let i = 0; i < fixturesResult.rows.length; i += batchSize) {
        const batch = fixturesResult.rows.slice(i, i + batchSize);
        console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(fixturesResult.rows.length/batchSize)} (${batch.length} fixtures)`);
        
        for (const fixture of batch) {
          try {
            await this.syncSingleFixture(fixture);
            this.syncedCount++;
            
            // Progress indicator
            if (this.syncedCount % 10 === 0) {
              console.log(`   ✅ Synced ${this.syncedCount} fixtures so far...`);
            }
          } catch (error) {
            console.error(`❌ Failed to sync fixture ${fixture.fixture_id}:`, error.message);
            this.errorCount++;
          }
        }
      }
      
      console.log(`\n🎉 Sync completed:`);
      console.log(`   ✅ Synced: ${this.syncedCount}`);
      console.log(`   ❌ Errors: ${this.errorCount}`);
      console.log(`   ⏭️ Skipped: ${this.skippedCount}`);
      
    } catch (error) {
      console.error('❌ Error in syncAllPastFixtureResults:', error);
    }
  }

  async syncSingleFixture(fixture) {
    const resultInfo = fixture.result_info;
    
    if (!resultInfo || resultInfo.home_score === null || resultInfo.home_score === undefined || 
        resultInfo.away_score === null || resultInfo.away_score === undefined) {
      console.log(`⚠️ Skipping fixture ${fixture.fixture_id}: incomplete result info`);
      this.skippedCount++;
      return;
    }
    
    // Calculate outcomes based on scores
    const outcomes = this.calculateOutcomes(resultInfo);
    
    // Insert into match_results table
    await db.query(`
      INSERT INTO oracle.match_results (
        id, match_id, home_score, away_score, ht_home_score, ht_away_score,
        outcome_1x2, outcome_ou05, outcome_ou15, outcome_ou25, outcome_ou35,
        outcome_ht_result, outcome_btts, full_score, ht_score,
        state_id, result_info, finished_at, resolved_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
    `, [
      `match_result_${fixture.fixture_id}`,
      fixture.fixture_id,
      resultInfo.home_score,
      resultInfo.away_score,
      resultInfo.ht_home_score || null,
      resultInfo.ht_away_score || null,
      outcomes.outcome_1x2,
      outcomes.outcome_ou05,
      outcomes.outcome_ou15,
      outcomes.outcome_ou25,
      outcomes.outcome_ou35,
      outcomes.outcome_ht_result,
      outcomes.outcome_btts,
      outcomes.full_score,
      outcomes.ht_score,
      resultInfo.status || 'FT',
      JSON.stringify(resultInfo),
      fixture.match_date
    ]);
    
    // Only log every 10th fixture to avoid spam
    if (this.syncedCount % 10 === 0) {
      console.log(`   ✅ Synced fixture ${fixture.fixture_id}: ${fixture.home_team} ${resultInfo.home_score}-${resultInfo.away_score} ${fixture.away_team}`);
    }
  }

  calculateOutcomes(resultInfo) {
    const homeScore = resultInfo.home_score;
    const awayScore = resultInfo.away_score;
    const htHomeScore = resultInfo.ht_home_score;
    const htAwayScore = resultInfo.ht_away_score;
    
    // Calculate 1X2 outcome
    let outcome_1x2;
    if (homeScore > awayScore) outcome_1x2 = '1';
    else if (homeScore < awayScore) outcome_1x2 = '2';
    else outcome_1x2 = 'X';
    
    // Calculate Over/Under outcomes
    const totalGoals = homeScore + awayScore;
    const htTotalGoals = (htHomeScore || 0) + (htAwayScore || 0);
    
    const outcome_ou05 = totalGoals > 0.5 ? 'Over' : 'Under';
    const outcome_ou15 = totalGoals > 1.5 ? 'Over' : 'Under';
    const outcome_ou25 = totalGoals > 2.5 ? 'Over' : 'Under';
    const outcome_ou35 = totalGoals > 3.5 ? 'Over' : 'Under';
    
    // Calculate half-time result
    let outcome_ht_result;
    if (htHomeScore > htAwayScore) outcome_ht_result = '1';
    else if (htHomeScore < htAwayScore) outcome_ht_result = '2';
    else outcome_ht_result = 'X';
    
    // Calculate BTTS (Both Teams To Score)
    const outcome_btts = (homeScore > 0 && awayScore > 0) ? 'Yes' : 'No';
    
    return {
      outcome_1x2,
      outcome_ou05,
      outcome_ou15,
      outcome_ou25,
      outcome_ou35,
      outcome_ht_result,
      outcome_btts,
      full_score: `${homeScore}-${awayScore}`,
      ht_score: htHomeScore && htAwayScore ? `${htHomeScore}-${htAwayScore}` : null
    };
  }

  async updateAllOddysseyCycles() {
    console.log('\n🔄 Updating all Oddyssey cycles with resolved results...');
    
    try {
      // Get all cycles that need updating
      const cyclesResult = await db.query(`
        SELECT cycle_id, matches_data, is_resolved 
        FROM oracle.current_oddyssey_cycle 
        ORDER BY created_at DESC
      `);
      
      console.log(`📊 Found ${cyclesResult.rows.length} cycles to check`);
      
      let updatedCount = 0;
      
      for (const cycle of cyclesResult.rows) {
        try {
          const updated = await this.updateCycleResults(cycle);
          if (updated) {
            updatedCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to update cycle ${cycle.cycle_id}:`, error.message);
        }
      }
      
      console.log(`✅ Updated ${updatedCount} cycles with resolved results`);
      
    } catch (error) {
      console.error('❌ Error updating cycles:', error);
    }
  }

  async updateCycleResults(cycle) {
    const updatedMatchesData = [];
    let hasUpdates = false;
    
    for (const match of cycle.matches_data) {
      // Get match result from match_results table
      const resultQuery = await db.query(`
        SELECT outcome_1x2, outcome_ou25 FROM oracle.match_results 
        WHERE match_id = $1
      `, [match.id]);
      
      if (resultQuery.rows.length > 0) {
        const result = resultQuery.rows[0];
        const newResult = {
          moneyline: this.convertOutcomeToNumber(result.outcome_1x2),
          overUnder: this.convertOutcomeToNumber(result.outcome_ou25)
        };
        
        // Check if result has changed
        if (!match.result || 
            match.result.moneyline !== newResult.moneyline || 
            match.result.overUnder !== newResult.overUnder) {
          match.result = newResult;
          hasUpdates = true;
        }
      }
      
      updatedMatchesData.push(match);
    }
    
    if (hasUpdates) {
      // Update the cycle with resolved results
      await db.query(`
        UPDATE oracle.current_oddyssey_cycle 
        SET 
          matches_data = $1,
          is_resolved = true,
          resolved_at = NOW(),
          updated_at = NOW()
        WHERE cycle_id = $2
      `, [JSON.stringify(updatedMatchesData), cycle.cycle_id]);
      
      console.log(`   ✅ Updated cycle ${cycle.cycle_id}`);
      return true;
    }
    
    return false;
  }

  convertOutcomeToNumber(outcome) {
    if (!outcome) return 0;
    
    switch (outcome) {
      case '1': return 1;
      case '2': return 2;
      case 'X': return 3;
      case 'Over': return 1;
      case 'Under': return 2;
      default: return 0;
    }
  }

  async generateReport() {
    console.log('\n📊 Generating sync report...');
    
    try {
      // Count fixtures with results
      const fixturesWithResults = await db.query(`
        SELECT COUNT(*) as count FROM oracle.fixtures 
        WHERE result_info IS NOT NULL AND status IN ('FT', 'AET', 'PEN', 'FT_PEN')
      `);
      
      // Count fixtures in match_results
      const fixturesInMatchResults = await db.query(`
        SELECT COUNT(*) as count FROM oracle.match_results
      `);
      
      // Count cycles
      const cyclesCount = await db.query(`
        SELECT COUNT(*) as count FROM oracle.current_oddyssey_cycle
      `);
      
      // Count resolved cycles
      const resolvedCyclesCount = await db.query(`
        SELECT COUNT(*) as count FROM oracle.current_oddyssey_cycle WHERE is_resolved = true
      `);
      
      console.log('\n📈 SYNC REPORT:');
      console.log(`   📋 Fixtures with results: ${fixturesWithResults.rows[0].count}`);
      console.log(`   📊 Fixtures in match_results: ${fixturesInMatchResults.rows[0].count}`);
      console.log(`   🔄 Total cycles: ${cyclesCount.rows[0].count}`);
      console.log(`   ✅ Resolved cycles: ${resolvedCyclesCount.rows[0].count}`);
      console.log(`   📦 This sync: ${this.syncedCount} synced, ${this.errorCount} errors, ${this.skippedCount} skipped`);
      
    } catch (error) {
      console.error('❌ Error generating report:', error);
    }
  }
}

async function main() {
  const sync = new AllPastFixtureResultsSync();
  
  console.log('🚀 Starting comprehensive past fixture results sync...');
  
  // Step 1: Sync all past fixture results
  await sync.syncAllPastFixtureResults();
  
  // Step 2: Update all Oddyssey cycles
  await sync.updateAllOddysseyCycles();
  
  // Step 3: Generate report
  await sync.generateReport();
  
  console.log('\n🎉 Comprehensive sync completed!');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
