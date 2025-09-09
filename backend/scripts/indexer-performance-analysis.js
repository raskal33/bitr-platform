#!/usr/bin/env node

const { ethers } = require('ethers');
const config = require('../config');

/**
 * Indexer Performance Analysis
 * Analyzes if our indexer can keep up with Monad's 400ms block time
 */
class IndexerPerformanceAnalysis {
  constructor() {
    this.monadBlockTime = 400; // 400ms per block
    this.currentConfig = config.blockchain.indexer;
    this.monadConfig = config.blockchain.monad;
  }

  analyze() {
    console.log('⚡ INDEXER PERFORMANCE ANALYSIS');
    console.log('=' .repeat(50));
    
    this.analyzeNetworkSpeed();
    this.analyzeCurrentIndexerSpeed();
    this.calculatePerformanceGap();
    this.recommendOptimizations();
    
    console.log('\n🎯 FINAL ASSESSMENT:');
    this.provideFinalAssessment();
  }

  analyzeNetworkSpeed() {
    console.log('\n🌐 MONAD NETWORK SPECIFICATIONS:');
    console.log(`   ⚡ Block Time: ${this.monadConfig.blockTime}ms (${1000/this.monadConfig.blockTime} blocks/second)`);
    console.log(`   🚀 Throughput: ${this.monadConfig.throughput.toLocaleString()} TPS`);
    console.log(`   ⏱️ Finality: ${this.monadConfig.finality}ms`);
    console.log(`   ⛽ Block Gas Limit: ${(this.monadConfig.blockGasLimit / 1000000).toFixed(0)}M gas`);
    
    // Calculate blocks per minute/hour
    const blocksPerMinute = (60 * 1000) / this.monadConfig.blockTime;
    const blocksPerHour = blocksPerMinute * 60;
    
    console.log(`   📊 Network Speed: ${blocksPerMinute.toFixed(0)} blocks/minute, ${blocksPerHour.toLocaleString()} blocks/hour`);
    
    this.networkSpeed = {
      blockTime: this.monadConfig.blockTime,
      blocksPerSecond: 1000 / this.monadConfig.blockTime,
      blocksPerMinute,
      blocksPerHour
    };
  }

  analyzeCurrentIndexerSpeed() {
    console.log('\n🔍 CURRENT INDEXER CONFIGURATION:');
    console.log(`   ⏱️ Poll Interval: ${this.currentConfig.pollInterval}ms`);
    console.log(`   🔄 RPC Delay: ${this.currentConfig.rpcDelay}ms`);
    console.log(`   📦 Batch Size: ${this.currentConfig.batchSize} blocks`);
    console.log(`   🔁 Max Retries: ${this.currentConfig.maxRetries}`);
    
    // Calculate indexer processing time per block
    const rpcCallsPerBlock = 4; // pool, oracle, oddyssey, reputation
    const rpcTimePerBlock = rpcCallsPerBlock * this.currentConfig.rpcDelay;
    const dbSaveTime = 50; // Estimated 50ms for database operations
    const processingOverhead = 100; // Estimated 100ms for processing overhead
    
    const totalTimePerBlock = rpcTimePerBlock + dbSaveTime + processingOverhead;
    
    console.log('\n📊 INDEXER PERFORMANCE CALCULATION:');
    console.log(`   🔌 RPC calls per block: ${rpcCallsPerBlock}`);
    console.log(`   ⏱️ RPC time per block: ${rpcTimePerBlock}ms (${rpcCallsPerBlock} × ${this.currentConfig.rpcDelay}ms)`);
    console.log(`   💾 Database save time: ${dbSaveTime}ms`);
    console.log(`   ⚙️ Processing overhead: ${processingOverhead}ms`);
    console.log(`   📈 Total time per block: ${totalTimePerBlock}ms`);
    
    const indexerBlocksPerSecond = 1000 / totalTimePerBlock;
    const indexerBlocksPerMinute = indexerBlocksPerSecond * 60;
    const indexerBlocksPerHour = indexerBlocksPerMinute * 60;
    
    console.log(`   🚀 Indexer Speed: ${indexerBlocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   📊 Indexer Speed: ${indexerBlocksPerMinute.toFixed(0)} blocks/minute, ${indexerBlocksPerHour.toLocaleString()} blocks/hour`);
    
    this.indexerSpeed = {
      timePerBlock: totalTimePerBlock,
      blocksPerSecond: indexerBlocksPerSecond,
      blocksPerMinute: indexerBlocksPerMinute,
      blocksPerHour: indexerBlocksPerHour
    };
  }

