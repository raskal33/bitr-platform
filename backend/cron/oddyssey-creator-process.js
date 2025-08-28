#!/usr/bin/env node

/**
 * Oddyssey Creator Process
 * Creates new daily cycles at 00:03 UTC
 */

require('dotenv').config();
const OddysseyOracleBot = require('../services/oddyssey-oracle-bot');

async function startOddysseyCreator() {
  console.log('🚀 Starting Oddyssey Creator Process...');
  
  const bot = new OddysseyOracleBot();
  
  try {
    await bot.start();
    console.log('✅ Oddyssey Creator started successfully');
    
    // Check if we need to start a new cycle today
    console.log('🔍 Checking if new cycle needs to be created...');
    await bot.checkAndStartNewCycle();
    
    console.log('✅ Oddyssey Creator completed');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Failed to start Oddyssey Creator:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception in Oddyssey Creator:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection in Oddyssey Creator:', reason);
  process.exit(1);
});

startOddysseyCreator();
