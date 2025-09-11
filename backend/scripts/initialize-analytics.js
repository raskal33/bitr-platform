#!/usr/bin/env node

/**
 * Initialize Analytics Data Script
 * Populates all analytics and airdrop tables with data from existing oracle tables
 */

require('dotenv').config();
const EnhancedAnalyticsService = require('../services/enhanced-analytics-service');
const EnhancedAirdropService = require('../services/enhanced-airdrop-service');

async function initializeAnalytics() {
  console.log('🚀 Starting analytics initialization...');
  
  try {
    // Initialize services
    const analyticsService = new EnhancedAnalyticsService();
    const airdropService = new EnhancedAirdropService();
    
    // Start services
    await analyticsService.start();
    await airdropService.start();
    
    console.log('✅ Analytics initialization complete!');
    console.log('📊 All analytics and airdrop tables have been populated with data');
    console.log('🎯 You can now access enhanced analytics at /api/enhanced-analytics');
    
    // Stop services
    await analyticsService.stop();
    await airdropService.stop();
    
  } catch (error) {
    console.error('❌ Failed to initialize analytics:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeAnalytics();
}

module.exports = initializeAnalytics;
