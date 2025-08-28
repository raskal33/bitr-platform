const axios = require('axios');

const BASE_URL = 'https://bitredict-backend.fly.dev/api';

async function investigateCycles() {
  console.log('🔍 Investigating Cycle Resolution Issues...\n');

  try {
    // Check current matches
    console.log('📊 Checking current matches...');
    const matchesResponse = await axios.get(`${BASE_URL}/oddyssey/matches`);
    console.log('Current matches:', JSON.stringify(matchesResponse.data, null, 2));

    // Check health endpoint
    console.log('\n🏥 Checking Oddyssey health...');
    const healthResponse = await axios.get(`${BASE_URL}/oddyssey/health`);
    console.log('Health status:', JSON.stringify(healthResponse.data, null, 2));

    // Check admin endpoints for cycle info
    console.log('\n🔧 Checking admin endpoints...');
    
    // Check sync status
    const syncResponse = await axios.get(`${BASE_URL}/admin/sync-status`);
    console.log('Sync status:', JSON.stringify(syncResponse.data, null, 2));

    // Check tables
    const tablesResponse = await axios.get(`${BASE_URL}/admin/check-tables`);
    console.log('Tables status:', JSON.stringify(tablesResponse.data, null, 2));

    // Try to trigger cycle resolution
    console.log('\n⚡ Triggering cycle resolution...');
    const resolutionResponse = await axios.post(`${BASE_URL}/admin/resolve-oddyssey-cycles`);
    console.log('Resolution response:', JSON.stringify(resolutionResponse.data, null, 2));

    // Check results after resolution
    console.log('\n📋 Checking results after resolution...');
    const resultsResponse = await axios.post(`${BASE_URL}/admin/fetch-oddyssey-results`);
    console.log('Results response:', JSON.stringify(resultsResponse.data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

investigateCycles();
