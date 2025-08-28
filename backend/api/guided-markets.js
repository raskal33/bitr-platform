const express = require('express');
const GuidedMarketService = require('../services/guided-market-service');
const { ethers } = require('ethers');

const router = express.Router();
const guidedMarketService = new GuidedMarketService();

/**
 * POST /api/guided-markets/football
 * Create a guided football market
 */
router.post('/football', async (req, res) => {
  try {
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
    } = req.body;

    // Validate required fields
    if (!fixtureId || !homeTeam || !awayTeam || !league || !matchDate || !outcome || !predictedOutcome || !odds || !creatorStake) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fixtureId, homeTeam, awayTeam, league, matchDate, outcome, predictedOutcome, odds, creatorStake'
      });
    }

    // Validate odds format (should be in contract format: 200 = 2.0x)
    if (odds < 101 || odds > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Odds must be between 101 and 10000 (1.01x to 100.0x in contract format)'
      });
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000 : 5; // 1000 BITR or 5 STT
    const maxStake = 1000000; // 1M tokens

    if (creatorStake < minStake) {
      return res.status(400).json({
        success: false,
        error: `Creator stake must be at least ${minStake} ${useBitr ? 'BITR' : 'STT'}`
      });
    }

    if (creatorStake > maxStake) {
      return res.status(400).json({
        success: false,
        error: 'Creator stake cannot exceed 1,000,000 tokens'
      });
    }

    // Validate match date
    const matchTime = new Date(matchDate);
    const now = new Date();
    const bettingGracePeriod = 60; // 60 seconds

    if (matchTime <= new Date(now.getTime() + bettingGracePeriod * 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Match must start at least 1 minute from now'
      });
    }

    if (matchTime > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Match cannot be more than 365 days in the future'
      });
    }

    console.log('🎯 Creating guided football market:', {
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      outcome,
      predictedOutcome,
      odds: odds / 100,
      creatorStake,
      useBitr
    });

    const result = await guidedMarketService.createFootballMarket({
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      matchDate,
      outcome,
      predictedOutcome,
      odds,
      creatorStake,
      useBitr,
      description,
      isPrivate,
      maxBetPerUser
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error creating football market:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/cryptocurrency
 * Create a guided cryptocurrency market
 */
router.post('/cryptocurrency', async (req, res) => {
  try {
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
    } = req.body;

    // Validate required fields
    if (!cryptocurrency || !targetPrice || !direction || !timeframe || !predictedOutcome || !odds || !creatorStake) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: cryptocurrency, targetPrice, direction, timeframe, predictedOutcome, odds, creatorStake'
      });
    }

    // Validate cryptocurrency object
    if (!cryptocurrency.symbol || !cryptocurrency.name) {
      return res.status(400).json({
        success: false,
        error: 'Cryptocurrency must have symbol and name properties'
      });
    }

    // Validate target price
    if (targetPrice <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Target price must be greater than 0'
      });
    }

    // Validate direction
    if (!['above', 'below'].includes(direction)) {
      return res.status(400).json({
        success: false,
        error: 'Direction must be either "above" or "below"'
      });
    }

    // Validate timeframe
    const validTimeframes = ['1h', '4h', '1d', '1w', '1m'];
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({
        success: false,
        error: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`
      });
    }

    // Validate odds format
    if (odds < 101 || odds > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Odds must be between 101 and 10000 (1.01x to 100.0x in contract format)'
      });
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000 : 5; // 1000 BITR or 5 STT
    const maxStake = 1000000; // 1M tokens

    if (creatorStake < minStake) {
      return res.status(400).json({
        success: false,
        error: `Creator stake must be at least ${minStake} ${useBitr ? 'BITR' : 'STT'}`
      });
    }

    if (creatorStake > maxStake) {
      return res.status(400).json({
        success: false,
        error: 'Creator stake cannot exceed 1,000,000 tokens'
      });
    }

    console.log('💰 Creating guided cryptocurrency market:', {
      cryptocurrency: cryptocurrency.symbol,
      targetPrice,
      direction,
      timeframe,
      predictedOutcome,
      odds: odds / 100,
      creatorStake,
      useBitr
    });

    const result = await guidedMarketService.createCryptoMarket({
      cryptocurrency,
      targetPrice,
      direction,
      timeframe,
      predictedOutcome,
      odds,
      creatorStake,
      useBitr,
      description,
      isPrivate,
      maxBetPerUser
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error creating cryptocurrency market:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/pools
 * Get all pools with pagination
 */
router.get('/pools', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const pools = await guidedMarketService.getPools(parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      data: {
        pools,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: pools.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting pools:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/pools/:poolId
 * Get pool information
 */
router.get('/pools/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    const poolInfo = await guidedMarketService.getPoolInfo(parseInt(poolId));

    res.json({
      success: true,
      data: {
        pool: poolInfo
      }
    });

  } catch (error) {
    console.error('❌ Error getting pool info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/pools/:poolId/bet
 * Place a bet on a pool
 */
router.post('/pools/:poolId/bet', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { amount } = req.body;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid bet amount is required'
      });
    }

    const result = await guidedMarketService.placeBet(parseInt(poolId), amount);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error placing bet:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/pools/:poolId/liquidity
 * Add liquidity to a pool
 */
router.post('/pools/:poolId/liquidity', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { amount } = req.body;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid liquidity amount is required'
      });
    }

    const result = await guidedMarketService.addLiquidity(parseInt(poolId), amount);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error adding liquidity:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/pools/:poolId/settle
 * Settle a pool automatically
 */
router.post('/pools/:poolId/settle', async (req, res) => {
  try {
    const { poolId } = req.params;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    const result = await guidedMarketService.settlePoolAutomatically(parseInt(poolId));

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error settling pool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/pools/:poolId/claim
 * Claim rewards from a pool
 */
router.post('/pools/:poolId/claim', async (req, res) => {
  try {
    const { poolId } = req.params;

    if (!poolId || isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: 'Valid pool ID is required'
      });
    }

    const result = await guidedMarketService.claimRewards(parseInt(poolId));

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Error claiming rewards:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/pools/category/:category
 * Get pools by category
 */
router.get('/pools/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Category is required'
      });
    }

    const pools = await guidedMarketService.getPoolsByCategory(category, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      data: {
        pools,
        category,
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: pools.length
      }
    });

  } catch (error) {
    console.error('❌ Error getting pools by category:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/pools/creator/:address
 * Get active pools by creator
 */
router.get('/pools/creator/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Valid creator address is required'
      });
    }

    const pools = await guidedMarketService.getActivePoolsByCreator(address, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      data: {
        pools,
        creator: address,
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: pools.length
      }
    });

  } catch (error) {
    console.error('❌ Error getting pools by creator:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/analyze-cost
 * Analyze gas cost for pool creation
 */
router.post('/analyze-cost', async (req, res) => {
  try {
    const poolData = req.body;

    // Validate required fields for cost analysis
    if (!poolData.predictedOutcome || !poolData.odds || !poolData.creatorStake || 
        !poolData.eventStartTime || !poolData.eventEndTime || !poolData.league || 
        !poolData.category || !poolData.region || !poolData.marketId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields for cost analysis'
      });
    }

    const costAnalysis = await guidedMarketService.analyzePoolCreationCost(poolData);

    res.json({
      success: true,
      data: costAnalysis
    });

  } catch (error) {
    console.error('❌ Error analyzing cost:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/validate-oracle/:marketId
 * Validate guided oracle integration
 */
router.get('/validate-oracle/:marketId', async (req, res) => {
  try {
    const { marketId } = req.params;

    if (!marketId) {
      return res.status(400).json({
        success: false,
        error: 'Market ID is required'
      });
    }

    const validation = await guidedMarketService.validateGuidedOracle(marketId);

    res.json({
      success: true,
      data: validation
    });

  } catch (error) {
    console.error('❌ Error validating oracle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/stats
 * Get guided markets statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await guidedMarketService.getPoolStats();

    res.json({
      success: true,
      data: {
        stats
      }
    });

  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/guided-markets/health
 * Get service health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await guidedMarketService.getHealthStatus();

    res.json({
      success: true,
      data: health
    });

  } catch (error) {
    console.error('❌ Error getting health status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/football/prepare
 * Prepare guided football market transaction data for frontend
 */
router.post('/football/prepare', async (req, res) => {
  try {
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
    } = req.body;

    // Validate required fields
    if (!fixtureId || !homeTeam || !awayTeam || !league || !matchDate || !outcome || !predictedOutcome || !odds || !creatorStake) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fixtureId, homeTeam, awayTeam, league, matchDate, outcome, predictedOutcome, odds, creatorStake'
      });
    }

    // Validate odds format (should be in contract format: 200 = 2.0x)
    if (odds < 101 || odds > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Odds must be between 101 and 10000 (1.01x to 100.0x in contract format)'
      });
    }

    // Validate stake amounts
    const minStake = useBitr ? 1000 : 5; // 1000 BITR or 5 STT
    const maxStake = 1000000; // 1M tokens

    if (creatorStake < minStake) {
      return res.status(400).json({
        success: false,
        error: `Creator stake must be at least ${minStake} ${useBitr ? 'BITR' : 'STT'}`
      });
    }

    if (creatorStake > maxStake) {
      return res.status(400).json({
        success: false,
        error: 'Creator stake cannot exceed 1,000,000 tokens'
      });
    }

    // Validate match date
    const matchTime = new Date(matchDate);
    const now = new Date();
    const bettingGracePeriod = 60; // 60 seconds

    if (matchTime <= new Date(now.getTime() + bettingGracePeriod * 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Match must start at least 1 minute from now'
      });
    }

    if (matchTime > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) {
      return res.status(400).json({
        success: false,
        error: 'Match cannot be more than 365 days in the future'
      });
    }

    // Calculate event times
    const eventStartTime = Math.floor(matchTime.getTime() / 1000);
    const eventEndTime = eventStartTime + (2 * 60 * 60); // 2 hours after match starts

    // Create market ID using keccak256(abi.encodePacked(fixtureId))
    const marketId = ethers.keccak256(ethers.solidityPacked(['uint256'], [fixtureId]));

    // Convert amounts to wei
    const stakeAmountWei = ethers.parseEther(creatorStake.toString());
    const maxBetPerUserWei = ethers.parseEther(maxBetPerUser.toString());

    // Hash predicted outcome
    const predictedOutcomeHash = ethers.keccak256(ethers.toUtf8Bytes(predictedOutcome));

    // Get contract address from config
    const config = require('../config');
    const contractAddress = config.blockchain.contractAddresses.bitredictPool;

    // Prepare transaction data for frontend (convert BigInt to string for JSON serialization)
    const transactionData = {
      contractAddress: contractAddress,
      functionName: 'createPool',
      parameters: [
        predictedOutcomeHash,
        odds,
        stakeAmountWei.toString(), // Convert BigInt to string
        eventStartTime,
        eventEndTime,
        league,
        'football',
        'Global',
        isPrivate,
        maxBetPerUserWei.toString(), // Convert BigInt to string
        useBitr,
        0, // GUIDED oracle type
        marketId
      ],
      value: useBitr ? '0' : stakeAmountWei.toString(), // ETH value if using STT
      gasEstimate: '2000000', // Conservative gas estimate
      marketDetails: {
        fixtureId,
        homeTeam,
        awayTeam,
        league,
        outcome,
        predictedOutcome,
        odds: odds / 100,
        creatorStake,
        useBitr,
        marketId,
        eventStartTime: new Date(eventStartTime * 1000).toISOString(),
        eventEndTime: new Date(eventEndTime * 1000).toISOString()
      }
    };

    console.log('🎯 Prepared guided football market transaction:', {
      fixtureId,
      homeTeam,
      awayTeam,
      league,
      outcome,
      predictedOutcome,
      odds: odds / 100,
      creatorStake,
      useBitr,
      marketId,
      contractAddress
    });

    res.json({
      success: true,
      data: transactionData
    });

  } catch (error) {
    console.error('❌ Error preparing football market:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/guided-markets/football/confirm
 * Confirm and index a successful market creation transaction
 */
router.post('/football/confirm', async (req, res) => {
  try {
    const { transactionHash, marketDetails } = req.body;

    if (!transactionHash || !marketDetails) {
      return res.status(400).json({
        success: false,
        error: 'Transaction hash and market details are required'
      });
    }

    console.log('✅ Market creation confirmed:', {
      transactionHash,
      fixtureId: marketDetails.fixtureId,
      homeTeam: marketDetails.homeTeam,
      awayTeam: marketDetails.awayTeam
    });

    // The indexer will automatically process this transaction
    // We just need to acknowledge the confirmation
    res.json({
      success: true,
      message: 'Market creation confirmed. The indexer will process the transaction.',
      transactionHash,
      marketId: marketDetails.marketId
    });

  } catch (error) {
    console.error('❌ Error confirming market creation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
