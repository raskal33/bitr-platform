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
          
          // Update slip with evaluation results
          await db.query(`
            UPDATE oracle.oddyssey_slips 
            SET 
              final_score = $1,
              correct_count = $2,
              is_evaluated = true,
              updated_at = NOW()
            WHERE slip_id = $3
          `, [evaluation.finalScore, evaluation.correctCount, slip.slip_id]);
          
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
    const predictions = slip.predictions || [];
    let correctCount = 0;
    let totalScore = 0;
    
    for (const prediction of predictions) {
      const matchResult = await this.evaluatePrediction(prediction, matches);
      if (matchResult.correct) {
        correctCount++;
        totalScore += matchResult.score;
      }
    }
    
    return {
      finalScore: totalScore,
      correctCount: correctCount
    };
  }

  /**
   * Evaluate a single prediction
   */
  async evaluatePrediction(prediction, matches) {
    const { fixture_id, market, prediction: selection } = prediction;
    
    // Find the match in cycle data
    const match = matches.find(m => m.id === fixture_id || m.id === parseInt(fixture_id));
    if (!match) {
      console.warn(`⚠️ Match ${fixture_id} not found in cycle data`);
      return { correct: false, score: 0 };
    }
    
    // Get actual result from database
    const fixtureResult = await db.query(`
      SELECT result_info, status
      FROM oracle.fixtures 
      WHERE id = $1
    `, [fixture_id]);
    
    if (fixtureResult.rows.length === 0 || !fixtureResult.rows[0].result_info) {
      console.warn(`⚠️ No result found for fixture ${fixture_id}`);
      return { correct: false, score: 0 };
    }
    
    const result = fixtureResult.rows[0].result_info;
    const homeScore = result.home_score || 0;
    const awayScore = result.away_score || 0;
    
    let isCorrect = false;
    let score = 0;
    
    if (market === '1X2') {
      // Moneyline prediction
      const actualResult = this.getMoneylineResult(homeScore, awayScore);
      isCorrect = selection === actualResult;
      score = isCorrect ? 10 : 0; // 10 points for correct moneyline
      
    } else if (market === 'OU25') {
      // Over/Under prediction
      const totalGoals = homeScore + awayScore;
      const actualResult = totalGoals > 2.5 ? 'Over' : 'Under';
      isCorrect = selection === actualResult;
      score = isCorrect ? 5 : 0; // 5 points for correct over/under
    }
    
    return { correct: isCorrect, score };
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
