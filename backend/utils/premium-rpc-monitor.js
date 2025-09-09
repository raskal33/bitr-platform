/**
 * Premium RPC Performance Monitor
 * 
 * Monitors indexer performance and prevents lag with ANKR Premium RPC
 * - Real-time lag detection
 * - Emergency mode activation
 * - Performance optimization recommendations
 * - Automatic scaling of batch sizes and polling intervals
 */

const config = require('../config');

class PremiumRpcMonitor {
  constructor(indexer) {
    this.indexer = indexer;
    this.isMonitoring = false;
    this.stats = {
      startTime: Date.now(),
      totalBlocks: 0,
      totalEvents: 0,
      averageBlockTime: 0,
      currentLag: 0,
      maxLag: 0,
      emergencyModeActivations: 0,
      rpcCallsPerSecond: 0,
      lastPerformanceCheck: Date.now()
    };
    
    // Performance thresholds for premium RPC
    this.thresholds = {
      maxAcceptableLag: 25, // 10 seconds at 400ms blocks
      emergencyLagThreshold: 50, // 20 seconds - trigger emergency mode
      criticalLagThreshold: 100, // 40 seconds - critical alert
      targetBlocksPerSecond: 3, // Target: process 3 blocks per second (faster than chain)
      maxRpcCallsPerSecond: 400 // Premium RPC limit (conservative estimate)
    };
    
    // Emergency mode settings
    this.emergencyMode = {
      active: false,
      activatedAt: null,
      batchSizeMultiplier: 3,
      pollIntervalDivider: 4,
      maxConcurrentRequests: 20
    };
  }

  start() {
    this.isMonitoring = true;
    console.log('🔍 Starting Premium RPC Performance Monitor...');
    
    // Monitor every 10 seconds
    this.monitorInterval = setInterval(() => {
      this.performanceCheck();
    }, 10000);
    
    // Emergency lag check every 2 seconds
    this.emergencyInterval = setInterval(() => {
      this.emergencyLagCheck();
    }, 2000);
  }

  stop() {
    this.isMonitoring = false;
    if (this.monitorInterval) clearInterval(this.monitorInterval);
    if (this.emergencyInterval) clearInterval(this.emergencyInterval);
    console.log('🛑 Stopped Premium RPC Performance Monitor');
  }

  async performanceCheck() {
    if (!this.isMonitoring) return;

    try {
      // Get current blockchain state
      const currentBlock = await this.indexer.rpcManager.getBlockNumber();
      const lag = currentBlock - this.indexer.lastIndexedBlock;
      
      // Update stats
      this.stats.currentLag = lag;
      this.stats.maxLag = Math.max(this.stats.maxLag, lag);
      
      // Calculate performance metrics
      const timeSinceStart = Date.now() - this.stats.startTime;
      const blocksPerSecond = (this.stats.totalBlocks / timeSinceStart) * 1000;
      
      // Log performance status
      const status = this.getPerformanceStatus(lag, blocksPerSecond);
      console.log(`📊 Performance: ${status} | Lag: ${lag} blocks | Speed: ${blocksPerSecond.toFixed(2)} blocks/sec`);
      
      // Check if we need to optimize
      if (lag > this.thresholds.maxAcceptableLag) {
        this.recommendOptimizations(lag, blocksPerSecond);
      }
      
      // Update last check time
      this.stats.lastPerformanceCheck = Date.now();
      
    } catch (error) {
      console.error('❌ Error in performance check:', error.message);
    }
  }

  async emergencyLagCheck() {
    if (!this.isMonitoring) return;

    try {
      const currentBlock = await this.indexer.rpcManager.getBlockNumber();
      const lag = currentBlock - this.indexer.lastIndexedBlock;
      
      // Check if we need emergency mode
      if (lag >= this.thresholds.emergencyLagThreshold && !this.emergencyMode.active) {
        this.activateEmergencyMode(lag);
      } else if (lag < this.thresholds.maxAcceptableLag && this.emergencyMode.active) {
        this.deactivateEmergencyMode(lag);
      }
      
      // Critical lag alert
      if (lag >= this.thresholds.criticalLagThreshold) {
        this.sendCriticalAlert(lag);
      }
      
    } catch (error) {
      console.error('❌ Error in emergency lag check:', error.message);
    }
  }

