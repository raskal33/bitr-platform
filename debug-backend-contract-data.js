#!/usr/bin/env node

const axios = require('axios');

async function debugBackendContractData() {
  console.log('🔍 Debugging backend contract data...');
  
  try {
    // Test 1: Get contract matches from backend
    console.log('\n1. Getting contract matches from backend...');
    const contractResponse = await axios.get('https://bitredict-backend.fly.dev/api/oddyssey/contract-matches');
    
    if (!contractResponse.data.success) {
      console.log('❌ Failed to get contract matches from backend');
      return;
    }
    
    const contractMatches = contractResponse.data.data;
    console.log(`✅ Got ${contractMatches.length} contract matches from backend`);
    
    // Test 2: Check data types and values
    console.log('\n2. Analyzing contract match data...');
    contractMatches.forEach((match, index) => {
      console.log(`Match ${index}:`);
      console.log(`  ID: ${match.id} (type: ${typeof match.id})`);
      console.log(`  Teams: ${match.homeTeam} vs ${match.awayTeam}`);
      console.log(`  Odds: H=${match.oddsHome}, D=${match.oddsDraw}, A=${match.oddsAway}`);
    });
    
    // Test 3: Create predictions with exact same data
    console.log('\n3. Creating predictions with exact contract data...');
    const predictions = contractMatches.map((match, index) => ({
      matchId: match.id, // Use exact same value from contract
      betType: 'MONEYLINE',
      selection: '1'
    }));
    
    console.log('Predictions:');
    predictions.forEach((pred, index) => {
      console.log(`  Prediction ${index}: matchId=${pred.matchId} (type: ${typeof pred.matchId})`);
    });
    
    // Test 4: Test slip placement
    console.log('\n4. Testing slip placement...');
    const slipData = {
      playerAddress: '0x1234567890123456789012345678901234567890',
      predictions: predictions,
      cycleId: parseInt(contractResponse.data.cycleId)
    };
    
    console.log('Sending slip data with exact contract matchIds...');
    
    const response = await axios.post('https://bitredict-backend.fly.dev/api/oddyssey/place-slip', slipData, {
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

debugBackendContractData().catch(console.error);
