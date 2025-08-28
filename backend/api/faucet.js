const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

// Simplified BITR Faucet ABI (no eligibility checking)
const FAUCET_ABI = [
  "function claimBitr() external",
  "function getUserInfo(address user) external view returns (bool claimed, uint256 claimTime)",
  "function getFaucetStats() external view returns (uint256 balance, uint256 totalDistributed, uint256 userCount, bool active)",
  "function hasSufficientBalance() external view returns (bool)",
  "function maxPossibleClaims() external view returns (uint256)",
  "event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp)"
];

/**
 * Check STT activity eligibility using database
 */
async function checkSTTActivity(address) {
  try {
    // Query database for STT activity (pools and bets where uses_bitr = false)
    const activityQuery = await db.query(`
      SELECT 
        COUNT(CASE 
          WHEN p.creator_address = LOWER($1) AND p.uses_bitr = FALSE 
          THEN 1 END
        ) as pools_created,
        COUNT(CASE 
          WHEN b.user_address = LOWER($1) AND EXISTS (
            SELECT 1 FROM analytics.pools ap 
            WHERE ap.pool_id = b.pool_id AND ap.uses_bitr = FALSE
          ) 
          THEN 1 END
        ) as bets_placed,
        MIN(CASE 
          WHEN p.creator_address = LOWER($1) AND p.uses_bitr = FALSE 
          THEN p.creation_time 
          WHEN b.user_address = LOWER($1) AND EXISTS (
            SELECT 1 FROM analytics.pools ap 
            WHERE ap.pool_id = b.pool_id AND ap.uses_bitr = FALSE
          ) 
          THEN b.created_at 
        END) as first_activity,
        MAX(CASE 
          WHEN p.creator_address = LOWER($1) AND p.uses_bitr = FALSE 
          THEN p.creation_time 
          WHEN b.user_address = LOWER($1) AND EXISTS (
            SELECT 1 FROM analytics.pools ap 
            WHERE ap.pool_id = b.pool_id AND ap.uses_bitr = FALSE
          ) 
          THEN b.created_at 
        END) as last_activity
      FROM analytics.pools p
      FULL OUTER JOIN prediction.bets b ON 1=1
      WHERE p.creator_address = LOWER($1) OR b.user_address = LOWER($1)
    `, [address]);

    const activity = activityQuery.rows[0] || {
      pools_created: 0,
      bets_placed: 0,
      first_activity: null,
      last_activity: null
    };

    const totalSTTActions = parseInt(activity.pools_created || 0) + parseInt(activity.bets_placed || 0);
    const hasSTTActivity = totalSTTActions > 0;

    return {
      hasActivity: hasSTTActivity,
      poolsCreated: parseInt(activity.pools_created || 0),
      betsPlaced: parseInt(activity.bets_placed || 0),
      totalSTTActions,
      firstActivity: activity.first_activity,
      lastActivity: activity.last_activity
    };
  } catch (error) {
    console.error('Error checking STT activity:', error);
    return {
      hasActivity: false,
      poolsCreated: 0,
      betsPlaced: 0,
      totalSTTActions: 0,
      firstActivity: null,
      lastActivity: null
    };
  }
}

/**
 * GET /faucet/eligibility/:address
 * Check if user is eligible to claim BITR from faucet
 */
router.get('/eligibility/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }
    
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const faucetContract = new ethers.Contract(
      config.blockchain.contractAddresses.bitrFaucet,
      FAUCET_ABI,
      provider
    );
    
    // Check claim status from contract
    const [claimed, claimTime] = await faucetContract.getUserInfo(address);
    const hasSufficientBalance = await faucetContract.hasSufficientBalance();
    
    // Check STT activity from database
    const activityData = await checkSTTActivity(address);
    
    // Determine eligibility
    const alreadyClaimed = claimed;
    const hasRequiredActivity = activityData.hasActivity;
    const faucetHasBalance = hasSufficientBalance;
    
    const eligible = !alreadyClaimed && hasRequiredActivity && faucetHasBalance;
    
    let reason = "Eligible to claim";
    if (alreadyClaimed) {
      reason = "Already claimed";
    } else if (!hasRequiredActivity) {
      reason = "Must create a pool or place a bet using STT first";
    } else if (!faucetHasBalance) {
      reason = "Insufficient faucet balance";
    }
    
    res.json({
      address,
      eligible,
      reason,
      status: {
        hasClaimed: alreadyClaimed,
        claimTime: claimTime.toString(),
        hasSTTActivity: hasRequiredActivity,
        faucetHasBalance
      },
      activity: {
        poolsCreated: activityData.poolsCreated,
        betsPlaced: activityData.betsPlaced,
        firstActivity: activityData.firstActivity,
        lastActivity: activityData.lastActivity,
        totalSTTActions: activityData.totalSTTActions
      },
      requirements: {
        sttActivityRequired: true,
        message: hasRequiredActivity ? 
          "✅ STT activity verified" : 
          "❌ Must create a pool or place a bet using STT first"
      }
    });
    
  } catch (error) {
    console.error('Error checking faucet eligibility:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check faucet eligibility'
    });
  }
});

