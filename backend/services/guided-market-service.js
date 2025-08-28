const Web3Service = require('./web3-service');
const { ethers } = require('ethers');

class GuidedMarketService {
  constructor() {
    this.web3Service = new Web3Service();
    this.isInitialized = false;
  }

  /**
   * Initialize the guided market service
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    await this.web3Service.initialize();
    this.isInitialized = true;
    console.log('✅ GuidedMarketService initialized');
  }

  /**
   * Create a guided football market
   */
  async createFootballMarket(marketData) {
    await this.initialize();

    const {
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      matchDate,
      outcome,
      predictedOutcome,
      odds,
      creatorStake,
      useBitr = false,
      description = '',
      isPrivate = false,
      maxBetPerUser = 0
    } = marketData;

    // Validate required fields
    if (!fixtureId || !homeTeam || !awayTeam || !league || !matchDate || !outcome || !predictedOutcome || !odds || !creatorStake) {
      throw new Error('Missing required football market parameters');
    }

    // Validate odds range
    if (odds < 101 || odds > 10000) {
      throw new Error('Odds must be between 1.01x and 100.0x (101-10000 in contract format)');
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000n * 10n ** 18n : 5n * 10n ** 18n; // 1000 BITR or 5 STT
    const maxStake = 1000000n * 10n ** 18n; // 1M tokens
    const stakeAmount = BigInt(creatorStake) * 10n ** 18n;

    if (stakeAmount < minStake) {
      throw new Error(`Creator stake must be at least ${useBitr ? '1000 BITR' : '5 STT'}`);
    }

    if (stakeAmount > maxStake) {
      throw new Error('Creator stake cannot exceed 1,000,000 tokens');
    }

    // Calculate event times
    const matchTime = new Date(matchDate);
    const eventStartTime = Math.floor(matchTime.getTime() / 1000);
    const eventEndTime = eventStartTime + (2 * 60 * 60); // 2 hours after match starts

    // Validate timing
    const now = Math.floor(Date.now() / 1000);
    const bettingGracePeriod = 60; // 60 seconds
    const maxEventTime = 365 * 24 * 3600; // 365 days

    if (eventStartTime <= now + bettingGracePeriod) {
      throw new Error('Event must start at least 1 minute from now');
    }

    if (eventStartTime > now + maxEventTime) {
      throw new Error('Event cannot be more than 365 days in the future');
    }

    // Create market ID using keccak256(abi.encodePacked(fixtureId))
    const marketId = ethers.keccak256(ethers.solidityPacked(['uint256'], [fixtureId]));

    // Prepare pool data
    const poolData = {
      predictedOutcome: predictedOutcome, // Don't hash here - web3 service will hash it
      odds: odds,
      creatorStake: stakeAmount,
      eventStartTime: eventStartTime,
      eventEndTime: eventEndTime,
      league: league,
      category: 'football',
      region: 'Global', // Could be enhanced to extract from fixture data
      isPrivate: isPrivate,
      maxBetPerUser: BigInt(maxBetPerUser) * 10n ** 18n,
      useBitr: useBitr,
      oracleType: 0, // GUIDED oracle
      marketId: marketId
    };

    console.log('🎯 Creating guided football market:', {
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      outcome,
      predictedOutcome,
      odds: odds / 100,
      creatorStake: ethers.formatEther(stakeAmount),
      eventStartTime: new Date(eventStartTime * 1000).toISOString(),
      eventEndTime: new Date(eventEndTime * 1000).toISOString(),
      useBitr,
      marketId: marketId
    });

    // Create the pool using gas-optimized web3 service
    const tx = await this.web3Service.createPool(poolData);

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: null, // Will be available after transaction confirmation
      marketId: marketId,
      fixtureId: fixtureId,
      details: {
        homeTeam,
        awayTeam,
        league,
        outcome,
        predictedOutcome,
        odds: odds / 100,
        creatorStake: ethers.formatEther(stakeAmount),
        useBitr
      }
    };
  }

