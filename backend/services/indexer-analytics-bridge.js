#!/usr/bin/env node

/**
 * Indexer Analytics Bridge
 * Connects existing indexers with new analytics tables
 * Prevents conflicts and ensures data consistency
 */

require('dotenv').config();
const db = require('../db/db');

class IndexerAnalyticsBridge {
  constructor() {
    this.isRunning = false;
    this.analyticsCollector = null;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🌉 Indexer Analytics Bridge started');
    
    // Initialize analytics data collector
    const AnalyticsDataCollector = require('./analytics-data-collector');
    this.analyticsCollector = new AnalyticsDataCollector();
    await this.analyticsCollector.start();
  }

  async stop() {
    this.isRunning = false;
    if (this.analyticsCollector) {
      await this.analyticsCollector.stop();
    }
    console.log('🛑 Indexer Analytics Bridge stopped');
  }

  /**
   * Bridge airdrop indexer data to analytics
   */
  async bridgeAirdropData() {
    try {
      console.log('🔄 Bridging airdrop indexer data to analytics...');

      // Get airdrop activities and convert to analytics format
      const airdropActivities = await db.query(`
        SELECT 
          user_address, activity_type, amount, transaction_hash, 
          block_number, timestamp, created_at
        FROM airdrop.bitr_activities
        WHERE created_at >= NOW() - INTERVAL '1 hour'
        ORDER BY created_at DESC
      `);

      for (const activity of airdropActivities.rows) {
        // Convert airdrop activity to analytics staking events
        if (['stake', 'unstake', 'claim_rewards'].includes(activity.activity_type)) {
          await this.analyticsCollector.collectUserActivity(
            activity.user_address,
            'staking_activity',
            {
              eventType: activity.activity_type,
              amount: activity.amount,
              txHash: activity.transaction_hash,
              blockNumber: activity.block_number,
              additionalData: { source: 'airdrop_indexer' }
            }
          );
        }
      }

      // Update user analytics from airdrop data
      await this.updateUserAnalyticsFromAirdrop();

      console.log(`✅ Bridged ${airdropActivities.rows.length} airdrop activities to analytics`);
    } catch (error) {
      console.error('❌ Failed to bridge airdrop data:', error);
    }
  }

  /**
   * Bridge pool indexer data to analytics
   */
  async bridgePoolData() {
    try {
      console.log('🔄 Bridging pool indexer data to analytics...');

      // Get recent pool data from oracle schema
      const poolData = await db.query(`
        SELECT 
          p.pool_id, p.creator_address, p.predicted_outcome, p.odds, p.creator_stake,
          p.market_id, p.oracle_type, p.event_start_time, p.event_end_time,
          p.status, p.created_at, p.tx_hash, p.block_number
        FROM oracle.pools p
        WHERE p.created_at >= NOW() - INTERVAL '1 hour'
        ORDER BY p.created_at DESC
      `);

      for (const pool of poolData.rows) {
        // Convert oracle pool data to analytics format
        await db.query(`
          INSERT INTO analytics.pools (
            pool_id, creator_address, odds, is_settled, creator_side_won,
            is_private, uses_bitr, oracle_type, market_id, predicted_outcome,
            actual_result, creator_stake, total_creator_side_stake, total_bettor_stake,
            max_bettor_stake, event_start_time, event_end_time, betting_end_time,
            created_at, settled_at, category, league, region
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
          ON CONFLICT (pool_id) DO UPDATE SET
            is_settled = EXCLUDED.is_settled,
            creator_side_won = EXCLUDED.creator_side_won,
            actual_result = EXCLUDED.actual_result,
            total_bettor_stake = EXCLUDED.total_bettor_stake,
            event_end_time = EXCLUDED.event_end_time,
            settled_at = EXCLUDED.settled_at
        `, [
          pool.pool_id, pool.creator_address, pool.odds || 200, 
          pool.status === 'settled', null, // creator_side_won
          false, // is_private
          true, // uses_bitr
          pool.oracle_type || 'oracle', pool.market_id, pool.predicted_outcome,
          pool.status === 'settled' ? 'pending' : 'pending', // actual_result
          pool.creator_stake || 0, pool.creator_stake || 0, 0, // total_bettor_stake
          1000, // max_bettor_stake
          pool.event_start_time, pool.event_end_time, pool.event_end_time,
          pool.created_at, pool.status === 'settled' ? pool.created_at : null,
          'football', 'Premier League', 'Europe'
        ]);

        // Collect pool creation activity
        await this.analyticsCollector.collectUserActivity(
          pool.creator_address,
          'pool_created',
          {
            poolId: pool.pool_id,
            odds: pool.odds || 200,
            creatorStake: pool.creator_stake || 0,
            maxBettorStake: 1000,
            isPrivate: false,
            oracleType: pool.oracle_type || 'oracle',
            marketId: pool.market_id,
            predictedOutcome: pool.predicted_outcome,
            eventStartTime: pool.event_start_time,
            bettingEndTime: pool.event_end_time,
            category: 'football',
            league: 'Premier League',
            region: 'Europe'
          }
        );
      }

      console.log(`✅ Bridged ${poolData.rows.length} pools to analytics`);
    } catch (error) {
      console.error('❌ Failed to bridge pool data:', error);
    }
  }

