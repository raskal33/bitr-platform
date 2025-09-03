// Fixed user slips endpoint with proper enrichment
const express = require('express');
const db = require('../db/db');
const { asyncHandler } = require('../utils/validation');

const router = express.Router();

// FIXED: Get user's slips with proper team names and odds
router.get('/user-slips/:address/evaluated', asyncHandler(async (req, res) => {
  try {
    const { address } = req.params;
    
    // Get all user slips with evaluation data
    const slipsResult = await db.query(`
      SELECT 
        s.slip_id,
        s.cycle_id,
        s.player_address,
        s.predictions,
        s.is_evaluated,
        s.evaluation_data,
        s.final_score,
        s.correct_count,
        s.placed_at as created_at
      FROM oracle.oddyssey_slips s
      WHERE s.player_address = $1
      ORDER BY s.placed_at DESC
      LIMIT 50
    `, [address]);
    
    const evaluatedSlips = await Promise.all(slipsResult.rows.map(async slip => {
      const predictions = slip.predictions || [];
      const evaluationData = slip.evaluation_data || {};
      
      // Calculate total odds from predictions and enrich with team names
      let totalOdds = 1;
      const processedPredictions = await Promise.all(predictions.map(async (pred, index) => {
        const evaluation = evaluationData[index] || {};
        
        // Handle different prediction formats
        let matchId, prediction, odds;
        if (Array.isArray(pred)) {
          // Format: [fixture_id, bet_type, selection_hash, odds]
          [matchId, , , odds] = pred;
          prediction = evaluation.predictedResult || 'Unknown';
          odds = parseFloat(odds) / 1000; // Convert from scaled format
        } else if (typeof pred === 'object') {
          // Format: {matchId, betType, selection, selectedOdd, odds}
          matchId = pred.matchId;
          prediction = evaluation.predictedResult || pred.selection || pred.prediction;
          odds = pred.selectedOdd || pred.odds;
          if (typeof odds === 'string') {
            odds = parseFloat(odds) / 1000; // Convert from scaled format if string
          }
        }
        
        // Get fixture details for team names
        let fixtureData = {};
        try {
          const fixtureResult = await db.query(`
            SELECT id, home_team, away_team, league_name, starting_at
            FROM oracle.fixtures 
            WHERE id = $1::text
          `, [matchId]);
          
          if (fixtureResult.rows.length > 0) {
            const fixture = fixtureResult.rows[0];
            fixtureData = {
              home_team: fixture.home_team,
              away_team: fixture.away_team,
              team1: fixture.home_team,
              team2: fixture.away_team,
              league_name: fixture.league_name,
              match_date: fixture.starting_at,
              match_time: fixture.starting_at ? new Date(fixture.starting_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '00:00'
            };
          } else {
            // Fallback if fixture not found
            fixtureData = {
              home_team: `Home Team ${matchId}`,
              away_team: `Away Team ${matchId}`,
              team1: `Home Team ${matchId}`,
              team2: `Away Team ${matchId}`,
              league_name: 'Unknown League',
              match_date: 'Unknown Date',
              match_time: '00:00'
            };
          }
        } catch (error) {
          console.error(`Error fetching fixture ${matchId}:`, error);
          fixtureData = {
            home_team: `Home Team ${matchId}`,
            away_team: `Away Team ${matchId}`,
            team1: `Home Team ${matchId}`,
            team2: `Away Team ${matchId}`,
            league_name: 'Unknown League',
            match_date: 'Unknown Date',
            match_time: '00:00'
          };
        }
        
        // Convert odds to number and multiply for total odds
        if (odds && typeof odds === 'number' && odds > 0) {
          totalOdds *= odds;
        }
        
        return {
          matchId: matchId,
          match_id: matchId,
          prediction: prediction,
          pick: prediction,
          selection: prediction,
          odds: odds || 0,
          odd: odds || 0,
          selectedOdd: odds || 0,
          isCorrect: evaluation.isCorrect,
          actualResult: evaluation.actualResult,
          matchResult: evaluation.matchResult,
          homeScore: evaluation.homeScore,
          awayScore: evaluation.awayScore,
          betType: evaluation.betType,
          ...fixtureData
        };
      }));
      
      return {
        slipId: slip.slip_id,
        cycleId: slip.cycle_id,
        isEvaluated: slip.is_evaluated,
        finalScore: slip.final_score || 0,
        correctCount: slip.correct_count || 0,
        createdAt: slip.created_at,
        totalOdds: totalOdds > 1 ? totalOdds : 0, // Return 0 if no valid odds
        predictions: processedPredictions
      };
    }));
    
    res.json({
      success: true,
      data: evaluatedSlips
    });
    
  } catch (error) {
    console.error('❌ Error getting user slips with evaluation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user slips with evaluation',
      message: error.message
    });
  }
}));

module.exports = router;
