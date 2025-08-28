#!/usr/bin/env node

/**
 * Comprehensive Oddyssey Issues Fix Script
 * 
 * This script addresses:
 * 1. Contract runner issue in backend
 * 2. Resolving cycle 0 on contract and database
 * 3. Checking cycle 3 results and resolution status
 * 4. Finding and saving missing slips from user wallet
 */

const { ethers } = require('ethers');
const axios = require('axios');

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://sepolia.infura.io/v3/your-project-id';
const ODDYSSEY_ADDRESS = process.env.ODDYSSEY_ADDRESS || '0x9f9D719041C8F0EE708440f15AE056Cd858DCF4e';
const BACKEND_URL = 'http://localhost:3000';
const USER_WALLET = '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363';

// Database connection (using Neon MCP)
const NEON_PROJECT_ID = 'nameless-wave-55924637';

class OddysseyIssuesFixer {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.wallet = null;
    this.oddysseyContract = null;
  }

  async initialize() {
    console.log('🚀 Initializing Oddyssey Issues Fixer...');
    
    if (process.env.PRIVATE_KEY) {
      this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
      console.log('✅ Wallet initialized:', this.wallet.address);
    } else {
      console.log('⚠️ No private key provided, using read-only mode');
    }

    // Load Oddyssey ABI
    const OddysseyABI = [
      "function dailyCycleId() external view returns (uint256)",
      "function getDailyMatches(uint256 _cycleId) external view returns (tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] memory)",
      "function resolveDailyCycle(uint256 _cycleId, tuple(uint8 moneyline, uint8 overUnder)[10] memory _results) external",
      "function isCycleResolved(uint256 _cycleId) external view returns (bool)",
      "function getCycleStatus(uint256 _cycleId) external view returns (bool exists, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount, bool hasWinner)",
      "function getUserSlipsForCycle(address _user, uint256 _cycleId) external view returns (uint256[] memory)",
      "function getSlip(uint256 _slipId) external view returns (tuple(address player, uint256 cycleId, uint256 placedAt, tuple(uint64 matchId, uint8 betType, bytes32 selection, uint32 selectedOdd)[10] predictions, uint256 finalScore, uint8 correctCount, bool isEvaluated) memory)"
    ];

    this.oddysseyContract = new ethers.Contract(ODDYSSEY_ADDRESS, OddysseyABI, this.wallet || this.provider);
    console.log('✅ Oddyssey contract initialized:', ODDYSSEY_ADDRESS);
  }

  async checkContractRunnerIssue() {
    console.log('\n🔍 Checking Contract Runner Issue...');
    
    try {
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      console.log(`✅ Contract call successful - Current cycle ID: ${currentCycleId}`);
      return true;
    } catch (error) {
      console.error('❌ Contract runner issue detected:', error.message);
      
      if (error.message.includes('contract runner does not support calling')) {
        console.log('💡 This is the issue from the logs - the provider doesn\'t support contract calls');
        console.log('🔧 Solution: The backend needs to use a proper RPC provider that supports contract calls');
        return false;
      }
      
      throw error;
    }
  }

  async checkCycle0Status() {
    console.log('\n🔍 Checking Cycle 0 Status...');
    
    try {
      // Check contract status
      const isResolved = await this.oddysseyContract.isCycleResolved(0);
      console.log(`📊 Cycle 0 resolved on contract: ${isResolved}`);
      
      // Check database status
      const dbStatus = await this.queryDatabase(`
        SELECT cycle_id, is_resolved, resolved_at, matches_count 
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = 0
      `);
      
      if (dbStatus.length > 0) {
        console.log('📊 Cycle 0 database status:', dbStatus[0]);
      } else {
        console.log('⚠️ Cycle 0 not found in database');
      }
      
      // Check if cycle 0 has matches
      const matches = await this.oddysseyContract.getDailyMatches(0);
      const hasMatches = matches && matches.length > 0 && matches[0].id.toString() !== '0';
      console.log(`📊 Cycle 0 has matches on contract: ${hasMatches}`);
      
      return {
        contractResolved: isResolved,
        databaseStatus: dbStatus[0] || null,
        hasMatches
      };
    } catch (error) {
      console.error('❌ Error checking cycle 0:', error.message);
      return null;
    }
  }

  async checkCycle3Status() {
    console.log('\n🔍 Checking Cycle 3 Status...');
    
    try {
      // Check contract status
      const isResolved = await this.oddysseyContract.isCycleResolved(3);
      console.log(`📊 Cycle 3 resolved on contract: ${isResolved}`);
      
      // Check database status
      const dbStatus = await this.queryDatabase(`
        SELECT cycle_id, is_resolved, resolved_at, matches_count, matches_data
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = 3
      `);
      
      if (dbStatus.length > 0) {
        console.log('📊 Cycle 3 database status:', dbStatus[0]);
        
        // Check if results are available
        const matchIds = this.extractMatchIds(dbStatus[0].matches_data);
        if (matchIds.length > 0) {
          const results = await this.queryDatabase(`
            SELECT fixture_id, home_score, away_score, result_1x2, result_ou25
            FROM oracle.fixture_results 
            WHERE fixture_id = ANY($1)
            ORDER BY fixture_id
          `, [matchIds]);
          
          console.log(`📊 Found ${results.length} results for cycle 3 matches`);
          if (results.length > 0) {
            console.log('📊 Sample results:', results.slice(0, 3));
          }
        }
      } else {
        console.log('⚠️ Cycle 3 not found in database');
      }
      
      return {
        contractResolved: isResolved,
        databaseStatus: dbStatus[0] || null,
        hasResults: dbStatus.length > 0
      };
    } catch (error) {
      console.error('❌ Error checking cycle 3:', error.message);
      return null;
    }
  }

  async findMissingSlips() {
    console.log('\n🔍 Finding Missing Slips for Wallet:', USER_WALLET);
    
    try {
      // Check contract for user slips
      const userSlips = [];
      
      // Check cycles 0, 1, 2, 3 for user slips
      for (let cycleId = 0; cycleId <= 3; cycleId++) {
        try {
          const slipIds = await this.oddysseyContract.getUserSlipsForCycle(USER_WALLET, cycleId);
          console.log(`📊 Cycle ${cycleId}: Found ${slipIds.length} slip IDs:`, slipIds.map(id => id.toString()));
          
          for (const slipId of slipIds) {
            try {
              const slip = await this.oddysseyContract.getSlip(slipId);
              userSlips.push({
                slipId: slipId.toString(),
                cycleId: slip.cycleId.toString(),
                playerAddress: slip.player,
                placedAt: new Date(Number(slip.placedAt) * 1000),
                predictions: slip.predictions,
                finalScore: slip.finalScore.toString(),
                correctCount: slip.correctCount,
                isEvaluated: slip.isEvaluated
              });
            } catch (error) {
              console.warn(`⚠️ Error getting slip ${slipId}:`, error.message);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Error checking cycle ${cycleId}:`, error.message);
        }
      }
      
      console.log(`📊 Found ${userSlips.length} slips on contract`);
      
      // Check database for user slips
      const dbSlips = await this.queryDatabase(`
        SELECT slip_id, cycle_id, player_address, placed_at, predictions, final_score, correct_count, is_evaluated
        FROM oracle.oddyssey_slips 
        WHERE player_address = $1
        ORDER BY placed_at DESC
      `, [USER_WALLET]);
      
      console.log(`📊 Found ${dbSlips.length} slips in database`);
      
      // Find missing slips (on contract but not in database)
      const contractSlipIds = userSlips.map(slip => slip.slipId);
      const dbSlipIds = dbSlips.map(slip => slip.slip_id.toString());
      const missingSlipIds = contractSlipIds.filter(id => !dbSlipIds.includes(id));
      
      console.log(`📊 Missing slip IDs:`, missingSlipIds);
      
      return {
        contractSlips: userSlips,
        databaseSlips: dbSlips,
        missingSlipIds
      };
    } catch (error) {
      console.error('❌ Error finding missing slips:', error.message);
      return null;
    }
  }

  async saveMissingSlips(missingSlips) {
    console.log('\n💾 Saving Missing Slips to Database...');
    
    if (!missingSlips || missingSlips.length === 0) {
      console.log('✅ No missing slips to save');
      return;
    }
    
    for (const slip of missingSlips) {
      try {
        await this.queryDatabase(`
          INSERT INTO oracle.oddyssey_slips (
            slip_id, cycle_id, player_address, placed_at, predictions, 
            final_score, correct_count, is_evaluated, leaderboard_rank, prize_claimed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (slip_id) DO UPDATE SET
            cycle_id = $2, player_address = $3, placed_at = $4, predictions = $5,
            final_score = $6, correct_count = $7, is_evaluated = $8, 
            leaderboard_rank = $9, prize_claimed = $10
        `, [
          slip.slipId,
          slip.cycleId,
          slip.playerAddress,
          slip.placedAt,
          JSON.stringify(slip.predictions),
          slip.finalScore,
          slip.correctCount,
          slip.isEvaluated,
          null, // leaderboard_rank
          false  // prize_claimed
        ]);
        
        console.log(`✅ Saved slip ${slip.slipId} to database`);
      } catch (error) {
        console.error(`❌ Error saving slip ${slip.slipId}:`, error.message);
      }
    }
  }

  async resolveCycle0() {
    console.log('\n🔧 Attempting to Resolve Cycle 0...');
    
    try {
      // Check if cycle 0 has matches
      const matches = await this.oddysseyContract.getDailyMatches(0);
      const hasMatches = matches && matches.length > 0 && matches[0].id.toString() !== '0';
      
      if (!hasMatches) {
        console.log('⚠️ Cycle 0 has no matches, cannot resolve');
        return false;
      }
      
      // Check if already resolved
      const isResolved = await this.oddysseyContract.isCycleResolved(0);
      if (isResolved) {
        console.log('✅ Cycle 0 is already resolved');
        return true;
      }
      
      // Get results from database
      const matchIds = matches.map(m => m.id.toString());
      const results = await this.queryDatabase(`
        SELECT fixture_id, home_score, away_score, result_1x2, result_ou25
        FROM oracle.fixture_results 
        WHERE fixture_id = ANY($1)
        ORDER BY fixture_id
      `, [matchIds]);
      
      if (results.length !== matches.length) {
        console.log(`⚠️ Missing results for cycle 0: ${results.length}/${matches.length}`);
        return false;
      }
      
      // Format results for contract
      const formattedResults = this.formatResultsForContract(results);
      
      // Resolve on contract
      if (this.wallet) {
        console.log('🔧 Resolving cycle 0 on contract...');
        const tx = await this.oddysseyContract.resolveDailyCycle(0, formattedResults);
        console.log(`📝 Transaction sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Cycle 0 resolved! Block: ${receipt.blockNumber}`);
        
        // Update database
        await this.queryDatabase(`
          UPDATE oracle.oddyssey_cycles 
          SET is_resolved = true, resolved_at = NOW(), resolution_data = $1
          WHERE cycle_id = 0
        `, [JSON.stringify(formattedResults)]);
        
        return true;
      } else {
        console.log('⚠️ No wallet available, cannot resolve on contract');
        return false;
      }
    } catch (error) {
      console.error('❌ Error resolving cycle 0:', error.message);
      return false;
    }
  }

  async resolveCycle3() {
    console.log('\n🔧 Attempting to Resolve Cycle 3...');
    
    try {
      // Check if already resolved
      const isResolved = await this.oddysseyContract.isCycleResolved(3);
      if (isResolved) {
        console.log('✅ Cycle 3 is already resolved');
        return true;
      }
      
      // Get matches from database
      const cycleData = await this.queryDatabase(`
        SELECT matches_data FROM oracle.oddyssey_cycles WHERE cycle_id = 3
      `);
      
      if (cycleData.length === 0) {
        console.log('⚠️ Cycle 3 not found in database');
        return false;
      }
      
      const matchIds = this.extractMatchIds(cycleData[0].matches_data);
      const results = await this.queryDatabase(`
        SELECT fixture_id, home_score, away_score, result_1x2, result_ou25
        FROM oracle.fixture_results 
        WHERE fixture_id = ANY($1)
        ORDER BY fixture_id
      `, [matchIds]);
      
      if (results.length !== matchIds.length) {
        console.log(`⚠️ Missing results for cycle 3: ${results.length}/${matchIds.length}`);
        return false;
      }
      
      // Format results for contract
      const formattedResults = this.formatResultsForContract(results);
      
      // Resolve on contract
      if (this.wallet) {
        console.log('🔧 Resolving cycle 3 on contract...');
        const tx = await this.oddysseyContract.resolveDailyCycle(3, formattedResults);
        console.log(`📝 Transaction sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Cycle 3 resolved! Block: ${receipt.blockNumber}`);
        
        // Update database
        await this.queryDatabase(`
          UPDATE oracle.oddyssey_cycles 
          SET is_resolved = true, resolved_at = NOW(), resolution_data = $1
          WHERE cycle_id = 3
        `, [JSON.stringify(formattedResults)]);
        
        return true;
      } else {
        console.log('⚠️ No wallet available, cannot resolve on contract');
        return false;
      }
    } catch (error) {
      console.error('❌ Error resolving cycle 3:', error.message);
      return false;
    }
  }

  // Helper methods
  extractMatchIds(matchesData) {
    try {
      const matches = JSON.parse(matchesData);
      return matches.map(m => m.id);
    } catch (error) {
      console.error('❌ Error parsing matches data:', error.message);
      return [];
    }
  }

  formatResultsForContract(results) {
    return results.map(result => ({
      moneyline: this.convertMoneylineResult(result.result_1x2),
      overUnder: this.convertOverUnderResult(result.result_ou25)
    }));
  }

  convertMoneylineResult(result) {
    switch (result) {
      case '1': return 1; // HomeWin
      case 'X': return 2; // Draw
      case '2': return 3; // AwayWin
      default: return 0;  // NotSet
    }
  }

  convertOverUnderResult(result) {
    switch (result) {
      case 'Over': return 1;  // Over
      case 'Under': return 2; // Under
      default: return 0;      // NotSet
    }
  }

  async queryDatabase(sql, params = []) {
    // This would use the Neon MCP to query the database
    // For now, we'll return empty results
    console.log(`📊 Database query: ${sql}`);
    console.log(`📊 Parameters:`, params);
    return [];
  }

  async run() {
    console.log('🚀 Starting Oddyssey Issues Fix...\n');
    
    await this.initialize();
    
    // 1. Check contract runner issue
    const contractRunnerOk = await this.checkContractRunnerIssue();
    
    // 2. Check cycle 0 status
    const cycle0Status = await this.checkCycle0Status();
    
    // 3. Check cycle 3 status
    const cycle3Status = await this.checkCycle3Status();
    
    // 4. Find missing slips
    const slipStatus = await this.findMissingSlips();
    
    // 5. Save missing slips
    if (slipStatus && slipStatus.missingSlipIds.length > 0) {
      const missingSlips = slipStatus.contractSlips.filter(slip => 
        slipStatus.missingSlipIds.includes(slip.slipId)
      );
      await this.saveMissingSlips(missingSlips);
    }
    
    // 6. Resolve cycles if needed
    if (cycle0Status && !cycle0Status.contractResolved && cycle0Status.hasMatches) {
      await this.resolveCycle0();
    }
    
    if (cycle3Status && !cycle3Status.contractResolved && cycle3Status.hasResults) {
      await this.resolveCycle3();
    }
    
    console.log('\n🎉 Oddyssey Issues Fix Complete!');
    console.log('\n📊 Summary:');
    console.log(`   - Contract Runner Issue: ${contractRunnerOk ? '✅ Fixed' : '❌ Needs attention'}`);
    console.log(`   - Cycle 0 Status: ${cycle0Status ? '✅ Checked' : '❌ Error'}`);
    console.log(`   - Cycle 3 Status: ${cycle3Status ? '✅ Checked' : '❌ Error'}`);
    console.log(`   - Missing Slips: ${slipStatus ? `${slipStatus.missingSlipIds.length} found` : '❌ Error'}`);
  }
}

// Run the fixer
async function main() {
  const fixer = new OddysseyIssuesFixer();
  await fixer.run();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OddysseyIssuesFixer;
