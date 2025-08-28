const { ethers } = require('ethers');
const config = require('../config');

/**
 * Check Oddyssey Contract Status
 * 
 * This script checks the current status of the Oddyssey contract
 * to diagnose the "no active matches" issue.
 */
class OddysseyStatusChecker {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.contract = null;
  }

  async initialize() {
    try {
      console.log('🔍 Checking Oddyssey contract status...\n');
      console.log('Contract address:', config.blockchain.contractAddresses.oddyssey);
      console.log('RPC URL:', config.blockchain.rpcUrl);
      
      const oddysseyABI = require('../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json').abi;
      this.contract = new ethers.Contract(config.blockchain.contractAddresses.oddyssey, oddysseyABI, this.provider);
      
      console.log('✅ Contract initialized');
    } catch (error) {
      console.error('❌ Failed to initialize contract:', error);
      throw error;
    }
  }

  async checkContractStatus() {
    try {
      console.log('\n📊 Contract Status:');
      
      // Get current cycle ID
      const currentCycleId = await this.contract.getCurrentCycle();
      console.log(`   Current Cycle ID: ${currentCycleId.toString()}`);
      
      // Get matches for current cycle
      const matches = await this.contract.getCycleMatches(currentCycleId);
      console.log(`   Matches in current cycle: ${matches.length}`);
      
      if (matches.length === 0) {
        console.log('   ❌ NO MATCHES FOUND - This explains the error!');
        
        // Check if there are matches in cycle 0
        try {
          const cycle0Matches = await this.contract.getCycleMatches(0);
          console.log(`   Matches in cycle 0: ${cycle0Matches.length}`);
        } catch (error) {
          console.log('   ❌ Cannot check cycle 0:', error.message);
        }
        
        return false;
      } else {
        console.log('   ✅ Matches found in current cycle');
        
        // Show first few matches
        console.log('\n📋 Sample matches:');
        for (let i = 0; i < Math.min(3, matches.length); i++) {
          const match = matches[i];
          console.log(`   ${i + 1}. Match ID: ${match.matchId}, Home: ${match.homeTeam}, Away: ${match.awayTeam}`);
        }
        
        return true;
      }
      
    } catch (error) {
      console.error('❌ Error checking contract status:', error);
      return false;
    }
  }

  async checkCycleHistory() {
    try {
      console.log('\n📈 Cycle History:');
      
      const currentCycleId = await this.contract.getCurrentCycle();
      const maxCheck = Math.min(5, Number(currentCycleId) + 1);
      
      for (let i = 0; i < maxCheck; i++) {
        try {
          const matches = await this.contract.getCycleMatches(i);
          console.log(`   Cycle ${i}: ${matches.length} matches`);
        } catch (error) {
          console.log(`   Cycle ${i}: Error - ${error.message}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Error checking cycle history:', error);
    }
  }

  async checkContractOwner() {
    try {
      console.log('\n👤 Contract Ownership:');
      
      const owner = await this.contract.owner();
      console.log(`   Owner: ${owner}`);
      
      // Check if owner matches our wallet
      const expectedOwner = '0x483fc7FD690dCf2a01318282559C389F385d4428';
      if (owner.toLowerCase() === expectedOwner.toLowerCase()) {
        console.log('   ✅ Owner matches expected wallet');
      } else {
        console.log('   ⚠️ Owner does not match expected wallet');
        console.log(`   Expected: ${expectedOwner}`);
      }
      
    } catch (error) {
      console.error('❌ Error checking contract owner:', error);
    }
  }

  async suggestSolution() {
    console.log('\n🔧 Suggested Solutions:');
    
    const currentCycleId = await this.contract.getCurrentCycle();
    const matches = await this.contract.getCycleMatches(currentCycleId);
    
    if (matches.length === 0) {
      console.log('   1. Run the Oddyssey match selector to populate matches');
      console.log('   2. Check if the match selection cron job is running');
      console.log('   3. Verify SportMonks API is working');
      console.log('   4. Check if matches were selected for today\'s date');
      console.log('\n💡 Quick fix commands:');
      console.log('   node scripts/run-oddyssey-match-selector.js');
      console.log('   node cron/oddyssey-scheduler.js');
    } else {
      console.log('   ✅ Contract has matches - issue might be elsewhere');
    }
  }

  async runFullCheck() {
    try {
      await this.initialize();
      const hasMatches = await this.checkContractStatus();
      await this.checkCycleHistory();
      await this.checkContractOwner();
      await this.suggestSolution();
      
      if (hasMatches) {
        console.log('\n🎉 Oddyssey contract status: HEALTHY');
      } else {
        console.log('\n❌ Oddyssey contract status: NO ACTIVE MATCHES');
      }
      
      return hasMatches;
      
    } catch (error) {
      console.error('\n❌ Full check failed:', error);
      return false;
    }
  }
}

// Run the check if executed directly
if (require.main === module) {
  const checker = new OddysseyStatusChecker();
  
  checker.runFullCheck()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Check execution failed:', error);
      process.exit(1);
    });
}

module.exports = OddysseyStatusChecker;
