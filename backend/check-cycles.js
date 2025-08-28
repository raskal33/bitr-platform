const { ethers } = require('ethers');
const db = require('./db/db');
const fs = require('fs');

class CycleChecker {
  constructor() {
    this.provider = null;
    this.oddysseyContract = null;
    this.oddysseyABI = null;
  }

  async initialize() {
    try {
      // Initialize provider
      this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.ankr.com/polygon');
      
      // Load contract ABI
      const abiPath = './solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json';
      if (fs.existsSync(abiPath)) {
        this.oddysseyABI = JSON.parse(fs.readFileSync(abiPath, 'utf8')).abi;
      } else {
        console.error('❌ Oddyssey ABI not found at:', abiPath);
        return false;
      }

      // Initialize contract
      const contractAddress = process.env.ODDYSSEY_ADDRESS;
      if (!contractAddress) {
        console.error('❌ ODDYSSEY_ADDRESS not set in environment');
        return false;
      }

      this.oddysseyContract = new ethers.Contract(contractAddress, this.oddysseyABI, this.provider);
      console.log('✅ Contract initialized:', contractAddress);
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize:', error.message);
      return false;
    }
  }

  async checkDatabaseCycles() {
    console.log('\n📊 === DATABASE CYCLES ===');
    
    try {
      // Check if oddyssey_cycles table exists
      const tableExists = await db.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'oracle' AND table_name = 'oddyssey_cycles'
        ) as exists
      `);

      if (!tableExists.rows[0].exists) {
        console.log('❌ oracle.oddyssey_cycles table does not exist');
        return;
      }

      // Get all cycles from database
      const cycles = await db.query(`
        SELECT 
          cycle_id,
          created_at,
          updated_at,
          matches_count,
          cycle_start_time,
          cycle_end_time,
          is_resolved,
          tx_hash,
          ready_for_resolution,
          resolution_prepared_at,
          resolved_at,
          resolution_tx_hash
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC
      `);

      console.log(`📋 Found ${cycles.rows.length} cycles in database:`);
      
      if (cycles.rows.length === 0) {
        console.log('⚠️ No cycles found in database');
        return;
      }

      cycles.rows.forEach(cycle => {
        const startTime = cycle.cycle_start_time ? new Date(cycle.cycle_start_time).toISOString() : 'N/A';
        const endTime = cycle.cycle_end_time ? new Date(cycle.cycle_end_time).toISOString() : 'N/A';
        const now = new Date();
        const endDate = cycle.cycle_end_time ? new Date(cycle.cycle_end_time) : null;
        const isExpired = endDate && endDate < now;
        
        console.log(`\n🔄 Cycle ${cycle.cycle_id}:`);
        console.log(`   Created: ${cycle.created_at}`);
        console.log(`   Updated: ${cycle.updated_at}`);
        console.log(`   Matches: ${cycle.matches_count}`);
        console.log(`   Start Time: ${startTime}`);
        console.log(`   End Time: ${endTime}`);
        console.log(`   Resolved: ${cycle.is_resolved}`);
        console.log(`   Resolved At: ${cycle.resolved_at || 'N/A'}`);
        console.log(`   Ready for Resolution: ${cycle.ready_for_resolution}`);
        console.log(`   Expired: ${isExpired}`);
        console.log(`   TX Hash: ${cycle.tx_hash || 'N/A'}`);
        console.log(`   Resolution TX Hash: ${cycle.resolution_tx_hash || 'N/A'}`);
      });

      // Check current cycle view
      console.log('\n📋 === CURRENT CYCLE VIEW ===');
      const currentCycleView = await db.query(`
        SELECT * FROM oracle.current_oddyssey_cycle
      `);

      if (currentCycleView.rows.length === 0) {
        console.log('⚠️ No active cycle found in current_oddyssey_cycle view');
      } else {
        console.log('✅ Current cycle view data:');
        console.table(currentCycleView.rows);
      }

      // Check daily_game_matches
      console.log('\n📋 === DAILY GAME MATCHES ===');
      const dailyMatches = await db.query(`
        SELECT 
          game_date,
          COUNT(*) as match_count,
          MIN(created_at) as first_created,
          MAX(created_at) as last_created
        FROM oracle.daily_game_matches 
        GROUP BY game_date
        ORDER BY game_date DESC
      `);

      console.log(`📊 Found ${dailyMatches.rows.length} daily game match entries:`);
      dailyMatches.rows.forEach(match => {
        console.log(`   Date ${match.game_date}: ${match.match_count} matches`);
      });

    } catch (error) {
      console.error('❌ Error checking database cycles:', error.message);
    }
  }

  async checkContractCycles() {
    console.log('\n📊 === CONTRACT CYCLES ===');
    
    if (!this.oddysseyContract) {
      console.log('❌ Contract not initialized, skipping contract checks');
      return;
    }

    try {
      // Get current cycle ID from contract
      const currentCycleId = await this.oddysseyContract.getCurrentCycle();
      console.log(`📋 Contract current cycle ID: ${currentCycleId.toString()}`);

      // Get total cycles
      const totalCycles = await this.oddysseyContract.dailyCycleId();
      console.log(`📋 Contract total cycles: ${totalCycles.toString()}`);

      // Check last few cycles
      const cyclesToCheck = Math.min(Number(totalCycles), 5);
      console.log(`\n🔍 Checking last ${cyclesToCheck} cycles from contract:`);

      for (let i = 1; i <= cyclesToCheck; i++) {
        try {
          const cycleId = Number(totalCycles) - cyclesToCheck + i;
          const status = await this.oddysseyContract.getCycleStatus(cycleId);
          
          console.log(`\n🔄 Contract Cycle ${cycleId}:`);
          console.log(`   Exists: ${status.exists}`);
          console.log(`   End Time: ${status.endTime ? new Date(Number(status.endTime) * 1000).toISOString() : 'N/A'}`);
          console.log(`   Is Resolved: ${status.isResolved}`);
          console.log(`   Total Slips: ${status.totalSlips.toString()}`);
          console.log(`   Total Prize Pool: ${ethers.formatEther(status.totalPrizePool)} ETH`);

          // Check if cycle is expired
          const now = Math.floor(Date.now() / 1000);
          const isExpired = status.endTime && Number(status.endTime) < now;
          console.log(`   Expired: ${isExpired}`);

        } catch (error) {
          console.log(`❌ Error checking contract cycle ${i}:`, error.message);
        }
      }

    } catch (error) {
      console.error('❌ Error checking contract cycles:', error.message);
    }
  }

  async checkConflicts() {
    console.log('\n🔍 === CONFLICT ANALYSIS ===');
    
    try {
      // Get database cycles
      const dbCycles = await db.query(`
        SELECT cycle_id, is_resolved, cycle_end_time, resolved_at
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC
      `);

      if (!this.oddysseyContract) {
        console.log('⚠️ Cannot check contract cycles (contract not initialized)');
        return;
      }

      // Get contract cycles
      const contractCurrentCycle = await this.oddysseyContract.getCurrentCycle();
      const contractTotalCycles = await this.oddysseyContract.dailyCycleId();

      console.log(`📊 Database cycles: ${dbCycles.rows.length}`);
      console.log(`📊 Contract current cycle: ${contractCurrentCycle.toString()}`);
      console.log(`📊 Contract total cycles: ${contractTotalCycles.toString()}`);

      // Check for mismatches
      const dbMaxCycle = dbCycles.rows.length > 0 ? Math.max(...dbCycles.rows.map(c => c.cycle_id)) : 0;
      const contractMaxCycle = Number(contractTotalCycles);

      console.log(`\n🔍 Cycle ID Analysis:`);
      console.log(`   Database max cycle: ${dbMaxCycle}`);
      console.log(`   Contract max cycle: ${contractMaxCycle}`);

      if (dbMaxCycle !== contractMaxCycle) {
        console.log(`❌ MISMATCH: Database and contract have different cycle counts!`);
        console.log(`   Database: ${dbMaxCycle}, Contract: ${contractMaxCycle}`);
      } else {
        console.log(`✅ Cycle counts match between database and contract`);
      }

      // Check for unresolved cycles
      const unresolvedDbCycles = dbCycles.rows.filter(c => !c.is_resolved);
      console.log(`\n🔍 Unresolved Cycles:`);
      console.log(`   Database unresolved: ${unresolvedDbCycles.length}`);

      // Check for expired cycles
      const now = new Date();
      const expiredDbCycles = dbCycles.rows.filter(c => {
        if (!c.cycle_end_time) return false;
        return new Date(c.cycle_end_time) < now;
      });

      console.log(`🔍 Expired Cycles:`);
      console.log(`   Database expired: ${expiredDbCycles.length}`);

      if (expiredDbCycles.length > 0) {
        console.log(`⚠️ WARNING: Found ${expiredDbCycles.length} expired cycles that may need resolution`);
        expiredDbCycles.forEach(cycle => {
          console.log(`   - Cycle ${cycle.cycle_id} (${cycle.cycle_end_time})`);
        });
      }

      // Check daily_game_matches consistency
      const dailyMatches = await db.query(`
        SELECT game_date, COUNT(*) as match_count
        FROM oracle.daily_game_matches 
        GROUP BY game_date
        ORDER BY game_date DESC
      `);

      console.log(`\n🔍 Daily Game Matches Analysis:`);
      dailyMatches.rows.forEach(match => {
        console.log(`   Date ${match.game_date}: ${match.match_count} matches`);
      });

    } catch (error) {
      console.error('❌ Error checking conflicts:', error.message);
    }
  }

  async runFullCheck() {
    console.log('🔍 === ODDYSSEY CYCLE COMPREHENSIVE CHECK ===\n');
    
    const initialized = await this.initialize();
    if (!initialized) {
      console.log('⚠️ Skipping contract checks due to initialization failure');
    }

    await this.checkDatabaseCycles();
    await this.checkContractCycles();
    await this.checkConflicts();

    console.log('\n✅ === CHECK COMPLETE ===');
  }
}

// Run the check if called directly
if (require.main === module) {
  const checker = new CycleChecker();
  checker.runFullCheck().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('❌ Check failed:', error);
    process.exit(1);
  });
}

module.exports = CycleChecker; 