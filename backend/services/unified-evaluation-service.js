const db = require('../db/db');

/**
 * Unified Evaluation Service
 * 
 * This service coordinates the complete evaluation pipeline:
 * 1. Calculate fixture outcomes when results are available
 * 2. Evaluate slips when cycles are resolved
 * 3. Ensure data consistency across all systems
 */
class UnifiedEvaluationService {
  constructor() {
    this.serviceName = 'UnifiedEvaluationService';
  }

  /**
   * MAIN ENTRY POINT: Complete evaluation pipeline for a cycle
   */
  async evaluateCompleteCycle(cycleId) {
    console.log(`🎯 ${this.serviceName}: Starting complete evaluation for cycle ${cycleId}`);
    
    try {
      // Step 1: Ensure all fixture results have calculated outcomes
      const outcomeResults = await this.calculateFixtureOutcomes(cycleId);
      console.log(`✅ Calculated outcomes for ${outcomeResults.calculated} fixtures`);
      
      // Step 2: Evaluate all slips for this cycle
      const evaluationResults = await this.evaluateCycleSlips(cycleId);
      console.log(`✅ Evaluated ${evaluationResults.evaluated} slips`);
      
      // Step 3: Update cycle evaluation status
      await this.markCycleEvaluated(cycleId);
      
      return {
        success: true,
        cycleId,
        fixturesProcessed: outcomeResults.calculated,
        slipsEvaluated: evaluationResults.evaluated,
        totalSlips: evaluationResults.total
      };
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error evaluating cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Step 1: Calculate outcomes for all fixture results in a cycle
   */
  async calculateFixtureOutcomes(cycleId) {
    try {
      // Get all match IDs for this cycle
      const cycleResult = await db.query(`
        SELECT matches_data FROM oracle.oddyssey_cycles WHERE cycle_id = $1
      `, [cycleId]);
      
      if (cycleResult.rows.length === 0) {
        throw new Error(`Cycle ${cycleId} not found`);
      }
      
      const matchesData = cycleResult.rows[0].matches_data || [];
      const fixtureIds = matchesData.map(match => match.id).filter(id => id);
      
      if (fixtureIds.length === 0) {
        console.log(`⚠️ No fixtures found for cycle ${cycleId}`);
        return { calculated: 0 };
      }
      
      console.log(`🔍 Processing ${fixtureIds.length} fixtures for cycle ${cycleId}`);
      
      // Calculate outcomes for all fixtures that have scores but missing outcomes
      const updateQuery = `
        UPDATE oracle.fixture_results 
        SET 
          result_1x2 = CASE 
            WHEN home_score > away_score THEN '1'
            WHEN home_score < away_score THEN '2'
            ELSE 'X'
          END,
          result_ou25 = CASE 
            WHEN (home_score + away_score) > 2.5 THEN 'Over'
            ELSE 'Under'
          END,
          outcome_1x2 = CASE 
            WHEN home_score > away_score THEN '1'
            WHEN home_score < away_score THEN '2'
            ELSE 'X'
          END,
          outcome_ou25 = CASE 
            WHEN (home_score + away_score) > 2.5 THEN 'Over'
            ELSE 'Under'
          END,
          evaluation_status = 'completed',
          evaluation_timestamp = NOW()
        WHERE fixture_id = ANY($1)
        AND home_score IS NOT NULL 
        AND away_score IS NOT NULL
        AND (result_1x2 IS NULL OR outcome_1x2 IS NULL)
      `;
      
      const result = await db.query(updateQuery, [fixtureIds]);
      
      // Also handle fixtures with missing away_score (set to 0)
      const fixMissingScores = `
        UPDATE oracle.fixture_results 
        SET away_score = 0
        WHERE fixture_id = ANY($1)
        AND home_score IS NOT NULL 
        AND away_score IS NULL
      `;
      
      await db.query(fixMissingScores, [fixtureIds]);
      
      // Recalculate outcomes for the fixed scores
      const recalculateResult = await db.query(updateQuery, [fixtureIds]);
      
      const totalCalculated = result.rowCount + recalculateResult.rowCount;
      
      console.log(`✅ Calculated outcomes for ${totalCalculated} fixtures in cycle ${cycleId}`);
      
      return { calculated: totalCalculated };
      
    } catch (error) {
      console.error(`❌ Error calculating fixture outcomes for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Step 2: Evaluate all slips for a resolved cycle
   */
  async evaluateCycleSlips(cycleId) {
    try {
      // Get all slips for this cycle that need evaluation
      const slipsResult = await db.query(`
        SELECT slip_id, player_address, predictions, is_evaluated
        FROM oracle.oddyssey_slips 
        WHERE cycle_id = $1 AND is_evaluated = FALSE
        ORDER BY slip_id
      `, [cycleId]);
      
      if (slipsResult.rows.length === 0) {
        console.log(`✅ No slips need evaluation for cycle ${cycleId}`);
        return { evaluated: 0, total: 0 };
      }
      
      console.log(`📊 Evaluating ${slipsResult.rows.length} slips for cycle ${cycleId}`);
      
      let evaluatedCount = 0;
      
      for (const slip of slipsResult.rows) {
        try {
          const evaluation = await this.evaluateSingleSlip(slip.slip_id, slip.predictions, cycleId);
          
          // Update slip with evaluation results
          await db.query(`
            UPDATE oracle.oddyssey_slips 
            SET 
              is_evaluated = TRUE,
              correct_count = $1,
              final_score = $2,
              leaderboard_rank = $3
            WHERE slip_id = $4
          `, [evaluation.correctCount, evaluation.finalScore, evaluation.rank, slip.slip_id]);
          
          evaluatedCount++;
          console.log(`✅ Evaluated slip ${slip.slip_id}: ${evaluation.correctCount}/10 correct, score: ${evaluation.finalScore}`);
          
        } catch (error) {
          console.error(`❌ Failed to evaluate slip ${slip.slip_id}:`, error.message);
        }
      }
      
      return { evaluated: evaluatedCount, total: slipsResult.rows.length };
      
    } catch (error) {
      console.error(`❌ Error evaluating slips for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a single slip's predictions
   */
  async evaluateSingleSlip(slipId, predictions, cycleId) {
    try {
      if (!predictions || predictions.length === 0) {
        throw new Error(`No predictions found for slip ${slipId}`);
      }
      
      let correctCount = 0;
      let finalScore = 0;
      
      // Evaluate each prediction
      for (const prediction of predictions) {
        const matchId = prediction.matchId;
        const betType = prediction.betType; // "0" = 1X2, "1" = Over/Under
        const selection = prediction.selection;
        
        // Get fixture result
        const resultQuery = `
          SELECT home_score, away_score, result_1x2, result_ou25, outcome_1x2, outcome_ou25
          FROM oracle.fixture_results 
          WHERE fixture_id = $1
        `;
        
        const resultData = await db.query(resultQuery, [matchId]);
        
        if (resultData.rows.length === 0) {
          console.warn(`⚠️ No result found for match ${matchId}`);
          continue;
        }
        
        const result = resultData.rows[0];
        let isCorrect = false;
        
        if (betType === "0") {
          // 1X2 prediction
          const actualResult = result.result_1x2 || result.outcome_1x2;
          
          // Map selection hash to result
          if (selection === "0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6" && actualResult === "X") {
            isCorrect = true; // Draw
          } else if (selection === "0x09492a13c7e2353fdb9d678856a01eb3a777f03982867b5ce379154825ae0e62" && actualResult === "1") {
            isCorrect = true; // Home win
          } else if (selection === "0xad7c5bef027816a800da1736444fb58a807ef4c9603b7848673f7e3a68eb14a5" && actualResult === "2") {
            isCorrect = true; // Away win
          } else if (selection === "0x550c64a15031c3064454c19adc6243a6122c138a242eaa098da50bb114fc8d56" && actualResult === "2") {
            isCorrect = true; // Away win (alternative hash)
          }
          
        } else if (betType === "1") {
          // Over/Under prediction
          const actualResult = result.result_ou25 || result.outcome_ou25;
          
          if (selection === "0x09492a13c7e2353fdb9d678856a01eb3a777f03982867b5ce379154825ae0e62" && actualResult === "Over") {
            isCorrect = true; // Over
          } else if (selection === "0xe5f3458d553c578199ad9150ab9a1cce5e22e9b34834f66492b28636da59e11b" && actualResult === "Under") {
            isCorrect = true; // Under
          }
        }
        
        if (isCorrect) {
          correctCount++;
          finalScore += 10; // 10 points per correct prediction
        }
      }
      
      // Calculate rank (simplified - could be enhanced with proper leaderboard logic)
      const rank = correctCount >= 6 ? 1 : correctCount >= 4 ? 2 : correctCount >= 2 ? 3 : null;
      
      return {
        correctCount,
        finalScore,
        rank
      };
      
    } catch (error) {
      console.error(`❌ Error evaluating slip ${slipId}:`, error);
      throw error;
    }
  }

  /**
   * Step 3: Mark cycle as fully evaluated
   */
  async markCycleEvaluated(cycleId) {
    try {
      await db.query(`
        UPDATE oracle.oddyssey_cycles 
        SET 
          evaluation_completed = TRUE,
          evaluation_completed_at = NOW()
        WHERE cycle_id = $1
      `, [cycleId]);
      
      console.log(`✅ Marked cycle ${cycleId} as fully evaluated`);
      
    } catch (error) {
      // Column might not exist, add it
      try {
        await db.query(`
          ALTER TABLE oracle.oddyssey_cycles 
          ADD COLUMN IF NOT EXISTS evaluation_completed BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS evaluation_completed_at TIMESTAMPTZ
        `);
        
        // Retry the update
        await db.query(`
          UPDATE oracle.oddyssey_cycles 
          SET 
            evaluation_completed = TRUE,
            evaluation_completed_at = NOW()
          WHERE cycle_id = $1
        `, [cycleId]);
        
        console.log(`✅ Added evaluation columns and marked cycle ${cycleId} as evaluated`);
        
      } catch (alterError) {
        console.warn(`⚠️ Could not mark cycle ${cycleId} as evaluated:`, alterError.message);
      }
    }
  }

  /**
   * Auto-evaluate all resolved cycles that haven't been evaluated
   */
  async autoEvaluateAllResolvedCycles() {
    console.log(`🤖 ${this.serviceName}: Starting auto-evaluation of all resolved cycles`);
    
    try {
      // Find resolved cycles that haven't been fully evaluated
      // Use a simpler approach that works with existing schema
      const cyclesResult = await db.query(`
        SELECT DISTINCT c.cycle_id
        FROM oracle.oddyssey_cycles c
        JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
        WHERE c.is_resolved = TRUE 
        AND s.is_evaluated = FALSE
        ORDER BY c.cycle_id
      `);
      
      if (cyclesResult.rows.length === 0) {
        console.log(`✅ ${this.serviceName}: No resolved cycles need evaluation`);
        return { evaluatedCycles: 0, totalSlips: 0 };
      }
      
      console.log(`📊 ${this.serviceName}: Found ${cyclesResult.rows.length} cycles to evaluate`);
      
      let totalSlipsEvaluated = 0;
      let evaluatedCycles = 0;
      
      for (const row of cyclesResult.rows) {
        try {
          const result = await this.evaluateCompleteCycle(row.cycle_id);
          totalSlipsEvaluated += result.slipsEvaluated;
          evaluatedCycles++;
          
        } catch (error) {
          console.error(`❌ ${this.serviceName}: Error evaluating cycle ${row.cycle_id}:`, error.message);
        }
      }
      
      console.log(`🎉 ${this.serviceName}: Auto-evaluation completed - ${evaluatedCycles} cycles, ${totalSlipsEvaluated} slips evaluated`);
      
      return { evaluatedCycles, totalSlips: totalSlipsEvaluated };
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error in auto-evaluation:`, error.message);
      throw error;
    }
  }

  /**
   * Trigger evaluation when a cycle is resolved (called by indexer)
   */
  async onCycleResolved(cycleId) {
    console.log(`🔔 ${this.serviceName}: Cycle ${cycleId} resolved - triggering evaluation`);
    
    try {
      // Wait a bit for all data to be consistent
      setTimeout(async () => {
        try {
          await this.evaluateCompleteCycle(cycleId);
          console.log(`✅ Auto-evaluation completed for cycle ${cycleId}`);
        } catch (error) {
          console.error(`❌ Auto-evaluation failed for cycle ${cycleId}:`, error.message);
        }
      }, 5000); // 5 second delay
      
    } catch (error) {
      console.error(`❌ Error triggering evaluation for cycle ${cycleId}:`, error);
    }
  }

  /**
   * Health check - verify evaluation system is working
   */
  async healthCheck() {
    try {
      // Check for unresolved cycles with slips
      const unresolvedResult = await db.query(`
        SELECT COUNT(DISTINCT c.cycle_id) as unresolved_cycles
        FROM oracle.oddyssey_cycles c
        JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
        WHERE c.is_resolved = FALSE
        AND c.cycle_end_time < NOW() - INTERVAL '2 hours'
      `);
      
      // Check for resolved cycles with unevaluated slips
      const unevaluatedResult = await db.query(`
        SELECT COUNT(DISTINCT c.cycle_id) as unevaluated_cycles
        FROM oracle.oddyssey_cycles c
        JOIN oracle.oddyssey_slips s ON c.cycle_id = s.cycle_id
        WHERE c.is_resolved = TRUE
        AND s.is_evaluated = FALSE
      `);
      
      const health = {
        status: 'healthy',
        unresolvedCycles: parseInt(unresolvedResult.rows[0].unresolved_cycles),
        unevaluatedCycles: parseInt(unevaluatedResult.rows[0].unevaluated_cycles),
        timestamp: new Date().toISOString()
      };
      
      if (health.unresolvedCycles > 0 || health.unevaluatedCycles > 0) {
        health.status = 'needs_attention';
        console.log(`⚠️ Evaluation health check: ${health.unevaluatedCycles} cycles need evaluation`);
      }
      
      return health;
      
    } catch (error) {
      console.error(`❌ Health check failed:`, error);
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = UnifiedEvaluationService;
