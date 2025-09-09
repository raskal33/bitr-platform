const { ethers } = require('ethers');

/**
 * Monad Gas Optimizer
 * 
 * Optimized gas settings specifically for Monad testnet based on:
 * - Successful transaction: 0xcd9c88222ecb08819ac24c0cd1c013347c921b4a0e0f1bcd8641367b006a4839
 * - Monad's unique gas charging model (charges gas_limit, not gas_used)
 * - Current testnet parameters and best practices
 */
class MonadGasOptimizer {
  constructor() {
    // Monad testnet optimized settings (based on successful transactions)
    this.settings = {
      // Base fee is fixed at 50 gwei on Monad testnet
      baseFee: '50000000000', // 50 gwei (fixed by network)
      
      // Priority fee - keep low for testnet
      priorityFee: '1000000000', // 1 gwei (reduced from 2 gwei for efficiency)
      
      // Gas limits optimized for Monad (reduced to prevent excessive gas usage)
      maxGasLimit: 5000000, // 5M gas (practical limit for most operations)
      blockGasLimit: 150000000, // 150M gas per block
      
      // Conservative gas estimation buffers
      buffers: {
        standard: 1.15, // 15% buffer for standard operations
        complex: 1.25,  // 25% buffer for complex operations
        batch: 1.30     // 30% buffer for batch operations
      },
      
      // Monad-specific optimizations
      gasCharging: 'gas_limit', // Monad charges gas_limit, not gas_used
      blockTime: 400, // 400ms block time
      finality: 800,  // 800ms finality
      
      // Fallback gas limits for different operation types (optimized based on actual usage)
      fallbackLimits: {
        createPool: 2000000,     // 2M gas for creating pools (optimized for Monad)
        placeSlip: 3000000,      // 3M gas for placing slips (based on successful tx)
        evaluateSlip: 1500000,   // 1.5M gas for evaluation
        claimPrize: 800000,      // 800K gas for claiming
        startCycle: 5000000,     // 5M gas for starting cycles
        batchEvaluate: 3000000,  // 3M gas for batch operations
        batchClaim: 2500000      // 2.5M gas for batch claiming
      }
    };
  }

  /**
   * Get optimized gas settings for a transaction
   */
  getOptimizedGasSettings(estimatedGas, operationType = 'standard', options = {}) {
    const {
      forceBuffer = null,
      maxLimit = this.settings.maxGasLimit,
      priorityMultiplier = 1.0
    } = options;

    // Determine buffer based on operation type
    let buffer = this.settings.buffers.standard;
    if (operationType === 'complex') buffer = this.settings.buffers.complex;
    if (operationType === 'batch') buffer = this.settings.buffers.batch;
    if (forceBuffer) buffer = forceBuffer;

    // Calculate gas limit with buffer
    const gasLimit = Math.min(
      Math.floor(estimatedGas * buffer),
      maxLimit
    );

    // Calculate fees
    const baseFee = BigInt(this.settings.baseFee);
    const priorityFee = BigInt(Math.floor(parseInt(this.settings.priorityFee) * priorityMultiplier));
    const maxFeePerGas = baseFee + priorityFee;

    // Calculate total cost (Monad charges gas_limit!)
    const totalCost = BigInt(gasLimit) * maxFeePerGas;

    return {
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas: priorityFee,
      totalCost,
      estimatedCost: ethers.formatEther(totalCost),
      monadOptimized: true,
      operationType,
      buffer: buffer,
      warning: 'Monad charges gas_limit, not gas_used - cost is guaranteed'
    };
  }

  /**
   * Get fallback gas settings when estimation fails
   */
  getFallbackGasSettings(operationType, options = {}) {
    const fallbackGas = this.settings.fallbackLimits[operationType] || this.settings.fallbackLimits.standard;
    
    console.log(`⚠️ Using fallback gas settings for ${operationType}: ${fallbackGas} gas`);
    
    return this.getOptimizedGasSettings(fallbackGas, 'standard', {
      forceBuffer: 1.0, // No additional buffer on fallback
      ...options
    });
  }

