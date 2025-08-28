const axios = require('axios');

class UserSlipsAPITester {
  constructor() {
    this.baseUrl = 'https://bitredict-backend.fly.dev';
    this.testAddress = '0x1234567890123456789012345678901234567890';
  }

  async testUserSlipsAPI() {
    console.log('🧪 Testing User Slips API...\n');

    try {
      // Test 1: Get user slips
      console.log('📋 Test 1: Fetching user slips...');
      const response = await axios.get(`${this.baseUrl}/api/oddyssey/user-slips/${this.testAddress}`);
      
      console.log('✅ Response Status:', response.status);
      console.log('✅ Response Data:', JSON.stringify(response.data, null, 2));
      
      if (response.data.success) {
        console.log(`✅ Found ${response.data.data.length} slips`);
        
        if (response.data.data.length > 0) {
          const slip = response.data.data[0];
          console.log('\n📊 Sample Slip Data:');
          console.log('- Slip ID:', slip.slip_id);
          console.log('- Cycle ID:', slip.cycle_id);
          console.log('- Player Address:', slip.player_address);
          console.log('- Placed At:', slip.placed_at);
          console.log('- Is Evaluated:', slip.is_evaluated);
          console.log('- Final Score:', slip.final_score);
          console.log('- Correct Count:', slip.correct_count);
          console.log('- Total Odds:', slip.total_odds);
          console.log('- Potential Payout:', slip.potential_payout);
          
          if (slip.predictions && slip.predictions.length > 0) {
            console.log('\n🎯 Sample Prediction:');
            const pred = slip.predictions[0];
            console.log('- Match ID:', pred.match_id);
            console.log('- Home Team:', pred.home_team);
            console.log('- Away Team:', pred.away_team);
            console.log('- Match Date:', pred.match_date);
            console.log('- League:', pred.league_name);
            console.log('- Odds:', pred.odds);
          }
        }
      } else {
        console.log('❌ API returned error:', response.data.message);
      }

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
  }

  async testWithRealAddress() {
    console.log('\n🧪 Testing with a real address...');
    
    // You can replace this with a real address that has slips
    const realAddress = '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6';
    
    try {
      const response = await axios.get(`${this.baseUrl}/api/oddyssey/user-slips/${realAddress}`);
      
      if (response.data.success) {
        console.log(`✅ Found ${response.data.data.length} slips for real address`);
        
        if (response.data.data.length > 0) {
          console.log('\n📊 Real Slip Data:');
          const slip = response.data.data[0];
          console.log('- Slip ID:', slip.slip_id);
          console.log('- Cycle ID:', slip.cycle_id);
          console.log('- Total Odds:', slip.total_odds);
          console.log('- Predictions Count:', slip.predictions?.length || 0);
        }
      }
    } catch (error) {
      console.error('❌ Real address test failed:', error.message);
    }
  }
}

async function main() {
  const tester = new UserSlipsAPITester();
  await tester.testUserSlipsAPI();
  await tester.testWithRealAddress();
}

main().catch(console.error);
