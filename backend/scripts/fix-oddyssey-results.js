const SportMonksService = require('../services/sportmonks');
const db = require('../db/db');

/**
 * Fix Oddyssey Results Script
 * 
 * This script manually fetches and updates results for Oddyssey matches
 * that are showing as "No score" even though they should be finished.
 */
class FixOddysseyResults {
  constructor() {
    this.sportmonksService = new SportMonksService();
  }

  async run() {
    console.log('🔧 Starting Oddyssey results fix...');
    
    try {
      // Get the problematic fixture IDs from the logs
      const fixtureIds = [
        '19427470', '19433480', '19434270', '19427471', 
        '19424882', '19424883', '19424881', '19424886', 
        '19433782', '19387112'
      ];

      console.log(`📊 Checking ${fixtureIds.length} fixtures for results...`);

      // First, let's check the current status of these fixtures
      await this.checkCurrentStatus(fixtureIds);

      // Fetch results from SportMonks API
      console.log('🔍 Fetching results from SportMonks API...');
      const results = await this.sportmonksService.fetchFixtureResults(fixtureIds);
      
      console.log(`✅ Fetched ${results.length} results from API`);

      if (results.length === 0) {
        console.log('⚠️ No results fetched from API');
        return;
      }

      // Save results to both fixture_results table and result_info column
      await this.saveResults(results);

      // Verify the results were saved
      await this.verifyResults(fixtureIds);

      console.log('🎉 Oddyssey results fix completed!');

    } catch (error) {
      console.error('❌ Error in Oddyssey results fix:', error);
    }
  }

  async checkCurrentStatus(fixtureIds) {
    console.log('📊 Current fixture status:');
    
    const result = await db.query(`
      SELECT 
        f.id,
        f.home_team,
        f.away_team,
        f.status,
        f.match_date,
        f.result_info,
        fr.home_score,
        fr.away_score,
        fr.result_1x2,
        fr.result_ou25
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
      WHERE f.id = ANY($1)
      ORDER BY f.match_date
    `, [fixtureIds]);

    result.rows.forEach((row, index) => {
      const hasResultInfo = row.result_info !== null;
      const hasFixtureResults = row.home_score !== null && row.away_score !== null;
      const status = hasResultInfo || hasFixtureResults ? '✅' : '❌';
      
      console.log(`   ${status} ${index + 1}. ${row.home_team} vs ${row.away_team} [${row.status}] - Result: ${hasResultInfo ? 'result_info' : hasFixtureResults ? 'fixture_results' : 'No score'}`);
    });
  }

  async saveResults(results) {
    console.log('💾 Saving results to database...');
    
    let savedToFixtureResults = 0;
    let savedToResultInfo = 0;

    for (const result of results) {
      try {
        // Save to fixture_results table
        await db.query(`
          INSERT INTO oracle.fixture_results (
            id, fixture_id, home_score, away_score, ht_home_score, ht_away_score,
            result_1x2, result_ou25, finished_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
          ON CONFLICT (fixture_id) DO UPDATE SET
            home_score = EXCLUDED.home_score,
            away_score = EXCLUDED.away_score,
            ht_home_score = EXCLUDED.ht_home_score,
            ht_away_score = EXCLUDED.ht_away_score,
            result_1x2 = EXCLUDED.result_1x2,
            result_ou25 = EXCLUDED.result_ou25,
            finished_at = EXCLUDED.finished_at,
            updated_at = NOW()
        `, [
          `result_${result.fixture_id}`,
          result.fixture_id,
          result.home_score || null,
          result.away_score || null,
          result.ht_home_score || null,
          result.ht_away_score || null,
          result.result_1x2 || null,
          result.result_ou25 || null
        ]);
        
        savedToFixtureResults++;

        // Also save to result_info column in fixtures table
        await db.query(`
          UPDATE oracle.fixtures 
          SET result_info = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(result), result.fixture_id]);
        
        savedToResultInfo++;

        console.log(`✅ Saved result for fixture ${result.fixture_id}: ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team}`);

      } catch (error) {
        console.error(`❌ Failed to save result for fixture ${result.fixture_id}:`, error.message);
      }
    }

    console.log(`📊 Results saved: ${savedToFixtureResults} to fixture_results, ${savedToResultInfo} to result_info`);
  }

  async verifyResults(fixtureIds) {
    console.log('🔍 Verifying saved results...');
    
    const result = await db.query(`
      SELECT 
        f.id,
        f.home_team,
        f.away_team,
        f.status,
        f.result_info IS NOT NULL as has_result_info,
        fr.home_score IS NOT NULL as has_fixture_results
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
      WHERE f.id = ANY($1)
      ORDER BY f.match_date
    `, [fixtureIds]);

    let fixedCount = 0;
    result.rows.forEach((row, index) => {
      const hasResults = row.has_result_info || row.has_fixture_results;
      const status = hasResults ? '✅' : '❌';
      
      if (hasResults) fixedCount++;
      
      console.log(`   ${status} ${index + 1}. ${row.home_team} vs ${row.away_team} [${row.status}] - Results: ${hasResults ? 'FIXED' : 'Still missing'}`);
    });

    console.log(`📊 Verification complete: ${fixedCount}/${result.rows.length} fixtures now have results`);
  }
}

// Run the fix if this script is executed directly
if (require.main === module) {
  const fixer = new FixOddysseyResults();
  fixer.run()
    .then(() => {
      console.log('✅ Fix completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fix failed:', error);
      process.exit(1);
    });
}

module.exports = FixOddysseyResults;