  calculatePerformanceGap() {
    console.log('\n⚖️ PERFORMANCE COMPARISON:');
    
    const speedRatio = this.indexerSpeed.blocksPerSecond / this.networkSpeed.blocksPerSecond;
    const canKeepUp = speedRatio >= 1.0;
    
    console.log(`   🌐 Network: ${this.networkSpeed.blocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   🔍 Indexer: ${this.indexerSpeed.blocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   📊 Speed Ratio: ${speedRatio.toFixed(2)}x (${speedRatio >= 1 ? 'CAN KEEP UP' : 'WILL LAG'})`);
    
    if (canKeepUp) {
      const surplus = (speedRatio - 1) * 100;
      console.log(`   ✅ Performance: ${surplus.toFixed(1)}% faster than network`);
    } else {
      const deficit = (1 - speedRatio) * 100;
      console.log(`   ❌ Performance Gap: ${deficit.toFixed(1)}% slower than network`);
      
      // Calculate lag accumulation
      const lagPerHour = this.networkSpeed.blocksPerHour - this.indexerSpeed.blocksPerHour;
      const lagPerDay = lagPerHour * 24;
      
      console.log(`   📈 Lag Accumulation: ${lagPerHour.toLocaleString()} blocks/hour, ${lagPerDay.toLocaleString()} blocks/day`);
    }
    
    this.performanceGap = {
      canKeepUp,
      speedRatio,
      lagPerHour: canKeepUp ? 0 : this.networkSpeed.blocksPerHour - this.indexerSpeed.blocksPerHour
    };
  }

  recommendOptimizations() {
    console.log('\n🚀 OPTIMIZATION RECOMMENDATIONS:');
    
    if (this.performanceGap.canKeepUp) {
      console.log('   ✅ Current configuration can keep up with the network!');
      console.log('   💡 Optional optimizations for better performance:');
      
      // Still provide optimizations for better efficiency
      this.provideOptimizations();
    } else {
      console.log('   ⚠️ Current configuration CANNOT keep up with the network!');
      console.log('   🔧 CRITICAL optimizations needed:');
      
      this.provideCriticalOptimizations();
    }
  }

