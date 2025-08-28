const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Import claimable positions routes
const claimableRoutes = require('./pools/claimable');

// Get pool data by ID
router.get('/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    // Get pool data from contract (simulated for now)
    // In production, this would call the smart contract
    const poolData = {
      creator: "0x1234567890123456789012345678901234567890",
      odds: 150, // 1.50x in basis points
      predictedOutcome: "Team A wins",
      eventStartTime: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
      eventEndTime: Math.floor(Date.now() / 1000) + 86400 + 7200, // 2 hours after start
      bettingEndTime: Math.floor(Date.now() / 1000) + 86400 - 3600, // 1 hour before start
      settled: false,
      creatorSideWon: false,
      totalCreatorSideStake: "1000000000000000000000", // 1000 tokens
      totalBettorStake: "500000000000000000000", // 500 tokens
      maxBettorStake: "2000000000000000000000", // 2000 tokens
      usesBitr: true,
      isPrivate: false,
      oracleType: "GUIDED",
      marketId: "match_123",
      maxBetPerUser: "100000000000000000000", // 100 tokens
      league: "Premier League",
      category: "football",
      region: "England"
    };
    
    res.json({
      success: true,
      data: poolData
    });
    
  } catch (error) {
    console.error('Error fetching pool data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool data'
    });
  }
});

// Get pool analytics with indexed data
router.get('/:poolId/analytics', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    // Get indexed analytics data
    const analyticsQuery = `
      SELECT 
        pa.pool_id,
        pa.creator_address,
        pa.odds,
        pa.is_settled,
        pa.creator_side_won,
        pa.is_private,
        pa.uses_bitr,
        pa.oracle_type,
        pa.market_id,
        pa.predicted_outcome,
        pa.actual_result,
        pa.creator_stake,
        pa.total_creator_side_stake,
        pa.total_bettor_stake,
        pa.max_bettor_stake,
        pa.event_start_time,
        pa.event_end_time,
        pa.betting_end_time,
        pa.created_at,
        pa.settled_at,
        -- Calculate additional metrics
        COALESCE(pa.total_bettor_stake::numeric / NULLIF(pa.creator_stake::numeric, 0), 0) as fill_percentage,
        -- Get bet count
        (SELECT COUNT(*) FROM prediction.bets WHERE pool_id = $1) as bet_count,
        -- Get creator reputation
        COALESCE((SELECT reputation FROM core.users WHERE address = pa.creator_address), 0) as creator_reputation,
        -- Check if pool is hot (high activity in last 24h)
        CASE 
          WHEN pa.total_bettor_stake::numeric > pa.creator_stake::numeric * 0.5 THEN true 
          ELSE false 
        END as is_hot,
        -- Get last activity
        COALESCE(
          (SELECT MAX(created_at) FROM prediction.bets WHERE pool_id = $1),
          pa.created_at
        ) as last_activity
      FROM analytics.pools pa
      WHERE pa.pool_id = $1
    `;
    
    const analyticsResult = await db.query(analyticsQuery, [poolId]);
    
    if (analyticsResult.rows.length === 0) {
      return res.json({
        success: false,
        error: 'Pool analytics not found'
      });
    }
    
    const analytics = analyticsResult.rows[0];
    
    // Format the response
    const response = {
      participantCount: parseInt(analytics.bet_count) || 0,
      fillPercentage: Math.round(parseFloat(analytics.fill_percentage || 0) * 100),
      totalVolume: analytics.total_bettor_stake || '0',
      betCount: parseInt(analytics.bet_count) || 0,
      avgBetSize: analytics.total_bettor_stake && analytics.bet_count ? 
        (parseFloat(analytics.total_bettor_stake) / parseInt(analytics.bet_count)).toFixed(2) : '0',
      creatorReputation: parseInt(analytics.creator_reputation) || 0,
      isHot: analytics.is_hot || false,
      lastActivity: analytics.last_activity,
      categoryRank: 0, // TODO: Implement category ranking
      timeToFill: null, // TODO: Calculate time to fill
      odds: analytics.odds,
      isSettled: analytics.is_settled,
      creatorSideWon: analytics.creator_side_won,
      isPrivate: analytics.is_private,
      usesBitr: analytics.uses_bitr,
      oracleType: analytics.oracle_type,
      marketId: analytics.market_id,
      predictedOutcome: analytics.predicted_outcome,
      actualResult: analytics.actual_result,
      creatorStake: analytics.creator_stake,
      totalCreatorSideStake: analytics.total_creator_side_stake,
      maxBettorStake: analytics.max_bettor_stake,
      eventStartTime: analytics.event_start_time,
      eventEndTime: analytics.event_end_time,
      bettingEndTime: analytics.betting_end_time,
      createdAt: analytics.created_at,
      settledAt: analytics.settled_at
    };
    
    res.json({
      success: true,
      data: response
    });
    
  } catch (error) {
    console.error('Error fetching pool analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool analytics'
    });
  }
});

