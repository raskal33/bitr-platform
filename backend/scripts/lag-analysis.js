#!/usr/bin/env node

/**
 * Real-time Indexer Lag Analysis
 */
class IndexerLagAnalysis {
  constructor() {
    this.monadBlockTime = 400; // 400ms per block
    this.currentIndexerBlock = 35521813;
    this.currentRealTimeBlock = 35526680;
    this.gap = this.currentRealTimeBlock - this.currentIndexerBlock;
  }

  analyze() {
    console.log('🚨 CRITICAL INDEXER LAG ANALYSIS');
    console.log('=' .repeat(50));
    
    this.calculateCurrentGap();
    this.calculateIndexerSpeed();
    this.calculateMonadSpeed();
    this.calculateLagAccumulation();
    this.provideSolution();
  }

  calculateCurrentGap() {
    console.log('\n📊 CURRENT STATUS:');
    console.log(`   🔍 Indexer Block: ${this.currentIndexerBlock.toLocaleString()}`);
    console.log(`   🌐 Real-time Block: ${this.currentRealTimeBlock.toLocaleString()}`);
    console.log(`   ❌ Gap: ${this.gap.toLocaleString()} blocks behind`);
    
    // Time to catch up at current speed
    const timeToBlock = this.gap * 400; // 400ms per block
    const hoursToBlock = timeToBlock / (1000 * 60 * 60);
    console.log(`   ⏱️ Time represented: ${hoursToBlock.toFixed(1)} hours of blockchain history`);
  }

  calculateIndexerSpeed() {
    console.log('\n🔍 INDEXER PERFORMANCE:');
    
    // From logs: processing 1 block every ~3-4 seconds
    // 4 RPC calls × 300ms delay = 1200ms
    // + processing overhead ~800ms = ~2000ms per block
    const timePerBlock = 2000; // 2 seconds per block observed from logs
    const blocksPerSecond = 1000 / timePerBlock;
    const blocksPerMinute = blocksPerSecond * 60;
    const blocksPerHour = blocksPerMinute * 60;
    
    console.log(`   ⏱️ Time per block: ${timePerBlock}ms`);
    console.log(`   🚀 Indexer Speed: ${blocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   📊 Indexer Speed: ${blocksPerMinute.toFixed(0)} blocks/minute`);
    console.log(`   📈 Indexer Speed: ${blocksPerHour.toLocaleString()} blocks/hour`);
    
    this.indexerSpeed = {
      timePerBlock,
      blocksPerSecond,
      blocksPerMinute,
      blocksPerHour
    };
  }

  calculateMonadSpeed() {
    console.log('\n🌐 MONAD NETWORK SPEED:');
    
    const blocksPerSecond = 1000 / this.monadBlockTime;
    const blocksPerMinute = blocksPerSecond * 60;
    const blocksPerHour = blocksPerMinute * 60;
    
    console.log(`   ⚡ Block Time: ${this.monadBlockTime}ms`);
    console.log(`   🚀 Network Speed: ${blocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   📊 Network Speed: ${blocksPerMinute.toFixed(0)} blocks/minute`);
    console.log(`   📈 Network Speed: ${blocksPerHour.toLocaleString()} blocks/hour`);
    
    this.monadSpeed = {
      blockTime: this.monadBlockTime,
      blocksPerSecond,
      blocksPerMinute,
      blocksPerHour
    };
  }

  calculateLagAccumulation() {
    console.log('\n⚖️ SPEED COMPARISON:');
    
    const speedRatio = this.indexerSpeed.blocksPerSecond / this.monadSpeed.blocksPerSecond;
    const canKeepUp = speedRatio >= 1.0;
    
    console.log(`   🌐 Network: ${this.monadSpeed.blocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   🔍 Indexer: ${this.indexerSpeed.blocksPerSecond.toFixed(2)} blocks/second`);
    console.log(`   📊 Speed Ratio: ${speedRatio.toFixed(3)}x`);
    
    if (canKeepUp) {
      console.log(`   ✅ CAN KEEP UP: Indexer is ${((speedRatio - 1) * 100).toFixed(1)}% faster`);
    } else {
      const deficit = (1 - speedRatio) * 100;
      console.log(`   ❌ CANNOT KEEP UP: Indexer is ${deficit.toFixed(1)}% slower`);
      
      // Calculate lag accumulation
      const lagPerHour = this.monadSpeed.blocksPerHour - this.indexerSpeed.blocksPerHour;
      const lagPerDay = lagPerHour * 24;
      
      console.log(`   📈 Lag Accumulation: ${lagPerHour.toLocaleString()} blocks/hour`);
      console.log(`   📈 Lag Accumulation: ${lagPerDay.toLocaleString()} blocks/day`);
      
      // Time to catch up current gap
      const catchUpTime = this.gap / (this.indexerSpeed.blocksPerHour - this.monadSpeed.blocksPerHour);
      if (catchUpTime > 0) {
        console.log(`   ⏱️ Time to catch up current gap: ${catchUpTime.toFixed(1)} hours`);
      } else {
        console.log(`   ⏱️ Will NEVER catch up - gap will keep growing!`);
      }
    }
    
    this.lagAnalysis = {
      canKeepUp,
      speedRatio,
      lagPerHour: canKeepUp ? 0 : this.monadSpeed.blocksPerHour - this.indexerSpeed.blocksPerHour
    };
  }

