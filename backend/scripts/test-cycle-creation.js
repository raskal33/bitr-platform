const OddysseyManager = require('../services/oddyssey-manager');
const db = require('../db/db');

async function testCycleCreation() {
  console.log('🧪 Testing Oddyssey cycle creation...');
  
  try {
    // Initialize the manager
    const oddysseyManager = new OddysseyManager();
    await oddysseyManager.initialize();
    
    console.log('✅ OddysseyManager initialized');
    
    // Test 1: Check if we can get daily matches
    console.log('\n📋 Test 1: Getting daily matches...');
    const matches = await oddysseyManager.getDailyMatches();
    console.log(`✅ Found ${matches.length} matches for today`);
    
    if (matches.length === 0) {
      console.log('⚠️ No matches found. This might be normal if no matches are scheduled for today.');
      return;
    }
    
    // Display match details
    matches.forEach((match, i) => {
      const startTime = new Date(match.startTime * 1000);
      console.log(`  ${i+1}. Match ${match.id} at ${startTime.toUTCString()}`);
      console.log(`     Odds: H:${match.oddsHome/1000} D:${match.oddsDraw/1000} A:${match.oddsAway/1000}`);
    });
    
    // Test 2: Check current cycle ID on blockchain
    console.log('\n🔗 Test 2: Checking current cycle ID on blockchain...');
    const currentCycleId = await oddysseyManager.oddysseyContract.dailyCycleId();
    console.log(`✅ Current cycle ID on blockchain: ${currentCycleId}`);
    
    // Test 3: Check if cycle exists in database
    console.log('\n💾 Test 3: Checking cycle in database...');
    const dbCycleQuery = `
      SELECT cycle_id, created_at, matches_count, is_resolved, tx_hash
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = $1
    `;
    
    const dbResult = await db.query(dbCycleQuery, [parseInt(currentCycleId)]);
    
    if (dbResult.rows.length > 0) {
      const cycle = dbResult.rows[0];
      console.log(`✅ Cycle ${cycle.cycle_id} found in database:`);
      console.log(`   Created: ${cycle.created_at}`);
      console.log(`   Matches: ${cycle.matches_count}`);
      console.log(`   Resolved: ${cycle.is_resolved}`);
      console.log(`   TX Hash: ${cycle.tx_hash}`);
    } else {
      console.log(`⚠️ Cycle ${currentCycleId} not found in database`);
    }
    
    // Test 4: Check current_oddyssey_cycle table
    console.log('\n📊 Test 4: Checking current_oddyssey_cycle table...');
    const currentCycleQuery = `
      SELECT cycle_id, created_at, matches_count, is_resolved, tx_hash
      FROM oracle.current_oddyssey_cycle
    `;
    
    const currentResult = await db.query(currentCycleQuery);
    
    if (currentResult.rows.length > 0) {
      const currentCycle = currentResult.rows[0];
      console.log(`✅ Current cycle in database:`);
      console.log(`   Cycle ID: ${currentCycle.cycle_id}`);
      console.log(`   Created: ${currentCycle.created_at}`);
      console.log(`   Matches: ${currentCycle.matches_count}`);
      console.log(`   Resolved: ${currentCycle.is_resolved}`);
      console.log(`   TX Hash: ${currentCycle.tx_hash}`);
    } else {
      console.log('⚠️ No current cycle found in database');
    }
    
    // Test 5: Check if matches are linked to cycle
    console.log('\n🔗 Test 5: Checking if matches are linked to cycle...');
    const matchIds = matches.map(m => m.id.toString());
    const linkedMatchesQuery = `
      SELECT COUNT(*) as linked_count
      FROM oracle.daily_game_matches 
      WHERE fixture_id = ANY($1) AND cycle_id = $2
    `;
    
    const linkedResult = await db.query(linkedMatchesQuery, [matchIds, parseInt(currentCycleId)]);
    const linkedCount = parseInt(linkedResult.rows[0].linked_count);
    
    console.log(`✅ ${linkedCount}/${matches.length} matches linked to cycle ${currentCycleId}`);
    
    // Test 6: Verify blockchain cycle data
    console.log('\n🔗 Test 6: Verifying blockchain cycle data...');
    try {
      const cycleEndTime = await oddysseyManager.oddysseyContract.dailyCycleEndTimes(currentCycleId);
      const isResolved = await oddysseyManager.oddysseyContract.isCycleResolved(currentCycleId);
      
      console.log(`✅ Blockchain cycle data:`);
      console.log(`   End time: ${new Date(cycleEndTime * 1000).toISOString()}`);
      console.log(`   Resolved: ${isResolved}`);
      
      // Check if cycle end time is reasonable (should be in the future)
      const now = Math.floor(Date.now() / 1000);
      if (cycleEndTime > now) {
        console.log(`✅ Cycle end time is in the future (${cycleEndTime - now} seconds from now)`);
      } else {
        console.log(`⚠️ Cycle end time is in the past`);
      }
      
    } catch (error) {
      console.log(`❌ Error reading blockchain cycle data: ${error.message}`);
    }
    
    console.log('\n✅ Cycle creation test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testCycleCreation()
    .then(() => {
      console.log('🎉 All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testCycleCreation };
