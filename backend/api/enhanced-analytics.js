#!/usr/bin/env node

/**
 * Enhanced Analytics API Endpoints
 * Provides comprehensive analytics using the new analytics and airdrop tables
 */

const express = require('express');
const router = express.Router();
const EnhancedAnalyticsService = require('../services/enhanced-analytics-service');
const EnhancedAirdropService = require('../services/enhanced-airdrop-service');
const db = require('../db/db');

const analyticsService = new EnhancedAnalyticsService();
const airdropService = new EnhancedAirdropService();

// Store globally for graceful shutdown access
global.analyticsService = analyticsService;
global.airdropService = airdropService;

// Initialize services
analyticsService.start();
airdropService.start();

/**
 * ANALYTICS DASHBOARD ENDPOINTS
 */

// Get comprehensive analytics dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const dashboard = await analyticsService.getAnalyticsDashboard();
    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('Error getting analytics dashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user analytics
router.get('/users', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await db.query(`
      SELECT 
        user_address, total_bets, winning_bets, total_staked, 
        total_won, win_rate, avg_odds, created_at, updated_at
      FROM analytics.user_analytics
      ORDER BY total_bets DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific user analytics
router.get('/users/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    const result = await db.query(`
      SELECT 
        ua.*, uss.social_score, uss.total_comments, uss.total_discussions
      FROM analytics.user_analytics ua
      LEFT JOIN analytics.user_social_stats uss ON ua.user_address = uss.user_address
      WHERE ua.user_address = $1
    `, [userAddress]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User analytics not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pool analytics
router.get('/pools', async (req, res) => {
  try {
    const { limit = 50, offset = 0, category, status } = req.query;
    let query = `
      SELECT 
        pool_id, creator_address, odds, is_settled, creator_side_won,
        is_private, uses_bitr, oracle_type, predicted_outcome, actual_result,
        creator_stake, total_creator_side_stake, total_bettor_stake,
        event_start_time, event_end_time, created_at, settled_at,
        category, league, region
      FROM analytics.pools
    `;
    
    const conditions = [];
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      conditions.push(`category = $${paramCount}`);
      params.push(category);
    }

    if (status) {
      paramCount++;
      conditions.push(`is_settled = $${paramCount}`);
      params.push(status === 'settled');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting pool analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get daily statistics
router.get('/daily', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const result = await db.query(`
      SELECT 
        date, total_users, total_pools, total_bets, total_volume,
        active_users, new_users, created_at
      FROM analytics.daily_stats
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY date DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting daily statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get category statistics
router.get('/categories', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const result = await db.query(`
      SELECT 
        category, total_pools, total_volume, avg_odds, win_rate, created_at
      FROM analytics.category_stats
      WHERE date = $1
      ORDER BY total_volume DESC
    `, [targetDate]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting category statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get hourly activity
router.get('/hourly', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const result = await db.query(`
      SELECT 
        date_hour, active_users, total_actions, pools_created, bets_placed, created_at
      FROM analytics.hourly_activity
      WHERE date_hour >= NOW() - INTERVAL '${hours} hours'
      ORDER BY date_hour DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting hourly activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get market analytics
router.get('/markets', async (req, res) => {
  try {
    const { marketType, limit = 50 } = req.query;
    let query = `
      SELECT 
        fixture_id, market_type, total_bets, home_bets, draw_bets, away_bets,
        over_bets, under_bets, btts_yes_bets, btts_no_bets, created_at, updated_at
      FROM analytics.market_analytics
    `;
    
    const params = [];
    if (marketType) {
      query += ` WHERE market_type = $1`;
      params.push(marketType);
    }
    
    query += ` ORDER BY total_bets DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting market analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get staking events
router.get('/staking', async (req, res) => {
  try {
    const { userAddress, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT 
        user_address, event_type, amount, transaction_hash, block_number,
        timestamp, additional_data, created_at
      FROM analytics.staking_events
    `;
    
    const params = [];
    if (userAddress) {
      query += ` WHERE user_address = $1`;
      params.push(userAddress);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting staking events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user social stats
router.get('/social', async (req, res) => {
  try {
    const { userAddress, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT 
        user_address, total_comments, total_discussions, total_replies,
        total_reactions_given, total_reactions_received, total_reflections,
        social_score, created_at, updated_at
      FROM analytics.user_social_stats
    `;
    
    const params = [];
    if (userAddress) {
      query += ` WHERE user_address = $1`;
      params.push(userAddress);
    } else {
      query += ` ORDER BY social_score DESC LIMIT $1 OFFSET $2`;
      params.push(limit, offset);
    }

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting social stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * AIRDROP ENDPOINTS
 */

// Get airdrop statistics
router.get('/airdrop/stats', async (req, res) => {
  try {
    const stats = await airdropService.getAirdropStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting airdrop statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user eligibility
router.get('/airdrop/eligibility/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    const eligibility = await airdropService.getUserEligibility(userAddress);
    
    if (!eligibility) {
      return res.status(404).json({ error: 'User eligibility not found' });
    }

    res.json({
      success: true,
      data: eligibility
    });
  } catch (error) {
    console.error('Error getting user eligibility:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get airdrop leaderboard
router.get('/airdrop/leaderboard', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const leaderboard = await airdropService.getAirdropLeaderboard(limit);
    
    res.json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    console.error('Error getting airdrop leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transfer pattern analysis
router.get('/airdrop/transfers', async (req, res) => {
  try {
    const analysis = await airdropService.getTransferPatternAnalysis();
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Error getting transfer pattern analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get staking activity summary
router.get('/airdrop/staking', async (req, res) => {
  try {
    const summary = await airdropService.getStakingActivitySummary();
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting staking activity summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get airdrop snapshots
router.get('/airdrop/snapshots', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        id, snapshot_name, snapshot_block, snapshot_timestamp,
        total_eligible_wallets, total_eligible_bitr, created_at
      FROM airdrop.snapshots
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting airdrop snapshots:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get snapshot balances
router.get('/airdrop/snapshots/:snapshotId/balances', async (req, res) => {
  try {
    const { snapshotId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(`
      SELECT 
        user_address, bitr_balance, airdrop_amount, is_eligible, created_at
      FROM airdrop.snapshot_balances
      WHERE snapshot_id = $1
      ORDER BY airdrop_amount DESC
      LIMIT $2 OFFSET $3
    `, [snapshotId, limit, offset]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting snapshot balances:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * ADMIN ENDPOINTS
 */

// Initialize analytics data
router.post('/admin/initialize', async (req, res) => {
  try {
    await analyticsService.initializeAnalytics();
    res.json({
      success: true,
      message: 'Analytics data initialized successfully'
    });
  } catch (error) {
    console.error('Error initializing analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create airdrop snapshot
router.post('/admin/airdrop/snapshot', async (req, res) => {
  try {
    const { snapshotName, blockNumber, timestamp } = req.body;
    const snapshotId = await airdropService.createSnapshot(
      snapshotName || `snapshot_${Date.now()}`,
      blockNumber || 1000000,
      timestamp || new Date()
    );
    
    res.json({
      success: true,
      data: { snapshotId },
      message: 'Airdrop snapshot created successfully'
    });
  } catch (error) {
    console.error('Error creating airdrop snapshot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process airdrop data
router.post('/admin/airdrop/process', async (req, res) => {
  try {
    await airdropService.processAirdropData();
    res.json({
      success: true,
      message: 'Airdrop data processed successfully'
    });
  } catch (error) {
    console.error('Error processing airdrop data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Track staking activity
router.post('/admin/staking/track', async (req, res) => {
  try {
    const { userAddress, actionType, amount, tierId, durationOption, txHash, blockNumber, timestamp } = req.body;
    
    await airdropService.trackStakingActivity(
      userAddress, actionType, amount, tierId, durationOption, txHash, blockNumber, timestamp
    );
    
    res.json({
      success: true,
      message: 'Staking activity tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking staking activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Track transfer pattern
router.post('/admin/transfers/track', async (req, res) => {
  try {
    const { fromAddress, toAddress, amount, txHash, blockNumber, timestamp } = req.body;
    
    await airdropService.trackTransferPattern(
      fromAddress, toAddress, amount, txHash, blockNumber, timestamp
    );
    
    res.json({
      success: true,
      message: 'Transfer pattern tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking transfer pattern:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
