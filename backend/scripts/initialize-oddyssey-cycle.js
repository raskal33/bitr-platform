const { ethers } = require('ethers');
const config = require('../config');
const OddysseyMatchSelector = require('../services/oddyssey-match-selector');

/**
 * Initialize Oddyssey Cycle Script
 * 
 * This script creates the first daily cycle for the Oddyssey contract
 * after redeployment by selecting matches and starting the cycle.
 */
class OddysseyInitializer {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.contract = null;
    this.matchSelector = new OddysseyMatchSelector();
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Oddyssey Cycle Creator...\n');
      console.log('Contract address:', config.blockchain.contractAddresses.oddyssey);
      console.log('RPC URL:', config.blockchain.rpcUrl);
      
      // Load contract ABI and create contract instance
      const oddysseyABI = require('../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json').abi;
      const wallet = new ethers.Wallet(config.blockchain.privateKey, this.provider);
      this.contract = new ethers.Contract(config.blockchain.contractAddresses.oddyssey, oddysseyABI, wallet);
      
      console.log('✅ Contract initialized with wallet:', wallet.address);
    } catch (error) {
      console.error('❌ Failed to initialize:', error);
      throw error;
    }
  }

  async checkCurrentStatus() {
    try {
      console.log('\n📊 Checking current contract status...');
      
      const currentCycle = await this.contract.getCurrentCycle();
      console.log(`   Current Cycle ID: ${currentCycle.toString()}`);
      
      // Try to get matches for current cycle
      try {
        const matches = await this.contract.getCycleMatches(currentCycle);
        console.log(`   Matches in current cycle: ${matches.length}`);
        return { cycleId: currentCycle, hasMatches: matches.length > 0 };
      } catch (error) {
        if (error.message.includes('Cycle does not exist')) {
          console.log('   ❌ Current cycle does not exist - needs initialization');
          return { cycleId: currentCycle, hasMatches: false, needsInit: true };
        }
        throw error;
      }
      
    } catch (error) {
      console.error('❌ Error checking status:', error);
      throw error;
    }
  }

  async selectTodaysMatches() {
    try {
      console.log('\n🎯 Selecting matches for today...');
      
      const today = new Date().toISOString().split('T')[0];
      console.log(`   Target date: ${today}`);
      
      // Select 10 matches for today
      const selection = await this.matchSelector.selectDailyMatches(today);
      
      if (!selection.oddysseyMatches || selection.oddysseyMatches.length !== 10) {
        throw new Error(`Failed to select exactly 10 matches. Got: ${selection.oddysseyMatches?.length || 0}`);
      }
      
      console.log('✅ Successfully selected 10 matches:');
      selection.selectedMatches.forEach((match, i) => {
        console.log(`   ${i + 1}. ${match.homeTeam} vs ${match.awayTeam} (${match.league})`);
      });
      
      return selection;
      
    } catch (error) {
      console.error('❌ Error selecting matches:', error);
      throw error;
    }
  }

  async startDailyCycle(matches) {
    try {
      console.log('\n🚀 Starting daily cycle on contract...');
      
      // Prepare matches in contract format
      const contractMatches = matches.oddysseyMatches;
      
      console.log(`   Submitting ${contractMatches.length} matches to contract...`);
      
      // Call startDailyCycle function
      const tx = await this.contract.startDailyCycle(contractMatches, {
        gasLimit: 3000000 // Conservative gas limit
      });
      
      console.log(`   Transaction submitted: ${tx.hash}`);
      console.log('   Waiting for confirmation...');
      
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log('✅ Daily cycle started successfully!');
        console.log(`   Block number: ${receipt.blockNumber}`);
        console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
        
        // Get the new cycle ID
        const newCycleId = await this.contract.getCurrentCycle();
        console.log(`   New cycle ID: ${newCycleId.toString()}`);
        
        return {
          success: true,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          cycleId: newCycleId.toString()
        };
      } else {
        throw new Error('Transaction failed');
      }
      
    } catch (error) {
      console.error('❌ Error starting daily cycle:', error);
      throw error;
    }
  }

  async verifyCycleCreation() {
    try {
      console.log('\n🔍 Verifying cycle creation...');
      
      const currentCycle = await this.contract.getCurrentCycle();
      const matches = await this.contract.getCycleMatches(currentCycle);
      
      console.log(`   Current cycle ID: ${currentCycle.toString()}`);
      console.log(`   Matches in cycle: ${matches.length}`);
      
      if (matches.length === 10) {
        console.log('✅ Cycle verification successful!');
        
        // Show first few matches
        console.log('\n📋 Sample matches in cycle:');
        for (let i = 0; i < Math.min(3, matches.length); i++) {
          const match = matches[i];
          console.log(`   ${i + 1}. Match ID: ${match.matchId.toString()}`);
          console.log(`      Start time: ${new Date(Number(match.startTime) * 1000).toISOString()}`);
          console.log(`      Odds: ${match.homeOdds}/1000, ${match.drawOdds}/1000, ${match.awayOdds}/1000`);
        }
        
        return true;
      } else {
        console.log(`❌ Verification failed: Expected 10 matches, got ${matches.length}`);
        return false;
      }
      
    } catch (error) {
      console.error('❌ Error verifying cycle:', error);
      return false;
    }
  }

  async runFullInitialization() {
    try {
      await this.initialize();
      
      // Check current status
      const status = await this.checkCurrentStatus();
      
      if (status.hasMatches && !status.needsInit) {
        console.log('\n✅ Oddyssey already has active matches - no initialization needed');
        return {
          success: true,
          message: 'Already initialized',
          cycleId: status.cycleId.toString()
        };
      }
      
      // Select matches for today
      const matchSelection = await this.selectTodaysMatches();
      
      // Start the daily cycle
      const cycleResult = await this.startDailyCycle(matchSelection);
      
      // Verify the cycle was created correctly
      const verified = await this.verifyCycleCreation();
      
      if (verified) {
        console.log('\n🎉 Oddyssey initialization completed successfully!');
        console.log('✅ Contract now has active matches');
        console.log('✅ Users can now submit slips');
        
        return {
          success: true,
          message: 'Initialization completed',
          cycleId: cycleResult.cycleId,
          transactionHash: cycleResult.transactionHash
        };
      } else {
        throw new Error('Cycle verification failed');
      }
      
    } catch (error) {
      console.error('\n❌ Oddyssey initialization failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Run the initialization if executed directly
if (require.main === module) {
  const initializer = new OddysseyInitializer();
  
  initializer.runFullInitialization()
    .then((result) => {
      if (result.success) {
        console.log('\n✅ Initialization completed successfully');
        process.exit(0);
      } else {
        console.log('\n❌ Initialization failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ Initialization execution failed:', error);
      process.exit(1);
    });
}

module.exports = OddysseyInitializer;


