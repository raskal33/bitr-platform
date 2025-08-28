const express = require('express');
const router = express.Router();
const db = require('../db/db');

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
        id,
        badge_type,
        badge_category,
        title,
        description,
        icon_name,
        rarity,
        earned_at,
        true as is_active
      FROM core.user_badges 
      WHERE user_address = $1
      ORDER BY earned_at DESC
    `, [address.toLowerCase()]);
    
    const badges = result.rows.map(badge => ({
      id: badge.id,
      badge_type: badge.badge_type,
      badge_category: badge.badge_category,
      title: badge.title,
      description: badge.description,
      icon_name: badge.icon_name,
      rarity: badge.rarity,
      earned_at: badge.earned_at,
      is_active: badge.is_active
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
        id,
        activity_type,
        description,
        amount,
        pool_id,
        category,
        timestamp,
        block_number,
        tx_hash
      FROM core.user_activity 
      WHERE user_address = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [address.toLowerCase(), parseInt(limit)]);
    
    const activities = result.rows.map(activity => ({
      id: activity.id,
      activity_type: activity.activity_type,
      description: activity.description,
      amount: activity.amount ? `${activity.amount} STT` : null,
      pool_id: activity.pool_id,
      category: activity.category,
      timestamp: activity.timestamp,
      block_number: activity.block_number,
      tx_hash: activity.tx_hash
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
    
    // Query user category performance from database
    const result = await db.query(`
      SELECT 
        category,
        total_bets,
        won_bets,
        total_volume,
        profit_loss,
        avg_bet_size,
        best_streak
      FROM core.user_category_performance 
      WHERE user_address = $1
      ORDER BY total_volume DESC
    `, [address.toLowerCase()]);
    
    const categoryPerformance = result.rows.map(category => ({
      category: category.category,
      total_bets: parseInt(category.total_bets) || 0,
      won_bets: parseInt(category.won_bets) || 0,
      total_volume: parseFloat(category.total_volume) || 0,
      profit_loss: parseFloat(category.profit_loss) || 0,
      avg_bet_size: parseFloat(category.avg_bet_size) || 0,
      best_streak: parseInt(category.best_streak) || 0
    }));

    res.json(categoryPerformance);
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
