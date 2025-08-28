const axios = require('axios');

const BASE_URL = 'https://bitredict-backend.fly.dev/api';

async function debugCycleResolution() {
  console.log('🔍 Debugging Cycle Resolution Issues...\n');

  try {
    // Check current cycles
    console.log('📊 Checking current cycles...');
    const cyclesResponse = await axios.get(`${BASE_URL}/oddyssey/cycles`);
    console.log('Cycles response:', JSON.stringify(cyclesResponse.data, null, 2));

    // Check contract matches
    console.log('\n📋 Checking contract matches...');
    const contractResponse = await axios.get(`${BASE_URL}/oddyssey/contract-matches`);
    console.log('Contract matches response:', JSON.stringify(contractResponse.data, null, 2));

    // Check database matches
    console.log('\n🗄️ Checking database matches...');
    const dbResponse = await axios.get(`${BASE_URL}/oddyssey/matches`);
    console.log('Database matches response:', JSON.stringify(dbResponse.data, null, 2));

    // Check specific cycle 4
    console.log('\n🎯 Checking Cycle 4 specifically...');
    const cycle4Response = await axios.get(`${BASE_URL}/oddyssey/cycles/4`);
    console.log('Cycle 4 response:', JSON.stringify(cycle4Response.data, null, 2));

    // Check resolution status
    console.log('\n✅ Checking resolution status...');
    const resolutionResponse = await axios.get(`${BASE_URL}/oddyssey/resolution-status`);
    console.log('Resolution status:', JSON.stringify(resolutionResponse.data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

debugCycleResolution();