  /**
   * Create a guided cryptocurrency market
   */
  async createCryptoMarket(marketData) {
    await this.initialize();

    const {
      cryptocurrency,
      targetPrice,
      direction,
      timeframe,
      predictedOutcome,
      odds,
      creatorStake,
      useBitr = false,
      description = '',
      isPrivate = false,
      maxBetPerUser = 0
    } = marketData;

    // Validate required fields
    if (!cryptocurrency || !targetPrice || !direction || !timeframe || !predictedOutcome || !odds || !creatorStake) {
      throw new Error('Missing required cryptocurrency market parameters');
    }

    // Validate odds range
    if (odds < 101 || odds > 10000) {
      throw new Error('Odds must be between 1.01x and 100.0x (101-10000 in contract format)');
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000n * 10n ** 18n : 5n * 10n ** 18n; // 1000 BITR or 5 STT
    const maxStake = 1000000n * 10n ** 18n; // 1M tokens
    const stakeAmount = BigInt(creatorStake) * 10n ** 18n;

    if (stakeAmount < minStake) {
      throw new Error(`Creator stake must be at least ${useBitr ? '1000 BITR' : '5 STT'}`);
    }

    if (stakeAmount > maxStake) {
      throw new Error('Creator stake cannot exceed 1,000,000 tokens');
    }

    // Calculate event times based on timeframe
    const now = Math.floor(Date.now() / 1000);
    const timeframeInSeconds = this.parseTimeframe(timeframe);
    const eventStartTime = now + timeframeInSeconds;
    const eventEndTime = eventStartTime + (60 * 60); // 1 hour after start

    // Validate timing
    const bettingGracePeriod = 60; // 60 seconds
    const maxEventTime = 365 * 24 * 3600; // 365 days

    if (eventStartTime <= now + bettingGracePeriod) {
      throw new Error('Event must start at least 1 minute from now');
    }

    if (eventStartTime > now + maxEventTime) {
      throw new Error('Event cannot be more than 365 days in the future');
    }

    // Create market ID using keccak256(abi.encodePacked(crypto_symbol, targetPrice, direction, timeframe))
    const marketIdData = ethers.solidityPacked(
      ['string', 'uint256', 'string', 'uint256'],
      [cryptocurrency.symbol, Math.floor(targetPrice * 100), direction, eventStartTime]
    );
    const marketId = ethers.keccak256(marketIdData);

    // Prepare pool data
    const poolData = {
      predictedOutcome: predictedOutcome, // Don't hash here - web3 service will hash it
      odds: odds,
      creatorStake: stakeAmount,
      eventStartTime: eventStartTime,
      eventEndTime: eventEndTime,
      league: cryptocurrency.name,
      category: 'cryptocurrency',
      region: 'Global',
      isPrivate: isPrivate,
      maxBetPerUser: BigInt(maxBetPerUser) * 10n ** 18n,
      useBitr: useBitr,
      oracleType: 0, // GUIDED oracle
      marketId: marketId
    };

    console.log('💰 Creating guided cryptocurrency market:', {
      cryptocurrency: cryptocurrency.symbol,
      targetPrice,
      direction,
      timeframe,
      predictedOutcome,
      odds: odds / 100,
      creatorStake: ethers.formatEther(stakeAmount),
      eventStartTime: new Date(eventStartTime * 1000).toISOString(),
      eventEndTime: new Date(eventEndTime * 1000).toISOString(),
      useBitr,
      marketId: marketId
    });

    // Create the pool using gas-optimized web3 service
    const tx = await this.web3Service.createPool(poolData);

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: null, // Will be available after transaction confirmation
      marketId: marketId,
      details: {
        cryptocurrency: cryptocurrency.symbol,
        targetPrice,
        direction,
        timeframe,
        predictedOutcome,
        odds: odds / 100,
        creatorStake: ethers.formatEther(stakeAmount),
        useBitr
      }
    };
  }

  /**
   * Parse timeframe string to seconds
   */
  parseTimeframe(timeframe) {
    const timeframes = {
      '1h': 60 * 60,
      '4h': 4 * 60 * 60,
      '1d': 24 * 60 * 60,
      '1w': 7 * 24 * 60 * 60,
      '1m': 30 * 24 * 60 * 60
    };

    if (timeframes[timeframe]) {
      return timeframes[timeframe];
    }

    // Try to parse custom timeframe (e.g., "2h", "3d")
    const match = timeframe.match(/^(\d+)([hdw])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      const multipliers = { h: 60 * 60, d: 24 * 60 * 60, w: 7 * 24 * 60 * 60 };
      return value * multipliers[unit];
    }

    throw new Error(`Invalid timeframe: ${timeframe}. Valid formats: 1h, 4h, 1d, 1w, 1m, or custom like 2h, 3d`);
  }