  /**
   * Bridge user stats to analytics
   */
  async bridgeUserStats() {
    try {
      console.log('🔄 Bridging user stats to analytics...');

      // Get user stats from oracle schema
      const userStats = await db.query(`
        SELECT 
          user_address, total_bets, total_bet_amount, total_liquidity, 
          total_liquidity_amount, last_activity
        FROM oracle.user_stats
        WHERE last_activity >= NOW() - INTERVAL '1 hour'
        ORDER BY last_activity DESC
      `);

      for (const user of userStats.rows) {
        // Update analytics user data
        await db.query(`
          INSERT INTO analytics.user_analytics (
            user_address, total_bets, winning_bets, total_staked, 
            total_won, win_rate, avg_odds, created_at, updated_at
          ) VALUES ($1, $2, 0, $3, 0, 0, 0, NOW(), NOW())
          ON CONFLICT (user_address) DO UPDATE SET
            total_bets = EXCLUDED.total_bets,
            total_staked = EXCLUDED.total_staked,
            updated_at = NOW()
        `, [
          user.user_address, 
          user.total_bets || 0, 
          (user.total_bet_amount || 0) + (user.total_liquidity_amount || 0)
        ]);
      }

      console.log(`✅ Bridged ${userStats.rows.length} user stats to analytics`);
    } catch (error) {
      console.error('❌ Failed to bridge user stats:', error);
    }
  }

  /**
   * Update user analytics from airdrop data
   */
  async updateUserAnalyticsFromAirdrop() {
    try {
      // Get users with recent airdrop activity
      const users = await db.query(`
        SELECT DISTINCT user_address
        FROM airdrop.bitr_activities
        WHERE created_at >= NOW() - INTERVAL '1 hour'
      `);

      for (const user of users.rows) {
        // Get user's airdrop activity summary
        const activitySummary = await db.query(`
          SELECT 
            COUNT(*) as total_activities,
            SUM(CASE WHEN activity_type IN ('stake', 'pool_bet') THEN amount ELSE 0 END) as total_staked,
            COUNT(CASE WHEN activity_type = 'pool_bet' THEN 1 END) as total_bets
          FROM airdrop.bitr_activities
          WHERE user_address = $1
        `, [user.user_address]);

        const summary = activitySummary.rows[0];

        // Update analytics
        await db.query(`
          INSERT INTO analytics.user_analytics (
            user_address, total_bets, winning_bets, total_staked, 
            total_won, win_rate, avg_odds, created_at, updated_at
          ) VALUES ($1, $2, 0, $3, 0, 0, 0, NOW(), NOW())
          ON CONFLICT (user_address) DO UPDATE SET
            total_bets = analytics.user_analytics.total_bets + $2,
            total_staked = analytics.user_analytics.total_staked + $3,
            updated_at = NOW()
        `, [user.user_address, summary.total_bets || 0, summary.total_staked || 0]);
      }
    } catch (error) {
      console.error('❌ Failed to update user analytics from airdrop:', error);
    }
  }

  /**
   * Process all indexer data bridges
   */
  async processAllBridges() {
    try {
      console.log('🔄 Processing all indexer bridges...');
      
      await Promise.all([
        this.bridgeAirdropData(),
        this.bridgePoolData(),
        this.bridgeUserStats()
      ]);

      console.log('✅ All indexer bridges processed');
    } catch (error) {
      console.error('❌ Failed to process indexer bridges:', error);
    }
  }

  /**
   * Get bridge status
   */
  async getBridgeStatus() {
    try {
      const [
        airdropCount,
        poolCount,
        userCount,
        analyticsCount
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM airdrop.bitr_activities WHERE created_at >= NOW() - INTERVAL \'1 hour\''),
        db.query('SELECT COUNT(*) as count FROM oracle.pools WHERE created_at >= NOW() - INTERVAL \'1 hour\''),
        db.query('SELECT COUNT(*) as count FROM oracle.user_stats WHERE last_activity >= NOW() - INTERVAL \'1 hour\''),
        db.query('SELECT COUNT(*) as count FROM analytics.user_analytics')
      ]);

      return {
        airdrop_activities: parseInt(airdropCount.rows[0].count),
        oracle_pools: parseInt(poolCount.rows[0].count),
        oracle_users: parseInt(userCount.rows[0].count),
        analytics_users: parseInt(analyticsCount.rows[0].count),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to get bridge status:', error);
      return null;
    }
  }
}

module.exports = IndexerAnalyticsBridge;
