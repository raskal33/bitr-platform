const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/validation');
const db = require('../db/db');

// ============================================================================
// OPTIMISTIC ORACLE API - Community-driven market resolution system
// ============================================================================

/**
 * Get comprehensive OptimisticOracle statistics
 */
router.get('/statistics', asyncHandler(async (req, res) => {
  try {
    // Get contract statistics (mock data for now)
    const contractStats = {
      totalMarkets: 0,
      activeMarkets: 0,
      resolvedMarkets: 0,
      totalBondsLocked: '0',
      totalRewardsPaid: '0',
      contractAddress: '0x0000000000000000000000000000000000000000' // Placeholder
    };

    // Get analytics from database if tables exist
    let analytics = {
      avgResolutionTime: 0,
      disputeRate: 0,
      successfulProposals: 0,
      totalProposers: 0,
      totalDisputers: 0,
      marketsLast24h: 0,
      resolutionsLast24h: 0
    };

    try {
      // Try to get real analytics data
      const analyticsResult = await db.query(`
        SELECT 
          COUNT(*) as total_markets,
          COUNT(CASE WHEN state = 1 THEN 1 END) as active_markets,
          COUNT(CASE WHEN state = 3 THEN 1 END) as resolved_markets,
          AVG(CASE WHEN resolution_time > 0 THEN resolution_time - proposal_time END) as avg_resolution_time
        FROM oracle.optimistic_markets
      `);

      if (analyticsResult.rows.length > 0) {
        const row = analyticsResult.rows[0];
        contractStats.totalMarkets = parseInt(row.total_markets) || 0;
        contractStats.activeMarkets = parseInt(row.active_markets) || 0;
        contractStats.resolvedMarkets = parseInt(row.resolved_markets) || 0;
        analytics.avgResolutionTime = parseFloat(row.avg_resolution_time) || 0;
      }
    } catch (error) {
      console.log('Optimistic markets table not found, using mock data');
    }

    const response = {
      success: true,
      data: {
        contract: contractStats,
        analytics: analytics,
        formatted: {
          totalBondsLocked: '0.0 BITR',
          totalRewardsPaid: '0.0 BITR',
          avgResolutionTime: `${Math.round(analytics.avgResolutionTime / 3600)}h`,
          disputeRate: `${analytics.disputeRate}%`
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching optimistic oracle statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch optimistic oracle statistics',
      error: error.message
    });
  }
}));

/**
 * Get market by ID
 */
router.get('/market/:marketId', asyncHandler(async (req, res) => {
  try {
    const { marketId } = req.params;

    // Try to get market from database
    let market = null;
    try {
      const result = await db.query(`
        SELECT 
          market_id,
          pool_id,
          question,
          category,
          proposed_outcome,
          proposer,
          proposal_time,
          proposal_bond,
          disputer,
          dispute_time,
          dispute_bond,
          state,
          final_outcome,
          resolution_time
        FROM oracle.optimistic_markets
        WHERE market_id = $1
      `, [marketId]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        market = {
          marketId: row.market_id,
          poolId: row.pool_id,
          question: row.question,
          category: row.category,
          proposedOutcome: row.proposed_outcome,
          proposer: row.proposer,
          proposalTime: row.proposal_time,
          proposalBond: row.proposal_bond,
          disputer: row.disputer,
          disputeTime: row.dispute_time,
          disputeBond: row.dispute_bond,
          state: row.state,
          finalOutcome: row.final_outcome,
          resolutionTime: row.resolution_time
        };
      }
    } catch (error) {
      console.log('Optimistic markets table not found, returning mock data');
    }

    if (!market) {
      // Return mock market data
      market = {
        marketId: marketId,
        poolId: 0,
        question: 'Sample market question',
        category: 'general',
        proposedOutcome: null,
        proposer: null,
        proposalTime: 0,
        proposalBond: '0',
        disputer: null,
        disputeTime: 0,
        disputeBond: '0',
        state: 0, // PENDING
        finalOutcome: null,
        resolutionTime: 0
      };
    }

    res.json({
      success: true,
      data: market
    });
  } catch (error) {
    console.error('Error fetching market:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch market',
      error: error.message
    });
  }
}));

/**
 * Get all markets with optional filtering
 */