  /**
   * Get pool information
   */
  async getPoolInfo(poolId) {
    await this.initialize();

    const contract = await this.web3Service.getBitredictPoolContract();
    const pool = await contract.pools(poolId);

    return {
      poolId: poolId,
      creator: pool.creator,
      odds: Number(pool.odds) / 100,
      settled: pool.settled,
      creatorSideWon: pool.creatorSideWon,
      isPrivate: pool.isPrivate,
      usesBitr: pool.usesBitr,
      filledAbove60: pool.filledAbove60,
      oracleType: pool.oracleType === 0 ? 'GUIDED' : 'OPEN',
      creatorStake: ethers.formatEther(pool.creatorStake),
      totalCreatorSideStake: ethers.formatEther(pool.totalCreatorSideStake),
      maxBettorStake: ethers.formatEther(pool.maxBettorStake),
      totalBettorStake: ethers.formatEther(pool.totalBettorStake),
      predictedOutcome: pool.predictedOutcome,
      result: pool.result,
      marketId: pool.marketId,
      eventStartTime: new Date(Number(pool.eventStartTime) * 1000).toISOString(),
      eventEndTime: new Date(Number(pool.eventEndTime) * 1000).toISOString(),
      bettingEndTime: new Date(Number(pool.bettingEndTime) * 1000).toISOString(),
      resultTimestamp: pool.resultTimestamp ? new Date(Number(pool.resultTimestamp) * 1000).toISOString() : null,
      arbitrationDeadline: new Date(Number(pool.arbitrationDeadline) * 1000).toISOString(),
      league: pool.league,
      category: pool.category,
      region: pool.region,
      maxBetPerUser: ethers.formatEther(pool.maxBetPerUser)
    };
  }

