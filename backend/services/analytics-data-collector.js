#!/usr/bin/env node

/**
 * Analytics Data Collector
 * Hooks into existing API endpoints to collect and populate analytics data in real-time
 */

require('dotenv').config();
const db = require('../db/db');

class AnalyticsDataCollector {
  constructor() {
    this.isRunning = false;
    this.batchSize = 10;
    this.batchQueue = [];
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('📊 Analytics Data Collector started');
    
    // Process batch queue every 30 seconds
    setInterval(() => {
      this.processBatchQueue();
    }, 30000);
  }

  async stop() {
    this.isRunning = false;
    console.log('🛑 Analytics Data Collector stopped');
  }

  /**
   * Collect user activity data
   */
  async collectUserActivity(userAddress, activityType, data = {}) {
    try {
      const activity = {
        userAddress,
        activityType,
        data,
        timestamp: new Date()
      };

      this.batchQueue.push(activity);

      // Process immediately if batch is full
      if (this.batchQueue.length >= this.batchSize) {
        await this.processBatchQueue();
      }
    } catch (error) {
      console.error('❌ Failed to collect user activity:', error);
    }
  }

  /**
   * Process batch queue
   */
  async processBatchQueue() {
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0, this.batchSize);
    
    try {
      for (const activity of batch) {
        await this.processActivity(activity);
      }
    } catch (error) {
      console.error('❌ Failed to process batch queue:', error);
      // Re-queue failed activities
      this.batchQueue.unshift(...batch);
    }
  }

  /**
   * Process individual activity
   */
  async processActivity(activity) {
    const { userAddress, activityType, data, timestamp } = activity;

    switch (activityType) {
      case 'slip_placed':
        await this.handleSlipPlaced(userAddress, data, timestamp);
        break;
      case 'slip_evaluated':
        await this.handleSlipEvaluated(userAddress, data, timestamp);
        break;
      case 'pool_created':
        await this.handlePoolCreated(userAddress, data, timestamp);
        break;
      case 'bet_placed':
        await this.handleBetPlaced(userAddress, data, timestamp);
        break;
      case 'social_interaction':
        await this.handleSocialInteraction(userAddress, data, timestamp);
        break;
      case 'staking_activity':
        await this.handleStakingActivity(userAddress, data, timestamp);
        break;
      default:
        console.log(`Unknown activity type: ${activityType}`);
    }
  }

  /**
   * Handle slip placed activity
   */
  async handleSlipPlaced(userAddress, data, timestamp) {
    try {
      // Update user analytics
      await db.query(`
        INSERT INTO analytics.user_analytics (
          user_address, total_bets, total_staked, created_at, updated_at
        ) VALUES ($1, 1, $2, NOW(), NOW())
        ON CONFLICT (user_address) DO UPDATE SET
          total_bets = analytics.user_analytics.total_bets + 1,
          total_staked = analytics.user_analytics.total_staked + $2,
          updated_at = NOW()
      `, [userAddress, data.amount || 0]);

      // Update hourly activity
      await this.updateHourlyActivity(timestamp, 'bets_placed', 1);

      // Update daily stats
      await this.updateDailyStats(timestamp, 'total_bets', 1);

      console.log(`📊 Collected slip placed data for ${userAddress}`);
    } catch (error) {
      console.error('❌ Failed to handle slip placed:', error);
    }
  }

  /**
   * Handle slip evaluated activity
   */
  async handleSlipEvaluated(userAddress, data, timestamp) {
    try {
      const isWin = data.finalScore >= 5;
      const winAmount = isWin ? data.prizeAmount || 0 : 0;

      // Update user analytics
      await db.query(`
        UPDATE analytics.user_analytics 
        SET 
          winning_bets = winning_bets + $2,
          total_won = total_won + $3,
          win_rate = CASE 
            WHEN total_bets > 0 THEN (winning_bets + $2)::DECIMAL / total_bets * 100
            ELSE 0 
          END,
          updated_at = NOW()
        WHERE user_address = $1
      `, [userAddress, isWin ? 1 : 0, winAmount]);

      console.log(`📊 Collected slip evaluated data for ${userAddress}`);
    } catch (error) {
      console.error('❌ Failed to handle slip evaluated:', error);
    }
  }

  /**
   * Handle pool created activity
   */
  async handlePoolCreated(userAddress, data, timestamp) {
    try {
      // Create pool analytics record
      await db.query(`
        INSERT INTO analytics.pools (
          pool_id, creator_address, odds, is_settled, creator_side_won,
          is_private, uses_bitr, oracle_type, market_id, predicted_outcome,
          actual_result, creator_stake, total_creator_side_stake, total_bettor_stake,
          max_bettor_stake, event_start_time, event_end_time, betting_end_time,
          created_at, settled_at, category, league, region
        ) VALUES ($1, $2, $3, false, null, $4, true, $5, $6, $7, 'pending', 
                  $8, $8, 0, $9, $10, null, $11, NOW(), null, $12, $13, $14)
      `, [
        data.poolId, userAddress, data.odds, data.isPrivate || false,
        data.oracleType || 'oddyssey', data.marketId, data.predictedOutcome,
        data.creatorStake, data.maxBettorStake, data.eventStartTime,
        data.bettingEndTime, data.category || 'football', data.league || 'Premier League',
        data.region || 'Europe'
      ]);

      // Update hourly activity
      await this.updateHourlyActivity(timestamp, 'pools_created', 1);

      // Update daily stats
      await this.updateDailyStats(timestamp, 'total_pools', 1);

      console.log(`📊 Collected pool created data for ${userAddress}`);
    } catch (error) {
      console.error('❌ Failed to handle pool created:', error);
    }
  }

  /**
   * Handle bet placed activity
   */
  async handleBetPlaced(userAddress, data, timestamp) {
    try {
      // Update pool analytics
      await db.query(`
        UPDATE analytics.pools 
        SET 
          total_bettor_stake = total_bettor_stake + $2,
          updated_at = NOW()
        WHERE pool_id = $1
      `, [data.poolId, data.amount]);

      // Update user analytics
      await db.query(`
        UPDATE analytics.user_analytics 
        SET 
          total_bets = total_bets + 1,
          total_staked = total_staked + $2,
          updated_at = NOW()
        WHERE user_address = $1
      `, [userAddress, data.amount]);

      // Update hourly activity
      await this.updateHourlyActivity(timestamp, 'bets_placed', 1);

      console.log(`📊 Collected bet placed data for ${userAddress}`);
    } catch (error) {
      console.error('❌ Failed to handle bet placed:', error);
    }
  }

  /**
   * Handle social interaction activity
   */
  async handleSocialInteraction(userAddress, data, timestamp) {
    try {
      const { interactionType } = data;
      
      let updateField = '';
      switch (interactionType) {
        case 'comment':
          updateField = 'total_comments';
          break;
        case 'discussion':
          updateField = 'total_discussions';
          break;
        case 'reply':
          updateField = 'total_replies';
          break;
        case 'reaction_given':
          updateField = 'total_reactions_given';
          break;
        case 'reaction_received':
          updateField = 'total_reactions_received';
          break;
        case 'reflection':
          updateField = 'total_reflections';
          break;
        default:
          return;
      }

      await db.query(`
        INSERT INTO analytics.user_social_stats (
          user_address, ${updateField}, social_score, created_at, updated_at
        ) VALUES ($1, 1, 10, NOW(), NOW())
        ON CONFLICT (user_address) DO UPDATE SET
          ${updateField} = analytics.user_social_stats.${updateField} + 1,
          social_score = analytics.user_social_stats.social_score + 10,
          updated_at = NOW()
      `, [userAddress]);

      console.log(`📊 Collected social interaction data for ${userAddress}`);
    } catch (error) {
      console.error('❌ Failed to handle social interaction:', error);
    }
  }

  /**
   * Handle staking activity
   */
  async handleStakingActivity(userAddress, data, timestamp) {
    try {
      await db.query(`
        INSERT INTO analytics.staking_events (
          user_address, event_type, amount, transaction_hash, block_number,
          timestamp, additional_data, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        userAddress, data.eventType, data.amount, data.txHash,
        data.blockNumber, timestamp, JSON.stringify(data.additionalData || {})
      ]);

      console.log(`📊 Collected staking activity data for ${userAddress}`);
    } catch (error) {
      console.error('❌ Failed to handle staking activity:', error);
    }
  }

  /**
   * Update hourly activity
   */
  async updateHourlyActivity(timestamp, field, increment) {
    try {
      const hour = new Date(timestamp);
      hour.setMinutes(0, 0, 0);

      await db.query(`
        INSERT INTO analytics.hourly_activity (
          date_hour, ${field}, created_at
        ) VALUES ($1, $2, NOW())
        ON CONFLICT (date_hour) DO UPDATE SET
          ${field} = analytics.hourly_activity.${field} + $2
      `, [hour, increment]);
    } catch (error) {
      console.error('❌ Failed to update hourly activity:', error);
    }
  }

  /**
   * Update daily stats
   */
  async updateDailyStats(timestamp, field, increment) {
    try {
      const date = new Date(timestamp).toISOString().split('T')[0];

      await db.query(`
        INSERT INTO analytics.daily_stats (
          date, ${field}, created_at
        ) VALUES ($1, $2, NOW())
        ON CONFLICT (date) DO UPDATE SET
          ${field} = analytics.daily_stats.${field} + $2
      `, [date, increment]);
    } catch (error) {
      console.error('❌ Failed to update daily stats:', error);
    }
  }

  /**
   * Update market analytics
   */
  async updateMarketAnalytics(fixtureId, marketType, betType, increment) {
    try {
      await db.query(`
        INSERT INTO analytics.market_analytics (
          fixture_id, market_type, total_bets, ${betType}, created_at, updated_at
        ) VALUES ($1, $2, $3, $3, NOW(), NOW())
        ON CONFLICT (fixture_id, market_type) DO UPDATE SET
          total_bets = analytics.market_analytics.total_bets + $3,
          ${betType} = analytics.market_analytics.${betType} + $3,
          updated_at = NOW()
      `, [fixtureId, marketType, increment]);
    } catch (error) {
      console.error('❌ Failed to update market analytics:', error);
    }
  }

  /**
   * Update category stats
   */
  async updateCategoryStats(category, data) {
    try {
      const today = new Date().toISOString().split('T')[0];

      await db.query(`
        INSERT INTO analytics.category_stats (
          category, date, total_pools, total_volume, avg_odds, win_rate, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (category, date) DO UPDATE SET
          total_pools = analytics.category_stats.total_pools + $3,
          total_volume = analytics.category_stats.total_volume + $4,
          avg_odds = (analytics.category_stats.avg_odds + $5) / 2,
          win_rate = (analytics.category_stats.win_rate + $6) / 2
      `, [category, today, data.pools || 1, data.volume || 0, data.avgOdds || 0, data.winRate || 0]);
    } catch (error) {
      console.error('❌ Failed to update category stats:', error);
    }
  }
}

module.exports = AnalyticsDataCollector;
