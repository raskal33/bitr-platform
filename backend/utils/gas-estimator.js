const { ethers } = require('ethers');

class GasEstimator {
  constructor(provider, contract, monadSettings = null) {
    this.provider = provider;
    this.contract = contract;
    this.gasPriceCache = null;
    this.cacheExpiry = 0;
    this.CACHE_DURATION = 30000; // 30 seconds
    
    // Monad-specific settings
    this.monadSettings = monadSettings || {
      baseFee: '50000000000', // 50 gwei
      priorityFee: '2000000000', // 2 gwei
      maxGasLimit: 5000000, // 5M gas (practical limit for most operations)
      gasCharging: 'gas_limit' // Charges gas_limit, not gas_used
    };
  }

  /**
   * Estimate gas with multiple fallback methods
   */
  async estimateGasWithFallback(functionName, args, options = {}) {
    const {
      buffer = 20, // Default 20% buffer
      maxGasLimit = this.monadSettings.maxGasLimit, // Use Monad's 30M gas limit
      value = 0n,
      ...otherOptions
    } = options;

    try {
      // Method 1: Try contract's estimateGas method
      console.log(`⛽ Estimating gas for ${functionName} using contract method...`);
      const estimate = await this.contract[functionName].estimateGas(...args, {
        value,
        ...otherOptions
      });
      
      const gasLimit = this.calculateGasLimit(estimate, buffer, maxGasLimit);
      const totalCost = await this.calculateMonadTotalCost(gasLimit, value);
      
      return {
        method: 'contract_estimate',
        estimate,
        gasLimit,
        totalCost,
        monadWarning: 'Monad charges gas_limit, not gas_used!',
        error: null
      };
    } catch (error) {
      console.warn(`⚠️ Contract gas estimation failed: ${error.message}`);
      
      // Method 2: Try provider's estimateGas
      try {
        console.log(`⛽ Trying provider gas estimation...`);
        const data = this.contract.interface.encodeFunctionData(functionName, args);
        const estimate = await this.provider.estimateGas({
          to: await this.contract.getAddress(),
          data,
          value,
          ...otherOptions
        });
        
        const gasLimit = this.calculateGasLimit(estimate, buffer, maxGasLimit);
        const totalCost = await this.calculateTotalCost(gasLimit, value);
        
        return {
          method: 'provider_estimate',
          estimate,
          gasLimit,
          totalCost,
          error: null
        };
      } catch (providerError) {
        console.warn(`⚠️ Provider gas estimation failed: ${providerError.message}`);
        
        // Method 3: Use predefined gas limits based on function
        const predefinedLimit = this.getPredefinedGasLimit(functionName, args);
        const gasLimit = this.calculateGasLimit(predefinedLimit, buffer, maxGasLimit);
        const totalCost = await this.calculateTotalCost(gasLimit, value);
        
        return {
          method: 'predefined_limit',
          estimate: predefinedLimit,
          gasLimit,
          totalCost,
          error: null
        };
      }
    }
  }

  /**
   * Calculate gas limit with buffer
   */
  calculateGasLimit(estimate, buffer, maxGasLimit) {
    const bufferedLimit = (estimate * BigInt(100 + buffer)) / 100n;
    return bufferedLimit > maxGasLimit ? BigInt(maxGasLimit) : bufferedLimit;
  }

  /**
   * Calculate total transaction cost for Monad (charges gas_limit)
   */
  async calculateMonadTotalCost(gasLimit, value = 0n) {
    const baseFee = BigInt(this.monadSettings.baseFee);
    const priorityFee = BigInt(this.monadSettings.priorityFee);
    const totalGasPrice = baseFee + priorityFee;
    
    // Monad charges gas_limit, not gas_used!
    const gasCost = BigInt(gasLimit) * totalGasPrice;
    const totalCost = gasCost + BigInt(value);
    
    return {
      gasCost: ethers.formatEther(gasCost),
      totalCost: ethers.formatEther(totalCost),
      gasLimit,
      baseFee: ethers.formatUnits(baseFee, 'gwei') + ' gwei',
      priorityFee: ethers.formatUnits(priorityFee, 'gwei') + ' gwei',
      warning: 'Monad charges full gas_limit, not actual gas_used'
    };
  }

  /**
   * Calculate total cost including gas and value (Legacy method)
   */
  async calculateTotalCost(gasLimit, value) {
    const gasPrice = await this.getOptimalGasPrice();
    const gasCost = gasLimit * gasPrice.gasPrice;
    return gasCost + value;
  }

