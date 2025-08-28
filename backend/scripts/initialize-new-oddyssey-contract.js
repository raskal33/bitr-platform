const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Initialize New Oddyssey Contract
 * 
 * This script initializes the new Oddyssey contract (0x9f9D719041C8F0EE708440f15AE056Cd858DCF4e)
 * with today's matches from the database and starts cycle 0.
 */
class NewOddysseyInitializer {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.contract = null;
    this.contractAddress = '0x9f9D719041C8F0EE708440f15AE056Cd858DCF4e';
  }

  async initialize() {
    try {
      console.log('🚀 Initializing New Oddyssey Contract...\n');
      console.log('Contract address:', this.contractAddress);
      console.log('RPC URL:', config.blockchain.rpcUrl);
      
      // Load contract ABI and create contract instance
      const oddysseyABI = require('../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json').abi;
      const wallet = new ethers.Wallet(config.blockchain.privateKey, this.provider);
      this.contract = new ethers.Contract(this.contractAddress, oddysseyABI, wallet);
      
      console.log('✅ Contract initialized with wallet:', wallet.address);
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      throw error;
    }
  }

  async clearOldContractData() {
    try {
      console.log('\n🧹 Clearing old contract data from database...');
      
      // Clear all old cycle data
      await db.query('DELETE FROM oracle.current_oddyssey_cycle');
      console.log('✅ Cleared current_oddyssey_cycle table');
      
      await db.query('DELETE FROM oracle.oddyssey_cycles');
      console.log('✅ Cleared oddyssey_cycles table');
      
      // Clear any old slips data
      await db.query('DELETE FROM oracle.oddyssey_slips');
      console.log('✅ Cleared oddyssey_slips table');
      
      console.log('✅ All old contract data cleared successfully');
    } catch (error) {
      console.error('❌ Error clearing old data:', error);
      throw error;
    }
  }

  async getTodaysMatches() {
    try {
      console.log('\n📋 Getting today\'s matches from database...');
      
      const result = await db.query(`
        SELECT 
          dgm.fixture_id,
          dgm.home_team,
          dgm.away_team,
          dgm.league_name,
          dgm.match_date,
          dgm.home_odds,
          dgm.draw_odds,
          dgm.away_odds,
          dgm.over_25_odds,
          dgm.under_25_odds,
          dgm.display_order
        FROM oracle.daily_game_matches dgm
        WHERE dgm.game_date = CURRENT_DATE
        ORDER BY dgm.display_order
        LIMIT 10
      `);
      
      if (result.rows.length !== 10) {
        throw new Error(`Expected 10 matches, got ${result.rows.length}`);
      }
      
      console.log(`✅ Found ${result.rows.length} matches for today:`);
      result.rows.forEach((match, i) => {
        console.log(`   ${i + 1}. ${match.home_team} vs ${match.away_team} (${match.league_name})`);
      });
      
      return result.rows;
      
    } catch (error) {
      console.error('❌ Error getting today\'s matches:', error);
      throw error;
    }
  }

  formatMatchesForContract(matches) {
    try {
      console.log('\n🔧 Formatting matches for contract...');
      
      const contractMatches = matches.map((match, index) => {
        // Convert match date to timestamp
        const startTime = Math.floor(new Date(match.match_date).getTime() / 1000);
        
        // Use odds from database or defaults if missing
        const homeOdds = Math.floor((match.home_odds || 2.0) * 1000);
        const drawOdds = Math.floor((match.draw_odds || 3.0) * 1000);
        const awayOdds = Math.floor((match.away_odds || 2.5) * 1000);
        const overOdds = Math.floor((match.over_25_odds || 1.8) * 1000);
        const underOdds = Math.floor((match.under_25_odds || 2.0) * 1000);
        
        console.log(`   ${index + 1}. Match ID: ${match.fixture_id}, Start: ${new Date(startTime * 1000).toISOString()}`);
        console.log(`      Odds: ${homeOdds}/1000, ${drawOdds}/1000, ${awayOdds}/1000, ${overOdds}/1000, ${underOdds}/1000`);
        
        // Format as contract expects: (uint64,uint64,uint32,uint32,uint32,uint32,uint32,(uint8,uint8))
        return [
          BigInt(match.fixture_id),           // uint64: fixture ID
          BigInt(startTime),                  // uint64: start time
          homeOdds,                          // uint32: home odds (scaled by 1000)
          drawOdds,                          // uint32: draw odds (scaled by 1000)
          awayOdds,                          // uint32: away odds (scaled by 1000)
          overOdds,                          // uint32: over odds (scaled by 1000)
          underOdds,                         // uint32: under odds (scaled by 1000)
          [0, 0]                             // uint8[2]: result (0 = not set)
        ];
      });
      
      console.log(`✅ Formatted ${contractMatches.length} matches for contract`);
      return contractMatches;
    } catch (error) {
      console.error('❌ Error formatting matches:', error);
      throw error;
    }
  }

  async startDailyCycle(matches) {
    try {
      console.log('\n🚀 Starting daily cycle on contract...');
      console.log(`   Submitting ${matches.length} matches...`);
      
      // Estimate gas
      const gasEstimate = await this.contract.startDailyCycle.estimateGas(matches);
      console.log(`   Gas estimate: ${gasEstimate.toString()}`);
      
      // Submit transaction
      const tx = await this.contract.startDailyCycle(matches, {
        gasLimit: gasEstimate * 120n / 100n // Add 20% buffer
      });
      
      console.log(`   Transaction submitted: ${tx.hash}`);
      console.log('   Waiting for confirmation...');
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log('✅ Daily cycle started successfully!');
        console.log(`   Block number: ${receipt.blockNumber}`);
        console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
        
        // Get the new cycle ID from the event
        const cycleStartedEvent = receipt.logs.find(log => {
          try {
            const parsed = this.contract.interface.parseLog(log);
            return parsed.name === 'CycleStarted';
          } catch {
            return false;
          }
        });
        
        let cycleId = '0';
        if (cycleStartedEvent) {
          const parsed = this.contract.interface.parseLog(cycleStartedEvent);
          cycleId = parsed.args.cycleId.toString();
        }
        
        console.log(`   New cycle ID: ${cycleId}`);
        
        return {
          success: true,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          cycleId: cycleId,
          gasUsed: receipt.gasUsed.toString()
        };
      } else {
        throw new Error('Transaction failed');
      }
      
    } catch (error) {
      console.error('❌ Error starting daily cycle:', error);
      
      // Provide more specific error messages
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient funds in wallet for gas fees');
      } else if (error.message.includes('execution reverted')) {
        throw new Error(`Contract execution failed: ${error.reason || error.message}`);
      } else {
        throw error;
      }
    }
  }

  async syncCycleToDatabase(cycleId, matches) {
    try {
      console.log('\n💾 Syncing cycle to database...');
      
      // Insert into current_oddyssey_cycle table
      const cycleData = {
        cycle_id: cycleId,
        created_at: new Date(),
        updated_at: new Date(),
        matches_count: matches.length,
        matches_data: matches.map(match => ({
          id: match[0].toString(),
          startTime: Number(match[1]),
          oddsHome: Number(match[2]),
          oddsDraw: Number(match[3]),
          oddsAway: Number(match[4]),
          oddsOver: Number(match[5]),
          oddsUnder: Number(match[6]),
          result: { moneyline: 0, overUnder: 0 }
        })),
        cycle_start_time: new Date(Math.min(...matches.map(m => Number(m[1]) * 1000))),
        cycle_end_time: new Date(Math.max(...matches.map(m => Number(m[1]) * 1000))),
        is_resolved: false,
        tx_hash: null,
        resolution_tx_hash: null,
        resolution_data: null,
        ready_for_resolution: false
      };
      
      await db.query(`
        INSERT INTO oracle.current_oddyssey_cycle 
        (cycle_id, created_at, updated_at, matches_count, matches_data, cycle_start_time, cycle_end_time, is_resolved, tx_hash, resolution_tx_hash, resolution_data, ready_for_resolution)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        cycleData.cycle_id,
        cycleData.created_at,
        cycleData.updated_at,
        cycleData.matches_count,
        JSON.stringify(cycleData.matches_data),
        cycleData.cycle_start_time,
        cycleData.cycle_end_time,
        cycleData.is_resolved,
        cycleData.tx_hash,
        cycleData.resolution_tx_hash,
        cycleData.resolution_data,
        cycleData.ready_for_resolution
      ]);
      
      console.log('✅ Cycle synced to database successfully');
      console.log(`   Cycle ID: ${cycleId}`);
      console.log(`   Matches: ${matches.length}`);
      
    } catch (error) {
      console.error('❌ Error syncing cycle to database:', error);
      throw error;
    }
  }

  async runFullInitialization() {
    try {
      await this.initialize();
      
      // Clear old contract data first
      await this.clearOldContractData();
      
      // Get today's matches from database
      const todaysMatches = await this.getTodaysMatches();
      
      // Format matches for contract
      const contractMatches = this.formatMatchesForContract(todaysMatches);
      
      // Start the daily cycle
      const cycleResult = await this.startDailyCycle(contractMatches);
      
      // Sync the cycle to database
      await this.syncCycleToDatabase(cycleResult.cycleId, contractMatches);
      
      console.log('\n🎉 New Oddyssey contract initialization completed successfully!');
      console.log('✅ Contract now has active cycle with 10 matches');
      console.log('✅ Database synchronized with contract');
      console.log('✅ Users can now submit slips');
      console.log('✅ Frontend should now work correctly');
      
      return {
        success: true,
        message: 'Initialization completed',
        cycleId: cycleResult.cycleId,
        transactionHash: cycleResult.transactionHash,
        contractAddress: this.contractAddress
      };
      
    } catch (error) {
      console.error('\n❌ New Oddyssey contract initialization failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Run the initialization if executed directly
if (require.main === module) {
  const initializer = new NewOddysseyInitializer();
  
  initializer.runFullInitialization()
    .then((result) => {
      if (result.success) {
        console.log('\n✅ Initialization completed successfully');
        console.log('🎯 Contract address:', result.contractAddress);
        console.log('🎯 Cycle ID:', result.cycleId);
        console.log('🎯 Transaction:', result.transactionHash);
        process.exit(0);
      } else {
        console.log('\n❌ Initialization failed:', result.error);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ Initialization execution failed:', error);
      process.exit(1);
    });
}

module.exports = NewOddysseyInitializer;
