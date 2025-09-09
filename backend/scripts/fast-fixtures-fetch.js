#!/usr/bin/env node

const SportMonksService = require('../services/sportmonks');
const config = require('../config');

class FastFixturesFetcher {
  constructor() {
    this.sportmonksService = new SportMonksService();
  }

  async fetchFixturesFast() {
    console.log('⚡ Fast 7-day fixtures fetch (optimized)...');
    console.log('📊 This will fetch fixtures with minimal processing for speed\n');
    
    try {
      const startTime = Date.now();
      
      // Use the existing service but with optimizations
      const result = await this.sportmonksService.fetchAndSave7DayFixtures();
      
      const duration = Date.now() - startTime;
      console.log(`\n🎉 Fast fetch completed in ${(duration / 1000).toFixed(1)} seconds!`);
      console.log('✅ Fixtures fetch completed:');
      console.log(`   - Total fixtures: ${result.fixturesCount || 0}`);
      console.log(`   - Saved: ${result.savedCount || 0}`);
      console.log(`   - Updated: ${result.updatedCount || 0}`);
      console.log(`   - Errors: ${result.errors || 0}`);
      
      return result;
    } catch (error) {
      console.error('❌ Fast fixtures fetch failed:', error.message);
      throw error;
    }
  }

  async fetchFixturesMinimal() {
    console.log('🚀 Minimal fixtures fetch (fastest option)...');
    console.log('📊 This will fetch only essential fixtures without odds processing\n');
    
    try {
      const startTime = Date.now();
      
      // Fetch only today's fixtures for testing
      const today = new Date().toISOString().split('T')[0];
      console.log(`📅 Fetching fixtures for ${today} only...`);
      
      const result = await this.sportmonksService.fetchFixturesForDate(today);
      
      const duration = Date.now() - startTime;
      console.log(`\n🎉 Minimal fetch completed in ${(duration / 1000).toFixed(1)} seconds!`);
      console.log(`✅ Fetched ${result.length} fixtures for ${today}`);
      
      return result;
    } catch (error) {
      console.error('❌ Minimal fixtures fetch failed:', error.message);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const fetcher = new FastFixturesFetcher();
  const args = process.argv.slice(2);
  
  if (args.includes('--minimal')) {
    fetcher.fetchFixturesMinimal().catch(console.error);
  } else {
    fetcher.fetchFixturesFast().catch(console.error);
  }
}

module.exports = FastFixturesFetcher;