/**
 * POST /faucet/claim
 * Validate eligibility and return claim instructions
 */
router.post('/claim', async (req, res) => {
  try {
    const { address, signature } = req.body;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }
    
    // Verify signature (optional - for additional security)
    if (signature) {
      const message = `Claim BITR faucet: ${address}`;
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        return res.status(400).json({
          error: 'Invalid signature'
        });
      }
    }
    
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const faucetContract = new ethers.Contract(
      config.blockchain.contractAddresses.bitrFaucet,
      FAUCET_ABI,
      provider
    );
    
    // Check claim status from contract
    const [claimed, claimTime] = await faucetContract.getUserInfo(address);
    const hasSufficientBalance = await faucetContract.hasSufficientBalance();
    
    // Check STT activity from database
    const activityData = await checkSTTActivity(address);
    
    // Validate eligibility
    if (claimed) {
      return res.status(400).json({
        error: 'Already claimed',
        claimTime: claimTime.toString()
      });
    }
    
    if (!activityData.hasActivity) {
      return res.status(400).json({
        error: 'Not eligible to claim',
        reason: 'Must create a pool or place a bet using STT first'
      });
    }
    
    if (!hasSufficientBalance) {
      return res.status(400).json({
        error: 'Insufficient faucet balance',
        reason: 'Faucet needs to be refilled'
      });
    }
    
    // All checks passed - user can claim
    res.json({
      success: true,
      message: 'Eligible to claim BITR',
      contractAddress: config.blockchain.contractAddresses.bitrFaucet,
      method: 'claimBitr',
      amount: '20000000000000000000000', // 20,000 BITR in wei
      instructions: 'Call claimBitr() function on the faucet contract',
      activity: activityData
    });
    
  } catch (error) {
    console.error('Error processing faucet claim:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process faucet claim'
    });
  }
});

/**
 * GET /faucet/statistics
 * Get overall faucet statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const faucetContract = new ethers.Contract(
      config.blockchain.contractAddresses.bitrFaucet,
      FAUCET_ABI,
      provider
    );
    
    const [balance, totalDistributed, userCount, active] = await faucetContract.getFaucetStats();
    const maxClaims = await faucetContract.maxPossibleClaims();
    const hasSufficientBalance = await faucetContract.hasSufficientBalance();
    
    res.json({
      faucet: {
        active: active,
        balance: balance.toString(),
        totalDistributed: totalDistributed.toString(),
        totalUsers: userCount.toString(),
        maxPossibleClaims: maxClaims.toString(),
        hasSufficientBalance: hasSufficientBalance
      },
      constants: {
        faucetAmount: '20000000000000000000000', // 20K BITR
        contractAddress: config.blockchain.contractAddresses.bitrFaucet
      },
      formatted: {
        balance: ethers.formatEther(balance) + ' BITR',
        totalDistributed: ethers.formatEther(totalDistributed) + ' BITR',
        faucetAmount: '20,000 BITR'
      }
    });
    
  } catch (error) {
    console.error('Error getting faucet statistics:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get faucet statistics'
    });
  }
});

/**
 * GET /faucet/activity/:address
 * Get user's STT activity history for faucet eligibility
 */
router.get('/activity/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({
        error: 'Invalid wallet address format'
      });
    }
    
    // Get detailed STT activity from database
    const activities = await db.query(`
      SELECT 
        pool_id,
        'POOL_CREATE' as activity_type,
        creator_stake::text as amount,
        creation_time as timestamp,
        'Pool Creation' as description,
        category,
        league
      FROM analytics.pools 
      WHERE LOWER(creator_address) = LOWER($1)
      AND uses_bitr = FALSE  -- STT pools only
      
      UNION ALL
      
      SELECT 
        b.pool_id,
        'BET_PLACE' as activity_type,
        b.amount::text as amount,
        b.created_at as timestamp,
        'Bet Placed' as description,
        p.category,
        p.league
      FROM prediction.bets b
      JOIN analytics.pools p ON b.pool_id = p.pool_id
      WHERE LOWER(b.user_address) = LOWER($1)
      AND p.uses_bitr = FALSE  -- STT bets only
      
      ORDER BY timestamp DESC
      LIMIT 50
    `, [address]);
    
    const activityData = await checkSTTActivity(address);
    
    res.json({
      address,
      summary: {
        poolsCreated: activityData.poolsCreated,
        betsPlaced: activityData.betsPlaced,
        totalSTTActions: activityData.totalSTTActions,
        firstActivity: activityData.firstActivity,
        lastActivity: activityData.lastActivity
      },
      activities: activities.rows.map(activity => ({
        poolId: activity.pool_id,
        type: activity.activity_type,
        amount: activity.amount,
        timestamp: activity.timestamp,
        description: activity.description,
        category: activity.category,
        league: activity.league
      })),
      eligibility: {
        hasSTTActivity: activityData.hasActivity,
        message: activityData.hasActivity ?
          "✅ Eligible for BITR faucet" :
          "❌ Must create a pool or place a bet using STT first"
      }
    });
    
  } catch (error) {
    console.error('Error getting user activity:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get user activity'
    });
  }
});

module.exports = router; 