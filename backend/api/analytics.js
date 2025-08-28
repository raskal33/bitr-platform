#!/usr/bin/env node

/**
 * Analytics API Endpoints
 * Provides endpoints for user analytics and leaderboards
 */

const express = require('express');
const router = express.Router();
const OddysseyAnalyticsService = require('../services/oddyssey-analytics-service');
const AnalyticsAggregator = require('../analytics/aggregator');

const analyticsService = new OddysseyAnalyticsService();
const aggregator = new AnalyticsAggregator();

// Get user analytics for a specific cycle
router.get('/user/cycle/:cycleId/:userAddress', async (req, res) => {
  try {
    const { cycleId, userAddress } = req.params;
    const analytics = await analyticsService.getUserCycleAnalytics(userAddress, cycleId);
    
    if (!analytics) {
      return res.status(404).json({ error: 'User analytics not found for this cycle' });
    }
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error getting user cycle analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get cumulative stats for a user
router.get('/user/cumulative/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    const stats = await analyticsService.getUserCumulativeStats(userAddress);
    
    if (!stats) {
      return res.status(404).json({ error: 'User cumulative stats not found' });
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting user cumulative stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get cycle leaderboard
router.get('/leaderboard/cycle/:cycleId', async (req, res) => {
  try {
    const { cycleId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const leaderboard = await analyticsService.getCycleLeaderboard(cycleId, limit);
    
    res.json({
      success: true,
      data: {
        cycleId: parseInt(cycleId),
        leaderboard,
        total: leaderboard.length
      }
    });
  } catch (error) {
    console.error('Error getting cycle leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get global leaderboard
router.get('/leaderboard/global', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const leaderboard = await analyticsService.getGlobalLeaderboard(limit);
    
    res.json({
      success: true,
      data: {
        leaderboard,
        total: leaderboard.length
      }
    });
  } catch (error) {
    console.error('Error getting global leaderboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get cycle statistics
router.get('/cycle/:cycleId', async (req, res) => {
  try {
    const { cycleId } = req.params;
    const stats = await analyticsService.getCycleStats(cycleId);
    
    if (!stats) {
      return res.status(404).json({ error: 'Cycle statistics not found' });
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting cycle stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analytics summary
router.get('/summary', async (req, res) => {
  try {
    const summary = await analyticsService.getAnalyticsSummary();
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting analytics summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process analytics for all cycles (admin endpoint)
router.post('/process-all', async (req, res) => {
  try {
    await analyticsService.processAllCycles();
    
    res.json({
      success: true,
      message: 'Analytics processing completed'
    });
  } catch (error) {
    console.error('Error processing analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user performance comparison
router.get('/user/comparison/:userAddress', async (req, res) => {
  try {
    const { userAddress } = req.params;
    
    // Get user's cumulative stats
    const userStats = await analyticsService.getUserCumulativeStats(userAddress);
    
    if (!userStats) {
      return res.status(404).json({ error: 'User stats not found' });
    }
    
    // Get global average
    const summary = await analyticsService.getAnalyticsSummary();
    
    const comparison = {
      user: userStats,
      global: {
        avgAccuracy: summary ? (summary.avg_correct_predictions / 10 * 100).toFixed(2) : 0, // Assuming 10 matches per cycle
        totalUsers: summary?.total_users || 0,
        totalSlips: summary?.total_slips || 0
      },
      performance: {
        accuracyVsGlobal: userStats.overall_accuracy_percentage - (summary ? (summary.avg_correct_predictions / 10 * 100) : 0),
        rank: null // Would need to calculate from global leaderboard
      }
    };
    
    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Error getting user comparison:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// FRONTEND-REQUIRED ENDPOINTS
// ============================================================================

// Get global platform statistics
router.get('/global', async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query;
    
    // Get analytics data for the specified timeframe
    const analyticsData = await aggregator.getAnalyticsData(timeframe);
    
    // Calculate global stats from analytics data
    const globalStats = {
      totalVolume: 0, // Will be calculated from pools
      totalPools: analyticsData.odyssey.length > 0 ? analyticsData.odyssey[0].total_cycles || 0 : 0,
      totalBets: analyticsData.odyssey.length > 0 ? analyticsData.odyssey[0].total_slips || 0 : 0,
      activePools: analyticsData.odyssey.length > 0 ? analyticsData.odyssey[0].active_cycles || 0 : 0
    };
    
    res.json({
      success: true,
      data: globalStats,
      timeframe
    });
  } catch (error) {
    console.error('Error getting global stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get volume history for charts
router.get('/volume-history', async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query;
    
    // Get analytics data for the specified timeframe
    const analyticsData = await aggregator.getAnalyticsData(timeframe);
    
    // Transform analytics data to volume history format
    const volumeHistory = analyticsData.odyssey.map(day => ({
      date: day.date,
      volume: parseFloat(day.total_prize_pools || 0),
      pools: day.total_cycles || 0,
      users: day.unique_players || 0
    }));
    
    res.json({
      success: true,
      data: volumeHistory,
      timeframe
    });
  } catch (error) {
    console.error('Error getting volume history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get category statistics and distribution
router.get('/categories', async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query;
    
    // For now, return placeholder data since we don't have category-specific analytics
    const distribution = {
      'Odyssey': 100,
      'Crypto': 0,
      'Sports': 0,
      'Politics': 0,
      'Finance': 0
    };
    
    const detailed = [
      {
        category: 'Odyssey',
        poolCount: 1,
        totalVolume: 0,
        avgPoolSize: 0,
        participantCount: 1
      }
    ];
    
    res.json({
      success: true,
      data: {
        distribution,
        detailed
      },
      timeframe
    });
  } catch (error) {
    console.error('Error getting category stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get top creators leaderboard
router.get('/leaderboard/creators', async (req, res) => {
  try {
    const { limit = 10, sortBy = 'total_volume' } = req.query;
    
    // Get global leaderboard and transform to creators format
    const leaderboard = await analyticsService.getGlobalLeaderboard(parseInt(limit));
    
    const topCreators = leaderboard.map(user => ({
      address: user.user_address,
      shortAddress: `${user.user_address.slice(0, 6)}...${user.user_address.slice(-4)}`,
      reputation: 40, // Default reputation
      stats: {
        totalPools: user.total_slips || 0,
        totalVolume: parseFloat(user.total_prizes_won || 0),
        winRate: parseFloat(user.overall_accuracy_percentage || 0)
      }
    }));
    
    res.json({
      success: true,
      data: topCreators,
      sortBy,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error getting top creators:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get top bettors leaderboard
router.get('/leaderboard/bettors', async (req, res) => {
  try {
    const { limit = 10, sortBy = 'profit_loss' } = req.query;
    
    // Get global leaderboard and transform to bettors format
    const leaderboard = await analyticsService.getGlobalLeaderboard(parseInt(limit));
    
    const topBettors = leaderboard.map(user => ({
      address: user.user_address,
      shortAddress: `${user.user_address.slice(0, 6)}...${user.user_address.slice(-4)}`,
      stats: {
        totalBets: user.total_slips || 0,
        wonBets: Math.round((user.total_slips || 0) * (parseFloat(user.overall_accuracy_percentage || 0) / 100)),
        totalStaked: parseFloat(user.total_prizes_won || 0),
        totalWinnings: parseFloat(user.total_prizes_won || 0),
        winRate: parseFloat(user.overall_accuracy_percentage || 0),
        profitLoss: parseFloat(user.total_prizes_won || 0),
        biggestWin: parseFloat(user.total_prizes_won || 0),
        currentStreak: 0,
        maxWinStreak: 0,
        streakIsWin: true
      },
      joinedAt: new Date().toISOString()
    }));
    
    res.json({
      success: true,
      data: topBettors,
      sortBy,
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error getting top bettors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get hourly user activity patterns
router.get('/user-activity', async (req, res) => {
  try {
    // Get user activity data from analytics
    const analyticsData = await aggregator.getAnalyticsData('7d');
    
    // Transform to hourly activity format (simplified for now)
    const userActivity = analyticsData.userActivity.map(day => ({
      hour: day.date,
      users: day.active_users || 0,
      volume: 0, // Not available in current analytics
      bets: day.total_actions || 0
    }));
    
    res.json({
      success: true,
      data: userActivity
    });
  } catch (error) {
    console.error('Error getting user activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get platform overview (combination of multiple endpoints)
router.get('/platform-overview', async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query;
    
    // Get all analytics data
    const analyticsData = await aggregator.getAnalyticsData(timeframe);
    
    const overview = {
      globalStats: {
        totalVolume: 0,
        totalPools: analyticsData.odyssey.length > 0 ? analyticsData.odyssey[0].total_cycles || 0 : 0,
        totalBets: analyticsData.odyssey.length > 0 ? analyticsData.odyssey[0].total_slips || 0 : 0,
        activePools: analyticsData.odyssey.length > 0 ? analyticsData.odyssey[0].active_cycles || 0 : 0
      },
      volumeHistory: analyticsData.odyssey.map(day => ({
        date: day.date,
        volume: parseFloat(day.total_prize_pools || 0),
        pools: day.total_cycles || 0,
        users: day.unique_players || 0
      })),
      categoryDistribution: {
        'Odyssey': 100,
        'Crypto': 0,
        'Sports': 0,
        'Politics': 0,
        'Finance': 0
      },
      categoryDetails: [
        {
          category: 'Odyssey',
          poolCount: 1,
          totalVolume: 0,
          avgPoolSize: 0,
          participantCount: 1
        }
      ],
      userActivity: analyticsData.userActivity.map(day => ({
        hour: day.date,
        users: day.active_users || 0,
        volume: 0,
        bets: day.total_actions || 0
      }))
    };
    
    res.json({
      success: true,
      data: overview,
      timeframe
    });
  } catch (error) {
    console.error('Error getting platform overview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get leaderboards (creators and bettors combined)
router.get('/leaderboards', async (req, res) => {
  try {
    // Get both leaderboards
    const [topCreators, topBettors] = await Promise.all([
      analyticsService.getGlobalLeaderboard(10),
      analyticsService.getGlobalLeaderboard(10)
    ]);
    
    const creators = topCreators.map(user => ({
      address: user.user_address,
      shortAddress: `${user.user_address.slice(0, 6)}...${user.user_address.slice(-4)}`,
      reputation: 40,
      stats: {
        totalPools: user.total_slips || 0,
        totalVolume: parseFloat(user.total_prizes_won || 0),
        winRate: parseFloat(user.overall_accuracy_percentage || 0)
      }
    }));
    
    const bettors = topBettors.map(user => ({
      address: user.user_address,
      shortAddress: `${user.user_address.slice(0, 6)}...${user.user_address.slice(-4)}`,
      stats: {
        totalBets: user.total_slips || 0,
        wonBets: Math.round((user.total_slips || 0) * (parseFloat(user.overall_accuracy_percentage || 0) / 100)),
        totalStaked: parseFloat(user.total_prizes_won || 0),
        totalWinnings: parseFloat(user.total_prizes_won || 0),
        winRate: parseFloat(user.overall_accuracy_percentage || 0),
        profitLoss: parseFloat(user.total_prizes_won || 0),
        biggestWin: parseFloat(user.total_prizes_won || 0),
        currentStreak: 0,
        maxWinStreak: 0,
        streakIsWin: true
      },
      joinedAt: new Date().toISOString()
    }));
    
    res.json({
      success: true,
      data: {
        topCreators: creators,
        topBettors: bettors
      }
    });
  } catch (error) {
    console.error('Error getting leaderboards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 