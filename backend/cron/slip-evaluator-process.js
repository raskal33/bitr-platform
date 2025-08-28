require('dotenv').config({ path: '../.env' });
const UnifiedEvaluationService = require('../services/unified-evaluation-service');

async function runSlipEvaluator() {
  console.log('🚀 Starting Unified Slip Evaluator Process...');
  
  try {
    const evaluationService = new UnifiedEvaluationService();
    
    console.log('1️⃣ Running auto-evaluation of all resolved cycles...');
    const result = await evaluationService.autoEvaluateAllResolvedCycles();
    
    console.log('📊 Results:', result);
    
    if (result.totalSlips > 0) {
      console.log('✅ Unified evaluator completed successfully!');
      console.log(`   • Cycles evaluated: ${result.evaluatedCycles}`);
      console.log(`   • Slips evaluated: ${result.totalSlips}`);
    } else {
      console.log('✅ Unified evaluator completed - no cycles needed evaluation');
    }
    
    // Run health check
    console.log('2️⃣ Running evaluation health check...');
    const health = await evaluationService.healthCheck();
    console.log('🏥 Health status:', health);
    
    if (health.status === 'needs_attention') {
      console.log('⚠️ Some cycles may need manual attention');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Unified evaluator process failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  runSlipEvaluator().catch(console.error);
}

module.exports = runSlipEvaluator;
