const UnifiedEvaluationService = require('./unified-evaluation-service');
const db = require('../db/db');

/**
 * Auto Evaluation Trigger Service
 * 
 * This service automatically evaluates cycles when they become resolved
 * and ensures no cycles are left unevaluated.
 */
class AutoEvaluationTrigger {
  constructor() {
    this.serviceName = 'AutoEvaluationTrigger';
    this.evaluationService = new UnifiedEvaluationService();
  }

  /**
   * Check and evaluate all resolved but unevaluated cycles
   */
  async checkAndEvaluateAllCycles() {
    console.log(`🔄 ${this.serviceName}: Checking for unevaluated cycles...`);
    
    try {
      // Find all resolved cycles that haven't been evaluated
      const unevaluatedCycles = await db.query(`
        SELECT cycle_id, created_at, matches_count
        FROM oracle.oddyssey_cycles 
        WHERE is_resolved = true 
        AND (evaluation_completed = false OR evaluation_completed IS NULL)
        ORDER BY cycle_id ASC
      `);

      if (unevaluatedCycles.rows.length === 0) {
        console.log(`✅ ${this.serviceName}: All resolved cycles are evaluated`);
        return { evaluatedCycles: 0, totalSlips: 0 };
      }

      console.log(`🎯 ${this.serviceName}: Found ${unevaluatedCycles.rows.length} unevaluated cycles`);

      let totalEvaluatedCycles = 0;
      let totalEvaluatedSlips = 0;

      // Evaluate each cycle
      for (const cycle of unevaluatedCycles.rows) {
        try {
          console.log(`🔧 ${this.serviceName}: Evaluating cycle ${cycle.cycle_id}...`);
          
          const result = await this.evaluationService.evaluateCompleteCycle(cycle.cycle_id);
          
          if (result.success) {
            totalEvaluatedCycles++;
            totalEvaluatedSlips += result.slipsEvaluated;
            console.log(`✅ ${this.serviceName}: Cycle ${cycle.cycle_id} evaluated - ${result.slipsEvaluated} slips processed`);
          } else {
            console.error(`❌ ${this.serviceName}: Failed to evaluate cycle ${cycle.cycle_id}`);
          }
          
        } catch (error) {
          console.error(`❌ ${this.serviceName}: Error evaluating cycle ${cycle.cycle_id}:`, error.message);
        }
      }

      console.log(`🎉 ${this.serviceName}: Completed - ${totalEvaluatedCycles} cycles, ${totalEvaluatedSlips} slips evaluated`);
      
      return {
        evaluatedCycles: totalEvaluatedCycles,
        totalSlips: totalEvaluatedSlips,
        processedCycles: unevaluatedCycles.rows.map(c => c.cycle_id)
      };

    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error in auto-evaluation:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a specific cycle if it's resolved but not evaluated
   */
  async evaluateCycleIfReady(cycleId) {
    try {
      // Check if cycle is resolved and not evaluated
      const cycleCheck = await db.query(`
        SELECT cycle_id, is_resolved, evaluation_completed
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = $1
      `, [cycleId]);

      if (cycleCheck.rows.length === 0) {
        console.log(`⚠️ ${this.serviceName}: Cycle ${cycleId} not found`);
        return { evaluated: false, reason: 'cycle_not_found' };
      }

      const cycle = cycleCheck.rows[0];
      
      if (!cycle.is_resolved) {
        console.log(`⚠️ ${this.serviceName}: Cycle ${cycleId} not resolved yet`);
        return { evaluated: false, reason: 'not_resolved' };
      }

      if (cycle.evaluation_completed) {
        console.log(`✅ ${this.serviceName}: Cycle ${cycleId} already evaluated`);
        return { evaluated: false, reason: 'already_evaluated' };
      }

      // Evaluate the cycle
      console.log(`🔧 ${this.serviceName}: Auto-evaluating cycle ${cycleId}...`);
      const result = await this.evaluationService.evaluateCompleteCycle(cycleId);
      
      if (result.success) {
        console.log(`✅ ${this.serviceName}: Auto-evaluated cycle ${cycleId} - ${result.slipsEvaluated} slips`);
        return { 
          evaluated: true, 
          slipsEvaluated: result.slipsEvaluated,
          totalSlips: result.totalSlips
        };
      } else {
        console.error(`❌ ${this.serviceName}: Failed to auto-evaluate cycle ${cycleId}`);
        return { evaluated: false, reason: 'evaluation_failed' };
      }

    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error in auto-evaluation for cycle ${cycleId}:`, error);
      return { evaluated: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Health check - report on evaluation status
   */
  async getEvaluationHealthStatus() {
    try {
      const healthQuery = `
        SELECT 
          COUNT(*) as total_cycles,
          COUNT(CASE WHEN is_resolved = true THEN 1 END) as resolved_cycles,
          COUNT(CASE WHEN is_resolved = true AND evaluation_completed = true THEN 1 END) as evaluated_cycles,
          COUNT(CASE WHEN is_resolved = true AND (evaluation_completed = false OR evaluation_completed IS NULL) THEN 1 END) as pending_evaluation
        FROM oracle.oddyssey_cycles
      `;
      
      const healthResult = await db.query(healthQuery);
      const stats = healthResult.rows[0];
      
      const health = {
        timestamp: new Date().toISOString(),
        totalCycles: parseInt(stats.total_cycles),
        resolvedCycles: parseInt(stats.resolved_cycles),
        evaluatedCycles: parseInt(stats.evaluated_cycles),
        pendingEvaluation: parseInt(stats.pending_evaluation),
        healthStatus: parseInt(stats.pending_evaluation) === 0 ? 'healthy' : 'needs_attention'
      };
      
      console.log(`🏥 ${this.serviceName}: Health Status:`, health);
      return health;
      
    } catch (error) {
      console.error(`❌ ${this.serviceName}: Error getting health status:`, error);
      return {
        timestamp: new Date().toISOString(),
        healthStatus: 'error',
        error: error.message
      };
    }
  }
}

module.exports = AutoEvaluationTrigger;
