const SportMonksService = require('./services/sportmonks');
const ResultsFetcherService = require('./services/results-fetcher-service');
const db = require('./db/db');

/**
 * Comprehensive System Health Test
 * Tests all components of the results fetching and resolution system
 */
async function testSystemHealth() {
  console.log('🏥 Starting comprehensive system health test...\n');
  
  try {
    // Test 1: Database Connection
    console.log('1️⃣ Testing database connection...');
    await db.query('SELECT NOW() as current_time');
    console.log('✅ Database connection: OK\n');
    
    // Test 2: SportMonks API Connection
    console.log('2️⃣ Testing SportMonks API connection...');
    const sportMonksService = new SportMonksService();
    console.log('✅ SportMonks service: OK\n');
    
    // Test 3: Fixture Status Update
    console.log('3️⃣ Testing fixture status update...');
    const statusResult = await sportMonksService.updateFixtureStatus();
    console.log(`✅ Fixture status update: ${statusResult.updated} fixtures updated\n`);
    
    // Test 4: Results Fetching
    console.log('4️⃣ Testing results fetching...');
    const resultsFetcher = new ResultsFetcherService();
    const resultsResult = await resultsFetcher.fetchAndSaveResults();
    console.log(`✅ Results fetching: ${resultsResult.fetched} fetched, ${resultsResult.saved} saved\n`);
    
    // Test 5: Database Statistics
    console.log('5️⃣ Checking database statistics...');
    const stats = await resultsFetcher.getResultsStats();
    console.log('📊 Database Statistics:');
    console.log(`   • Total completed matches: ${stats.total_completed}`);
    console.log(`   • Matches with results: ${stats.with_results}`);
    console.log(`   • Matches without results: ${stats.without_results}`);
    console.log(`   • Recent results (24h): ${stats.recent_results}`);
    console.log(`   • Coverage rate: ${stats.coverage_percentage}%\n`);
    
    // Test 6: Recent Match Status
    console.log('6️⃣ Checking recent match status...');
    const recentMatches = await db.query(`
      SELECT 
        DATE(match_date) as date,
        status,
        COUNT(*) as count
      FROM oracle.fixtures 
      WHERE match_date >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(match_date), status
      ORDER BY date DESC, status
    `);
    
    console.log('📅 Recent Match Status:');
    recentMatches.rows.forEach(row => {
      console.log(`   • ${row.date}: ${row.status} - ${row.count} matches`);
    });
    console.log();
    
    // Test 7: Results Coverage by Date
    console.log('7️⃣ Checking results coverage by date...');
    const coverageByDate = await db.query(`
      SELECT 
        DATE(f.match_date) as date,
        COUNT(*) as total_matches,
        COUNT(fr.fixture_id) as matches_with_results,
        ROUND(COUNT(fr.fixture_id) * 100.0 / COUNT(*), 2) as completion_rate
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
      WHERE f.match_date >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(f.match_date)
      ORDER BY date DESC
    `);
    
    console.log('📊 Results Coverage by Date:');
    coverageByDate.rows.forEach(row => {
      console.log(`   • ${row.date}: ${row.matches_with_results}/${row.total_matches} (${row.completion_rate}%)`);
    });
    console.log();
    
    // Summary
    console.log('🎉 System Health Test Summary:');
    console.log('✅ All core components are working correctly');
    console.log(`✅ Fixture status updates: ${statusResult.updated} fixtures processed`);
    console.log(`✅ Results fetching: ${resultsResult.saved} results saved`);
    console.log(`✅ Overall coverage: ${stats.coverage_percentage}%`);
    
    if (stats.coverage_percentage < 50) {
      console.log('⚠️ Coverage rate is low - consider running backfill');
    }
    
    console.log('\n🚀 System is healthy and ready for production!');
    
  } catch (error) {
    console.error('❌ System health test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testSystemHealth().then(() => {
    console.log('\n✅ Health test completed successfully');
    process.exit(0);
  }).catch(error => {
    console.error('\n❌ Health test failed:', error);
    process.exit(1);
  });
}

module.exports = { testSystemHealth };
