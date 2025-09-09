/**
 * Oddyssey Slips API Endpoints
 * 
 * Handles fetching user slips from the database
 */

const express = require('express');
const router = express.Router();
const db = require('../../db/db');

/**
 * GET /api/oddyssey/slips/:address
 * Get all slips for a specific user address
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 50, startDate, endDate } = req.query;

    console.log(`🎯 Fetching slips for address: ${address}`);

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Address parameter is required'
      });
    }

    // Build the query with optional date filtering
    let query = `
      SELECT 
        s.slip_id,
        s.cycle_id,
        s.player_address,
        s.placed_at,
        s.predictions,
        s.final_score,
        s.correct_count,
        s.is_evaluated,
        s.leaderboard_rank,
        s.prize_claimed,
        s.tx_hash,
        s.transaction_hash,
        s.creator_address,
        s.category,
        s.uses_bitr,
        s.creator_stake,
        s.odds,
        s.evaluation_data,
        s.evaluated_at,
        c.cycle_start_time,
        c.cycle_end_time,
        c.prize_pool,
        c.is_resolved as cycle_resolved
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      WHERE LOWER(s.player_address) = LOWER($1)
    `;

    const params = [address];
    let paramIndex = 2;

    // Add date filtering if provided
    if (startDate) {
      query += ` AND s.placed_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND s.placed_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    // Order by most recent first and apply limit
    query += ` ORDER BY s.placed_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    console.log(`📊 Executing query with params:`, params);

    const result = await db.query(query, params);
    const slips = result.rows;

    console.log(`✅ Found ${slips.length} slips for address ${address}`);

    // Transform the data to match frontend expectations
    const transformedSlips = slips.map(slip => ({
      slipId: slip.slip_id,
      cycleId: slip.cycle_id,
      playerAddress: slip.player_address,
      placedAt: slip.placed_at,
      predictions: typeof slip.predictions === 'string' ? JSON.parse(slip.predictions) : slip.predictions,
      score: parseFloat(slip.final_score || 0),
      isEvaluated: slip.is_evaluated,
      evaluatedAt: slip.evaluated_at,
      rank: slip.rank,
      prizeAmount: slip.prize_amount,
      isClaimed: slip.is_claimed,
      claimedAt: slip.claimed_at,
      cycle: {
        cycleId: slip.cycle_id,
        startTime: slip.cycle_start_time,
        endTime: slip.cycle_end_time,
        entryFee: slip.entry_fee,
        prizePool: slip.prize_pool,
        isResolved: slip.cycle_resolved
      }
    }));

    res.json({
      success: true,
      data: transformedSlips,
      total: slips.length,
      message: 'Slips fetched successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching user slips:', error);
    res.status(500).json({
      success: false,
      data: [],
      message: 'Failed to fetch user slips',
      error: error.message
    });
  }
});

/**
 * GET /api/oddyssey/slips/:cycleId/:address
 * Get slips for a specific user in a specific cycle
 */
router.get('/:cycleId/:address', async (req, res) => {
  try {
    const { cycleId, address } = req.params;

    console.log(`🎯 Fetching slips for cycle ${cycleId} and address: ${address}`);

    const query = `
      SELECT 
        s.*,
        c.start_time as cycle_start_time,
        c.end_time as cycle_end_time,
        c.entry_fee,
        c.prize_pool,
        c.is_resolved as cycle_resolved
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      WHERE s.cycle_id = $1 AND LOWER(s.player_address) = LOWER($2)
      ORDER BY s.placed_at DESC
    `;

    const result = await db.query(query, [cycleId, address]);
    const slips = result.rows;

    console.log(`✅ Found ${slips.length} slips for cycle ${cycleId} and address ${address}`);

    // Transform the data
    const transformedSlips = slips.map(slip => ({
      slipId: slip.slip_id,
      cycleId: slip.cycle_id,
      playerAddress: slip.player_address,
      placedAt: slip.placed_at,
      predictions: typeof slip.predictions === 'string' ? JSON.parse(slip.predictions) : slip.predictions,
      score: parseFloat(slip.final_score || 0),
      isEvaluated: slip.is_evaluated,
      evaluatedAt: slip.evaluated_at,
      rank: slip.rank,
      prizeAmount: slip.prize_amount,
      isClaimed: slip.is_claimed,
      claimedAt: slip.claimed_at
    }));

    res.json({
      success: true,
      data: transformedSlips,
      total: slips.length,
      message: 'Cycle slips fetched successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching cycle slips:', error);
    res.status(500).json({
      success: false,
      data: [],
      message: 'Failed to fetch cycle slips',
      error: error.message
    });
  }
});

module.exports = router;
