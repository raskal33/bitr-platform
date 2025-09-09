#!/usr/bin/env node

const axios = require('axios');
const db = require('../db/db');

class QuickFixturesFetcher {
  constructor() {
    this.apiToken = process.env.SPORTMONKS_API_TOKEN;
    this.baseUrl = 'https://api.sportmonks.com/v3/football';
    
    if (!this.apiToken) {
      throw new Error('SPORTMONKS_API_TOKEN not configured');
    }
    
    console.log('✅ SportMonks API token configured');
  }

  async fetchTodayFixtures() {
    console.log('⚡ Quick fetch: Today\'s fixtures only...');
    
    try {
      const today = new Date().toISOString().split('T')[0];
      console.log(`📅 Fetching fixtures for ${today}...`);
      
      const startTime = Date.now();
      
      // Fetch fixtures for today only
      const response = await axios.get(`${this.baseUrl}/fixtures/date/${today}`, {
        params: {
          api_token: this.apiToken,
          include: 'participants,league,venue,referee',
          per_page: 100 // Limit to 100 fixtures for speed
        }
      });

      const fixtures = response.data.data || [];
      console.log(`📊 Found ${fixtures.length} fixtures for ${today}`);
      
      if (fixtures.length === 0) {
        console.log('ℹ️ No fixtures found for today');
        return { count: 0, saved: 0 };
      }

      // Save fixtures in batch
      let savedCount = 0;
      for (const fixture of fixtures.slice(0, 20)) { // Limit to first 20 for speed
        try {
          await this.saveFixtureQuick(fixture);
          savedCount++;
        } catch (error) {
          console.warn(`⚠️ Failed to save fixture ${fixture.id}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`\n🎉 Quick fetch completed in ${(duration / 1000).toFixed(1)} seconds!`);
      console.log(`✅ Saved ${savedCount}/${fixtures.length} fixtures`);
      
      return { count: fixtures.length, saved: savedCount };
      
    } catch (error) {
      console.error('❌ Quick fixtures fetch failed:', error.message);
      throw error;
    }
  }

  async saveFixtureQuick(fixture) {
    const query = `
      INSERT INTO oracle.fixtures (
        id, name, home_team_id, away_team_id, home_team, away_team,
        league_id, league_name, match_date, starting_at, status,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
    `;
    
    const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');
    
    const values = [
      fixture.id,
      fixture.name,
      homeTeam?.id || null,
      awayTeam?.id || null,
      homeTeam?.name || null,
      awayTeam?.name || null,
      fixture.league?.id || null,
      fixture.league?.name || null,
      fixture.starting_at,
      fixture.starting_at,
      fixture.state?.short_name || 'NS'
    ];
    
    await db.query(query, values);
  }
}

// Run the quick fetch
if (require.main === module) {
  const fetcher = new QuickFixturesFetcher();
  fetcher.fetchTodayFixtures().catch(console.error);
}

module.exports = QuickFixturesFetcher;