  /**
   * Place a bet on a pool
   */
  async placeBet(poolId, amount, options = {}) {
    await this.initialize();

    // Validate amount
    const minBet = 1n * 10n ** 18n; // 1 token minimum
    const maxBet = 100000n * 10n ** 18n; // 100K tokens maximum
    const betAmount = BigInt(amount) * 10n ** 18n;

    if (betAmount < minBet) {
      throw new Error('Bet amount must be at least 1 token');
    }

    if (betAmount > maxBet) {
      throw new Error('Bet amount cannot exceed 100,000 tokens');
    }

    console.log(`🎲 Placing bet on pool ${poolId}:`, {
      amount: ethers.formatEther(betAmount),
      options
    });

    const tx = await this.web3Service.placeBet(poolId, betAmount, options);

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: poolId,
      amount: ethers.formatEther(betAmount)
    };
  }

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(poolId, amount, options = {}) {
    await this.initialize();

    // Validate amount
    const minLiquidity = 1n * 10n ** 18n; // 1 token minimum
    const maxLiquidity = 500000n * 10n ** 18n; // 500K tokens maximum
    const liquidityAmount = BigInt(amount) * 10n ** 18n;

    if (liquidityAmount < minLiquidity) {
      throw new Error('Liquidity amount must be at least 1 token');
    }

    if (liquidityAmount > maxLiquidity) {
      throw new Error('Liquidity amount cannot exceed 500,000 tokens');
    }

    console.log(`💧 Adding liquidity to pool ${poolId}:`, {
      amount: ethers.formatEther(liquidityAmount),
      options
    });

    const tx = await this.web3Service.addLiquidity(poolId, liquidityAmount, options);

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: poolId,
      amount: ethers.formatEther(liquidityAmount)
    };
  }

  /**
   * Settle a guided pool automatically
   */
  async settlePoolAutomatically(poolId) {
    await this.initialize();

    console.log(`🔍 Settling pool ${poolId} automatically...`);

    const contract = await this.web3Service.getBitredictPoolContract();
    const tx = await contract.settlePoolAutomatically(poolId, {
      gasLimit: 1000000
    });

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: poolId
    };
  }

  /**
   * Claim rewards from a pool
   */
  async claimRewards(poolId) {
    await this.initialize();

    console.log(`💰 Claiming rewards from pool ${poolId}...`);

    const tx = await this.web3Service.claimPoolRewards(poolId);

    return {
      success: true,
      transactionHash: tx.hash,
      poolId: poolId
    };
  }

  /**
   * Get pools by category
   */
  async getPoolsByCategory(category, limit = 20, offset = 0) {
    await this.initialize();

    const contract = await this.web3Service.getBitredictPoolContract();
    const categoryHash = ethers.keccak256(ethers.toUtf8Bytes(category));
    const poolIds = await contract.getPoolsByCategory(categoryHash, limit, offset);

    const pools = [];
    for (const poolId of poolIds) {
      try {
        const poolInfo = await this.getPoolInfo(poolId);
        pools.push(poolInfo);
      } catch (error) {
        console.warn(`Failed to get pool info for ${poolId}:`, error.message);
      }
    }

    return pools;
  }

  /**
   * Get all pools with pagination
   */
  async getPools(limit = 50, offset = 0) {
    await this.initialize();

    try {
      const contract = await this.web3Service.getBitredictPoolContract();
      const poolCount = await contract.poolCount();
      
      const pools = [];
      const startId = Math.max(1, poolCount - offset - limit + 1);
      const endId = Math.max(0, poolCount - offset);
      
      for (let i = startId; i <= endId; i++) {
        try {
          const poolInfo = await this.getPoolInfo(i);
          if (poolInfo) {
            pools.push(poolInfo);
          }
        } catch (error) {
          console.warn(`Failed to get pool info for ${i}:`, error.message);
        }
      }
      
      return pools.reverse(); // Return newest first
    } catch (error) {
      console.error('Error getting pools:', error);
      return [];
    }
  }

  /**
   * Get active pools by creator
   */
  async getActivePoolsByCreator(creatorAddress, limit = 20, offset = 0) {
    await this.initialize();

    const contract = await this.web3Service.getBitredictPoolContract();
    const poolIds = await contract.getActivePoolsByCreator(creatorAddress, limit, offset);

    const pools = [];
    for (const poolId of poolIds) {
      try {
        const poolInfo = await this.getPoolInfo(poolId);
        pools.push(poolInfo);
      } catch (error) {
        console.warn(`Failed to get pool info for ${poolId}:`, error.message);
      }
    }

    return pools;
  }

  /**
   * Get gas cost analysis for pool creation
   */
  async analyzePoolCreationCost(poolData) {
    await this.initialize();

    return await this.web3Service.gasEstimator.analyzeGasCost('createPool', [
      poolData.predictedOutcome,
      poolData.odds,
      poolData.creatorStake,
      poolData.eventStartTime,
      poolData.eventEndTime,
      poolData.league,
      poolData.category,
      poolData.region,
      poolData.isPrivate,
      poolData.maxBetPerUser,
      poolData.useBitr,
      poolData.oracleType,
      poolData.marketId
    ], {
      value: poolData.useBitr ? 0n : poolData.creatorStake + 1n * 10n ** 18n
    });
  }

  /**
   * Validate guided oracle integration
   */
  async validateGuidedOracle(marketId) {
    await this.initialize();

    try {
      const guidedOracle = await this.web3Service.getGuidedOracleContract();
      const outcome = await guidedOracle.getOutcome(marketId);
      
      return {
        isValid: true,
        isSet: outcome.isSet,
        resultData: outcome.resultData,
        marketId: marketId
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        marketId: marketId
      };
    }
  }

  /**
   * Get pool statistics
   */
  async getPoolStats() {
    try {
      await this.initialize();
      
      const contract = await this.web3Service.getBitredictPoolContract();
      const poolCount = await contract.poolCount();
      
      // Calculate basic stats
      let totalVolume = 0n;
      let activeMarkets = 0;
      let settledMarkets = 0;
      let privatePools = 0;
      let bitrPools = 0;
      
      // Sample pools to calculate stats (for performance)
      const sampleSize = Math.min(100, poolCount);
      const startId = Math.max(1, poolCount - sampleSize + 1);
      
      for (let i = startId; i <= poolCount; i++) {
        try {
          const poolInfo = await this.getPoolInfo(i);
          if (poolInfo) {
            totalVolume += BigInt(poolInfo.creatorStake || 0) + BigInt(poolInfo.totalBettorStake || 0);
            
            if (!poolInfo.settled) {
              activeMarkets++;
            } else {
              settledMarkets++;
            }
            
            if (poolInfo.isPrivate) {
              privatePools++;
            }
            
            if (poolInfo.usesBitr) {
              bitrPools++;
            }
          }
        } catch (error) {
          console.warn(`Failed to get pool stats for ${i}:`, error.message);
        }
      }
      
      // Extrapolate stats for all pools
      const multiplier = poolCount / sampleSize;
      
      return {
        totalVolume: (totalVolume * BigInt(Math.floor(multiplier)) / 10n ** 18n).toString(),
        activeMarkets: Math.floor(activeMarkets * multiplier),
        participants: Math.floor(poolCount * 0.8), // Estimate based on pool count
        totalPools: poolCount,
        boostedPools: Math.floor(poolCount * 0.1), // Estimate 10% are boosted
        comboPools: 0, // Not implemented yet
        privatePools: Math.floor(privatePools * multiplier),
        bitrPools: Math.floor(bitrPools * multiplier)
      };
    } catch (error) {
      console.error('Error getting pool stats:', error);
      return {
        totalVolume: "0",
        activeMarkets: 0,
        participants: 0,
        totalPools: 0,
        boostedPools: 0,
        comboPools: 0,
        privatePools: 0,
        bitrPools: 0
      };
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus() {
    try {
      await this.initialize();
      const health = await this.web3Service.healthCheck();
      
      return {
        status: 'healthy',
        web3Service: health,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = GuidedMarketService;
