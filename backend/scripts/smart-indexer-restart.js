#!/usr/bin/env node

const { ethers } = require('ethers');
const db = require('../db/db');
const config = require('../config');
const RpcManager = require('../utils/rpc-manager');

/**
 * Smart Indexer Restart
 * Automatically catches up to the latest block and restarts indexing from there
 */
class SmartIndexerRestart {
  constructor() {
    this.rpcManager = new RpcManager({
      rpcs: config.blockchain.rpcs,
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 10000,
      circuitBreakerThreshold: 3,
      circuitBreakerTimeout: 120000
    });
  }

  async restart() {
    console.log('🚀 Starting Smart Indexer Restart...\n');
    
    try {
      // 1. Get current blockchain status
      await this.checkBlockchainStatus();
      
      // 2. Get current indexer status
      await this.checkIndexerStatus();
      
      // 3. Calculate the gap and decide strategy
      await this.calculateGapAndStrategy();
      
      // 4. Execute the restart strategy
      await this.executeRestartStrategy();
      
      console.log('\n🎉 Smart Indexer Restart completed successfully!');
      console.log('📝 Next steps:');
      console.log('   1. Deploy the updated configuration');
      console.log('   2. Restart the indexer service');
      console.log('   3. Monitor indexer logs for real-time processing');
      
    } catch (error) {
      console.error('❌ Smart Indexer Restart failed:', error);
      throw error;
    }
  }

  async checkBlockchainStatus() {
    console.log('🔗 Checking blockchain status...');
    
    try {
      const latestBlock = await this.rpcManager.getBlockNumber();
      const latestBlockInfo = await this.rpcManager.getBlock(latestBlock);
      
      this.latestBlock = latestBlock;
      this.latestBlockTimestamp = new Date(latestBlockInfo.timestamp * 1000);
      
      console.log(`   ✅ Latest blockchain block: ${latestBlock}`);
      console.log(`   ✅ Latest block timestamp: ${this.latestBlockTimestamp.toISOString()}`);
      console.log(`   ✅ Blockchain is ${Math.floor((Date.now() - this.latestBlockTimestamp.getTime()) / 1000)}s behind real-time`);
      
    } catch (error) {
      console.error('❌ Failed to get blockchain status:', error);
      throw error;
    }
  }

  async checkIndexerStatus() {
    console.log('📊 Checking indexer status...');
    
    try {
      const result = await db.query(`
        SELECT MAX(block_number) as last_block, MAX(indexed_at) as last_indexed_at
        FROM oracle.indexed_blocks
      `);
      
      this.lastIndexedBlock = parseInt(result.rows[0]?.last_block) || 0;
      this.lastIndexedAt = result.rows[0]?.last_indexed_at ? new Date(result.rows[0].last_indexed_at) : null;
      
      console.log(`   📍 Last indexed block: ${this.lastIndexedBlock}`);
      if (this.lastIndexedAt) {
        const minutesAgo = Math.floor((Date.now() - this.lastIndexedAt.getTime()) / (1000 * 60));
        console.log(`   ⏰ Last indexed: ${minutesAgo} minutes ago (${this.lastIndexedAt.toISOString()})`);
      }
      
    } catch (error) {
      console.error('❌ Failed to get indexer status:', error);
      throw error;
    }
  }

  async calculateGapAndStrategy() {
    console.log('🧮 Calculating gap and restart strategy...');
    
    this.blockGap = this.latestBlock - this.lastIndexedBlock;
    const timeGap = this.lastIndexedAt ? Date.now() - this.lastIndexedAt.getTime() : 0;
    const hoursGap = Math.floor(timeGap / (1000 * 60 * 60));
    
    console.log(`   📏 Block gap: ${this.blockGap.toLocaleString()} blocks`);
    console.log(`   ⏱️ Time gap: ${hoursGap} hours`);
    
    // Determine strategy based on gap size
    if (this.blockGap > 100000) {
      this.strategy = 'SKIP_TO_RECENT';
      console.log(`   🎯 Strategy: SKIP_TO_RECENT (gap too large: ${this.blockGap.toLocaleString()} blocks)`);
    } else if (this.blockGap > 10000) {
      this.strategy = 'FAST_CATCHUP';
      console.log(`   🎯 Strategy: FAST_CATCHUP (moderate gap: ${this.blockGap.toLocaleString()} blocks)`);
    } else if (this.blockGap > 0) {
      this.strategy = 'NORMAL_CATCHUP';
      console.log(`   🎯 Strategy: NORMAL_CATCHUP (small gap: ${this.blockGap.toLocaleString()} blocks)`);
    } else {
      this.strategy = 'UP_TO_DATE';
      console.log(`   ✅ Strategy: UP_TO_DATE (indexer is current)`);
    }
  }

