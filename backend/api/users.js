const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { ethers } = require('ethers');

// Get user profile and basic stats
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    // Query user stats from database
    const result = await db.query(`
      SELECT 
        address,
        reputation,
        total_volume,
        profit_loss,
        total_bets,
        won_bets,
        current_streak,
        max_win_streak,
        max_loss_streak,
        streak_is_win,
        biggest_win,
        biggest_loss,
        favorite_category,
        total_pools_created,
        pools_won,
        avg_bet_size,
        risk_score,
        joined_at,
        last_active
      FROM core.users 
      WHERE address = $1
    `, [address.toLowerCase()]);
    
    let userStats;
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      userStats = {
        total_bets: parseInt(user.total_bets) || 0,
        won_bets: parseInt(user.won_bets) || 0,
        profit_loss: parseFloat(user.profit_loss) || 0,
        total_volume: parseFloat(user.total_volume) || 0,
        avg_bet_size: parseFloat(user.avg_bet_size) || 0,
        biggest_win: parseFloat(user.biggest_win) || 0,
        biggest_loss: parseFloat(user.biggest_loss) || 0,
        current_streak: parseInt(user.current_streak) || 0,
        max_win_streak: parseInt(user.max_win_streak) || 0,
        max_loss_streak: parseInt(user.max_loss_streak) || 0,
        streak_is_win: user.streak_is_win || false,
        favorite_category: user.favorite_category || 'General',
        total_pools_created: parseInt(user.total_pools_created) || 0,
        pools_won: parseInt(user.pools_won) || 0,
        reputation: parseInt(user.reputation) || 40,
        risk_score: parseInt(user.risk_score) || 500,
        joined_at: user.joined_at,
        last_active: user.last_active
      };
    } else {
      // Return default stats for new user
      userStats = {
        total_bets: 0,
        won_bets: 0,
        profit_loss: 0,
        total_volume: 0,
        avg_bet_size: 0,
        biggest_win: 0,
        biggest_loss: 0,
        current_streak: 0,
        max_win_streak: 0,
        max_loss_streak: 0,
        streak_is_win: false,
        favorite_category: 'General',
        total_pools_created: 0,
        pools_won: 0,
        reputation: 40,
        risk_score: 500,
        joined_at: null,
        last_active: null
      };
    }

    res.json(userStats);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user profile' });
  }
});

// Enhanced profile endpoint with refunds and prizes
router.get('/:address/profile', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    // Get refundable pools (closed pools with no bettor stakes)
    const refundablePools = await db.query(`
      SELECT 
        pool_id,
        creator_stake,
        created_at,
        category,
        league
      FROM oracle.pools 
      WHERE creator_address = $1 
        AND status = 'closed' 
        AND total_bettor_stake = '0'
      ORDER BY created_at DESC
    `, [address.toLowerCase()]);
    
    // Get claimable Oddyssey prizes (evaluated slips with 7+ correct predictions)
    const claimablePrizes = await db.query(`
      SELECT 
        slip_id,
        cycle_id,
        leaderboard_rank,
        final_score,
        correct_count,
        placed_at,
        (correct_count >= 7) as is_eligible
      FROM oracle.oddyssey_slips 
      WHERE player_address = $1 
        AND is_evaluated = true 
        AND prize_claimed = false
        AND leaderboard_rank <= 3
        AND correct_count >= 7
      ORDER BY placed_at DESC
    `, [address.toLowerCase()]);
    
    // Calculate total refundable amount
    const totalRefundable = refundablePools.rows.reduce((sum, pool) => {
      const weiAmount = BigInt(pool.creator_stake);
      const bitrAmount = Number(weiAmount) / 1e18;
      return sum + bitrAmount;
    }, 0);
    
    res.json({
      success: true,
      data: {
        refunds: {
          pools: refundablePools.rows,
          totalAmount: totalRefundable,
          count: refundablePools.rows.length
        },
        prizes: {
          slips: claimablePrizes.rows,
          count: claimablePrizes.rows.length
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching enhanced profile:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile data' });
  }
});

// Get user badges
router.get('/:address/badges', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    // Query user badges from database
    const result = await db.query(`
      SELECT 
        badge_id,
        badge_type,
        badge_name,
        badge_description,
        badge_icon,
        rarity,
        earned_at,
        is_active
      FROM core.user_badges 
      WHERE user_address = $1
      ORDER BY earned_at DESC
    `, [address.toLowerCase()]);
    
    const badges = result.rows.map(badge => ({
      id: badge.badge_id,
      type: badge.badge_type,
      name: badge.badge_name,
      description: badge.badge_description,
      icon: badge.badge_icon,
      rarity: badge.rarity,
      earnedAt: badge.earned_at,
      isActive: badge.is_active
    }));
    
    res.json(badges);
  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user badges' });
  }
});

// Get user activity
router.get('/:address/activity', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 20 } = req.query;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    // Query user activity from database
    const result = await db.query(`
      SELECT 
        activity_id,
        activity_type,
        description,
        amount,
        timestamp,
        related_pool_id,
        related_slip_id
      FROM core.user_activity 
      WHERE user_address = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [address.toLowerCase(), parseInt(limit)]);
    
    const activities = result.rows.map(activity => ({
      id: activity.activity_id,
      type: activity.activity_type,
      description: activity.description,
      amount: activity.amount,
      timestamp: activity.timestamp,
      relatedPoolId: activity.related_pool_id,
      relatedSlipId: activity.related_slip_id
    }));
    
    res.json(activities);
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user activity' });
  }
});

// Get user category performance
router.get('/:address/category-performance', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    // Query category performance from database
    const result = await db.query(`
      SELECT 
        category,
        total_bets,
        won_bets,
        total_volume,
        avg_bet_size,
        win_rate
      FROM core.category_performance 
      WHERE user_address = $1
      ORDER BY total_volume DESC
    `, [address.toLowerCase()]);
    
    const categories = result.rows.map(cat => ({
      category: cat.category,
      totalBets: parseInt(cat.total_bets) || 0,
      wonBets: parseInt(cat.won_bets) || 0,
      totalVolume: parseFloat(cat.total_volume) || 0,
      avgBetSize: parseFloat(cat.avg_bet_size) || 0,
      winRate: parseFloat(cat.win_rate) || 0
    }));
    
    res.json(categories);
  } catch (error) {
    console.error('Error fetching category performance:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch category performance' });
  }
});

// Get user portfolio
router.get('/:address/portfolio', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet address format' });
    }
    
    // Query user portfolio from database
    const result = await db.query(`
      SELECT 
        active_bets,
        active_pools_created,
        total_value,
        potential_winnings,
        risked_amount
      FROM core.user_portfolio 
      WHERE user_address = $1
    `, [address.toLowerCase()]);
    
    let portfolio;
    
    if (result.rows.length > 0) {
      const userPortfolio = result.rows[0];
      portfolio = {
        activeBets: userPortfolio.active_bets || [],
        activePoolsCreated: userPortfolio.active_pools_created || [],
        totalValue: parseFloat(userPortfolio.total_value) || 0,
        potentialWinnings: parseFloat(userPortfolio.potential_winnings) || 0,
        riskedAmount: parseFloat(userPortfolio.risked_amount) || 0
      };
    } else {
      // Return empty portfolio for new user
      portfolio = {
        activeBets: [],
        activePoolsCreated: [],
        totalValue: 0,
        potentialWinnings: 0,
        riskedAmount: 0
      };
    }

    res.json(portfolio);
  } catch (error) {
    console.error('Error fetching user portfolio:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user portfolio' });
  }
});

module.exports = router;
