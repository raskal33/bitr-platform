/**
 * Check Result Info
 * 
 * This script checks what's in the result_info column.
 */

const db = require('./backend/db/db');

async function checkResultInfo() {
  console.log('🔍 Checking Result Info...');
  
  try {
    // Check fixtures with FT status
    const ftFixtures = await db.query(`
      SELECT id, home_team, away_team, match_date, status, result_info 
      FROM oracle.fixtures 
      WHERE status = 'FT' 
      ORDER BY match_date DESC 
      LIMIT 5
    `);
    
    console.log(`📊 Found ${ftFixtures.rows.length} FT fixtures:`);
    
    for (const fixture of ftFixtures.rows) {
      console.log(`\n🏆 ${fixture.home_team} vs ${fixture.away_team} (${fixture.match_date})`);
      console.log(`   ID: ${fixture.id}`);
      console.log(`   Status: ${fixture.status}`);
      console.log(`   Result Info:`, fixture.result_info);
    }
    
    // Check fixtures without result_info
    const missingResults = await db.query(`
      SELECT id, home_team, away_team, match_date, status 
      FROM oracle.fixtures 
      WHERE status = 'FT' AND (result_info IS NULL OR result_info = '{}' OR result_info = 'null')
      ORDER BY match_date DESC 
      LIMIT 5
    `);
    
    console.log(`\n❌ Found ${missingResults.rows.length} FT fixtures missing result_info:`);
    
    for (const fixture of missingResults.rows) {
      console.log(`   • ${fixture.home_team} vs ${fixture.away_team} (${fixture.match_date}) - ID: ${fixture.id}`);
    }
    
    // Check all fixtures statistics
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_ft,
        COUNT(CASE WHEN result_info IS NOT NULL AND result_info != '{}' AND result_info != 'null' THEN 1 END) as with_results,
        COUNT(CASE WHEN result_info IS NULL OR result_info = '{}' OR result_info = 'null' THEN 1 END) as without_results
      FROM oracle.fixtures 
      WHERE status = 'FT'
    `);
    
    const statRow = stats.rows[0];
    console.log(`\n📈 Results Statistics:`);
    console.log(`   • Total FT fixtures: ${statRow.total_ft}`);
    console.log(`   • With results: ${statRow.with_results}`);
    console.log(`   • Without results: ${statRow.without_results}`);
    
  } catch (error) {
    console.error('❌ Error checking result info:', error.message);
  }
}

// Run the check
if (require.main === module) {
  checkResultInfo().catch(console.error);
}

module.exports = checkResultInfo;
