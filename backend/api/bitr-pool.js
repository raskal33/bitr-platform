/**
 * BitrPool API
 * 
 * API endpoints for prediction pool operations
 */

const express = require('express');
const router = express.Router();
const BitrPoolService = require('../services/bitr-pool-service.js');
const db = require('../db/db.js');

// Initialize service
const poolService = new BitrPoolService();

/**
 * GET /api/bitredict-pool/pools
 * Get all active pools
 */
router.get('/pools', async (req, res) => {
  try {
    const pools = await poolService.getActivePools();
    
    res.json({
      success: true,
      data: pools,
      meta: {
        count: pools.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching pools:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch pools',
        details: {
          timestamp: new Date().toISOString(),
          path: '/pools',
          method: 'GET'
        }
      }
    });
  }
});

/**
 * GET /api/bitredict-pool/pools/:poolId
 * Get specific pool details
 */
router.get('/pools/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    // Get pool details from contract
    const poolDetails = await poolService.getPoolDetails(poolId);
    
    // Get pool statistics from database
    const poolStats = await poolService.getPoolStats(poolId);
    
    res.json({
      success: true,
      data: {
        ...poolDetails,
        statistics: poolStats
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching pool details:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch pool details',
        details: {
          timestamp: new Date().toISOString(),
          path: `/pools/${req.params.poolId}`,
          method: 'GET'
        }
      }
    });
  }
});

/**
 * POST /api/bitredict-pool/pools
 * Create a new pool
 */
router.post('/pools', async (req, res) => {
  try {
    const poolData = req.body;
    
    // Validate required fields
    const requiredFields = [
      'predictedOutcome', 'odds', 'creatorStake', 
      'eventStartTime', 'eventEndTime', 'league', 
      'category', 'region'
    ];
    
    for (const field of requiredFields) {
      if (!poolData[field]) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELD',
            message: `Missing required field: ${field}`,
            details: {
              timestamp: new Date().toISOString(),
              path: '/pools',
              method: 'POST'
            }
          }
        });
      }
    }
    
    // Add creator address from request
    poolData.creatorAddress = req.body.creatorAddress || req.user?.address;
    
    const result = await poolService.createPool(poolData);
    
    res.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error creating pool:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create pool',
        details: {
          timestamp: new Date().toISOString(),
          path: '/pools',
          method: 'POST'
        }
      }
    });
  }
});

/**
 * POST /api/bitredict-pool/pools/:poolId/bet
 * Place a bet on a pool
 */
router.post('/pools/:poolId/bet', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { amount, userAddress } = req.body;
    
    if (!amount || !userAddress) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Missing required fields: amount, userAddress',
          details: {
            timestamp: new Date().toISOString(),
            path: `/pools/${poolId}/bet`,
            method: 'POST'
          }
        }
      });
    }
    
    const result = await poolService.placeBet(poolId, amount, userAddress);
    
    res.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error placing bet:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to place bet',
        details: {
          timestamp: new Date().toISOString(),
          path: `/pools/${req.params.poolId}/bet`,
          method: 'POST'
        }
      }
    });
  }
});

/**
 * POST /api/bitredict-pool/pools/:poolId/settle
 * Settle a pool (Oracle only)
 */
router.post('/pools/:poolId/settle', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { outcome } = req.body;
    
    if (outcome === undefined || outcome === null) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Missing required field: outcome',
          details: {
            timestamp: new Date().toISOString(),
            path: `/pools/${poolId}/settle`,
            method: 'POST'
          }
        }
      });
    }
    
    const result = await poolService.settlePool(poolId, outcome);
    
    res.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error settling pool:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to settle pool',
        details: {
          timestamp: new Date().toISOString(),
          path: `/pools/${req.params.poolId}/settle`,
          method: 'POST'
        }
      }
    });
  }
});

/**
 * GET /api/bitredict-pool/user/:address/pools
 * Get user's pools
 */
router.get('/user/:address/pools', async (req, res) => {
  try {
    const { address } = req.params;
    const pools = await poolService.getUserPools(address);
    
    res.json({
      success: true,
      data: pools,
      meta: {
        count: pools.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user pools:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch user pools',
        details: {
          timestamp: new Date().toISOString(),
          path: `/user/${req.params.address}/pools`,
          method: 'GET'
        }
      }
    });
  }
});

/**
 * GET /api/bitredict-pool/user/:address/bets
 * Get user's bets
 */
router.get('/user/:address/bets', async (req, res) => {
  try {
    const { address } = req.params;
    
    const result = await db.query(`
      SELECT 
        pb.*,
        p.league,
        p.category,
        p.predicted_outcome,
        p.status as pool_status
      FROM oracle.pool_bets pb
      JOIN oracle.pools p ON pb.pool_id = p.pool_id
      WHERE pb.user_address = $1
      ORDER BY pb.created_at DESC
    `, [address]);
    
    res.json({
      success: true,
      data: result.rows,
      meta: {
        count: result.rows.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user bets:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch user bets',
        details: {
          timestamp: new Date().toISOString(),
          path: `/user/${req.params.address}/bets`,
          method: 'GET'
        }
      }
    });
  }
});

/**
 * GET /api/bitredict-pool/statistics
 * Get platform statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_pools,
        COUNT(CASE WHEN status = 'settled' THEN 1 END) as settled_pools,
        SUM(CASE WHEN status = 'active' THEN creator_stake ELSE 0 END) as total_active_stake,
        SUM(CASE WHEN status = 'settled' THEN creator_stake ELSE 0 END) as total_settled_stake
      FROM oracle.pools
    `);
    
    const betStats = await db.query(`
      SELECT 
        COUNT(*) as total_bets,
        SUM(amount) as total_bet_amount,
        COUNT(DISTINCT user_address) as unique_bettors,
        AVG(amount) as average_bet_amount
      FROM oracle.pool_bets
    `);
    
    res.json({
      success: true,
      data: {
        pools: result.rows[0],
        bets: betStats.rows[0]
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch statistics',
        details: {
          timestamp: new Date().toISOString(),
          path: '/statistics',
          method: 'GET'
        }
      }
    });
  }
});

module.exports = router;
