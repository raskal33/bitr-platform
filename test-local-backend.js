#!/usr/bin/env node

const axios = require('axios');

async function testLocalBackend() {
  console.log('🔍 Testing local backend slip placement...');
  
  try {
    // Step 1: Get contract matches from local backend
    console.log('\n1. Getting contract matches from local backend...');
    const contractResponse = await axios.get('http://localhost:3000/api/oddyssey/contract-matches');
    
    if (!contractResponse.data.success) {
      console.log('❌ Failed to get contract matches from local backend');
      return;
    }
    
    const contractMatches = contractResponse.data.data;
    const cycleId = contractResponse.data.cycleId;
    
    console.log(`✅ Got ${contractMatches.length} matches for cycle ${cycleId} from local backend`);
    
    // Step 2: Create predictions in exact order
    console.log('\n2. Creating predictions...');
    const predictions = contractMatches.map((match, index) => ({
      matchId: parseInt(match.id), // Convert to number to match contract data type
      betType: 'MONEYLINE',
      selection: '1'
    }));
    
    console.log(`Created ${predictions.length} predictions`);
    
    // Step 3: Test slip placement with local backend
    console.log('\n3. Testing slip placement with local backend...');
    const slipData = {
      playerAddress: '0x1234567890123456789012345678901234567890',
      predictions: predictions,
      cycleId: parseInt(cycleId)
    };
    
    console.log('Sending slip data to local backend...');
    
    const response = await axios.post('http://localhost:3000/api/oddyssey/place-slip', slipData, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('✅ Success!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.response?.data) {
      console.log('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testLocalBackend().catch(console.error);
