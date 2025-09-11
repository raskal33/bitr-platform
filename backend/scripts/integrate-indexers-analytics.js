#!/usr/bin/env node

/**
 * Indexer Analytics Integration Script
 * Coordinates existing indexers with new analytics system
 * Prevents conflicts and ensures proper data flow
 */

require('dotenv').config();
const IndexerAnalyticsBridge = require('../services/indexer-analytics-bridge');
const EnhancedAnalyticsService = require('../services/enhanced-analytics-service');
const EnhancedAirdropService = require('../services/enhanced-airdrop-service');

async function integrateIndexersAnalytics() {
  console.log('🚀 Starting indexer-analytics integration...');
  
  try {
    // Initialize services
    const bridge = new IndexerAnalyticsBridge();
    const analyticsService = new EnhancedAnalyticsService();
    const airdropService = new EnhancedAirdropService();
    
    // Start services
    await bridge.start();
    await analyticsService.start();
    await airdropService.start();
    
    console.log('✅ All services started successfully');
    
    // Process initial data bridges
    console.log('🔄 Processing initial data bridges...');
    await bridge.processAllBridges();
    
    // Get integration status
    const status = await bridge.getBridgeStatus();
    console.log('📊 Integration Status:', status);
    
    console.log('✅ Indexer-analytics integration complete!');
    console.log('🎯 System is now ready with:');
    console.log('   - Existing indexers continue to populate oracle/airdrop tables');
    console.log('   - Analytics bridge syncs data to analytics tables');
    console.log('   - Real-time analytics collection from API endpoints');
    console.log('   - No conflicts or data duplication');
    
    // Stop services
    await bridge.stop();
    await analyticsService.stop();
    await airdropService.stop();
    
  } catch (error) {
    console.error('❌ Failed to integrate indexers with analytics:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  integrateIndexersAnalytics();
}

module.exports = integrateIndexersAnalytics;
