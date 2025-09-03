#!/usr/bin/env node

require('dotenv').config({ path: '../.env' });
const AutoEvaluationTrigger = require('../services/auto-evaluation-trigger');

/**
 * Auto Evaluation Cron Job
 * 
 * This cron job runs every 30 minutes to check for resolved cycles
 * that need evaluation and automatically processes them.
 * 
 * Usage:
 * - Run manually: node cron/auto-evaluation-cron.js
 * - Add to crontab: "0,30 * * * * /path/to/node /path/to/auto-evaluation-cron.js"
 */

async function runAutoEvaluationCron() {
  const startTime = new Date();
  console.log(`🕐 [${startTime.toISOString()}] Starting Auto Evaluation Cron Job...`);
  
  try {
    const autoEvaluator = new AutoEvaluationTrigger();
    
    // Step 1: Get health status
    console.log('1️⃣ Checking evaluation health status...');
    const healthStatus = await autoEvaluator.getEvaluationHealthStatus();
    
    if (healthStatus.healthStatus === 'healthy') {
      console.log('✅ All cycles are properly evaluated - no action needed');
      return;
    }
    
    if (healthStatus.pendingEvaluation > 0) {
      console.log(`🎯 Found ${healthStatus.pendingEvaluation} cycles needing evaluation`);
      
      // Step 2: Run auto-evaluation
      console.log('2️⃣ Running auto-evaluation for all pending cycles...');
      const evaluationResult = await autoEvaluator.checkAndEvaluateAllCycles();
      
      console.log('📊 Auto-evaluation completed:');
      console.log(`   • Cycles evaluated: ${evaluationResult.evaluatedCycles}`);
      console.log(`   • Slips processed: ${evaluationResult.totalSlips}`);
      
      if (evaluationResult.processedCycles && evaluationResult.processedCycles.length > 0) {
        console.log(`   • Processed cycles: ${evaluationResult.processedCycles.join(', ')}`);
      }
      
      // Step 3: Final health check
      console.log('3️⃣ Final health check...');
      const finalHealth = await autoEvaluator.getEvaluationHealthStatus();
      
      if (finalHealth.healthStatus === 'healthy') {
        console.log('🎉 All cycles are now properly evaluated!');
      } else {
        console.log(`⚠️ ${finalHealth.pendingEvaluation} cycles still need attention`);
      }
    }
    
    const endTime = new Date();
    const duration = endTime - startTime;
    console.log(`✅ Auto Evaluation Cron completed in ${duration}ms`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Auto Evaluation Cron failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Log error for monitoring
    try {
      const db = require('../db/db');
      await db.query(`
        INSERT INTO oracle.system_alerts (alert_type, message, details, created_at)
        VALUES ('auto_evaluation_error', $1, $2, NOW())
      `, [
        'Auto evaluation cron job failed',
        JSON.stringify({ error: error.message, stack: error.stack })
      ]);
    } catch (logError) {
      console.error('❌ Failed to log error to database:', logError.message);
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runAutoEvaluationCron().catch(console.error);
}

module.exports = runAutoEvaluationCron;
