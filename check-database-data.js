const axios = require('axios');

class DatabaseDataChecker {
  constructor() {
    this.baseUrl = 'https://bitredict-backend.fly.dev';
  }

  async checkDatabaseData() {
    console.log('🔍 Checking Database Data...\n');

    try {
      // Check 1: Get all slips
      console.log('📋 Check 1: Getting all slips...');
      const slipsResponse = await axios.get(`${this.baseUrl}/api/oddyssey/slips/all`);
      console.log('✅ Slips Response:', JSON.stringify(slipsResponse.data, null, 2));

      // Check 2: Get fixtures
      console.log('\n📋 Check 2: Getting fixtures...');
      const fixturesResponse = await axios.get(`${this.baseUrl}/api/fixtures`);
      console.log('✅ Fixtures Response:', JSON.stringify(fixturesResponse.data, null, 2));

      // Check 3: Get current cycle
      console.log('\n📋 Check 3: Getting current cycle...');
      const cycleResponse = await axios.get(`${this.baseUrl}/api/oddyssey/current-cycle`);
      console.log('✅ Cycle Response:', JSON.stringify(cycleResponse.data, null, 2));

      // Check 4: Get matches
      console.log('\n📋 Check 4: Getting matches...');
      const matchesResponse = await axios.get(`${this.baseUrl}/api/oddyssey/matches`);
      console.log('✅ Matches Response:', JSON.stringify(matchesResponse.data, null, 2));

    } catch (error) {
      console.error('❌ Check failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
  }
}

async function main() {
  const checker = new DatabaseDataChecker();
  await checker.checkDatabaseData();
}

main().catch(console.error);
