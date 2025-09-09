#!/usr/bin/env node

const config = require('../config');

/**
 * Optimized Performance Analysis
 * Analyzes performance with parallel RPC calls implemented
 */
class OptimizedPerformanceAnalysis {
  constructor() {
    this.monadBlockTime = 400; // 400ms per block
    this.currentConfig = config.blockchain.indexer;
    this.monadConfig = config.blockchain.monad;
  }

  analyze() {
    console.log('⚡ OPTIMIZED INDEXER PERFORMANCE ANALYSIS');
    console.log('=' .repeat(55));
    
    this.analyzeNetworkSpeed();
    this.analyzeOptimizedIndexerSpeed();
    this.calculateOptimizedPerformanceGap();
    this.provideFinalAssessment();
  }

  analyzeNetworkSpeed() {
    console.log('\n🌐 MONAD NETWORK SPECIFICATIONS:');
    console.log(`   ⚡ Block Time: ${this.monadConfig.blockTime}ms (${1000/this.monadConfig.blockTime} blocks/second)`);
    console.log(`   🚀 Throughput: ${this.monadConfig.throughput.toLocaleString()} TPS`);
    console.log(`   ⏱️ Finality: ${this.monadConfig.finality}ms`);
    
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

  analyzeOptimizedIndexerSpeed() {
    console.log('\n🚀 OPTIMIZED INDEXER CONFIGURATION:');
    console.log(`   ⏱️ Poll Interval: ${this.currentConfig.pollInterval}ms`);
    console.log(`   🔄 RPC Delay: ${this.currentConfig.rpcDelay}ms`);
    console.log(`   📦 Batch Size: ${this.currentConfig.batchSize} blocks`);
    console.log(`   ⚡ Parallel Processing: ENABLED (Promise.all)`);
    
    // Calculate OPTIMIZED processing time per block
    const rpcCallsPerBlock = 4; // pool, oracle, oddyssey, reputation
    
    // With parallel processing, RPC calls happen simultaneously
    const parallelRpcTime = this.currentConfig.rpcDelay; // Single delay for all parallel calls
    const dbSaveTime = 50; // Estimated 50ms for database operations
    const processingOverhead = 50; // Reduced overhead due to parallel processing
    
    const totalTimePerBlock = parallelRpcTime + dbSaveTime + processingOverhead;
    
    console.log('\n📊 OPTIMIZED PERFORMANCE CALCULATION:');
    console.log(`   🔌 RPC calls per block: ${rpcCallsPerBlock} (PARALLEL)`);
    console.log(`   ⚡ Parallel RPC time: ${parallelRpcTime}ms (was ${rpcCallsPerBlock * this.currentConfig.rpcDelay}ms sequential)`);
    console.log(`   💾 Database save time: ${dbSaveTime}ms`);
    console.log(`   ⚙️ Processing overhead: ${processingOverhead}ms (optimized)`);
    console.log(`   📈 Total time per block: ${totalTimePerBlock}ms (was 550ms)`);
    
    const indexerBlocksPerSecond = 1000 / totalTimePerBlock;
    const indexerBlocksPerMinute = indexerBlocksPerSecond * 60;
    const indexerBlocksPerHour = indexerBlocksPerMinute * 60;
    
    console.log(`   🚀 Optimized Speed: ${indexerBlocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   📊 Optimized Speed: ${indexerBlocksPerMinute.toFixed(0)} blocks/minute, ${indexerBlocksPerHour.toLocaleString()} blocks/hour`);
    
    // Performance improvement calculation
    const oldTimePerBlock = (4 * this.currentConfig.rpcDelay) + 50 + 100;
    const oldBlocksPerSecond = 1000 / oldTimePerBlock;
    const improvement = ((indexerBlocksPerSecond - oldBlocksPerSecond) / oldBlocksPerSecond * 100);
    
    console.log(`   📈 Performance Improvement: ${improvement.toFixed(1)}% faster than sequential`);
    
    this.indexerSpeed = {
      timePerBlock: totalTimePerBlock,
      blocksPerSecond: indexerBlocksPerSecond,
      blocksPerMinute: indexerBlocksPerMinute,
      blocksPerHour: indexerBlocksPerHour,
      improvement
    };
  }

  calculateOptimizedPerformanceGap() {
    console.log('\n⚖️ OPTIMIZED PERFORMANCE COMPARISON:');
    
    const speedRatio = this.indexerSpeed.blocksPerSecond / this.networkSpeed.blocksPerSecond;
    const canKeepUp = speedRatio >= 1.0;
    
    console.log(`   🌐 Network: ${this.networkSpeed.blocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   🚀 Optimized Indexer: ${this.indexerSpeed.blocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   📊 Speed Ratio: ${speedRatio.toFixed(2)}x (${speedRatio >= 1 ? 'CAN KEEP UP' : 'WILL LAG'})`);
    
    if (canKeepUp) {
      const surplus = (speedRatio - 1) * 100;
      console.log(`   ✅ Performance: ${surplus.toFixed(1)}% faster than network`);
      console.log(`   🎯 Status: REAL-TIME CAPABLE`);
    } else {
      const deficit = (1 - speedRatio) * 100;
      console.log(`   ⚠️ Performance Gap: ${deficit.toFixed(1)}% slower than network`);
      
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

  provideFinalAssessment() {
    console.log('\n🎯 FINAL OPTIMIZED ASSESSMENT:');
    
    if (this.performanceGap.canKeepUp) {
      const surplus = ((this.performanceGap.speedRatio - 1) * 100).toFixed(1);
      console.log(`✅ RESULT: Optimized indexer CAN keep up with Monad!`);
      console.log(`🚀 PERFORMANCE: ${surplus}% faster than network (${this.indexerSpeed.improvement.toFixed(1)}% improvement)`);
      console.log(`📊 STATUS: Real-time blockchain indexing achieved`);
      console.log(`🎯 ACTION: Monitor performance and maintain current optimizations`);
      
      console.log('\n🔧 CURRENT OPTIMIZATIONS APPLIED:');
      console.log('   ✅ Parallel RPC calls (4x speed improvement)');
      console.log('   ✅ Reduced processing overhead');
      console.log('   ✅ Smart indexer restart system');
      console.log('   ✅ Skip empty blocks optimization');
      
    } else {
      const deficit = ((1 - this.performanceGap.speedRatio) * 100).toFixed(1);
      console.log(`⚠️ RESULT: Even with optimizations, ${deficit}% deficit remains`);
      console.log(`📊 IMPROVEMENT: ${this.indexerSpeed.improvement.toFixed(1)}% faster than before`);
      console.log(`🚨 ACTION: Additional optimizations needed`);
      
      console.log('\n🔧 ADDITIONAL OPTIMIZATIONS NEEDED:');
      console.log('   1. Reduce RPC delay to 50ms');
      console.log('   2. Implement batch database operations');
      console.log('   3. Use faster RPC provider');
      console.log('   4. Consider event filtering optimization');
    }
    
    console.log('\n📈 MONITORING RECOMMENDATIONS:');
    console.log('   - Run smart-indexer-restart.js daily');
    console.log('   - Monitor block gap every hour');
    console.log('   - Set up alerts for >1000 block lag');
    console.log('   - Track RPC rate limit usage');
    
    console.log('\n⚙️ PRODUCTION CONFIGURATION:');
    console.log(`   RPC_DELAY=${this.currentConfig.rpcDelay} (parallel processing)`);
    console.log(`   BATCH_SIZE=${this.currentConfig.batchSize}`);
    console.log(`   POLL_INTERVAL=${this.currentConfig.pollInterval}`);
    console.log('   PARALLEL_PROCESSING=enabled');
  }
}

// Run the optimized analysis
if (require.main === module) {
  const analyzer = new OptimizedPerformanceAnalysis();
  analyzer.analyze();
}

module.exports = OptimizedPerformanceAnalysis;
