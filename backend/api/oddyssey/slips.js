/**
 * Oddyssey Slips API Endpoints
 * 
 * Handles fetching user slips from the database
 */

const express = require('express');
const router = express.Router();
const db = require('../../db/db');

/**
 * Decode prediction hashes to human-readable text
 */
function decodePredictionHash(betType, selectionHash) {
  // Known hash mappings from contract
  const hashMappings = {
    // Moneyline (1X2) hashes
    '0x09492a13c7e2353fdb9d678856a01eb3a777f03982867b5ce379154825ae0e62': '1', // Home win
    '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6': 'X', // Draw
    '0xad7c5bef027816a800da1736444fb58a807ef4c9603b7848673f7e3a68eb14a5': '2', // Away win
    '0x550c64a15031c3064454c19adc6243a6122c138a242eaa098da50bb114fc8d56': '2', // Alternative Away win
    
    // Over/Under hashes
    '0x09492a13c7e2353fdb9d678856a01eb3a777f03982867b5ce379154825ae0e62': 'Over', // Over (context-dependent)
    '0xe5f3458d553c578199ad9150ab9a1cce5e22e9b34834f66492b28636da59e11b': 'Under' // Under
  };

  // Handle ambiguous hash that can be both Home win or Over
  if (selectionHash === '0x09492a13c7e2353fdb9d678856a01eb3a777f03982867b5ce379154825ae0e62') {
    return (betType === '0' || betType === 'MONEYLINE') ? '1' : 'Over';
  }

  // Direct hash lookup
  if (hashMappings[selectionHash]) {
    return hashMappings[selectionHash];
  }

  // Fallback
  return 'Unknown';
}

/**
 * Enrich predictions with human-readable text and evaluation results
 */
async function enrichPredictions(predictions, cycleId, isEvaluated) {
  if (!predictions || !Array.isArray(predictions)) {
    return [];
  }

  // Get cycle match results if the slip is evaluated
  let cycleResults = null;
  if (isEvaluated && cycleId) {
    try {
      const cycleQuery = `
        SELECT matches_data FROM oracle.current_oddyssey_cycle 
        WHERE cycle_id = $1 AND is_resolved = true
      `;
      const cycleResult = await db.query(cycleQuery, [cycleId]);
      if (cycleResult.rows.length > 0) {
        cycleResults = cycleResult.rows[0].matches_data;
      }
    } catch (error) {
      console.error('Error fetching cycle results:', error);
    }
  }

  return predictions.map(pred => {
    const decodedSelection = decodePredictionHash(pred.betType, pred.selection);
    
    // Convert to human-readable format
    let predictionText = 'Unknown';
    if (pred.betType === '0' || pred.betType === 'MONEYLINE') {
      // Moneyline
      if (decodedSelection === '1') predictionText = 'Home Win';
      else if (decodedSelection === 'X') predictionText = 'Draw';
      else if (decodedSelection === '2') predictionText = 'Away Win';
    } else if (pred.betType === '1' || pred.betType === 'OVER_UNDER') {
      // Over/Under
      if (decodedSelection === 'Over') predictionText = 'Over 2.5';
      else if (decodedSelection === 'Under') predictionText = 'Under 2.5';
    }

    // Add evaluation result if available
    let isCorrect = null;
    let actualResult = null;
    
    if (isEvaluated && cycleResults) {
      const matchResult = cycleResults.find(match => match.id === pred.matchId);
      if (matchResult && matchResult.result) {
        if (pred.betType === '0' || pred.betType === 'MONEYLINE') {
          // Moneyline prediction
          actualResult = matchResult.result.moneyline;
          const actualText = actualResult === 1 ? '1' : actualResult === 2 ? 'X' : actualResult === 3 ? '2' : null;
          isCorrect = decodedSelection === actualText;
        } else if (pred.betType === '1' || pred.betType === 'OVER_UNDER') {
          // Over/Under prediction  
          actualResult = matchResult.result.overUnder;
          const actualText = actualResult === 1 ? 'Over' : actualResult === 2 ? 'Under' : null;
          isCorrect = decodedSelection === actualText;
        }
      }
    }

    return {
      ...pred,
      // FIXED: Provide correct field names for frontend
      match_id: pred.matchId,
      matchId: pred.matchId,
      id: pred.matchId,
      prediction: decodedSelection,
      selection: decodedSelection,
      betType: pred.betType,
      // FIXED: Convert odds from scaled format (1850) to decimal (1.85) but keep original for backend processing
      odds: pred.selectedOdd,
      selectedOdd: pred.selectedOdd,
      odd: pred.selectedOdd,
      decodedSelection,
      predictionText,
      marketType: pred.betType === '0' ? 'Moneyline' : 'Over/Under 2.5',
      isCorrect,
      actualResult
    };
  });
}

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
    const transformedSlips = await Promise.all(slips.map(async slip => {
      const rawPredictions = typeof slip.predictions === 'string' ? JSON.parse(slip.predictions) : slip.predictions;
      const enrichedPredictions = await enrichPredictions(rawPredictions, slip.cycle_id, slip.is_evaluated);
      
      // Parse evaluation data if available
      let evaluationData = {};
      if (slip.evaluation_data) {
        try {
          evaluationData = typeof slip.evaluation_data === 'string' 
            ? JSON.parse(slip.evaluation_data) 
            : slip.evaluation_data;
        } catch (error) {
          console.error('Error parsing evaluation_data:', error);
        }
      }
      
      // Enhance predictions with evaluation results
      const enhancedPredictions = enrichedPredictions.map((pred, index) => {
        const evalData = evaluationData[index] || {};
        return {
          ...pred,
          // Add evaluation results from evaluation_data
          isCorrect: evalData.isCorrect || null,
          actualResult: evalData.actualResult || null,
          matchResult: {
            homeScore: evalData.homeScore || null,
            awayScore: evalData.awayScore || null,
            result: evalData.matchResult || null,
            status: 'finished'
          }
        };
      });
      
      return {
        slip_id: slip.slip_id,
        cycle_id: slip.cycle_id,
        player_address: slip.player_address,
        placed_at: slip.placed_at,
        predictions: enhancedPredictions,
        final_score: parseFloat(slip.final_score || 0),
        correct_count: slip.correct_count || 0,
        is_evaluated: slip.is_evaluated,
        leaderboard_rank: slip.leaderboard_rank,
        prize_claimed: slip.prize_claimed,
        tx_hash: slip.tx_hash,
        total_odds: slip.odds,
        status: slip.is_evaluated ? 'Evaluated' : 'Pending Evaluation',
        cycle: {
          cycleId: slip.cycle_id,
          startTime: slip.cycle_start_time,
          endTime: slip.cycle_end_time,
          prizePool: slip.prize_pool,
          isResolved: slip.cycle_resolved
        }
      };
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
