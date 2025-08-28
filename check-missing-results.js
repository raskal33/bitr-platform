/**
 * Check Missing Results
 * 
 * This script checks what fixtures are missing results.
 */

const db = require('./backend/db/db');

async function checkMissingResults() {
  console.log('🔍 Checking Missing Results...');
  
  try {
    // Check fixtures with FT status but no final_score
    const missingResults = await db.query(`
      SELECT id, home_team, away_team, match_date, status, final_score 
      FROM oracle.fixtures 
      WHERE status = 'FT' AND final_score IS NULL 
      ORDER BY match_date DESC 
      LIMIT 10
    `);
    
    console.log(`📊 Found ${missingResults.rows.length} fixtures missing results:`);
    
    for (const fixture of missingResults.rows) {
      console.log(`   • ${fixture.home_team} vs ${fixture.away_team} (${fixture.match_date}) - ID: ${fixture.id}`);
    }
    
    // Check all fixtures with FT status
    const allFTFixtures = await db.query(`
      SELECT COUNT(*) as total_ft, 
             COUNT(CASE WHEN final_score IS NOT NULL THEN 1 END) as with_results,
             COUNT(CASE WHEN final_score IS NULL THEN 1 END) as without_results
      FROM oracle.fixtures 
      WHERE status = 'FT'
    `);
    
    const stats = allFTFixtures.rows[0];
    console.log('');
    console.log('📈 Results Statistics:');
    console.log(`   • Total FT fixtures: ${stats.total_ft}`);
    console.log(`   • With results: ${stats.with_results}`);
    console.log(`   • Without results: ${stats.without_results}`);
    
    // Check recent fixtures
    const recentFixtures = await db.query(`
      SELECT id, home_team, away_team, match_date, status, final_score 
      FROM oracle.fixtures 
      WHERE match_date >= NOW() - INTERVAL '7 days'
      ORDER BY match_date DESC 
      LIMIT 10
    `);
    
    console.log('');
    console.log('📅 Recent Fixtures (Last 7 days):');
    
    for (const fixture of recentFixtures.rows) {
      const resultStatus = fixture.final_score ? '✅' : '❌';
      console.log(`   ${resultStatus} ${fixture.home_team} vs ${fixture.away_team} (${fixture.match_date}) - ${fixture.status}`);
    }
    
  } catch (error) {
    console.error('❌ Error checking missing results:', error.message);
  }
}

// Run the check
if (require.main === module) {
  checkMissingResults().catch(console.error);
}

module.exports = checkMissingResults;
