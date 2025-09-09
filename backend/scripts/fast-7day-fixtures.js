#!/usr/bin/env node

const SportMonksService = require('../services/sportmonks');

class Fast7DayFixtures {
  constructor() {
    this.sportmonksService = new SportMonksService();
  }

  async fetchFast() {
    console.log('⚡ Fast 7-day fixtures fetch (optimized for speed)...');
    console.log('📊 This will process only essential fixtures without full odds processing\n');
    
    try {
      const startTime = Date.now();
      
      // Override the service to be faster
      const originalFetchAndSaveDayFixtures = this.sportmonksService.fetchAndSaveDayFixtures;
      
      this.sportmonksService.fetchAndSaveDayFixtures = async (dateStr) => {
        console.log(`📅 Fetching fixtures for ${dateStr} (fast mode)...`);
        
        // Fetch fixtures with minimal includes
        const response = await this.sportmonksService.axios.get(`/fixtures/date/${dateStr}`, {
          params: {
            api_token: this.sportmonksService.apiToken,
            include: 'participants,league', // Minimal includes
            per_page: 50 // Limit to 50 fixtures per day
          }
        });

        const fixtures = response.data.data || [];
        console.log(`📊 Found ${fixtures.length} fixtures for ${dateStr}`);
        
        if (fixtures.length === 0) {
          return { fixtures: 0, odds: 0, oddysseyReady: 0 };
        }

        // Process only first 10 fixtures for speed
        let savedCount = 0;
        for (const fixture of fixtures.slice(0, 10)) {
          try {
            await this.sportmonksService.saveFixture(fixture, 
              fixture.participants?.find(p => p.meta?.location === 'home'),
              fixture.participants?.find(p => p.meta?.location === 'away')
            );
            savedCount++;
          } catch (error) {
            console.warn(`⚠️ Failed to save fixture ${fixture.id}:`, error.message);
          }
        }

        return { fixtures: savedCount, odds: 0, oddysseyReady: 0 };
      };

      // Run the 7-day fetch
      const result = await this.sportmonksService.fetchAndSave7DayFixtures();
      
      const duration = Date.now() - startTime;
      console.log(`\n🎉 Fast 7-day fetch completed in ${(duration / 1000).toFixed(1)} seconds!`);
      console.log('✅ Results:');
      console.log(`   - Total fixtures: ${result.totalFixtures || 0}`);
      console.log(`   - Total odds: ${result.totalOdds || 0}`);
      console.log(`   - Oddyssey ready: ${result.oddysseyFixtures || 0}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Fast 7-day fetch failed:', error.message);
      throw error;
    }
  }
}

// Run the fast fetch
if (require.main === module) {
  const fetcher = new Fast7DayFixtures();
  fetcher.fetchFast().catch(console.error);
}

module.exports = Fast7DayFixtures;