  /**
   * Get predefined gas limits for common functions
   */
  getPredefinedGasLimit(functionName, args) {
    // Monad-optimized gas limits (conservative since gas_limit is charged)
    const limits = {
      // BitredictPool functions - reduced for Monad efficiency
      'createPool': 5000000n, // Reduced from 9M - Monad charges gas_limit!
      'placeBet': 300000n, // Reduced from 500k
      'addLiquidity': 250000n, // Reduced from 400k
      'withdrawLiquidity': 200000n, // Reduced from 300k
      'withdrawCreatorStake': 400000n, // Reduced from 600k
      'settlePool': 500000n, // Reduced from 800k
      'settlePoolAutomatically': 600000n, // Reduced from 1M
      'claim': 250000n, // Reduced from 400k
      'refundPool': 500000n, // Reduced from 800k
      'boostPool': 150000n, // Reduced from 200k
      'createComboPool': 1200000n, // Reduced from 2M
      'placeComboBet': 300000n, // Reduced from 500k
      'resolveComboCondition': 200000n, // Reduced from 300k
      'claimCombo': 250000n, // Reduced from 400k
      
      // Oddyssey functions - optimized for Monad
      'placeSlip': 500000n, // Reduced from 800k
      'evaluateSlip': 400000n, // Reduced from 600k
      'claimPrize': 200000n, // Reduced from 300k
      'evaluateMultipleSlips': 600000n, // Reduced from 1M
      'claimMultiplePrizes': 300000n, // Reduced from 500k
      'startDailyCycle': 1200000n, // Reduced from 2M
      'resolveDailyCycle': 1000000n, // Reduced from 1.5M
      'resolveMultipleCycles': 2000000n, // Reduced from 3M
      
      // Token functions
      'approve': 100000n,
      'transfer': 100000n,
      'transferFrom': 100000n,
      
      // Oracle functions
      'submitOutcome': 300000n,
      'executeCall': 500000n,
      'proposeOutcome': 400000n,
      'disputeOutcome': 400000n,
      'voteOnDispute': 300000n,
      'resolveMarket': 600000n,
      'claimBonds': 500000n,
      
      // Staking functions
      'stake': 400000n,
      'unstake': 400000n,
      'claim': 300000n,
      'claimRevenue': 400000n,
      
      // Faucet functions
      'claimBitr': 200000n,
      'refillFaucet': 100000n,
      
      // Default for unknown functions
      'default': 500000n
    };

    return limits[functionName] || limits['default'];
  }

  /**
   * Get optimal gas price with caching
   */
  async getOptimalGasPrice() {
    const now = Date.now();
    
    // Return cached price if still valid
    if (this.gasPriceCache && now < this.cacheExpiry) {
      return this.gasPriceCache;
    }

    try {
      // Get current gas price
      const currentGasPrice = await this.provider.getFeeData();
      
      // Calculate optimal gas price with small buffer
      const baseGasPrice = currentGasPrice.gasPrice || 20000000000n; // 20 gwei default
      const optimalGasPrice = (baseGasPrice * 110n) / 100n; // 10% buffer
      
      // Cache the result
      this.gasPriceCache = {
        gasPrice: optimalGasPrice,
        maxFeePerGas: null,
        maxPriorityFeePerGas: null
      };
      this.cacheExpiry = now + this.CACHE_DURATION;
      
      console.log(`⛽ Optimal gas price: ${ethers.formatUnits(optimalGasPrice, 'gwei')} gwei`);
      
      return this.gasPriceCache;
    } catch (error) {
      console.warn(`⚠️ Gas price estimation failed: ${error.message}`);
      
      // Fallback to default gas price
      const fallbackPrice = {
        gasPrice: 20000000000n, // 20 gwei
        maxFeePerGas: null,
        maxPriorityFeePerGas: null
      };
      
      this.gasPriceCache = fallbackPrice;
      this.cacheExpiry = now + this.CACHE_DURATION;
      
      return fallbackPrice;
    }
  }

  /**
   * Check if wallet has sufficient balance for transaction
   */
  async checkBalance(walletAddress, totalCost) {
    try {
      const balance = await this.provider.getBalance(walletAddress);
      const hasSufficientBalance = balance >= totalCost;
      
      return {
        hasSufficientBalance,
        balance,
        totalCost,
        shortfall: hasSufficientBalance ? 0n : totalCost - balance
      };
    } catch (error) {
      console.error(`❌ Balance check failed: ${error.message}`);
      return {
        hasSufficientBalance: false,
        balance: 0n,
        totalCost,
        shortfall: totalCost,
        error: error.message
      };
    }
  }

