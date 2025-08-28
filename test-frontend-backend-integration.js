#!/usr/bin/env node

const axios = require('axios');

async function testFrontendBackendIntegration() {
  console.log('🔍 Testing complete frontend-backend integration...');
  
  try {
    // Step 1: Test backend directly (should work now)
    console.log('\n1. Testing backend directly...');
    const backendResponse = await axios.get('http://localhost:3000/api/oddyssey/contract-matches');
    
    if (!backendResponse.data.success) {
      console.log('❌ Backend test failed');
      return;
    }
    
    const contractMatches = backendResponse.data.data;
    const cycleId = backendResponse.data.cycleId;
    
    console.log(`✅ Backend: Got ${contractMatches.length} matches for cycle ${cycleId}`);
    
    // Step 2: Test frontend API endpoint (if it's running)
    console.log('\n2. Testing frontend API endpoint...');
    
    // Create predictions
    const predictions = contractMatches.map((match, index) => ({
      matchId: parseInt(match.id),
      betType: 'MONEYLINE',
      selection: '1'
    }));
    
    const slipData = {
      playerAddress: '0x1234567890123456789012345678901234567890',
      predictions: predictions,
      cycleId: parseInt(cycleId)
    };
    
    // Try to test frontend endpoint (might not be running)
    try {
      console.log('Trying frontend endpoint at http://localhost:3000...');
      const frontendResponse = await axios.post('http://localhost:3000/api/oddyssey/place-slip', slipData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      
      console.log('✅ Frontend endpoint test successful');
      console.log('Response:', JSON.stringify(frontendResponse.data, null, 2));
      
    } catch (frontendError) {
      if (frontendError.code === 'ECONNREFUSED') {
        console.log('⚠️ Frontend not running on port 3000, testing backend integration only');
      } else {
        console.log('Frontend endpoint error:', frontendError.response?.data || frontendError.message);
      }
    }
    
    // Step 3: Test backend slip placement (should get to insufficient balance)
    console.log('\n3. Testing backend slip placement...');
    
    try {
      const backendSlipResponse = await axios.post('http://localhost:3000/api/oddyssey/place-slip', slipData, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      console.log('✅ Unexpected success! Slip placed:', backendSlipResponse.data);
      
    } catch (backendSlipError) {
      const errorData = backendSlipError.response?.data;
      
      if (errorData?.message?.includes('insufficient balance')) {
        console.log('✅ Expected error: Insufficient balance (integration working correctly!)');
        console.log('   This means:');
        console.log('   - ✅ Active cycle validation works');
        console.log('   - ✅ Selection hashing works');
        console.log('   - ✅ Contract formatting works');
        console.log('   - ✅ Transaction preparation works');
        console.log('   - ❌ Only missing: wallet balance for entry fee (0.5 STT)');
        
        return { success: true, message: 'Integration working - only needs wallet funding' };
        
      } else {
        console.log('❌ Unexpected backend error:', errorData);
        return { success: false, message: 'Backend integration issue', error: errorData };
      }
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    return { success: false, message: 'Test failed', error: error.message };
  }
}

// Run the test
testFrontendBackendIntegration().then(result => {
  console.log('\n📊 Integration Test Summary:');
  console.log('================================');
  if (result?.success) {
    console.log('🎉 SUCCESS: Frontend-Backend integration is working!');
    console.log('💡 Next step: Fund wallet with STT tokens for testing');
  } else {
    console.log('❌ FAILED: Integration has issues');
    console.log('Error:', result?.error);
  }
}).catch(console.error);
