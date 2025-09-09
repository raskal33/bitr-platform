#!/usr/bin/env node

/**
 * Manual Fixtures Fetcher
 * Fetches fixtures for the next 7 days and saves them to the database
 */

const SportMonksService = require('../services/sportmonks');

async function fetchFixtures() {
  console.log('🚀 Starting manual fixtures fetch...');
  
  try {
    const sportmonksService = new SportMonksService();
    
    // Fetch fixtures for the next 7 days
    const result = await sportmonksService.fetchAndSave7DayFixtures();
    
    console.log('🎉 Fixtures fetch completed!');
    console.log(`📊 Summary: ${result.totalFixtures} fixtures, ${result.totalOdds} odds, ${result.oddysseyFixtures} Oddyssey-ready matches`);
    
  } catch (error) {
    console.error('❌ Error fetching fixtures:', error);
    process.exit(1);
  }
}

// Run the fetch
fetchFixtures();
