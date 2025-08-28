#!/usr/bin/env node

/**
 * Odyssey Analytics Service
 * Tracks user predictions, calculates accuracy, and manages prize pools
 */

require('dotenv').config();
const db = require('../db/db');

class OddysseyAnalyticsService {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🚀 Oddyssey Analytics Service started');
  }

  async stop() {
    this.isRunning = false;
    console.log('🛑 Oddyssey Analytics Service stopped');
  }

  /**
   * Update prize pool for a cycle
   */
  async updateCyclePrizePool(cycleId, prizePool) {
    try {
      await db.query(`
        UPDATE oracle.oddyssey_cycles 
        SET prize_pool = $1, updated_at = NOW()
        WHERE cycle_id = $2
      `, [prizePool, cycleId]);
      
      console.log(`✅ Updated prize pool for cycle ${cycleId}: ${prizePool}`);
    } catch (error) {
      console.error(`❌ Failed to update prize pool for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate and store user analytics for a cycle
   */
  async calculateCycleAnalytics(cycleId) {
    try {
      console.log(`📊 Calculating analytics for cycle ${cycleId}...`);

      // Get all slips for this cycle
      const slipsResult = await db.query(`
        SELECT 
          player_address,
          COUNT(*) as slips_count,
          SUM(correct_count) as total_correct,
          SUM(JSONB_ARRAY_LENGTH(predictions)) as total_predictions
        FROM oracle.oddyssey_slips 
        WHERE cycle_id = $1 AND is_evaluated = true
        GROUP BY player_address
      `, [cycleId]);

      // Process each user's analytics
      for (const userData of slipsResult.rows) {
        const accuracyPercentage = userData.total_predictions > 0 
          ? (userData.total_correct / userData.total_predictions * 100).toFixed(2)
          : 0;

        // Insert or update cycle analytics
        await db.query(`
          INSERT INTO oracle.oddyssey_user_analytics 
            (user_address, cycle_id, slips_count, correct_predictions, total_predictions, accuracy_percentage)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (user_address, cycle_id) DO UPDATE SET
            slips_count = EXCLUDED.slips_count,
            correct_predictions = EXCLUDED.correct_predictions,
            total_predictions = EXCLUDED.total_predictions,
            accuracy_percentage = EXCLUDED.accuracy_percentage,
            updated_at = NOW()
        `, [
          userData.player_address,
          cycleId,
          userData.slips_count,
          userData.total_correct,
          userData.total_predictions,
          accuracyPercentage
        ]);

        // Update cumulative stats
        await this.updateCumulativeStats(userData.player_address);
      }

      console.log(`✅ Analytics calculated for cycle ${cycleId} (${slipsResult.rows.length} users)`);
    } catch (error) {
      console.error(`❌ Failed to calculate analytics for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Update cumulative stats for a user
   */
  async updateCumulativeStats(userAddress) {
    try {
      // Get all analytics for this user
      const analyticsResult = await db.query(`
        SELECT 
          SUM(slips_count) as total_slips,
          SUM(correct_predictions) as total_correct,
          SUM(total_predictions) as total_predictions,
          COUNT(DISTINCT cycle_id) as cycles_participated,
          MAX(accuracy_percentage) as best_cycle_accuracy
        FROM oracle.oddyssey_user_analytics 
        WHERE user_address = $1
      `, [userAddress]);

      const data = analyticsResult.rows[0];
      const overallAccuracy = data.total_predictions > 0 
        ? (data.total_correct / data.total_predictions * 100).toFixed(2)
        : 0;

      // Get best cycle ID
      const bestCycleResult = await db.query(`
        SELECT cycle_id 
        FROM oracle.oddyssey_user_analytics 
        WHERE user_address = $1 
        ORDER BY accuracy_percentage DESC 
        LIMIT 1
      `, [userAddress]);

      const bestCycleId = bestCycleResult.rows[0]?.cycle_id || null;

      // Get total prizes won
      const prizesResult = await db.query(`
        SELECT COALESCE(SUM(amount), 0) as total_prizes
        FROM oracle.oddyssey_prize_claims 
        WHERE player_address = $1
      `, [userAddress]);

      // Insert or update cumulative stats
      await db.query(`
        INSERT INTO oracle.oddyssey_cumulative_stats 
          (user_address, total_slips, total_correct_predictions, total_predictions, 
           overall_accuracy_percentage, best_cycle_accuracy, best_cycle_id, 
           total_prizes_won, cycles_participated)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_address) DO UPDATE SET
          total_slips = EXCLUDED.total_slips,
          total_correct_predictions = EXCLUDED.total_correct_predictions,
          total_predictions = EXCLUDED.total_predictions,
          overall_accuracy_percentage = EXCLUDED.overall_accuracy_percentage,
          best_cycle_accuracy = EXCLUDED.best_cycle_accuracy,
          best_cycle_id = EXCLUDED.best_cycle_id,
          total_prizes_won = EXCLUDED.total_prizes_won,
          cycles_participated = EXCLUDED.cycles_participated,
          updated_at = NOW()
      `, [
        userAddress,
        data.total_slips || 0,
        data.total_correct || 0,
        data.total_predictions || 0,
        overallAccuracy,
        data.best_cycle_accuracy || 0,
        bestCycleId,
        prizesResult.rows[0].total_prizes || 0,
        data.cycles_participated || 0
      ]);

    } catch (error) {
      console.error(`❌ Failed to update cumulative stats for ${userAddress}:`, error);
      throw error;
    }
  }

  /**
   * Get user analytics for a specific cycle
   */
  async getUserCycleAnalytics(userAddress, cycleId) {
    try {
      const result = await db.query(`
        SELECT * FROM oracle.oddyssey_user_analytics 
        WHERE user_address = $1 AND cycle_id = $2
      `, [userAddress, cycleId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error(`❌ Failed to get user cycle analytics:`, error);
      throw error;
    }
  }

  /**
   * Get cumulative stats for a user
   */
  async getUserCumulativeStats(userAddress) {
    try {
      const result = await db.query(`
        SELECT * FROM oracle.oddyssey_cumulative_stats 
        WHERE user_address = $1
      `, [userAddress]);

      return result.rows[0] || null;
    } catch (error) {
      console.error(`❌ Failed to get user cumulative stats:`, error);
      throw error;
    }
  }

  /**
   * Get leaderboard for a cycle
   */
  async getCycleLeaderboard(cycleId, limit = 50) {
    try {
      const result = await db.query(`
        SELECT 
          ua.user_address,
          ua.slips_count,
          ua.correct_predictions,
          ua.total_predictions,
          ua.accuracy_percentage,
          ROW_NUMBER() OVER (ORDER BY ua.accuracy_percentage DESC, ua.correct_predictions DESC) as rank
        FROM oracle.oddyssey_user_analytics ua
        WHERE ua.cycle_id = $1
        ORDER BY ua.accuracy_percentage DESC, ua.correct_predictions DESC
        LIMIT $2
      `, [cycleId, limit]);

      return result.rows;
    } catch (error) {
      console.error(`❌ Failed to get cycle leaderboard:`, error);
      throw error;
    }
  }

  /**
   * Get global leaderboard
   */
  async getGlobalLeaderboard(limit = 50) {
    try {
      const result = await db.query(`
        SELECT 
          cs.user_address,
          cs.total_slips,
          cs.total_correct_predictions,
          cs.total_predictions,
          cs.overall_accuracy_percentage,
          cs.total_prizes_won,
          cs.cycles_participated,
          ROW_NUMBER() OVER (ORDER BY cs.overall_accuracy_percentage DESC, cs.total_correct_predictions DESC) as rank
        FROM oracle.oddyssey_cumulative_stats cs
        WHERE cs.total_slips > 0
        ORDER BY cs.overall_accuracy_percentage DESC, cs.total_correct_predictions DESC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      console.error(`❌ Failed to get global leaderboard:`, error);
      throw error;
    }
  }

  /**
   * Get cycle statistics
   */
  async getCycleStats(cycleId) {
    try {
      const result = await db.query(`
        SELECT 
          oc.cycle_id,
          oc.prize_pool,
          oc.matches_count,
          oc.is_resolved,
          oc.resolved_at,
          COUNT(DISTINCT os.player_address) as participants,
          COUNT(os.slip_id) as total_slips,
          AVG(os.correct_count) as avg_correct_predictions,
          MAX(os.correct_count) as max_correct_predictions
        FROM oracle.oddyssey_cycles oc
        LEFT JOIN oracle.oddyssey_slips os ON oc.cycle_id = os.cycle_id
        WHERE oc.cycle_id = $1
        GROUP BY oc.cycle_id, oc.prize_pool, oc.matches_count, oc.is_resolved, oc.resolved_at
      `, [cycleId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error(`❌ Failed to get cycle stats:`, error);
      throw error;
    }
  }

  /**
   * Process all cycles and update analytics
   */
  async processAllCycles() {
    try {
      console.log('🔄 Processing analytics for all cycles...');

      // Get all resolved cycles
      const cyclesResult = await db.query(`
        SELECT cycle_id FROM oracle.oddyssey_cycles 
        WHERE is_resolved = true 
        ORDER BY cycle_id
      `);

      for (const cycle of cyclesResult.rows) {
        await this.calculateCycleAnalytics(cycle.cycle_id);
      }

      console.log(`✅ Processed analytics for ${cyclesResult.rows.length} cycles`);
    } catch (error) {
      console.error('❌ Failed to process all cycles:', error);
      throw error;
    }
  }

  /**
   * Get analytics summary
   */
  async getAnalyticsSummary() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(DISTINCT oc.cycle_id) as total_cycles,
          COUNT(DISTINCT os.player_address) as total_users,
          COUNT(os.slip_id) as total_slips,
          AVG(os.correct_count) as avg_correct_predictions,
          SUM(oc.prize_pool) as total_prize_pools
        FROM oracle.oddyssey_cycles oc
        LEFT JOIN oracle.oddyssey_slips os ON oc.cycle_id = os.cycle_id
        WHERE oc.is_resolved = true
      `);

      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Failed to get analytics summary:', error);
      throw error;
    }
  }
}

module.exports = OddysseyAnalyticsService;
