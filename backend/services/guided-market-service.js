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
    if (!this.web3Service.isInitialized) {
      await this.web3Service.initialize();
      console.log('✅ GuidedMarketService initialized');
    }
  }

  /**
   * Decode predicted outcome hash to readable text and get team names
   */
  async decodePredictedOutcome(predictedOutcomeHash, category, odds, marketId = null) {
    let readableOutcome = predictedOutcomeHash;
    let betMarketType = null;
    let homeTeam = null;
    let awayTeam = null;
    
    try {
      // First, try to get team names from fixture mapping table if marketId is available
      if (marketId && category === 'football') {
        try {
          const db = require('../db/db');
          
          // Look up the fixture mapping using the marketId hash
          const mappingResult = await db.query(`
            SELECT fixture_id, home_team, away_team, league_name, predicted_outcome
            FROM oracle.fixture_mappings 
            WHERE market_id_hash = $1
          `, [marketId]);
          
          if (mappingResult.rows.length > 0) {
            const mapping = mappingResult.rows[0];
            homeTeam = mapping.home_team;
            awayTeam = mapping.away_team;
            
            // If we have a decoded outcome in the fixture mapping, use it
            if (mapping.predicted_outcome) {
              readableOutcome = mapping.predicted_outcome;
              betMarketType = this.determineBetMarketType(mapping.predicted_outcome);
              return { readableOutcome, betMarketType, homeTeam, awayTeam };
            }
            
            // Now create a meaningful outcome description
            if (predictedOutcomeHash.startsWith('0x')) {
              // Try to decode the hash to get the actual prediction
              const decodedOutcome = await this.decodeHash(predictedOutcomeHash);
              
              if (decodedOutcome) {
                const outcome = decodedOutcome.toLowerCase();
                
                // Create readable outcome based on the prediction
                if (['1', 'home'].includes(outcome)) {
                  readableOutcome = `${homeTeam} wins`;
                  betMarketType = "Match Result";
                } else if (['2', 'away'].includes(outcome)) {
                  readableOutcome = `${awayTeam} wins`;
                  betMarketType = "Match Result";
                } else if (['x', 'draw'].includes(outcome)) {
                  readableOutcome = `Draw between ${homeTeam} and ${awayTeam}`;
                  betMarketType = "Match Result";
                } else if (['o', 'over'].some(term => outcome.includes(term))) {
                  readableOutcome = `Over 2.5 goals in ${homeTeam} vs ${awayTeam}`;
                  betMarketType = "Goals Over/Under";
                } else if (['u', 'under'].some(term => outcome.includes(term))) {
                  readableOutcome = `Under 2.5 goals in ${homeTeam} vs ${awayTeam}`;
                  betMarketType = "Goals Over/Under";
                } else if (['btts', 'both teams'].some(term => outcome.includes(term))) {
                  if (outcome.includes('yes')) {
                    readableOutcome = `Both teams to score in ${homeTeam} vs ${awayTeam}`;
                  } else {
                    readableOutcome = `Not both teams to score in ${homeTeam} vs ${awayTeam}`;
                  }
                  betMarketType = "Both Teams To Score";
                } else {
                  // Generic outcome with team names
                  readableOutcome = `${decodedOutcome} in ${homeTeam} vs ${awayTeam}`;
                  betMarketType = "Other";
                }
              } else {
                // Fallback to generic outcome with team names
                readableOutcome = `${homeTeam} vs ${awayTeam}`;
                betMarketType = "Match Result";
              }
            } else {
              // Not a hash, use as-is with team names
              readableOutcome = `${predictedOutcomeHash} in ${homeTeam} vs ${awayTeam}`;
              betMarketType = "Match Result";
            }
          }
        } catch (dbError) {
          console.warn('Could not fetch fixture mapping data:', dbError.message);
        }
      }
      
      // If we couldn't get team names, fall back to the original logic
      if (!homeTeam || !awayTeam) {
        if (predictedOutcomeHash.startsWith('0x')) {
          try {
            // Decode the hash to get the actual predicted outcome
            const decodedOutcome = ethers.toUtf8String(predictedOutcomeHash);
            if (decodedOutcome && decodedOutcome.trim() && !decodedOutcome.includes('\u0000')) {
              readableOutcome = decodedOutcome;
              
              // Determine bet market type based on the decoded outcome
              if (category === 'football') {
                const outcome = decodedOutcome.toLowerCase();
                if (['1', '2', 'x', 'home', 'away', 'draw'].includes(outcome)) {
                  betMarketType = "Match Result";
                } else if (['o', 'u', 'over', 'under'].some(term => outcome.includes(term))) {
                  betMarketType = "Goals Over/Under";
                } else if (['btts', 'both teams', 'yes', 'no'].some(term => outcome.includes(term))) {
                  betMarketType = "Both Teams To Score";
                } else if (['ht', 'half', 'first half'].some(term => outcome.includes(term))) {
                  betMarketType = "Half-time Result";
                } else {
                  betMarketType = "Other";
                }
              } else if (category === 'crypto') {
                betMarketType = "Price Target";
              } else {
                betMarketType = "General";
              }
            } else {
              // Fallback to generic outcome with team names
              if (category === 'football') {
                const oddsDecimal = parseFloat(odds) / 100;
                if (oddsDecimal >= 2.0) {
                  readableOutcome = "High odds outcome";
                  betMarketType = "Match Result";
                } else if (oddsDecimal >= 1.5) {
                  readableOutcome = "Medium odds outcome";
                  betMarketType = "Goals Over/Under";
                } else {
                  readableOutcome = "Low odds outcome";
                  betMarketType = "Double Chance";
                }
              } else if (category === 'crypto') {
                readableOutcome = "Price movement prediction";
                betMarketType = "Price Target";
              } else {
                readableOutcome = "Prediction outcome";
                betMarketType = "General";
              }
            }
          } catch (decodeError) {
            console.warn('Could not decode predicted outcome hash:', decodeError);
            // Fallback to generic outcome
            if (category === 'football') {
              const oddsDecimal = parseFloat(odds) / 100;
              if (oddsDecimal >= 2.0) {
                readableOutcome = "High odds outcome";
                betMarketType = "Match Result";
              } else if (oddsDecimal >= 1.5) {
                readableOutcome = "Medium odds outcome";
                betMarketType = "Goals Over/Under";
              } else {
                readableOutcome = "Low odds outcome";
                betMarketType = "Double Chance";
              }
            } else if (category === 'crypto') {
              readableOutcome = "Price movement prediction";
              betMarketType = "Price Target";
            } else {
              readableOutcome = "Prediction outcome";
              betMarketType = "General";
            }
          }
        }
      }
    } catch (error) {
      console.warn('Could not decode predicted outcome hash:', error);
      readableOutcome = "Prediction outcome";
      betMarketType = "General";
    }
    
    return { readableOutcome, betMarketType, homeTeam, awayTeam };
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
    // This creates a bytes32 hash that the contract expects
    // The fixture ID is stored separately for easy oracle result fetching
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

    // Store fixture mapping for future reference (enriched)
    await this.storeFixtureMapping({
      marketId,
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      matchDate: matchTime,
      predictedOutcome, // original hash/string
      readableOutcome: (await this.decodePredictedOutcome(predictedOutcome, 'football', odds, marketId)).readableOutcome,
      marketType: (await this.decodePredictedOutcome(predictedOutcome, 'football', odds, marketId)).betMarketType,
      oddsDecimal: odds / 100,
      creatorStakeWei: stakeAmount.toString(),
      paymentToken: useBitr ? 'BITR' : 'STT',
      useBitr,
      description,
      userPosition: 'YES - Challenge Supporters'
    });

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
   * Update pool statuses based on event timing
   */
  async updatePoolStatuses() {
    try {
      const db = require('../db/db');
      
      // Update pools to 'closed' if event has started
      const closeQuery = `
        UPDATE oracle.pools 
        SET status = 'closed' 
        WHERE status = 'active' 
        AND EXTRACT(EPOCH FROM NOW()) > event_start_time::bigint
      `;
      
      const closeResult = await db.query(closeQuery);
      
      if (closeResult.rowCount > 0) {
        console.log(`✅ Updated ${closeResult.rowCount} pools to 'closed' status`);
      }
      
      return closeResult.rowCount;
    } catch (error) {
      console.error('Error updating pool statuses:', error);
      return 0;
    }
  }

  /**
   * Get pool information
   */
  async getPoolInfo(poolId) {
    await this.initialize();

    try {
      // Update pool statuses first
      await this.updatePoolStatuses();
      
      // FIXED: Read from database instead of blockchain for better performance
      const db = require('../db/db');
      
      const query = `
        SELECT 
          pool_id, creator_address, predicted_outcome, odds, creator_stake,
          event_start_time, event_end_time, league, category, region,
          is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
          fixture_id, status, tx_hash, block_number, created_at,
          total_bettor_stake, creator_side_won, result, result_timestamp
        FROM oracle.pools 
        WHERE pool_id = $1
      `;
      
      const result = await db.query(query, [poolId]);
      
      if (result.rows.length === 0) {
        return null; // Pool not found
      }
      
      const row = result.rows[0];
      
      // Decode predicted outcome hash to readable text
      let readableOutcome = row.predicted_outcome;
      let homeTeam = null;
      let awayTeam = null;
      let betMarketType = null;
      
              // Use the helper function to decode predicted outcome
        const { readableOutcome: decodedOutcome, betMarketType: decodedMarketType, homeTeam: decodedHomeTeam, awayTeam: decodedAwayTeam } = 
          await this.decodePredictedOutcome(row.predicted_outcome, row.category, row.odds, row.market_id);
        readableOutcome = decodedOutcome;
        betMarketType = decodedMarketType;
        homeTeam = decodedHomeTeam || homeTeam;
        awayTeam = decodedAwayTeam || awayTeam;
      
      // Format amounts properly to avoid scientific notation
      const creatorStakeFormatted = ethers.formatEther(row.creator_stake || '0');
      const maxBettorStakeFormatted = ethers.formatEther(row.max_bet_per_user || '0');
      const totalBettorStakeFormatted = ethers.formatEther(row.total_bettor_stake || '0');
      
      // Calculate potential win amount
      const oddsDecimal = parseFloat(row.odds) / 100;
      const potentialWinAmount = (parseFloat(creatorStakeFormatted) * oddsDecimal).toString();
      
      // Calculate pool fill progress
      const totalPoolCapacity = parseFloat(creatorStakeFormatted) + parseFloat(totalBettorStakeFormatted);
      const poolFillProgress = totalPoolCapacity > 0 ? (parseFloat(totalBettorStakeFormatted) / totalPoolCapacity) * 100 : 0;

      return {
        poolId: parseInt(row.pool_id),
        pool_id: parseInt(row.pool_id), // Alternative field name
        number: parseInt(row.pool_id), // Common field name for display
        pool_number: parseInt(row.pool_id), // Another common field name
        creator: row.creator_address,
        odds: oddsDecimal,
        settled: row.status === 'settled',
        creatorSideWon: row.creator_side_won,
        isPrivate: row.is_private,
        usesBitr: row.use_bitr,
        filledAbove60: false, // Default for now
        oracleType: row.oracle_type === 0 ? 'GUIDED' : 'OPEN',
        status: row.status,
        creatorStake: creatorStakeFormatted,
        totalCreatorSideStake: creatorStakeFormatted,
        maxBettorStake: maxBettorStakeFormatted,
        totalBettorStake: totalBettorStakeFormatted,
        potentialWinAmount: potentialWinAmount,
        poolFillProgress: poolFillProgress,
        predictedOutcome: readableOutcome,
        originalPredictedOutcome: row.predicted_outcome, // Keep original hash
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        betMarketType: betMarketType,
        result: row.result,
        marketId: row.market_id,
        eventStartTime: new Date(parseInt(row.event_start_time) * 1000).toISOString(),
        eventEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(),
        bettingEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(), // Same as event end
        resultTimestamp: row.result_timestamp ? new Date(parseInt(row.result_timestamp) * 1000).toISOString() : null,
        arbitrationDeadline: null, // Not applicable
        league: row.league,
        category: row.category,
        region: row.region,
        maxBetPerUser: maxBettorStakeFormatted,
        txHash: row.tx_hash,
        blockNumber: parseInt(row.block_number),
        createdAt: row.created_at,
        status: row.status
      };
    } catch (error) {
      console.error('Error getting pool info:', error);
      return null;
    }
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

    // Invalidate cache for this pool's progress data
    try {
      const { delCache } = require('../config/redis');
      const cacheKey = `pool_progress:${poolId}`;
      await delCache(cacheKey);
      console.log(`🗑️ Invalidated cache for pool ${poolId} progress after bet placement`);
    } catch (error) {
      console.error('Error invalidating cache:', error);
      // Don't fail the bet placement if cache invalidation fails
    }

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

    // Invalidate cache for this pool's progress data
    try {
      const { delCache } = require('../config/redis');
      const cacheKey = `pool_progress:${poolId}`;
      await delCache(cacheKey);
      console.log(`🗑️ Invalidated cache for pool ${poolId} progress after liquidity addition`);
    } catch (error) {
      console.error('Error invalidating cache:', error);
      // Don't fail the liquidity addition if cache invalidation fails
    }

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
   * Get pool progress metrics for UI - calculated from database with Redis caching
   */
  async getPoolProgress(poolId) {
    try {
      const { cache } = require('../config/redis');
      
      // Check cache first
      const cacheKey = `pool_progress:${poolId}`;
      const cachedData = await cache.get(cacheKey);
      
      if (cachedData) {
        console.log(`📦 Cache hit for pool ${poolId} progress`);
        return cachedData;
      }
      
      console.log(`💾 Cache miss for pool ${poolId} progress, fetching from database`);
      const db = require('../db/db');
      
      // Get pool data
      const poolQuery = `
        SELECT 
          pool_id, creator_address, predicted_outcome, odds, creator_stake,
          event_start_time, event_end_time, league, category, region,
          is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
          status, created_at
        FROM oracle.pools 
        WHERE pool_id = $1
      `;
      
      const poolResult = await db.query(poolQuery, [poolId]);
      
      if (poolResult.rows.length === 0) {
        throw new Error('Pool not found');
      }
      
      const pool = poolResult.rows[0];
      
      // Get all bets for this pool
      const betsQuery = `
        SELECT 
          user_address, amount, is_creator_side, created_at
        FROM oracle.pool_bets 
        WHERE pool_id = $1
        ORDER BY created_at ASC
      `;
      
      const betsResult = await db.query(betsQuery, [poolId]);
      const bets = betsResult.rows;
      
      // Calculate pool progress metrics
      const totalBettorStake = bets
        .filter(bet => !bet.is_creator_side) // Only bettor bets (not LP bets)
        .reduce((sum, bet) => sum + BigInt(bet.amount), 0n);
      
      const totalCreatorSideStake = bets
        .filter(bet => bet.is_creator_side) // Only LP bets
        .reduce((sum, bet) => sum + BigInt(bet.amount), BigInt(pool.creator_stake));
      
      // Calculate max bettor capacity based on odds
      const odds = BigInt(pool.odds);
      const denominator = odds - 100n;
      const maxBettorCapacity = (totalCreatorSideStake * 100n) / denominator;
      
      // Calculate total pool size
      const totalPoolSize = totalCreatorSideStake + maxBettorCapacity;
      
      // Calculate fill percentage
      const fillPercentage = maxBettorCapacity > 0n 
        ? Number((totalBettorStake * 10000n) / maxBettorCapacity) / 100
        : 0;
      
      // Get participant counts
      const uniqueBettors = new Set(
        bets.filter(bet => !bet.is_creator_side).map(bet => bet.user_address)
      );
      
      const uniqueLPs = new Set(
        bets.filter(bet => bet.is_creator_side).map(bet => bet.user_address)
      );
      
      // Add creator to LPs count
      uniqueLPs.add(pool.creator_address);
      
      const progressData = {
        totalPoolSize: totalPoolSize.toString(),
        currentBettorStake: totalBettorStake.toString(),
        maxBettorCapacity: maxBettorCapacity.toString(),
        creatorSideStake: totalCreatorSideStake.toString(),
        fillPercentage: fillPercentage,
        bettorCount: uniqueBettors.size,
        lpCount: uniqueLPs.size,
        creatorStake: pool.creator_stake.toString(),
        totalCreatorSideStake: totalCreatorSideStake.toString(),
        totalBettorStake: totalBettorStake.toString(),
        maxBettorStake: maxBettorCapacity.toString(),
        odds: Number(odds) / 100, // Convert from basis points to decimal
        usesBitr: pool.use_bitr,
        poolData: {
          id: pool.pool_id,
          creator: pool.creator_address,
          predictedOutcome: pool.predicted_outcome,
          league: pool.league,
          category: pool.category,
          region: pool.region,
          isPrivate: pool.is_private,
          status: pool.status,
          createdAt: pool.created_at
        }
      };
      
      // Cache the result for 30 seconds (short cache for real-time data)
      await cache.set(cacheKey, progressData, 30);
      console.log(`💾 Cached pool ${poolId} progress data for 30 seconds`);
      
      return progressData;
    } catch (error) {
      console.error('Error getting pool progress:', error);
      throw error;
    }
  }

  /**
   * Get pools by category
   */
  async getPoolsByCategory(category, limit = 20, offset = 0) {
    await this.initialize();

    try {
      // FIXED: Read from database instead of blockchain for better performance
      const db = require('../db/db');
      
      let query;
      let params;
      
      if (category === 'all') {
        // For 'all' category, get all pools (active, closed, settled)
        query = `
          SELECT 
            pool_id, creator_address, predicted_outcome, odds, creator_stake,
            event_start_time, event_end_time, league, category, region,
            is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
            fixture_id, status, tx_hash, block_number, created_at
          FROM oracle.pools 
          WHERE status IN ('active', 'closed', 'settled')
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2
        `;
        params = [limit, offset];
      } else {
        // For specific category, filter by category
        query = `
          SELECT 
            pool_id, creator_address, predicted_outcome, odds, creator_stake,
            event_start_time, event_end_time, league, category, region,
            is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
            fixture_id, status, tx_hash, block_number, created_at
          FROM oracle.pools 
          WHERE status IN ('active', 'closed', 'settled') AND category = $1
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3
        `;
        params = [category, limit, offset];
      }
      
      const result = await db.query(query, params);
      
      const pools = result.rows.map(row => ({
        poolId: parseInt(row.pool_id),
        pool_id: parseInt(row.pool_id), // Alternative field name
        number: parseInt(row.pool_id), // Common field name for display
        pool_number: parseInt(row.pool_id), // Another common field name
        creator: row.creator_address,
        odds: parseFloat(row.odds) / 100, // Convert from basis points
        settled: row.status === 'settled',
        creatorSideWon: row.creator_side_won || null,
        isPrivate: row.is_private,
        usesBitr: row.use_bitr,
        filledAbove60: false, // Default
        oracleType: row.oracle_type === 0 ? 'GUIDED' : 'OPEN',
        creatorStake: row.creator_stake,
        totalCreatorSideStake: row.creator_stake, // Same as creator stake for now
        maxBettorStake: row.max_bet_per_user,
        totalBettorStake: '0', // No bets yet
        predictedOutcome: row.predicted_outcome,
        result: null, // Not settled
        marketId: row.market_id,
        eventStartTime: new Date(parseInt(row.event_start_time) * 1000).toISOString(),
        eventEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(),
        bettingEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(), // Same as event end
        resultTimestamp: null, // Not settled
        arbitrationDeadline: null, // Not applicable
        league: row.league,
        category: row.category,
        region: row.region,
        maxBetPerUser: row.max_bet_per_user,
        txHash: row.tx_hash,
        blockNumber: parseInt(row.block_number),
        createdAt: row.created_at
      }));
      
      return pools;
    } catch (error) {
      console.error('Error getting pools by category:', error);
      return [];
    }
  }

  /**
   * Get all pools with pagination
   */
  async getPools(limit = 50, offset = 0) {
    await this.initialize();

    try {
      // Update pool statuses first
      await this.updatePoolStatuses();
      
      // ENHANCED: Read from database with all the new columns
      const db = require('../db/db');
      
      const query = `
        SELECT 
          p.pool_id, p.creator_address, p.predicted_outcome, p.odds, p.creator_stake,
          p.event_start_time, p.event_end_time, p.league, p.category, p.region,
          p.is_private, p.max_bet_per_user, p.use_bitr, p.oracle_type, p.market_id,
          p.status, p.tx_hash, p.block_number, p.created_at,
          p.home_team, p.away_team, p.fixture_id, p.readable_outcome, p.market_type, p.title,
          p.creator_side_won, p.result, p.result_timestamp, p.settled_at,
          p.boost_tier, p.boost_expiry, p.participant_count, p.fill_percentage,
          p.total_volume, p.bet_count, p.avg_bet_size, p.creator_reputation,
          p.category_rank, p.is_hot, p.last_activity, p.trending, p.social_stats, p.change_24h
        FROM oracle.pools p
        WHERE p.status IN ('active', 'closed', 'settled')
        ORDER BY p.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      
      const result = await db.query(query, [limit, offset]);
      
      const pools = result.rows.map((row) => {
        // Use the stored readable data from the database
        const readableOutcome = row.readable_outcome || `Prediction ${row.pool_id}`;
        const betMarketType = row.market_type || "Prediction";
        const homeTeam = row.home_team;
        const awayTeam = row.away_team;
        const title = row.title || readableOutcome;
        
        // Format creator stake properly
        const formattedCreatorStake = ethers.formatEther(row.creator_stake);
        
        // Create structured odds display
        const oddsDisplay = {
          odds: parseFloat(row.odds) / 100, // Convert from basis points to decimal
          market: betMarketType,
          selection: "YES" // User is betting that it WILL happen (challenging creator)
        };

        // Parse social stats JSON
        let socialStats = { likes: 0, comments: 0, views: 0 };
        try {
          if (row.social_stats) {
            socialStats = typeof row.social_stats === 'string' 
              ? JSON.parse(row.social_stats) 
              : row.social_stats;
          }
        } catch (e) {
          console.warn(`Could not parse social stats for pool ${row.pool_id}:`, e.message);
        }

        return {
          
          id: parseInt(row.pool_id),
          poolId: parseInt(row.pool_id), // Add explicit poolId field for frontend compatibility
          pool_id: parseInt(row.pool_id), // Alternative field name
          number: parseInt(row.pool_id), // Common field name for display
          pool_number: parseInt(row.pool_id), // Another common field name
          creator: row.creator_address,
          odds: parseFloat(row.odds) / 100, // Convert from basis points
          settled: row.status === 'settled',
          creatorSideWon: row.creator_side_won,
          isPrivate: row.is_private,
          usesBitr: row.use_bitr,
          filledAbove60: row.fill_percentage >= 60,
          oracleType: row.oracle_type === 0 ? 'GUIDED' : 'OPEN',
          creatorStake: formattedCreatorStake, // Formatted as readable string
          totalCreatorSideStake: row.creator_stake, // Keep as BigInt string for calculations
          maxBettorStake: row.max_bet_per_user,
          totalBettorStake: row.total_volume || '0', // Use total_volume as total bettor stake
          predictedOutcome: readableOutcome,
          originalPredictedOutcome: row.predicted_outcome, // Keep original hash
          betMarketType: betMarketType,
          title: title, // User-friendly title with team names
          homeTeam: homeTeam,
          awayTeam: awayTeam,
          oddsDisplay: oddsDisplay, // Structured odds data
          result: row.result,
          marketId: row.market_id,
          eventStartTime: new Date(parseInt(row.event_start_time) * 1000).toISOString(),
          eventEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(),
          bettingEndTime: new Date(parseInt(row.event_start_time) * 1000 - 60000).toISOString(), // 1 minute before event
          resultTimestamp: row.result_timestamp ? new Date(row.result_timestamp).toISOString() : null,
          arbitrationDeadline: new Date(parseInt(row.event_end_time) * 1000 + (24 * 60 * 60 * 1000)).toISOString(), // 24 hours after event
          league: row.league,
          category: row.category,
          region: row.region,
          maxBetPerUser: row.max_bet_per_user,
          txHash: row.tx_hash,
          blockNumber: parseInt(row.block_number),
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
          
          // Enhanced display fields
          boostTier: row.boost_tier || 'NONE',
          boostExpiry: row.boost_expiry ? new Date(row.boost_expiry).getTime() / 1000 : 0,
          trending: row.trending || false,
          socialStats: socialStats,
          change24h: parseFloat(row.change_24h || 0),
          
          // Indexed data fields
          indexedData: {
            participantCount: row.participant_count || 0,
            fillPercentage: parseFloat(row.fill_percentage || 0),
            totalVolume: row.total_volume || '0',
            betCount: row.bet_count || 0,
            avgBetSize: row.avg_bet_size || '0',
            creatorReputation: row.creator_reputation || 0,
            categoryRank: row.category_rank || 0,
            isHot: row.is_hot || false,
            lastActivity: row.last_activity ? new Date(row.last_activity) : new Date(row.created_at)
          }
        };
      });
      
      console.log(`✅ Retrieved ${pools.length} pools with complete display data`);
      
      return pools;
      
    } catch (error) {
      console.error('❌ Error getting pools:', error);
      throw error;
    }
  }

  /**
   * Get active pools by creator
   */
  async getActivePoolsByCreator(creatorAddress, limit = 20, offset = 0) {
    await this.initialize();

    try {
      // FIXED: Read from database instead of blockchain for better performance
      const db = require('../db/db');
      
      const query = `
        SELECT 
          pool_id, creator_address, predicted_outcome, odds, creator_stake,
          event_start_time, event_end_time, league, category, region,
          is_private, max_bet_per_user, use_bitr, oracle_type, market_id,
          fixture_id, status, tx_hash, block_number, created_at
        FROM oracle.pools 
        WHERE status = 'active' AND creator_address = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await db.query(query, [creatorAddress, limit, offset]);
      
      const pools = result.rows.map(row => {
        // Decode predicted outcome hash to readable text
        let readableOutcome = row.predicted_outcome;
        let betMarketType = null;
        
        try {
          if (row.predicted_outcome.startsWith('0x')) {
            // This is a hash, create a readable format
            if (row.category === 'football') {
              const oddsDecimal = parseFloat(row.odds) / 100;
              if (oddsDecimal >= 2.0) {
                readableOutcome = "High odds outcome";
                betMarketType = "Match Result";
              } else if (oddsDecimal >= 1.5) {
                readableOutcome = "Medium odds outcome";
                betMarketType = "Goals Over/Under";
              } else {
                readableOutcome = "Low odds outcome";
                betMarketType = "Double Chance";
              }
            } else if (row.category === 'crypto') {
              readableOutcome = "Price movement prediction";
              betMarketType = "Price Target";
            } else {
              readableOutcome = "Prediction outcome";
              betMarketType = "General";
            }
          }
        } catch (error) {
          console.warn('Could not decode predicted outcome hash:', error);
          readableOutcome = "Prediction outcome";
          betMarketType = "General";
        }

        return {
          poolId: parseInt(row.pool_id),
          pool_id: parseInt(row.pool_id), // Alternative field name
          number: parseInt(row.pool_id), // Common field name for display
          pool_number: parseInt(row.pool_id), // Another common field name
          creator: row.creator_address,
          odds: parseFloat(row.odds) / 100, // Convert from basis points
          settled: row.status === 'settled',
          creatorSideWon: row.creator_side_won || null,
          isPrivate: row.is_private,
          usesBitr: row.use_bitr,
          filledAbove60: false, // Default
          oracleType: row.oracle_type === 0 ? 'GUIDED' : 'OPEN',
          creatorStake: row.creator_stake,
          totalCreatorSideStake: row.creator_stake, // Same as creator stake for now
          maxBettorStake: row.max_bet_per_user,
          totalBettorStake: '0', // No bets yet
          predictedOutcome: readableOutcome,
          originalPredictedOutcome: row.predicted_outcome, // Keep original hash
          betMarketType: betMarketType,
          result: null, // Not settled
          marketId: row.market_id,
          eventStartTime: new Date(parseInt(row.event_start_time) * 1000).toISOString(),
          eventEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(),
          bettingEndTime: new Date(parseInt(row.event_end_time) * 1000).toISOString(), // Same as event end
          resultTimestamp: null, // Not settled
          arbitrationDeadline: null, // Not applicable
          league: row.league,
          category: row.category,
          region: row.region,
          maxBetPerUser: row.max_bet_per_user,
          txHash: row.tx_hash,
          blockNumber: parseInt(row.block_number),
          createdAt: row.created_at
        };
      });
      
      return pools;
    } catch (error) {
      console.error('Error getting pools by creator:', error);
      return [];
    }
  }

  /**
   * Store fixture mapping for future reference
   */
  async storeFixtureMapping(marketId, fixtureId, homeTeam, awayTeam, league, additionalData = {}) {
    try {
      const db = require('../db/db');
      
      // Prepare data object with all the information
      const data = {
        marketId: marketId,
        fixtureId: fixtureId,
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        league: league,
        // Merge additional data
        ...additionalData
      };

      // Ensure columns exist (idempotent ALTERs)
      await db.query(`
        DO $$ BEGIN
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS predicted_outcome TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS readable_outcome TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS market_type TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS binary_selection TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS odds_decimal NUMERIC;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS creator_stake_wei NUMERIC;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS payment_token TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS use_bitr BOOLEAN;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS description TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS user_position TEXT;
          ALTER TABLE oracle.fixture_mappings ADD COLUMN IF NOT EXISTS match_date TIMESTAMP;
        EXCEPTION WHEN duplicate_column THEN NULL; END $$;
      `);
      
      // Upsert enriched mapping
      const insertQuery = `
        INSERT INTO oracle.fixture_mappings (
          market_id_hash, fixture_id, home_team, away_team, league_name,
          predicted_outcome, readable_outcome, market_type, binary_selection, odds_decimal,
          creator_stake_wei, payment_token, use_bitr, description, user_position, match_date
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
        )
        ON CONFLICT (market_id_hash) DO UPDATE SET
          fixture_id = EXCLUDED.fixture_id,
          home_team = EXCLUDED.home_team,
          away_team = EXCLUDED.away_team,
          league_name = EXCLUDED.league_name,
          predicted_outcome = COALESCE(EXCLUDED.predicted_outcome, oracle.fixture_mappings.predicted_outcome),
          readable_outcome = COALESCE(EXCLUDED.readable_outcome, oracle.fixture_mappings.readable_outcome),
          market_type = COALESCE(EXCLUDED.market_type, oracle.fixture_mappings.market_type),
          binary_selection = COALESCE(EXCLUDED.binary_selection, oracle.fixture_mappings.binary_selection),
          odds_decimal = COALESCE(EXCLUDED.odds_decimal, oracle.fixture_mappings.odds_decimal),
          creator_stake_wei = COALESCE(EXCLUDED.creator_stake_wei, oracle.fixture_mappings.creator_stake_wei),
          payment_token = COALESCE(EXCLUDED.payment_token, oracle.fixture_mappings.payment_token),
          use_bitr = COALESCE(EXCLUDED.use_bitr, oracle.fixture_mappings.use_bitr),
          description = COALESCE(EXCLUDED.description, oracle.fixture_mappings.description),
          user_position = COALESCE(EXCLUDED.user_position, oracle.fixture_mappings.user_position),
          match_date = COALESCE(EXCLUDED.match_date, oracle.fixture_mappings.match_date)
      `;
      
      await db.query(insertQuery, [
        data.marketId,
        data.fixtureId,
        data.homeTeam,
        data.awayTeam,
        data.league,
        data.predictedOutcome || null,
        data.readableOutcome || null,
        data.marketType || null,
        data.binarySelection || null,
        data.oddsDecimal || null,
        data.creatorStakeWei || null,
        data.paymentToken || null,
        data.useBitr ?? null,
        data.description || null,
        data.userPosition || null,
        data.matchDate || null
      ]);
      console.log(`✅ Stored fixture mapping: ${data.marketId} -> ${data.fixtureId} (${data.homeTeam} vs ${data.awayTeam})`);
      
      // Update the pools table with fixture_id if it exists
      const updatePoolQuery = `
        UPDATE oracle.pools 
        SET fixture_id = $1 
        WHERE market_id = $2 AND (fixture_id IS NULL OR fixture_id = '')
      `;
      
      const updateResult = await db.query(updatePoolQuery, [data.fixtureId, data.marketId]);
      if (updateResult.rowCount > 0) {
        console.log(`✅ Updated pool with fixture_id: ${data.fixtureId}`);
      }
      
    } catch (error) {
      console.warn('Could not store fixture mapping:', error.message);
    }
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
      
      // FIXED: Read from database instead of blockchain for better performance
      const db = require('../db/db');
      
      // Get pool count from database
      const poolCountResult = await db.query('SELECT COUNT(*) as count FROM oracle.pools WHERE status = \'active\'');
      const poolCount = parseInt(poolCountResult.rows[0].count);
      
      // Get stats from database with separate BITR and STT volumes
      const statsQuery = `
        SELECT 
          COUNT(*) as total_pools,
          COUNT(CASE WHEN is_private = true THEN 1 END) as private_pools,
          COUNT(CASE WHEN use_bitr = true THEN 1 END) as bitr_pools,
          SUM(CAST(creator_stake AS NUMERIC)) as total_volume,
          SUM(CASE WHEN use_bitr = true THEN CAST(creator_stake AS NUMERIC) ELSE 0 END) as bitr_volume,
          SUM(CASE WHEN use_bitr = false THEN CAST(creator_stake AS NUMERIC) ELSE 0 END) as stt_volume
        FROM oracle.pools 
        WHERE status IN ('active', 'closed', 'settled')
      `;
      
      const statsResult = await db.query(statsQuery);
      const stats = statsResult.rows[0];
      
      const bitrVolume = stats.bitr_volume ? (parseFloat(stats.bitr_volume) / 1e18).toFixed(2) : "0";
      const sttVolume = stats.stt_volume ? (parseFloat(stats.stt_volume) / 1e18).toFixed(2) : "0";
      const totalVolume = stats.total_volume ? (parseFloat(stats.total_volume) / 1e18).toFixed(2) : "0";
      
      return {
        totalVolume: totalVolume,
        bitrVolume: bitrVolume,
        sttVolume: sttVolume,
        activeMarkets: poolCount,
        participants: Math.floor(poolCount * 0.8), // Estimate based on pool count
        totalPools: poolCount,
        boostedPools: Math.floor(poolCount * 0.1), // Estimate 10% are boosted
        comboPools: 0, // Not implemented yet
        privatePools: parseInt(stats.private_pools || 0),
        bitrPools: parseInt(stats.bitr_pools || 0)
      };
    } catch (error) {
      console.error('Error getting pool stats:', error);
      return {
        totalVolume: "0",
        bitrVolume: "0",
        sttVolume: "0",
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

  /**
   * Decode hash to find the original value
   */
  async decodeHash(hash) {
    const { ethers } = require('ethers');
    
    // Test common prediction values
    const testValues = [
      '1', '2', 'x', 'home', 'away', 'draw', 
      'over', 'under', 'o', 'u',
      'btts', 'both teams to score',
      'yes', 'no', 'y', 'n',
      'over_25_goals', 'under_25_goals',
      'over_15_goals', 'under_15_goals',
      'over_35_goals', 'under_35_goals'
    ];
    
    for (const value of testValues) {
      const testHash = ethers.keccak256(ethers.toUtf8Bytes(value));
      if (testHash.toLowerCase() === hash.toLowerCase()) {
        return value;
      }
    }
    
    // Test numbers
    for (let i = 0; i <= 10; i++) {
      const testHash = ethers.keccak256(ethers.toUtf8Bytes(i.toString()));
      if (testHash.toLowerCase() === hash.toLowerCase()) {
        return i.toString();
      }
    }
    
    return null;
  }

  /**
   * Boost pool visibility
   */
  async boostPool(poolId, tier) {
    try {
      await this.initialize();
      
      console.log(`🚀 Boosting pool ${poolId} with tier ${tier}`);
      
      // Convert tier to numeric value for contract
      const tierMap = {
        'BRONZE': 1,
        'SILVER': 2,
        'GOLD': 3
      };
      
      const tierValue = tierMap[tier];
      if (!tierValue) {
        throw new Error(`Invalid boost tier: ${tier}`);
      }
      
      // Call the web3 service to boost the pool
      const result = await this.web3Service.boostPool(poolId, tierValue);
      
      console.log(`✅ Pool ${poolId} boosted successfully with tier ${tier}`);
      
      return {
        poolId,
        tier,
        tierValue,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        boostExpiry: result.boostExpiry
      };
      
    } catch (error) {
      console.error(`❌ Error boosting pool ${poolId}:`, error);
      throw error;
    }
  }

  /**
   * Determine bet market type from outcome
   */
  determineBetMarketType(outcome) {
    const outcomeLower = outcome.toLowerCase();
    
    if (['wins', 'draw', '1', '2', 'x', 'home', 'away'].some(term => outcomeLower.includes(term))) {
      return "Match Result";
    } else if (['over', 'under', 'goals'].some(term => outcomeLower.includes(term))) {
      return "Goals Over/Under";
    } else if (['both teams', 'btts'].some(term => outcomeLower.includes(term))) {
      return "Both Teams To Score";
    } else if (['half', 'ht'].some(term => outcomeLower.includes(term))) {
      return "Half-time Result";
    } else {
      return "Other";
    }
  }
}

module.exports = GuidedMarketService;