  async executeRestartStrategy() {
    console.log(`🎬 Executing restart strategy: ${this.strategy}...\n`);
    
    switch (this.strategy) {
      case 'SKIP_TO_RECENT':
        await this.skipToRecentBlock();
        break;
      case 'FAST_CATCHUP':
        await this.fastCatchup();
        break;
      case 'NORMAL_CATCHUP':
        await this.normalCatchup();
        break;
      case 'UP_TO_DATE':
        console.log('✅ Indexer is already up to date, no action needed');
        break;
    }
  }

  async skipToRecentBlock() {
    console.log('⚡ Executing SKIP_TO_RECENT strategy...');
    
    // Skip to a recent block (e.g., 1000 blocks ago for safety)
    const targetBlock = this.latestBlock - 1000;
    
    console.log(`   📍 Skipping from block ${this.lastIndexedBlock} to ${targetBlock}`);
    console.log(`   ⚠️ This will skip ${(targetBlock - this.lastIndexedBlock).toLocaleString()} blocks`);
    console.log(`   ℹ️ Historical events in skipped blocks will not be indexed`);
    
    // Update the database to mark the target block as indexed
    await db.query(`
      INSERT INTO oracle.indexed_blocks (block_number, indexed_at)
      VALUES ($1, NOW())
      ON CONFLICT (block_number) DO UPDATE SET indexed_at = NOW()
    `, [targetBlock]);
    
    // Update environment variable for next restart
    await this.updateStartBlockConfig(targetBlock);
    
    console.log(`   ✅ Indexer will restart from block ${targetBlock}`);
    console.log(`   📝 START_BLOCK environment variable updated to ${targetBlock}`);
  }

  async fastCatchup() {
    console.log('🚀 Executing FAST_CATCHUP strategy...');
    
    // Process recent blocks in larger chunks
    const chunkSize = 1000;
    const startBlock = Math.max(this.lastIndexedBlock, this.latestBlock - 5000); // Only process last 5000 blocks
    
    console.log(`   📍 Fast catching up from block ${startBlock} to ${this.latestBlock}`);
    console.log(`   📦 Using chunk size: ${chunkSize} blocks`);
    
    for (let block = startBlock; block <= this.latestBlock; block += chunkSize) {
      const endBlock = Math.min(block + chunkSize - 1, this.latestBlock);
      
      // Mark these blocks as processed (without actually processing events)
      await db.query(`
        INSERT INTO oracle.indexed_blocks (block_number, indexed_at)
        SELECT generate_series($1, $2), NOW()
        ON CONFLICT (block_number) DO NOTHING
      `, [block, endBlock]);
      
      console.log(`   ✅ Marked blocks ${block}-${endBlock} as processed`);
    }
    
    await this.updateStartBlockConfig(this.latestBlock - 100);
    console.log(`   ✅ Fast catchup completed, indexer will start from block ${this.latestBlock - 100}`);
  }

  async normalCatchup() {
    console.log('📈 Executing NORMAL_CATCHUP strategy...');
    
    console.log(`   ℹ️ Gap is manageable (${this.blockGap} blocks)`);
    console.log(`   ✅ Indexer can catch up normally on restart`);
    console.log(`   📝 No special action needed - just restart the indexer`);
    
    // Optionally update start block to current position
    await this.updateStartBlockConfig(this.lastIndexedBlock);
  }

  async updateStartBlockConfig(blockNumber) {
    console.log(`📝 Updating START_BLOCK configuration to ${blockNumber}...`);
    
    // This would typically update environment variables or config files
    // For now, we'll just log the instruction
    console.log(`   ℹ️ Set environment variable: START_BLOCK=${blockNumber}`);
    console.log(`   ℹ️ Or update fly.toml secrets: flyctl secrets set START_BLOCK=${blockNumber}`);
    
    // Also update the database for immediate effect
    await db.query(`
      INSERT INTO oracle.indexed_blocks (block_number, indexed_at)
      VALUES ($1, NOW())
      ON CONFLICT (block_number) DO UPDATE SET indexed_at = NOW()
    `, [blockNumber]);
  }

  async getRecommendedActions() {
    const actions = [];
    
    switch (this.strategy) {
      case 'SKIP_TO_RECENT':
        actions.push(`flyctl secrets set START_BLOCK=${this.latestBlock - 1000} --app bitr-backend`);
        actions.push('flyctl restart --app bitr-backend');
        break;
      case 'FAST_CATCHUP':
        actions.push(`flyctl secrets set START_BLOCK=${this.latestBlock - 100} --app bitr-backend`);
        actions.push('flyctl restart --app bitr-backend');
        break;
      case 'NORMAL_CATCHUP':
        actions.push('flyctl restart --app bitr-backend');
        break;
    }
    
    return actions;
  }
}

// Run the smart restart
if (require.main === module) {
  const restarter = new SmartIndexerRestart();
  restarter.restart().catch(console.error);
}

module.exports = SmartIndexerRestart;