  /**
   * Validate gas settings for Monad compatibility
   */
  validateGasSettings(gasSettings) {
    const { gasLimit, maxFeePerGas, maxPriorityFeePerGas } = gasSettings;

    // Check gas limit
    if (gasLimit > this.settings.maxGasLimit) {
      throw new Error(`Gas limit ${gasLimit} exceeds Monad's maximum ${this.settings.maxGasLimit}`);
    }

    // Check fee structure
    if (maxFeePerGas < maxPriorityFeePerGas) {
      throw new Error('maxFeePerGas must be >= maxPriorityFeePerGas');
    }

    // Warn about high priority fees
    const priorityFeeGwei = Number(maxPriorityFeePerGas) / 1e9;
    if (priorityFeeGwei > 10) {
      console.warn(`⚠️ High priority fee: ${priorityFeeGwei} gwei - consider reducing for testnet`);
    }

    return true;
  }

  /**
   * Get current network gas price recommendations
   */
  async getCurrentGasPrice(provider) {
    try {
      // Get current gas price from network
      const gasPrice = await provider.getGasPrice();
      const gasPriceGwei = Number(gasPrice) / 1e9;
      
      console.log(`📊 Current network gas price: ${gasPriceGwei} gwei`);
      
      // For Monad testnet, use our optimized settings regardless of network price
      return {
        type: 'monad_optimized',
        gasPrice: gasPrice,
        maxFeePerGas: BigInt(this.settings.baseFee) + BigInt(this.settings.priorityFee),
        maxPriorityFeePerGas: BigInt(this.settings.priorityFee),
        recommendation: 'Using Monad-optimized settings'
      };
      
    } catch (error) {
      console.warn('⚠️ Failed to get network gas price, using defaults:', error.message);
      
      return {
        type: 'fallback',
        maxFeePerGas: BigInt(this.settings.baseFee) + BigInt(this.settings.priorityFee),
        maxPriorityFeePerGas: BigInt(this.settings.priorityFee),
        recommendation: 'Using fallback Monad settings'
      };
    }
  }

  /**
   * Estimate total transaction cost including value
   */
  estimateTransactionCost(gasSettings, value = 0n) {
    const gasCost = BigInt(gasSettings.gasLimit) * gasSettings.maxFeePerGas;
    const totalCost = gasCost + BigInt(value);
    
    return {
      gasCost,
      value: BigInt(value),
      totalCost,
      gasCostEth: ethers.formatEther(gasCost),
      valueEth: ethers.formatEther(value),
      totalCostEth: ethers.formatEther(totalCost)
    };
  }

  /**
   * Get operation-specific recommendations
   */
  getOperationRecommendations(operationType) {
    const recommendations = {
      placeSlip: {
        buffer: 1.20, // 20% buffer for slip placement
        priorityMultiplier: 1.0,
        tips: ['Include entry fee in value', 'Validate predictions format']
      },
      evaluateSlip: {
        buffer: 1.15, // 15% buffer for evaluation
        priorityMultiplier: 1.0,
        tips: ['Ensure slip is eligible', 'Check cycle resolution status']
      },
      startCycle: {
        buffer: 1.25, // 25% buffer for cycle creation
        priorityMultiplier: 1.2, // Higher priority for critical operations
        tips: ['Validate all 10 matches', 'Ensure proper odds format']
      },
      batchEvaluate: {
        buffer: 1.30, // 30% buffer for batch operations
        priorityMultiplier: 1.1,
        tips: ['Limit batch size', 'Monitor gas usage per slip']
      }
    };

    return recommendations[operationType] || {
      buffer: 1.15,
      priorityMultiplier: 1.0,
      tips: ['Use standard gas settings']
    };
  }
}

module.exports = MonadGasOptimizer;
