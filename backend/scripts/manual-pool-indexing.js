const { ethers } = require('ethers');
const db = require('../db/db');
const config = require('../config');

/**
 * Manual Pool Indexing Script
 * 
 * This script manually indexes a specific pool creation transaction
 * that was missed by the automatic indexer.
 */
class ManualPoolIndexer {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.poolContract = null;
  }

  async initialize() {
    try {
      // Load contract ABI
      const poolABI = require('../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
      this.poolContract = new ethers.Contract(config.blockchain.contractAddresses.bitredictPool, poolABI, this.provider);
      
      console.log('✅ Manual Pool Indexer initialized');
      console.log(`   Contract: ${config.blockchain.contractAddresses.bitredictPool}`);
      console.log(`   Provider: ${config.blockchain.rpcUrl}`);
    } catch (error) {
      console.error('❌ Failed to initialize Manual Pool Indexer:', error);
      throw error;
    }
  }

  async indexTransaction(transactionHash) {
    console.log(`🔍 Indexing transaction: ${transactionHash}`);
    
    try {
      // Get transaction details
      const tx = await this.provider.getTransaction(transactionHash);
      if (!tx) {
        throw new Error('Transaction not found');
      }

      console.log(`   Block: ${tx.blockNumber}`);
      console.log(`   From: ${tx.from}`);
      console.log(`   To: ${tx.to}`);

      // Get transaction receipt
      const receipt = await this.provider.getTransactionReceipt(transactionHash);
      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      console.log(`   Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

      if (receipt.status !== 1) {
        throw new Error('Transaction failed');
      }

      // Parse logs to find PoolCreated event
      const poolCreatedEvent = this.findPoolCreatedEvent(receipt.logs);
      if (!poolCreatedEvent) {
        throw new Error('PoolCreated event not found in transaction logs');
      }

      console.log('   ✅ PoolCreated event found');
      console.log(`   Pool ID: ${poolCreatedEvent.args.poolId.toString()}`);
      console.log(`   Creator: ${poolCreatedEvent.args.creator}`);
      console.log(`   Market ID: ${poolCreatedEvent.args.marketId}`);

      // Get pool details from contract
      const poolId = poolCreatedEvent.args.poolId;
      const pool = await this.poolContract.pools(poolId);
      
      console.log('   Pool details from contract:');
      console.log(`     Predicted Outcome: ${pool.predictedOutcome}`);
      console.log(`     Odds: ${pool.odds.toString()}`);
      console.log(`     Creator Stake: ${ethers.formatEther(pool.creatorStake)}`);
      console.log(`     Category: ${pool.category}`);
      console.log(`     League: ${pool.league}`);
      console.log(`     Uses BITR: ${pool.usesBitr}`);

      // Save to database
      await this.savePoolToDatabase(poolCreatedEvent, pool, tx, receipt);

      console.log('   ✅ Pool successfully indexed and saved to database');

      return {
        success: true,
        poolId: poolId.toString(),
        creator: poolCreatedEvent.args.creator,
        marketId: poolCreatedEvent.args.marketId.toString()
      };

    } catch (error) {
      console.error('❌ Error indexing transaction:', error);
      throw error;
    }
  }

  findPoolCreatedEvent(logs) {
    const poolCreatedTopic = this.poolContract.filters.PoolCreated().topics[0];
    
    for (const log of logs) {
      if (log.topics[0] === poolCreatedTopic) {
        return this.poolContract.interface.parseLog(log);
      }
    }
    
    return null;
  }

  async savePoolToDatabase(event, pool, tx, receipt) {
    const { poolId, creator, eventStartTime, eventEndTime, oracleType, marketId } = event.args;
    
    // Calculate derived values
    const bettingEndTime = eventStartTime.toNumber() - 60; // 60 seconds grace period
    const arbitrationDeadline = eventEndTime.toNumber() + (24 * 60 * 60); // 24 hours
    const maxBettorStake = pool.creatorStake.toNumber() / (pool.odds / 100 - 1);
    
    console.log('   Saving to database...');
    
    // Store pool in oracle.pools table
    await db.query(`
      INSERT INTO oracle.pools 
      (pool_id, creator_address, predicted_outcome, odds, creator_stake, 
       total_creator_side_stake, max_bettor_stake, total_bettor_stake,
       event_start_time, event_end_time, betting_end_time, arbitration_deadline,
       league, category, region, is_private, max_bet_per_user, use_bitr, 
       oracle_type, market_id, status, tx_hash, block_number, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (pool_id) DO NOTHING
    `, [
      poolId.toString(),
      creator,
      pool.predictedOutcome,
      pool.odds.toString(),
      pool.creatorStake.toString(),
      pool.totalCreatorSideStake.toString(),
      maxBettorStake.toString(),
      pool.totalBettorStake.toString(),
      eventStartTime.toString(),
      eventEndTime.toString(),
      bettingEndTime.toString(),
      arbitrationDeadline.toString(),
      pool.league || null,
      pool.category || null,
      pool.region || null,
      pool.isPrivate,
      pool.maxBetPerUser.toString(),
      pool.usesBitr,
      oracleType.toString(),
      marketId.toString(),
      'active',
      tx.hash,
      tx.blockNumber,
      new Date(receipt.blockNumber * 1000) // Approximate timestamp
    ]);

    // Add creator as first liquidity provider
    await db.query(`
      INSERT INTO oracle.pool_liquidity_providers 
      (pool_id, lp_address, stake)
      VALUES ($1, $2, $3)
      ON CONFLICT (pool_id, lp_address) DO NOTHING
    `, [
      poolId.toString(),
      creator,
      pool.creatorStake.toString()
    ]);

    console.log('   ✅ Database operations completed');
  }

  async verifyIndexing(transactionHash) {
    console.log('\n🔍 Verifying indexing...');
    
    try {
      const result = await db.query('SELECT pool_id, creator_address, category, tx_hash FROM oracle.pools WHERE tx_hash = $1', [transactionHash]);
      
      if (result.rows.length > 0) {
        const pool = result.rows[0];
        console.log('   ✅ Pool found in database:');
        console.log(`     Pool ID: ${pool.pool_id}`);
        console.log(`     Creator: ${pool.creator_address}`);
        console.log(`     Category: ${pool.category}`);
        console.log(`     TX Hash: ${pool.tx_hash}`);
        return true;
      } else {
        console.log('   ❌ Pool not found in database');
        return false;
      }
    } catch (error) {
      console.error('   ❌ Error verifying indexing:', error);
      return false;
    }
  }
}

// Run the script if executed directly
if (require.main === module) {
  const indexer = new ManualPoolIndexer();
  
  // Get transaction hash from command line arguments
  const transactionHash = process.argv[2];
  
  if (!transactionHash) {
    console.error('❌ Please provide a transaction hash as an argument');
    console.log('Usage: node scripts/manual-pool-indexing.js <transaction_hash>');
    process.exit(1);
  }

  indexer.initialize()
    .then(() => indexer.indexTransaction(transactionHash))
    .then(() => indexer.verifyIndexing(transactionHash))
    .then((verified) => {
      if (verified) {
        console.log('\n🎉 Manual indexing completed successfully!');
        console.log('✅ The pool should now be visible in the markets page');
      } else {
        console.log('\n❌ Manual indexing failed verification');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Manual indexing failed:', error);
      process.exit(1);
    });
}

module.exports = ManualPoolIndexer;