router.get('/markets', asyncHandler(async (req, res) => {
  try {
    const { state, category, limit = 50, offset = 0 } = req.query;

    let markets = [];
    let total = 0;

    try {
      // Build query with filters
      let query = 'SELECT * FROM oracle.optimistic_markets WHERE 1=1';
      const params = [];
      let paramCount = 0;

      if (state !== undefined) {
        paramCount++;
        query += ` AND state = $${paramCount}`;
        params.push(parseInt(state));
      }

      if (category) {
        paramCount++;
        query += ` AND category = $${paramCount}`;
        params.push(category);
      }

      // Get total count
      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
      const countResult = await db.query(countQuery, params);
      total = parseInt(countResult.rows[0].count) || 0;

      // Get paginated results
      query += ` ORDER BY proposal_time DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await db.query(query, params);
      markets = result.rows.map(row => ({
        marketId: row.market_id,
        poolId: row.pool_id,
        question: row.question,
        category: row.category,
        proposedOutcome: row.proposed_outcome,
        proposer: row.proposer,
        proposalTime: row.proposal_time,
        proposalBond: row.proposal_bond,
        disputer: row.disputer,
        disputeTime: row.dispute_time,
        disputeBond: row.dispute_bond,
        state: row.state,
        finalOutcome: row.final_outcome,
        resolutionTime: row.resolution_time
      }));
    } catch (error) {
      console.log('Optimistic markets table not found, returning empty results');
    }

    res.json({
      success: true,
      data: {
        markets: markets,
        total: total,
        hasMore: (parseInt(offset) + markets.length) < total
      }
    });
  } catch (error) {
    console.error('Error fetching markets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch markets',
      error: error.message
    });
  }
}));

/**
 * Get user market activity and statistics
 */
router.get('/user/:address/activity', asyncHandler(async (req, res) => {
  try {
    const { address } = req.params;

    // Mock user activity data
    const userActivity = {
      user: address,
      statistics: {
        totalProposals: 0,
        successfulProposals: 0,
        totalDisputes: 0,
        successfulDisputes: 0,
        totalBondsLocked: '0',
        totalRewardsEarned: '0',
        reputation: 0,
        successRate: 0
      },
      recentActivity: {
        proposals: [],
        disputes: []
      },
      formatted: {
        totalBondsLocked: '0.0 BITR',
        totalRewardsEarned: '0.0 BITR',
        successRate: '0%'
      }
    };

    try {
      // Try to get real user activity data
      const proposalsResult = await db.query(`
        SELECT * FROM oracle.optimistic_markets
        WHERE proposer = $1
        ORDER BY proposal_time DESC
        LIMIT 10
      `, [address]);

      const disputesResult = await db.query(`
        SELECT * FROM oracle.optimistic_markets
        WHERE disputer = $1
        ORDER BY dispute_time DESC
        LIMIT 10
      `, [address]);

      userActivity.statistics.totalProposals = proposalsResult.rows.length;
      userActivity.statistics.totalDisputes = disputesResult.rows.length;
      userActivity.statistics.successfulProposals = proposalsResult.rows.filter(r => r.state === 3).length;
      userActivity.statistics.successfulDisputes = disputesResult.rows.filter(r => r.state === 3).length;

      userActivity.recentActivity.proposals = proposalsResult.rows.map(row => ({
        marketId: row.market_id,
        poolId: row.pool_id,
        question: row.question,
        category: row.category,
        proposedOutcome: row.proposed_outcome,
        proposer: row.proposer,
        proposalTime: row.proposal_time,
        proposalBond: row.proposal_bond,
        disputer: row.disputer,
        disputeTime: row.dispute_time,
        disputeBond: row.dispute_bond,
        state: row.state,
        finalOutcome: row.final_outcome,
        resolutionTime: row.resolution_time
      }));

      userActivity.recentActivity.disputes = disputesResult.rows.map(row => ({
        marketId: row.market_id,
        poolId: row.pool_id,
        question: row.question,
        category: row.category,
        proposedOutcome: row.proposed_outcome,
        proposer: row.proposer,
        proposalTime: row.proposal_time,
        proposalBond: row.proposal_bond,
        disputer: row.disputer,
        disputeTime: row.dispute_time,
        disputeBond: row.dispute_bond,
        state: row.state,
        finalOutcome: row.final_outcome,
        resolutionTime: row.resolution_time
      }));
    } catch (error) {
      console.log('Optimistic markets table not found, using mock data');
    }

    res.json({
      success: true,
      data: userActivity
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user activity',
      error: error.message
    });
  }
}));

/**
 * Get user reputation
 */
router.get('/user/:address/reputation', asyncHandler(async (req, res) => {
  try {
    const { address } = req.params;

    // Mock reputation data
    const reputation = {
      reputation: 0,
      canPropose: false,
      canDispute: false,
      minReputationToPropose: 100,
      minReputationToDispute: 50
    };

    try {
      // Try to get real reputation data
      const result = await db.query(`
        SELECT reputation_score FROM core.user_reputation
        WHERE user_address = $1
      `, [address]);

      if (result.rows.length > 0) {
        reputation.reputation = parseInt(result.rows[0].reputation_score) || 0;
        reputation.canPropose = reputation.reputation >= reputation.minReputationToPropose;
        reputation.canDispute = reputation.reputation >= reputation.minReputationToDispute;
      }
    } catch (error) {
      console.log('User reputation table not found, using mock data');
    }

    res.json({
      success: true,
      data: reputation
    });
  } catch (error) {
    console.error('Error fetching user reputation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user reputation',
      error: error.message
    });
  }
}));

/**
 * Get markets by category with analytics
 */
router.get('/markets/by-category', asyncHandler(async (req, res) => {
  try {
    const marketsByCategory = {};

    try {
      const result = await db.query(`
        SELECT 
          category,
          COUNT(*) as total_markets,
          COUNT(CASE WHEN state = 1 THEN 1 END) as active_markets,
          AVG(CASE WHEN resolution_time > 0 THEN resolution_time - proposal_time END) as avg_resolution_time,
          COUNT(CASE WHEN disputer IS NOT NULL THEN 1 END) as disputed_count
        FROM oracle.optimistic_markets
        GROUP BY category
      `);

      for (const row of result.rows) {
        marketsByCategory[row.category] = {
          markets: [], // Would need separate query to get actual markets
          statistics: {
            totalMarkets: parseInt(row.total_markets) || 0,
            activeMarkets: parseInt(row.active_markets) || 0,
            avgResolutionTime: parseFloat(row.avg_resolution_time) || 0,
            disputeRate: row.total_markets > 0 ? (parseInt(row.disputed_count) / parseInt(row.total_markets)) * 100 : 0
          }
        };
      }
    } catch (error) {
      console.log('Optimistic markets table not found, returning empty categories');
    }

    res.json({
      success: true,
      data: marketsByCategory
    });
  } catch (error) {
    console.error('Error fetching markets by category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch markets by category',
      error: error.message
    });
  }
}));

/**
 * Get pending markets that need resolution
 */
router.get('/markets/pending', asyncHandler(async (req, res) => {
  try {
    let markets = [];

    try {
      const result = await db.query(`
        SELECT * FROM oracle.optimistic_markets
        WHERE state = 0
        ORDER BY proposal_time ASC
      `);

      markets = result.rows.map(row => ({
        marketId: row.market_id,
        poolId: row.pool_id,
        question: row.question,
        category: row.category,
        proposedOutcome: row.proposed_outcome,
        proposer: row.proposer,
        proposalTime: row.proposal_time,
        proposalBond: row.proposal_bond,
        disputer: row.disputer,
        disputeTime: row.dispute_time,
        disputeBond: row.dispute_bond,
        state: row.state,
        finalOutcome: row.final_outcome,
        resolutionTime: row.resolution_time
      }));
    } catch (error) {
      console.log('Optimistic markets table not found, returning empty pending markets');
    }

    res.json({
      success: true,
      data: markets
    });
  } catch (error) {
    console.error('Error fetching pending markets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending markets',
      error: error.message
    });
  }
}));

/**
 * Get disputed markets that need community resolution
 */
router.get('/markets/disputed', asyncHandler(async (req, res) => {
  try {
    let markets = [];

    try {
      const result = await db.query(`
        SELECT * FROM oracle.optimistic_markets
        WHERE state = 2
        ORDER BY dispute_time ASC
      `);

      markets = result.rows.map(row => ({
        marketId: row.market_id,
        poolId: row.pool_id,
        question: row.question,
        category: row.category,
        proposedOutcome: row.proposed_outcome,
        proposer: row.proposer,
        proposalTime: row.proposal_time,
        proposalBond: row.proposal_bond,
        disputer: row.disputer,
        disputeTime: row.dispute_time,
        disputeBond: row.dispute_bond,
        state: row.state,
        finalOutcome: row.final_outcome,
        resolutionTime: row.resolution_time
      }));
    } catch (error) {
      console.log('Optimistic markets table not found, returning empty disputed markets');
    }

    res.json({
      success: true,
      data: markets
    });
  } catch (error) {
    console.error('Error fetching disputed markets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch disputed markets',
      error: error.message
    });
  }
}));

/**
 * Get market resolution history
 */
router.get('/resolutions', asyncHandler(async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    let resolutions = [];
    let total = 0;

    try {
      const result = await db.query(`
        SELECT 
          market_id,
          question,
          category,
          final_outcome,
          resolution_time,
          proposer,
          proposal_bond,
          disputer
        FROM oracle.optimistic_markets
        WHERE state = 3 AND final_outcome IS NOT NULL
        ORDER BY resolution_time DESC
        LIMIT $1
      `, [parseInt(limit)]);

      const countResult = await db.query(`
        SELECT COUNT(*) FROM oracle.optimistic_markets
        WHERE state = 3 AND final_outcome IS NOT NULL
      `);

      total = parseInt(countResult.rows[0].count) || 0;

      resolutions = result.rows.map(row => ({
        marketId: row.market_id,
        question: row.question,
        category: row.category,
        finalOutcome: row.final_outcome,
        resolutionTime: row.resolution_time,
        winner: row.disputer ? row.disputer : row.proposer,
        rewardAmount: row.proposal_bond,
        wasDisputed: !!row.disputer
      }));
    } catch (error) {
      console.log('Optimistic markets table not found, returning empty resolutions');
    }

    res.json({
      success: true,
      data: {
        resolutions: resolutions,
        total: total
      }
    });
  } catch (error) {
    console.error('Error fetching resolution history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch resolution history',
      error: error.message
    });
  }
}));

module.exports = router;
