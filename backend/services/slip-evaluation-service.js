const db = require('../db/db');

class SlipEvaluationService {
  constructor() {
    this.serviceName = 'SlipEvaluationService';
  }

  /**
   * Evaluate all slips for a resolved cycle
   */
  async evaluateCycleSlips(cycleId) {
    console.log(`🎯 ${this.serviceName}: Starting evaluation for cycle ${cycleId}`);
    
    try {
      // Check if cycle is resolved
      const cycleResult = await db.query(`
        SELECT cycle_id, is_resolved, matches_data
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = $1
      `, [cycleId]);
      
      if (cycleResult.rows.length === 0) {
        throw new Error(`Cycle ${cycleId} not found`);
      }
      
      const cycle = cycleResult.rows[0];
      if (!cycle.is_resolved) {
        throw new Error(`Cycle ${cycleId} is not resolved yet`);
      }
      
      // Get all slips for this cycle
      const slipsResult = await db.query(`
        SELECT slip_id, player_address, predictions, is_evaluated
        FROM oracle.oddyssey_slips 
        WHERE cycle_id = $1
        ORDER BY slip_id
      `, [cycleId]);
      
      if (slipsResult.rows.length === 0) {
        console.log(`⚠️ ${this.serviceName}: No slips found for cycle ${cycleId}`);
        return { evaluated: 0, total: 0 };
      }
      
      console.log(`📊 ${this.serviceName}: Found ${slipsResult.rows.length} slips to evaluate`);
      
      let evaluatedCount = 0;
      const matches = cycle.matches_data || [];
      
      // Create evaluation job record
      const jobResult = await db.query(`
        INSERT INTO oracle.slip_evaluation_jobs (cycle_id, status, total_slips, started_at)
        VALUES ($1, 'processing', $2, NOW())
        RETURNING id
      `, [cycleId, slipsResult.rows.length]);
      
      const jobId = jobResult.rows[0].id;
      
      for (const slip of slipsResult.rows) {
        try {
          if (slip.is_evaluated) {
            console.log(`⏭️ ${this.serviceName}: Slip ${slip.slip_id} already evaluated, skipping`);
            continue;
          }
          
          const evaluation = await this.evaluateSlip(slip, matches);
          
          // Update slip with evaluation results including detailed data
          await db.query(`
            UPDATE oracle.oddyssey_slips 
            SET 
              final_score = $1,
              correct_count = $2,
              evaluation_data = $3,
              is_evaluated = true
            WHERE slip_id = $4
          `, [evaluation.finalScore, evaluation.correctCount, JSON.stringify(evaluation.evaluationData), slip.slip_id]);
          
          console.log(`✅ ${this.serviceName}: Evaluated slip ${slip.slip_id} - Score: ${evaluation.finalScore}, Correct: ${evaluation.correctCount}`);
          evaluatedCount++;
          
        } catch (error) {
          console.error(`❌ ${this.serviceName}: Error evaluating slip ${slip.slip_id}:`, error.message);
        }
      }
      
      // Update leaderboard ranks
      await this.updateLeaderboardRanks(cycleId);
      
      // Update evaluation job status
      await db.query(`
        UPDATE oracle.slip_evaluation_jobs 
        SET 
          status = 'completed',
          processed_slips = $1,
          completed_at = NOW()
        WHERE id = $2
      `, [evaluatedCount, jobId]);
      
      console.log(`🎉 ${this.serviceName}: Completed evaluation for cycle ${cycleId} - ${evaluatedCount} slips evaluated`);
      
      return { evaluated: evaluatedCount, total: slipsResult.rows.length };
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error evaluating cycle ${cycleId}:`, error.message);
      throw error;
    }
  }

  /**
   * Evaluate a single slip
   */
  async evaluateSlip(slip, matches) {
    // Handle predictions that might be JSON string or already parsed array
    let predictions;
    if (typeof slip.predictions === 'string') {
      predictions = JSON.parse(slip.predictions || '[]');
    } else {
      predictions = slip.predictions || [];
    }
    
    let correctCount = 0;
    let finalScore = 1; // Start with 1 for multiplication
    const evaluationData = {};
    
    for (let i = 0; i < predictions.length; i++) {
      const prediction = predictions[i];
      const matchResult = await this.evaluatePrediction(prediction, matches);
      
      if (matchResult.correct) {
        correctCount++;
        // FIXED: Multiply odds correctly as per oddyssey.sol
        // Convert odds from scaled format (e.g., 2550 = 2.55) to decimal and multiply
        const oddsDecimal = parseFloat(matchResult.odds) / 1000;
        finalScore = finalScore * oddsDecimal;
      }
      
      // Store detailed evaluation data for each prediction
      evaluationData[i] = {
        isCorrect: matchResult.correct,
        actualResult: matchResult.actualResult,
        matchResult: matchResult.matchResult,
        homeScore: matchResult.homeScore,
        awayScore: matchResult.awayScore,
        score: matchResult.score,
        betType: matchResult.betType,
        predictedResult: matchResult.predictedResult,
        odds: matchResult.odds
      };
    }
    
    return {
      finalScore: correctCount > 0 ? Math.round(finalScore * 100) / 100 : 0, // Round to 2 decimal places, 0 if no correct predictions
      correctCount: correctCount,
      evaluationData: evaluationData
    };
  }

  /**
   * Evaluate a single prediction
   */
  async evaluatePrediction(prediction, matches) {
    // Handle different prediction formats
    let fixture_id, market, selection, odds;
    
    if (Array.isArray(prediction)) {
      // Format: [fixture_id, bet_type, selection_hash, odds]
      [fixture_id, market, , odds] = prediction;
      // Convert market type: "0" = 1X2, "1" = OU25
      const marketType = market === "0" ? "1X2" : market === "1" ? "OU25" : market;
      // Extract selection from hash or use default
      selection = this.extractSelectionFromHash(prediction[2], marketType);
    } else if (typeof prediction === 'object') {
      // Handle multiple object formats
      fixture_id = prediction.matchId;
      odds = prediction.selectedOdd || prediction.odds;
      
      // New format with readable betType and selection
      if (prediction.betType === 'MONEYLINE' || prediction.betType === 'OVER_UNDER') {
        market = prediction.betType === 'MONEYLINE' ? '1X2' : 'OU25';
        selection = prediction.selection || prediction.prediction;
      }
      // Legacy format with numeric betType
      else if (prediction.betType === "0" || prediction.betType === "1" || prediction.betType === 0 || prediction.betType === 1) {
        const marketType = (prediction.betType === "0" || prediction.betType === 0) ? "1X2" : "OU25";
        market = marketType;
        selection = this.extractSelectionFromHash(prediction.selection, marketType);
      }
      // Handle string betType
      else {
        const marketType = prediction.betType === "0" ? "1X2" : prediction.betType === "1" ? "OU25" : prediction.betType;
        market = marketType;
        selection = this.extractSelectionFromHash(prediction.selection, marketType);
      }
    } else {
      console.warn(`⚠️ Unknown prediction format:`, prediction);
      return { correct: false, score: 0, actualResult: 'Unknown', matchResult: 'Unknown', homeScore: 0, awayScore: 0, betType: 'Unknown', predictedResult: 'Unknown', odds: 0 };
    }
    
    // Find the match in cycle data
    const match = matches.find(m => m.id === fixture_id || m.id === parseInt(fixture_id));
    if (!match) {
      console.warn(`⚠️ Match ${fixture_id} not found in cycle data`);
      return { correct: false, score: 0 };
    }
    
    // Get actual result from fixture_results table (primary source)
    const fixtureResult = await db.query(`
      SELECT 
        home_score, 
        away_score, 
        result_1x2, 
        result_ou25,
        evaluation_status
      FROM oracle.fixture_results 
      WHERE fixture_id = $1::text
    `, [fixture_id]);
    
    if (fixtureResult.rows.length === 0) {
      // Fallback to fixtures table
      const fallbackResult = await db.query(`
        SELECT result_info
        FROM oracle.fixtures 
        WHERE id = $1::text
      `, [fixture_id]);
      
      if (fallbackResult.rows.length === 0 || !fallbackResult.rows[0].result_info) {
        console.warn(`⚠️ No result found for fixture ${fixture_id}`);
        return { correct: false, score: 0 };
      }
      
      const resultInfo = fallbackResult.rows[0].result_info;
      const homeScore = resultInfo.home_score || 0;
      const awayScore = resultInfo.away_score || 0;
      const actualResult1X2 = resultInfo.result_1x2;
      const actualResultOU25 = resultInfo.result_ou25;
      
      let isCorrect = false;
      let score = 0;
      let actualResult = '';
      
      if (market === '1X2' || market === "0") {
        // Moneyline prediction
        actualResult = actualResult1X2;
        isCorrect = selection === actualResult;
        score = isCorrect ? 10 : 0; // 10 points for correct moneyline
        
      } else if (market === 'OU25' || market === "1") {
        // Over/Under prediction
        actualResult = actualResultOU25;
        isCorrect = selection === actualResult;
        score = isCorrect ? 5 : 0; // 5 points for correct over/under
      }
      
      return { 
        correct: isCorrect, 
        score,
        actualResult: actualResult,
        matchResult: `${homeScore}-${awayScore}`,
        homeScore: homeScore,
        awayScore: awayScore,
        betType: market,
        predictedResult: selection,
        odds: odds
      };
    }
    
    // Use fixture_results data
    const result = fixtureResult.rows[0];
    const homeScore = result.home_score || 0;
    const awayScore = result.away_score || 0;
    
    let isCorrect = false;
    let score = 0;
    let actualResult = '';
    
    if (market === '1X2' || market === "0") {
      // Moneyline prediction
      actualResult = result.result_1x2;
      isCorrect = selection === actualResult;
      score = isCorrect ? 10 : 0; // 10 points for correct moneyline
      
    } else if (market === 'OU25' || market === "1") {
      // Over/Under prediction
      actualResult = result.result_ou25;
      isCorrect = selection === actualResult;
      score = isCorrect ? 5 : 0; // 5 points for correct over/under
    }
    
    return { 
      correct: isCorrect, 
      score,
      actualResult: actualResult,
      matchResult: `${homeScore}-${awayScore}`,
      homeScore: homeScore,
      awayScore: awayScore,
      betType: market,
      predictedResult: selection,
      odds: odds
    };
  }

  /**
   * Extract selection from hash or direct value
   */
  extractSelectionFromHash(selectionValue, market) {
    // If it's already a readable selection, return it
    if (typeof selectionValue === 'string' && ['1', '2', 'X', 'Over', 'Under'].includes(selectionValue)) {
      return selectionValue;
    }
    
    // Handle hash-based selections (decode based on market type)
    if (typeof selectionValue === 'string' && selectionValue.startsWith('0x')) {
      // This is a hash - decode it based on market type
      const hashValue = selectionValue.toLowerCase();
      
      if (market === '1X2' || market === "0") {
        // Common hash patterns for 1X2 markets
        if (hashValue.includes('1') || hashValue.endsWith('1')) return '1';
        if (hashValue.includes('2') || hashValue.endsWith('2')) return '2';
        if (hashValue.includes('x') || hashValue.includes('0')) return 'X';
      } else if (market === 'OU25' || market === "1") {
        // Common hash patterns for Over/Under markets
        if (hashValue.includes('over') || hashValue.includes('1')) return 'Over';
        if (hashValue.includes('under') || hashValue.includes('0')) return 'Under';
      }
    }
    
    // Handle numeric selections
    if (typeof selectionValue === 'number' || !isNaN(selectionValue)) {
      const numValue = parseInt(selectionValue);
      if (market === '1X2' || market === "0") {
        if (numValue === 0) return '1';
        if (numValue === 1) return 'X';
        if (numValue === 2) return '2';
      } else if (market === 'OU25' || market === "1") {
        if (numValue === 0) return 'Under';
        if (numValue === 1) return 'Over';
      }
    }
    
    // Fallback - return the original value as string
    return String(selectionValue);
  }

  /**
   * Get moneyline result (1, X, 2)
   */
  getMoneylineResult(homeScore, awayScore) {
    if (homeScore > awayScore) return '1';
    if (homeScore < awayScore) return '2';
    return 'X';
  }

  /**
   * Update leaderboard ranks for a cycle
   */
  async updateLeaderboardRanks(cycleId) {
    console.log(`📊 ${this.serviceName}: Updating leaderboard ranks for cycle ${cycleId}`);
    
    try {
      await db.query(`
        UPDATE oracle.oddyssey_slips 
        SET leaderboard_rank = subquery.rank
        FROM (
          SELECT 
            slip_id,
            ROW_NUMBER() OVER (ORDER BY final_score DESC, correct_count DESC, placed_at ASC) as rank
          FROM oracle.oddyssey_slips 
          WHERE cycle_id = $1 AND is_evaluated = true
        ) as subquery
        WHERE oracle.oddyssey_slips.slip_id = subquery.slip_id
      `, [cycleId]);
      
      console.log(`✅ ${this.serviceName}: Leaderboard ranks updated for cycle ${cycleId}`);
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error updating leaderboard ranks:`, error.message);
    }
  }

  /**
   * Get evaluation status for a cycle
   */
  async getEvaluationStatus(cycleId) {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_slips,
          COUNT(CASE WHEN is_evaluated = true THEN 1 END) as evaluated_slips,
          COUNT(CASE WHEN is_evaluated = false THEN 1 END) as unevaluated_slips
        FROM oracle.oddyssey_slips 
        WHERE cycle_id = $1
      `, [cycleId]);
      
      return result.rows[0];
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error getting evaluation status:`, error.message);
      throw error;
    }
  }

  /**
   * Auto-evaluate all resolved cycles that haven't been evaluated
   */
  async autoEvaluateResolvedCycles() {
    console.log(`🤖 ${this.serviceName}: Starting auto-evaluation of resolved cycles`);
    
    try {
      // Find resolved cycles with unevaluated slips
      const cyclesResult = await db.query(`
        SELECT DISTINCT c.cycle_id
        FROM oracle.oddyssey_cycles c
        JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
        WHERE c.is_resolved = true 
        AND s.is_evaluated = false
        ORDER BY c.cycle_id
      `);
      
      if (cyclesResult.rows.length === 0) {
        console.log(`✅ ${this.serviceName}: No resolved cycles need evaluation`);
        return { evaluated: 0 };
      }
      
      console.log(`📊 ${this.serviceName}: Found ${cyclesResult.rows.length} cycles to evaluate`);
      
      let totalEvaluated = 0;
      for (const row of cyclesResult.rows) {
        try {
          const result = await this.evaluateCycleSlips(row.cycle_id);
          totalEvaluated += result.evaluated;
        } catch (error) {
          console.error(`❌ ${this.serviceName}: Error evaluating cycle ${row.cycle_id}:`, error.message);
        }
      }
      
      console.log(`🎉 ${this.serviceName}: Auto-evaluation completed - ${totalEvaluated} slips evaluated`);
      return { evaluated: totalEvaluated };
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error in auto-evaluation:`, error.message);
      throw error;
    }
  }
}

module.exports = SlipEvaluationService;