// Get all pools with analytics
router.get('/with-analytics', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    let whereClause = '';
    let params = [limit, offset];
    
    const query = `
      SELECT 
        pa.pool_id,
        pa.creator_address,
        pa.odds,
        pa.is_settled,
        pa.creator_side_won,
        pa.is_private,
        pa.uses_bitr,
        pa.oracle_type,
        pa.market_id,
        pa.predicted_outcome,
        pa.actual_result,
        pa.creator_stake,
        pa.total_creator_side_stake,
        pa.total_bettor_stake,
        pa.max_bettor_stake,
        pa.event_start_time,
        pa.event_end_time,
        pa.betting_end_time,
        pa.created_at,
        pa.settled_at,
        pa.category,
        pa.league,
        pa.region,
        COALESCE(pa.total_bettor_stake::numeric / NULLIF(pa.creator_stake::numeric, 0), 0) as fill_percentage,
        (SELECT COUNT(*) FROM prediction.bets WHERE pool_id = pa.pool_id) as bet_count,
        COALESCE((SELECT reputation FROM core.users WHERE address = pa.creator_address), 0) as creator_reputation,
        CASE 
          WHEN pa.total_bettor_stake::numeric > pa.creator_stake::numeric * 0.5 THEN true 
          ELSE false 
        END as is_hot,
        COALESCE(
          (SELECT MAX(created_at) FROM prediction.bets WHERE pool_id = pa.pool_id),
          pa.created_at
        ) as last_activity
      FROM analytics.pools pa
      ${whereClause}
      ORDER BY pa.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.query(query, params);
    
    const pools = result.rows.map(row => ({
      id: parseInt(row.pool_id),
      creator: row.creator_address,
      odds: row.odds,
      isSettled: row.is_settled,
      creatorSideWon: row.creator_side_won,
      isPrivate: row.is_private,
      usesBitr: row.uses_bitr,
      oracleType: row.oracle_type,
      marketId: row.market_id,
      predictedOutcome: row.predicted_outcome,
      actualResult: row.actual_result,
      creatorStake: row.creator_stake,
      totalCreatorSideStake: row.total_creator_side_stake,
      totalBettorStake: row.total_bettor_stake,
      maxBettorStake: row.max_bettor_stake,
      eventStartTime: row.event_start_time,
      eventEndTime: row.event_end_time,
      bettingEndTime: row.betting_end_time,
      createdAt: row.created_at,
      settledAt: row.settled_at,
      category: row.category || 'unknown',
      league: row.league || 'Unknown',
      region: row.region || 'Unknown',
      indexedData: {
        participantCount: parseInt(row.bet_count) || 0,
        fillPercentage: Math.round(parseFloat(row.fill_percentage || 0) * 100),
        totalVolume: row.total_bettor_stake || '0',
        betCount: parseInt(row.bet_count) || 0,
        avgBetSize: row.total_bettor_stake && row.bet_count ? 
          (parseFloat(row.total_bettor_stake) / parseInt(row.bet_count)).toFixed(2) : '0',
        creatorReputation: parseInt(row.creator_reputation) || 0,
        isHot: row.is_hot || false,
        lastActivity: row.last_activity,
        categoryRank: 0,
        timeToFill: null
      }
    }));
    
    res.json({
      success: true,
      data: pools
    });
    
  } catch (error) {
    console.error('Error fetching pools with analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pools with analytics'
    });
  }
});

// Notify about pool creation for immediate indexing
router.post('/notify-creation', async (req, res) => {
  try {
    const { transactionHash, creator, category, useBitr, creatorStake, odds } = req.body;
    
    if (!transactionHash || !creator) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: transactionHash, creator'
      });
    }

    console.log('Pool creation notification received:', {
      transactionHash,
      creator,
      category,
      useBitr,
      creatorStake,
      odds
    });

    // Store the notification for the indexer to pick up
    await db.query(`
      INSERT INTO core.pool_creation_notifications 
      (pool_id, creator_address, notification_type, message, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (pool_id) DO NOTHING
    `, [
      transactionHash, // Use transaction hash as pool_id for now
      creator,
      'pool_created',
      JSON.stringify({
        category: category || 'unknown',
        usesBitr: useBitr || false,
        creatorStake: creatorStake || 0,
        odds: odds || 200,
        transactionHash
      })
    ]);

    // Trigger immediate indexing of this transaction
    await triggerImmediateIndexing(transactionHash);

    res.json({
      success: true,
      message: 'Pool creation notification received and indexing triggered'
    });
    
  } catch (error) {
    console.error('Error handling pool creation notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process pool creation notification'
    });
  }
});

// Helper function to trigger immediate indexing
async function triggerImmediateIndexing(transactionHash) {
  try {
    // In a production environment, this could trigger a webhook or message queue
    // For now, we'll just log it and rely on the regular indexer cycle
    console.log(`Triggering immediate indexing for transaction: ${transactionHash}`);
    
    // TODO: Implement real-time indexing trigger
    // This could involve:
    // 1. Sending a message to a queue (Redis, RabbitMQ)
    // 2. Making an HTTP request to the indexer service
    // 3. Updating a database flag for priority indexing
    
  } catch (error) {
    console.error('Error triggering immediate indexing:', error);
  }
}

// Get all pools with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      category, 
      isPrivate, 
      usesBitr, 
      oracleType, 
      status, 
      minVolume, 
      maxVolume, 
      sortBy = 'newest', 
      sortOrder = 'desc', 
      page = 1, 
      limit = 20 
    } = req.query;

    // Mock data for now - in production, this would query the database/contract
    const mockPools = [
      {
        id: "1",
        creator: "0x1234567890123456789012345678901234567890",
        odds: 175,
        isSettled: false,
        creatorSideWon: false,
        isPrivate: false,
        usesBitr: true,
        oracleType: 'GUIDED',
        marketId: 'match_001',
        predictedOutcome: 'Team A will win',
        creatorStake: "1000000000000000000000",
        totalCreatorSideStake: "1000000000000000000000",
        totalBettorStake: "750000000000000000000",
        eventStartTime: new Date(Date.now() + 86400000).toISOString(),
        eventEndTime: new Date(Date.now() + 93600000).toISOString(),
        bettingEndTime: new Date(Date.now() + 82800000).toISOString(),
        league: 'Premier League',
        category: 'football',
        region: 'England',
        maxBetPerUser: "100000000000000000000",
        totalVolume: 1750,
        participantCount: 25,
        fillPercentage: 75,
        creationTime: new Date().toISOString()
      }
    ];

    // Apply filters
    let filteredPools = mockPools;
    if (category) filteredPools = filteredPools.filter(p => p.category === category);
    if (isPrivate !== undefined) filteredPools = filteredPools.filter(p => p.isPrivate === (isPrivate === 'true'));
    if (status) filteredPools = filteredPools.filter(p => status === 'active' ? !p.isSettled : p.isSettled);

    res.json({
      success: true,
      data: {
        pools: filteredPools,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: filteredPools.length,
          totalPages: Math.ceil(filteredPools.length / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching pools:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pools' });
  }
});

// Get trending pools
router.get('/trending', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Real trending pools calculation based on actual data
    const trendingQuery = `
      SELECT 
        pa.pool_id,
        pa.creator_address,
        pa.odds,
        pa.is_settled,
        pa.creator_side_won,
        pa.is_private,
        pa.uses_bitr,
        pa.oracle_type,
        pa.market_id,
        pa.predicted_outcome,
        pa.actual_result,
        pa.creator_stake,
        pa.total_creator_side_stake,
        pa.total_bettor_stake,
        pa.max_bettor_stake,
        pa.event_start_time,
        pa.event_end_time,
        pa.betting_end_time,
        pa.created_at,
        pa.settled_at,
        pa.category,
        pa.league,
        pa.region,
        -- Calculate trending score based on multiple factors
        (
          -- Fill percentage (0-100 points)
          COALESCE(pa.total_bettor_stake::numeric / NULLIF(pa.creator_stake::numeric, 0), 0) * 100 +
          -- Recent activity bonus (0-50 points)
          CASE 
            WHEN pa.created_at > NOW() - INTERVAL '1 hour' THEN 50
            WHEN pa.created_at > NOW() - INTERVAL '6 hours' THEN 30
            WHEN pa.created_at > NOW() - INTERVAL '24 hours' THEN 10
            ELSE 0
          END +
          -- Bet count bonus (0-30 points)
          LEAST((SELECT COUNT(*) FROM prediction.bets WHERE pool_id = pa.pool_id), 30) +
          -- Creator reputation bonus (0-20 points)
          COALESCE((SELECT reputation FROM core.users WHERE address = pa.creator_address), 0) / 25
        ) as trending_score,
        -- Additional metrics
        COALESCE(pa.total_bettor_stake::numeric / NULLIF(pa.creator_stake::numeric, 0), 0) as fill_percentage,
        (SELECT COUNT(*) FROM prediction.bets WHERE pool_id = pa.pool_id) as bet_count,
        COALESCE((SELECT reputation FROM core.users WHERE address = pa.creator_address), 0) as creator_reputation,
        COALESCE(
          (SELECT MAX(created_at) FROM prediction.bets WHERE pool_id = pa.pool_id),
          pa.created_at
        ) as last_activity
      FROM analytics.pools pa
      WHERE pa.is_settled = FALSE 
        AND pa.event_start_time > NOW() 
        AND pa.betting_end_time > NOW()
      ORDER BY trending_score DESC, pa.created_at DESC
      LIMIT $1
    `;
    
    const result = await db.query(trendingQuery, [parseInt(limit)]);
    
    const trendingPools = result.rows.map(row => ({
      id: parseInt(row.pool_id),
      creator: row.creator_address,
      odds: row.odds,
      isSettled: row.is_settled,
      creatorSideWon: row.creator_side_won,
      isPrivate: row.is_private,
      usesBitr: row.uses_bitr,
      oracleType: row.oracle_type,
      marketId: row.market_id,
      predictedOutcome: row.predicted_outcome,
      actualResult: row.actual_result,
      creatorStake: row.creator_stake,
      totalCreatorSideStake: row.total_creator_side_stake,
      totalBettorStake: row.total_bettor_stake,
      maxBettorStake: row.max_bettor_stake,
      eventStartTime: row.event_start_time,
      eventEndTime: row.event_end_time,
      bettingEndTime: row.betting_end_time,
      createdAt: row.created_at,
      settledAt: row.settled_at,
      category: row.category || 'unknown',
      league: row.league || 'Unknown',
      region: row.region || 'Unknown',
      trendingScore: Math.round(parseFloat(row.trending_score || 0)),
      indexedData: {
        participantCount: parseInt(row.bet_count) || 0,
        fillPercentage: Math.round(parseFloat(row.fill_percentage || 0) * 100),
        totalVolume: row.total_bettor_stake || '0',
        betCount: parseInt(row.bet_count) || 0,
        creatorReputation: parseInt(row.creator_reputation) || 0,
        lastActivity: row.last_activity,
        trendingScore: Math.round(parseFloat(row.trending_score || 0))
      }
    }));

    res.json({
      success: true,
      data: {
        pools: trendingPools,
        meta: {
          totalCount: trendingPools.length,
          calculationTime: new Date().toISOString(),
          algorithm: 'Real-time trending based on fill percentage, recent activity, bet count, and creator reputation'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching trending pools:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trending pools' });
  }
});

// Get boosted pools
router.get('/boosted', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Mock boosted pools
    const boostedPools = [
      {
        id: "boosted_1",
        creator: "0x1234567890123456789012345678901234567890",
        odds: 150,
        isSettled: false,
        isPrivate: false,
        usesBitr: true,
        oracleType: 'GUIDED',
        predictedOutcome: 'Ethereum 2.0 launch success',
        creatorStake: "1500000000000000000000",
        totalCreatorSideStake: "1500000000000000000000",
        totalBettorStake: "1000000000000000000000",
        category: 'crypto',
        totalVolume: 2500,
        participantCount: 35,
        fillPercentage: 70,
        creationTime: new Date().toISOString()
      }
    ];

    res.json({
      success: true,
      data: {
        pools: boostedPools.slice(0, parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching boosted pools:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch boosted pools' });
  }
});

// Get market metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      totalActivePools: 156,
      totalVolume24h: 45000,
      topCategories: [
        { category: 'crypto', count: 45 },
        { category: 'sports', count: 38 },
        { category: 'politics', count: 25 }
      ],
      averagePoolSize: 1250
    };

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching market metrics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch market metrics' });
  }
});

// Mount claimable positions routes
router.use('/claimable', claimableRoutes);

module.exports = router; 