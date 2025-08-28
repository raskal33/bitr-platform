const Web3Service = require('./backend/services/web3-service');
const OddysseyManager = require('./backend/services/oddyssey-manager');
const db = require('./backend/db/db');

async function fixMissingCycle() {
  try {
    console.log('🔧 Fixing missing cycle 5...');
    
    // Initialize services
    const web3Service = new Web3Service();
    const oddysseyManager = new OddysseyManager();
    
    await web3Service.initialize();
    await oddysseyManager.initialize();
    
    // Get current contract cycle ID
    const contract = await web3Service.getOddysseyContract();
    const currentContractCycleId = await contract.dailyCycleId();
    console.log(`📊 Contract current cycle ID: ${currentContractCycleId}`);
    
    // Check what cycles exist in database
    const dbCycles = await db.query('SELECT cycle_id FROM oracle.oddyssey_cycles ORDER BY cycle_id ASC');
    console.log('📊 Database cycles:', dbCycles.rows.map(r => r.cycle_id));
    
    // Check if cycle 5 is missing
    const cycle5Exists = dbCycles.rows.some(r => r.cycle_id === 5);
    console.log(`🔍 Cycle 5 exists in database: ${cycle5Exists}`);
    
    if (cycle5Exists) {
      console.log('✅ Cycle 5 already exists in database');
      return;
    }
    
    // Check if we need to create cycle 5
    if (currentContractCycleId >= 5) {
      console.log('⚠️ Contract has cycle 5 or higher, but database is missing cycle 5');
      console.log('🔄 This suggests a database sync issue');
      
      // Check if cycle 5 exists in contract
      try {
        const cycle5Status = await contract.getCycleStatus(5);
        console.log('📊 Cycle 5 contract status:', cycle5Status);
        
        if (cycle5Status[0]) { // exists
          console.log('✅ Cycle 5 exists in contract, syncing to database...');
          
          // Get cycle 5 matches from contract
          const cycle5Matches = await contract.getDailyMatches(5);
          console.log(`📊 Cycle 5 has ${cycle5Matches.length} matches in contract`);
          
          // Create cycle 5 in database
          await createCycleInDatabase(5, cycle5Matches);
          console.log('✅ Cycle 5 created in database');
          
        } else {
          console.log('❌ Cycle 5 does not exist in contract either');
          console.log('💡 This suggests the cycle creation process failed for cycle 5');
        }
        
      } catch (error) {
        console.error('❌ Error checking cycle 5 in contract:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error fixing missing cycle:', error);
  }
}

async function createCycleInDatabase(cycleId, contractMatches) {
  try {
    console.log(`🔄 Creating cycle ${cycleId} in database...`);
    
    // Convert contract matches to database format
    const matchesData = contractMatches.map(match => ({
      id: match.id.toString(),
      startTime: parseInt(match.startTime.toString()),
      oddsHome: parseInt(match.oddsHome.toString()),
      oddsDraw: parseInt(match.oddsDraw.toString()),
      oddsAway: parseInt(match.oddsAway.toString()),
      oddsOver: parseInt(match.oddsOver.toString()),
      oddsUnder: parseInt(match.oddsUnder.toString()),
      result: {
        moneyline: 0,
        overUnder: 0
      }
    }));
    
    // Insert into oddyssey_cycles table
    const cycleQuery = `
      INSERT INTO oracle.oddyssey_cycles (
        cycle_id, matches_count, matches_data, cycle_start_time, cycle_end_time,
        is_resolved, tx_hash, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    `;
    
    const cycleStartTime = new Date('2025-08-26T00:00:00Z'); // Approximate
    const cycleEndTime = new Date('2025-08-26T23:59:59Z'); // Approximate
    
    await db.query(cycleQuery, [
      cycleId,
      contractMatches.length,
      JSON.stringify(matchesData),
      cycleStartTime,
      cycleEndTime,
      false, // is_resolved
      'manual_fix' // tx_hash placeholder
    ]);
    
    console.log(`✅ Cycle ${cycleId} created in database`);
    
  } catch (error) {
    console.error(`❌ Error creating cycle ${cycleId} in database:`, error);
    throw error;
  }
}

// Run the fix
fixMissingCycle()
  .then(() => {
    console.log('✅ Missing cycle fix completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Missing cycle fix failed:', error);
    process.exit(1);
  });
