const db = require('../db/db');

/**
 * Test Oddyssey Resolution Script
 * 
 * This script tests if the Oddyssey cycle resolution system can now properly
 * detect the fixed matches and resolve cycles.
 */
class TestOddysseyResolution {
  async run() {
    console.log('🧪 Testing Oddyssey resolution system...');
    
    try {
      // Get the current cycle data
      const cycleResult = await db.query(`
        SELECT cycle_id, matches_data, is_resolved, cycle_start_time
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id IN (1, 11)
        ORDER BY cycle_id
      `);

      if (cycleResult.rows.length === 0) {
        console.log('❌ No cycles found for testing');
        return;
      }

      for (const cycle of cycleResult.rows) {
        console.log(`\n📊 Testing Cycle ${cycle.cycle_id}:`);
        console.log(`   Status: ${cycle.is_resolved ? 'Resolved' : 'Pending'}`);
        console.log(`   Start Time: ${cycle.cycle_start_time}`);
        
        let fixtureIds = [];
        try {
          if (Array.isArray(cycle.matches_data)) {
            fixtureIds = cycle.matches_data.map(match => match.id ? match.id.toString() : null).filter(id => id);
          } else if (typeof cycle.matches_data === 'string') {
            const parsed = JSON.parse(cycle.matches_data);
            fixtureIds = Array.isArray(parsed) ? parsed.map(match => match.id ? match.id.toString() : null).filter(id => id) : [];
          }
        } catch (error) {
          console.log(`   ❌ Error parsing matches_data: ${error.message}`);
          continue;
        }

        if (fixtureIds.length === 0) {
          console.log(`   ❌ No fixture IDs found`);
          continue;
        }

        console.log(`   📋 Found ${fixtureIds.length} fixture IDs`);

        // Check match results
        const resultsQuery = `
          SELECT 
            f.id as fixture_id,
            f.home_team,
            f.away_team,
            f.status,
            fr.home_score,
            fr.away_score,
            fr.result_1x2,
            fr.result_ou25,
            CASE 
              WHEN f.status IN ('FT', 'AET', 'PEN') THEN true
              ELSE false
            END as is_finished,
            CASE 
              WHEN fr.home_score IS NOT NULL AND fr.away_score IS NOT NULL 
              AND fr.result_1x2 IS NOT NULL AND fr.result_ou25 IS NOT NULL 
              THEN true
              ELSE false
            END as has_complete_results
          FROM oracle.fixtures f
          LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
          WHERE f.id = ANY($1)
          ORDER BY f.match_date ASC
        `;
        
        const resultsResult = await db.query(resultsQuery, [fixtureIds]);
        
        const matches = resultsResult.rows;
        const finishedMatches = matches.filter(m => m.is_finished);
        const completeResults = matches.filter(m => m.has_complete_results);
        
        console.log(`   📈 Match Status:`);
        console.log(`      • Total matches: ${matches.length}/10`);
        console.log(`      • Finished matches: ${finishedMatches.length}/10`);
        console.log(`      • Complete results: ${completeResults.length}/10`);
        
        // Show individual match status
        matches.forEach((match, index) => {
          const statusEmoji = match.is_finished ? '✅' : '⏳';
          const resultEmoji = match.has_complete_results ? '✅' : '❌';
          const scoreText = match.home_score !== null && match.away_score !== null 
            ? `${match.home_score}-${match.away_score}` 
            : 'No score';
          const outcomeText = match.result_1x2 && match.result_ou25 
            ? `${match.result_1x2}/${match.result_ou25}` 
            : 'No outcomes';
          
          console.log(`      ${statusEmoji}${resultEmoji} ${index + 1}. ${match.home_team} vs ${match.away_team} [${match.status}] ${scoreText} → ${outcomeText}`);
        });

        // Check if cycle can be resolved
        const canResolve = finishedMatches.length === 10 && completeResults.length === 10;
        console.log(`   🎯 Resolution Status: ${canResolve ? '✅ READY TO RESOLVE' : '❌ NOT READY'}`);
        
        if (canResolve) {
          console.log(`   🚀 Cycle ${cycle.cycle_id} can now be resolved!`);
        } else {
          const missingFinished = 10 - finishedMatches.length;
          const missingResults = 10 - completeResults.length;
          console.log(`   ⏳ Waiting for: ${missingFinished} matches to finish, ${missingResults} results to complete`);
        }
      }

    } catch (error) {
      console.error('❌ Error testing Oddyssey resolution:', error);
    }
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  const tester = new TestOddysseyResolution();
  tester.run()
    .then(() => {
      console.log('\n✅ Oddyssey resolution test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Oddyssey resolution test failed:', error);
      process.exit(1);
    });
}

module.exports = TestOddysseyResolution;
