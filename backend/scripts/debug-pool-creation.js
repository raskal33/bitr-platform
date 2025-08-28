const { ethers } = require('ethers');
const db = require('../db/db');
const config = require('../config');

/**
 * Debug Pool Creation Script
 * 
 * This script helps debug pool creation issues by:
 * 1. Checking recent pool creation transactions
 * 2. Analyzing failed transactions
 * 3. Verifying contract addresses
 */
class PoolCreationDebugger {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.poolContract = null;
  }

  async initialize() {
    try {
      // Load contract ABI
      const poolABI = require('../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
      
      // Try both contract addresses
      const contractAddresses = [
        config.blockchain.contractAddresses.bitredictPool,
        '0x5a66a41b884aF70d5671b322C3e6ac1346CC885C' // Address from failed transaction
      ];
      
      console.log('🔍 Debugging Pool Creation Issues...\n');
      console.log('Contract Addresses:');
      contractAddresses.forEach((addr, i) => {
        console.log(`  ${i + 1}. ${addr} ${addr === config.blockchain.contractAddresses.bitredictPool ? '(config)' : '(from tx)'}`);
      });
      
      // Test which contract is active
      for (const address of contractAddresses) {
        try {
          this.poolContract = new ethers.Contract(address, poolABI, this.provider);
          const poolCount = await this.poolContract.poolCount();
          console.log(`\n✅ Active contract found: ${address}`);
          console.log(`   Pool count: ${poolCount.toString()}`);
          break;
        } catch (error) {
          console.log(`❌ Contract ${address} not accessible: ${error.message}`);
        }
      }
      
      if (!this.poolContract) {
        throw new Error('No accessible pool contract found');
      }
      
    } catch (error) {
      console.error('❌ Failed to initialize debugger:', error);
      throw error;
    }
  }

  async analyzeFailedTransaction(transactionHash) {
    console.log(`\n🔍 Analyzing failed transaction: ${transactionHash}`);
    
    try {
      const tx = await this.provider.getTransaction(transactionHash);
      const receipt = await this.provider.getTransactionReceipt(transactionHash);
      
      console.log('Transaction Details:');
      console.log(`  Block: ${tx.blockNumber}`);
      console.log(`  From: ${tx.from}`);
      console.log(`  To: ${tx.to}`);
      console.log(`  Value: ${ethers.formatEther(tx.value)} ETH`);
      console.log(`  Gas Limit: ${tx.gasLimit.toString()}`);
      console.log(`  Gas Used: ${receipt.gasUsed.toString()}`);
      console.log(`  Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
      
      // Decode the transaction data
      try {
        const decodedData = this.poolContract.interface.parseTransaction({ data: tx.data });
        console.log('\nDecoded Transaction Data:');
        console.log(`  Function: ${decodedData.name}`);
        console.log(`  Args:`, decodedData.args);
        
        // Validate the arguments
        await this.validatePoolCreationArgs(decodedData.args);
        
      } catch (decodeError) {
        console.log('❌ Could not decode transaction data:', decodeError.message);
      }
      
      // Check if the contract address matches
      if (tx.to !== this.poolContract.target) {
        console.log(`\n⚠️ Contract address mismatch:`);
        console.log(`  Transaction sent to: ${tx.to}`);
        console.log(`  Active contract: ${this.poolContract.target}`);
      }
      
    } catch (error) {
      console.error('❌ Error analyzing transaction:', error);
    }
  }

  async validatePoolCreationArgs(args) {
    console.log('\n🔍 Validating Pool Creation Arguments:');
    
    try {
      const [
        predictedOutcome,
        odds,
        creatorStake,
        eventStartTime,
        eventEndTime,
        league,
        category,
        region,
        isPrivate,
        maxBetPerUser,
        useBitr,
        oracleType,
        marketId
      ] = args;
      
      console.log(`  Predicted Outcome: ${predictedOutcome}`);
      console.log(`  Odds: ${odds.toString()} (${Number(odds) / 100}x)`);
      console.log(`  Creator Stake: ${ethers.formatEther(creatorStake)}`);
      console.log(`  Event Start: ${new Date(Number(eventStartTime) * 1000).toISOString()}`);
      console.log(`  Event End: ${new Date(Number(eventEndTime) * 1000).toISOString()}`);
      console.log(`  League: ${league}`);
      console.log(`  Category: ${category}`);
      console.log(`  Region: ${region}`);
      console.log(`  Is Private: ${isPrivate}`);
      console.log(`  Max Bet Per User: ${ethers.formatEther(maxBetPerUser)}`);
      console.log(`  Use BITR: ${useBitr}`);
      console.log(`  Oracle Type: ${oracleType.toString()} (${oracleType === 0 ? 'GUIDED' : 'OPEN'})`);
      console.log(`  Market ID: ${marketId}`);
      
      // Validation checks
      const now = Math.floor(Date.now() / 1000);
      const issues = [];
      
      if (Number(odds) < 101 || Number(odds) > 10000) {
        issues.push('Odds must be between 101 and 10000 (1.01x to 100.0x)');
      }
      
      if (Number(eventStartTime) <= now) {
        issues.push('Event start time must be in the future');
      }
      
      if (Number(eventEndTime) <= Number(eventStartTime)) {
        issues.push('Event end time must be after start time');
      }
      
      if (Number(creatorStake) === 0) {
        issues.push('Creator stake cannot be zero');
      }
      
      if (issues.length > 0) {
        console.log('\n❌ Validation Issues:');
        issues.forEach(issue => console.log(`  - ${issue}`));
      } else {
        console.log('\n✅ All validation checks passed');
      }
      
    } catch (error) {
      console.error('❌ Error validating arguments:', error);
    }
  }

  async checkRecentTransactions() {
    console.log('\n🔍 Checking recent pool creation transactions...');
    
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = currentBlock - 1000; // Last 1000 blocks
      
      console.log(`Scanning blocks ${fromBlock} to ${currentBlock}...`);
      
      const poolCreatedEvents = await this.poolContract.queryFilter(
        this.poolContract.filters.PoolCreated(),
        fromBlock,
        currentBlock
      );
      
      console.log(`Found ${poolCreatedEvents.length} pool creation events`);
      
      if (poolCreatedEvents.length > 0) {
        console.log('\nRecent Pool Creations:');
        for (const event of poolCreatedEvents.slice(-5)) { // Last 5 events
          const { poolId, creator, marketId } = event.args;
          const block = await event.getBlock();
          
          console.log(`  Pool ${poolId}: ${creator} at block ${block.number} (${new Date(block.timestamp * 1000).toISOString()})`);
        }
      }
      
    } catch (error) {
      console.error('❌ Error checking recent transactions:', error);
    }
  }

  async checkDatabaseStatus() {
    console.log('\n🔍 Checking database status...');
    
    try {
      const result = await db.query('SELECT COUNT(*) as count FROM oracle.pools');
      console.log(`Pools in database: ${result.rows[0].count}`);
      
      if (result.rows[0].count > 0) {
        const recentPools = await db.query('SELECT pool_id, creator_address, category, created_at FROM oracle.pools ORDER BY created_at DESC LIMIT 3');
        console.log('\nRecent pools in database:');
        recentPools.rows.forEach(pool => {
          console.log(`  Pool ${pool.pool_id}: ${pool.creator_address} (${pool.category}) - ${pool.created_at}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Error checking database:', error);
    }
  }
}

// Run the debugger if executed directly
if (require.main === module) {
  const debuggerInstance = new PoolCreationDebugger();
  
  debuggerInstance.initialize()
    .then(() => debuggerInstance.checkRecentTransactions())
    .then(() => debuggerInstance.checkDatabaseStatus())
    .then(() => {
      // Analyze the failed transaction if provided
      const failedTx = process.argv[2];
      if (failedTx) {
        return debuggerInstance.analyzeFailedTransaction(failedTx);
      }
    })
    .then(() => {
      console.log('\n🎯 Debug analysis completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Debug analysis failed:', error);
      process.exit(1);
    });
}

module.exports = PoolCreationDebugger;