  provideSolution() {
    console.log('\n🔧 SOLUTION ANALYSIS:');
    
    if (this.lagAnalysis.canKeepUp) {
      console.log('   ✅ Current configuration can eventually catch up');
      console.log('   🎯 Recommendation: Let it run and monitor');
    } else {
      console.log('   🚨 CRITICAL: Current configuration will NEVER catch up!');
      console.log('   📈 Gap will keep growing indefinitely');
      
      console.log('\n💡 IMMEDIATE SOLUTIONS:');
      
      // Solution 1: Smart restart from latest block
      console.log('   1️⃣ SMART RESTART (Recommended):');
      console.log('      • Set START_BLOCK to current real-time block');
      console.log('      • Skip historical blocks and start real-time indexing');
      console.log('      • Command: flyctl secrets set START_BLOCK=35526680 --app bitr-backend');
      console.log('      • Then restart indexer machine');
      
      // Solution 2: Optimize performance
      console.log('\n   2️⃣ PERFORMANCE OPTIMIZATION:');
      const requiredSpeed = this.monadSpeed.blocksPerSecond * 1.1; // 10% buffer
      const maxTimePerBlock = 1000 / requiredSpeed;
      console.log(`      • Target: ${maxTimePerBlock.toFixed(0)}ms per block (currently ${this.indexerSpeed.timePerBlock}ms)`);
      console.log('      • Reduce RPC_DELAY to 100ms (from 300ms)');
      console.log('      • Command: flyctl secrets set RPC_DELAY=100 --app bitr-backend');
      
      // Solution 3: Hybrid approach
      console.log('\n   3️⃣ HYBRID APPROACH (Best):');
      console.log('      • Smart restart + performance optimization');
      console.log('      • Start from latest block with optimized settings');
      console.log('      • Commands:');
      console.log('        flyctl secrets set START_BLOCK=35526680 RPC_DELAY=150 --app bitr-backend');
      console.log('        flyctl machine restart 7849329a2d5668 --app bitr-backend');
    }
    
    console.log('\n⚠️ RECOMMENDATION:');
    console.log('   🎯 Use SMART RESTART (Solution 1) immediately');
    console.log('   📊 This will put indexer back in real-time sync');
    console.log('   🔄 Historical data can be backfilled later if needed');
  }

  // Calculate optimized settings
  calculateOptimalSettings() {
    console.log('\n⚙️ OPTIMAL SETTINGS CALCULATION:');
    
    const targetSpeed = this.monadSpeed.blocksPerSecond * 1.2; // 20% buffer
    const maxTimePerBlock = 1000 / targetSpeed;
    
    // 4 RPC calls + processing overhead
    const processingOverhead = 200; // 200ms for processing + DB
    const availableTimeForRPC = maxTimePerBlock - processingOverhead;
    const optimalRpcDelay = availableTimeForRPC / 4;
    
    console.log(`   🎯 Target Speed: ${targetSpeed.toFixed(2)} blocks/second`);
    console.log(`   ⏱️ Max Time per Block: ${maxTimePerBlock.toFixed(0)}ms`);
    console.log(`   🔄 Optimal RPC Delay: ${Math.max(50, optimalRpcDelay).toFixed(0)}ms`);
    
    return {
      rpcDelay: Math.max(50, Math.floor(optimalRpcDelay)),
      startBlock: this.currentRealTimeBlock
    };
  }
}

// Run the analysis
if (require.main === module) {
  const analyzer = new IndexerLagAnalysis();
  analyzer.analyze();
  const optimal = analyzer.calculateOptimalSettings();
  
  console.log('\n🚀 EXECUTE THIS COMMAND TO FIX:');
  console.log(`flyctl secrets set START_BLOCK=${optimal.startBlock} RPC_DELAY=${optimal.rpcDelay} --app bitr-backend && flyctl machine restart 7849329a2d5668 --app bitr-backend`);
}

module.exports = IndexerLagAnalysis;