  activateEmergencyMode(lag) {
    this.emergencyMode.active = true;
    this.emergencyMode.activatedAt = Date.now();
    this.stats.emergencyModeActivations++;
    
    console.log(`🚨 EMERGENCY MODE ACTIVATED! Lag: ${lag} blocks (${(lag * 0.4).toFixed(1)}s)`);
    console.log('⚡ Switching to ultra-aggressive indexing mode...');
    
    // Override indexer settings for emergency mode
    if (this.indexer.batchSize) {
      this.indexer.originalBatchSize = this.indexer.batchSize;
      this.indexer.batchSize = Math.min(
        this.indexer.batchSize * this.emergencyMode.batchSizeMultiplier,
        500
      );
    }
    
    // Notify about emergency mode
    this.logEmergencyStats();
  }

  deactivateEmergencyMode(lag) {
    const duration = Date.now() - this.emergencyMode.activatedAt;
    
    console.log(`✅ Emergency mode deactivated after ${(duration / 1000).toFixed(1)}s`);
    console.log(`📈 Lag reduced to ${lag} blocks - returning to normal mode`);
    
    // Restore original settings
    if (this.indexer.originalBatchSize) {
      this.indexer.batchSize = this.indexer.originalBatchSize;
      delete this.indexer.originalBatchSize;
    }
    
    this.emergencyMode.active = false;
    this.emergencyMode.activatedAt = null;
  }

  sendCriticalAlert(lag) {
    const lagTimeSeconds = (lag * 0.4).toFixed(1);
    console.log(`🚨🚨 CRITICAL LAG ALERT! 🚨🚨`);
    console.log(`📊 Current lag: ${lag} blocks (${lagTimeSeconds} seconds)`);
    console.log(`⚠️ This exceeds the critical threshold of ${this.thresholds.criticalLagThreshold} blocks`);
    console.log(`🔧 Consider manual intervention or infrastructure scaling`);
  }

  getPerformanceStatus(lag, blocksPerSecond) {
    if (lag >= this.thresholds.criticalLagThreshold) return '🚨 CRITICAL';
    if (lag >= this.thresholds.emergencyLagThreshold) return '⚠️ EMERGENCY';
    if (lag >= this.thresholds.maxAcceptableLag) return '🟡 WARNING';
    if (blocksPerSecond >= this.thresholds.targetBlocksPerSecond) return '🟢 EXCELLENT';
    return '🔵 GOOD';
  }

  recommendOptimizations(lag, blocksPerSecond) {
    console.log(`🔧 OPTIMIZATION RECOMMENDATIONS (Lag: ${lag} blocks):`);
    
    if (blocksPerSecond < this.thresholds.targetBlocksPerSecond) {
      console.log(`   📈 Increase batch size (current performance: ${blocksPerSecond.toFixed(2)} blocks/sec)`);
      console.log(`   ⚡ Reduce polling interval for more aggressive indexing`);
    }
    
    if (lag > this.thresholds.emergencyLagThreshold) {
      console.log(`   🚨 Consider emergency restart from latest block`);
      console.log(`   💡 Command: flyctl secrets set START_BLOCK=$(curl -s https://rpc.ankr.com/monad_testnet/df5096a95ddedfa5ec32ad231b63250e719aef9ee7edcbbcea32b8539ae47205 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | jq -r '.result' | xargs printf "%d")`);
    }
  }

  logEmergencyStats() {
    console.log(`📊 Emergency Mode Stats:`);
    console.log(`   🔥 Activations: ${this.stats.emergencyModeActivations}`);
    console.log(`   📈 Max lag seen: ${this.stats.maxLag} blocks`);
    console.log(`   ⚡ Enhanced batch size: ${this.indexer.batchSize || 'N/A'}`);
  }

  getStats() {
    return {
      ...this.stats,
      emergencyMode: { ...this.emergencyMode },
      thresholds: { ...this.thresholds }
    };
  }

  // Method to update stats from indexer
  updateStats(blocksProcessed, eventsFound) {
    this.stats.totalBlocks += blocksProcessed;
    this.stats.totalEvents += eventsFound;
  }
}

module.exports = PremiumRpcMonitor;