  provideOptimizations() {
    console.log('\n📋 OPTIMIZATION OPTIONS:');
    
    // Option 1: Reduce RPC delay
    const newRpcDelay = 50; // Reduce from 100ms to 50ms
    const newTimePerBlock = (4 * newRpcDelay) + 50 + 100;
    const newBlocksPerSecond = 1000 / newTimePerBlock;
    
    console.log(`   1️⃣ Reduce RPC Delay: ${this.currentConfig.rpcDelay}ms → ${newRpcDelay}ms`);
    console.log(`      📈 New speed: ${newBlocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`      🎯 Command: flyctl secrets set RPC_DELAY=${newRpcDelay} --app bitr-backend`);
    
    // Option 2: Parallel processing
    console.log(`   2️⃣ Parallel RPC Calls: Process all 4 contract events simultaneously`);
    console.log(`      📈 Estimated speed: ~${(1000 / (Math.max(50, 100) + 50 + 100)).toFixed(2)} blocks/second`);
    console.log(`      🎯 Requires: Code modification to use Promise.all()`);
    
    // Option 3: Batch processing
    console.log(`   3️⃣ Increase Batch Size: Process multiple blocks together`);
    console.log(`      📈 Estimated speed: 2-3x improvement`);
    console.log(`      🎯 Command: flyctl secrets set BATCH_SIZE=5 --app bitr-backend`);
    
    // Option 4: Skip empty blocks
    console.log(`   4️⃣ Skip Empty Blocks: Already implemented ✅`);
    console.log(`      📈 Real-world performance boost when no events occur`);
  }

  provideCriticalOptimizations() {
    console.log('\n🚨 CRITICAL OPTIMIZATIONS NEEDED:');
    
    // Calculate required speed
    const requiredSpeed = this.networkSpeed.blocksPerSecond * 1.1; // 10% buffer
    const maxAllowedTimePerBlock = 1000 / requiredSpeed;
    
    console.log(`   🎯 Target: ${requiredSpeed.toFixed(2)} blocks/second (${maxAllowedTimePerBlock.toFixed(0)}ms per block)`);
    console.log(`   📊 Current: ${this.indexerSpeed.blocksPerSecond.toFixed(2)} blocks/second (${this.indexerSpeed.timePerBlock}ms per block)`);
    
    // Critical optimization 1: Aggressive RPC delay reduction
    console.log(`\n   1️⃣ CRITICAL: Reduce RPC Delay to 25ms`);
    console.log(`      🎯 Command: flyctl secrets set RPC_DELAY=25 --app bitr-backend`);
    
    // Critical optimization 2: Parallel processing
    console.log(`   2️⃣ CRITICAL: Implement parallel RPC calls`);
    console.log(`      📝 Modify indexer to use Promise.all() for simultaneous contract queries`);
    
    // Critical optimization 3: Batch processing
    console.log(`   3️⃣ CRITICAL: Increase batch size`);
    console.log(`      🎯 Command: flyctl secrets set BATCH_SIZE=10 --app bitr-backend`);
    
    // Critical optimization 4: Database optimization
    console.log(`   4️⃣ CRITICAL: Optimize database operations`);
    console.log(`      📝 Use batch inserts and connection pooling`);
  }

  provideFinalAssessment() {
    if (this.performanceGap.canKeepUp) {
      const surplus = ((this.performanceGap.speedRatio - 1) * 100).toFixed(1);
      console.log(`✅ ASSESSMENT: Indexer CAN keep up with Monad (${surplus}% surplus capacity)`);
      console.log('🎯 ACTION: Monitor performance and apply optional optimizations');
      console.log('📊 RISK: Low - system will stay synchronized');
    } else {
      const deficit = ((1 - this.performanceGap.speedRatio) * 100).toFixed(1);
      console.log(`❌ ASSESSMENT: Indexer CANNOT keep up with Monad (${deficit}% deficit)`);
      console.log('🚨 ACTION: Apply critical optimizations immediately');
      console.log(`📊 RISK: High - will lag ${this.performanceGap.lagPerHour.toLocaleString()} blocks/hour`);
      
      console.log('\n🔧 IMMEDIATE ACTIONS:');
      console.log('   1. flyctl secrets set RPC_DELAY=25 --app bitr-backend');
      console.log('   2. flyctl secrets set BATCH_SIZE=10 --app bitr-backend');
      console.log('   3. flyctl restart --app bitr-backend');
      console.log('   4. Monitor indexer performance after changes');
    }
    
    console.log('\n📈 MONITORING:');
    console.log('   - Watch indexer logs for processing speed');
    console.log('   - Check block gap regularly with smart-indexer-restart.js');
    console.log('   - Set up alerts if lag exceeds 1000 blocks');
  }

  // Generate optimized configuration
  generateOptimizedConfig() {
    const optimized = {
      rpcDelay: this.performanceGap.canKeepUp ? 50 : 25,
      batchSize: this.performanceGap.canKeepUp ? 3 : 10,
      pollInterval: 2000, // Reduce poll interval
      parallelProcessing: true // Implement parallel RPC calls
    };
    
    console.log('\n⚙️ RECOMMENDED CONFIGURATION:');
    console.log(`   RPC_DELAY=${optimized.rpcDelay}`);
    console.log(`   BATCH_SIZE=${optimized.batchSize}`);
    console.log(`   POLL_INTERVAL=${optimized.pollInterval}`);
    
    return optimized;
  }
}

// Run the analysis
if (require.main === module) {
  const analyzer = new IndexerPerformanceAnalysis();
  analyzer.analyze();
  analyzer.generateOptimizedConfig();
}

module.exports = IndexerPerformanceAnalysis;