  /**
   * Get gas price recommendations
   */
  async getGasPriceRecommendations() {
    try {
      const feeData = await this.provider.getFeeData();
      
      return {
        slow: {
          gasPrice: feeData.gasPrice || 15000000000n, // 15 gwei
          maxFeePerGas: feeData.maxFeePerGas || 15000000000n,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 1500000000n
        },
        medium: {
          gasPrice: (feeData.gasPrice || 20000000000n) * 110n / 100n, // 10% above base
          maxFeePerGas: (feeData.maxFeePerGas || 20000000000n) * 110n / 100n,
          maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas || 2000000000n) * 110n / 100n
        },
        fast: {
          gasPrice: (feeData.gasPrice || 25000000000n) * 120n / 100n, // 20% above base
          maxFeePerGas: (feeData.maxFeePerGas || 25000000000n) * 120n / 100n,
          maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas || 2500000000n) * 120n / 100n
        }
      };
    } catch (error) {
      console.warn(`⚠️ Gas price recommendations failed: ${error.message}`);
      
      // Fallback recommendations
      return {
        slow: { gasPrice: 15000000000n, maxFeePerGas: 15000000000n, maxPriorityFeePerGas: 1500000000n },
        medium: { gasPrice: 20000000000n, maxFeePerGas: 20000000000n, maxPriorityFeePerGas: 2000000000n },
        fast: { gasPrice: 25000000000n, maxFeePerGas: 25000000000n, maxPriorityFeePerGas: 2500000000n }
      };
    }
  }

  /**
   * Estimate gas for BitredictPool createPool with specific optimizations
   */
  async estimateCreatePoolGas(poolData, options = {}) {
    const {
      predictedOutcome,
      odds,
      creatorStake,
      eventStartTime,
      eventEndTime,
      league,
      category,
      region,
      isPrivate = false,
      maxBetPerUser = 0,
      useBitr = false,
      oracleType = 0,
      marketId
    } = poolData;

    // Validate required parameters
    if (!predictedOutcome || !odds || !creatorStake || !eventStartTime || !eventEndTime) {
      throw new Error('Missing required pool creation parameters');
    }

    // Calculate creation fee
    const creationFee = useBitr ? 50n * 10n ** 18n : 1n * 10n ** 18n; // 50 BITR or 1 STT
    const totalRequired = creationFee + BigInt(creatorStake);

    // Prepare transaction options
    const txOptions = {
      value: useBitr ? 0n : totalRequired,
      ...options
    };

    // Estimate gas with specific buffer for pool creation
    return await this.estimateGasWithFallback('createPool', [
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
    ], {
      buffer: 30, // 30% buffer for pool creation
      maxGasLimit: 9000000, // 9M gas limit for pool creation (increased from 2M)
      ...txOptions
    });
  }

  /**
   * Estimate gas for BitredictPool placeBet with optimizations
   */
  async estimatePlaceBetGas(poolId, amount, options = {}) {
    // Get pool info to determine token type
    const pool = await this.contract.pools(poolId);
    
    const txOptions = {
      value: pool.usesBitr ? 0n : BigInt(amount),
      ...options
    };

    return await this.estimateGasWithFallback('placeBet', [poolId, amount], {
      buffer: 25, // 25% buffer for betting
      maxGasLimit: 800000, // 800K gas limit
      ...txOptions
    });
  }

  /**
   * Estimate gas for BitredictPool addLiquidity with optimizations
   */
  async estimateAddLiquidityGas(poolId, amount, options = {}) {
    // Get pool info to determine token type
    const pool = await this.contract.pools(poolId);
    
    const txOptions = {
      value: pool.usesBitr ? 0n : BigInt(amount),
      ...options
    };

    return await this.estimateGasWithFallback('addLiquidity', [poolId, amount], {
      buffer: 20, // 20% buffer for liquidity
      maxGasLimit: 600000, // 600K gas limit
      ...txOptions
    });
  }

  /**
   * Get comprehensive gas analysis for a transaction
   */
  async analyzeGasCost(functionName, args, options = {}) {
    const gasEstimate = await this.estimateGasWithFallback(functionName, args, options);
    const gasPrice = await this.getOptimalGasPrice();
    const recommendations = await this.getGasPriceRecommendations();
    
    return {
      ...gasEstimate,
      gasPrice,
      recommendations,
      costBreakdown: {
        gasCost: gasEstimate.gasLimit * gasPrice.gasPrice,
        value: options.value || 0n,
        total: gasEstimate.totalCost
      },
      formatted: {
        gasLimit: gasEstimate.gasLimit.toString(),
        gasPrice: ethers.formatUnits(gasPrice.gasPrice, 'gwei') + ' gwei',
        totalCost: ethers.formatEther(gasEstimate.totalCost) + ' MON'
      }
    };
  }

  /**
   * Clear gas price cache
   */
  clearCache() {
    this.gasPriceCache = null;
    this.cacheExpiry = 0;
  }
}

module.exports = GasEstimator;
