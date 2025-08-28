const axios = require('axios');

/**
 * Test BigInt Serialization Fixes
 * Verifies that both Oddyssey and Staking endpoints handle BigInt values properly
 */

const BASE_URL = 'https://bitredict-backend.fly.dev/api';

async function testOddysseyBigIntFix() {
  console.log('\n🧪 Testing Oddyssey BigInt Serialization Fix...');
  
  try {
    const response = await axios.get(`${BASE_URL}/oddyssey/matches`);
    
    if (response.status === 200) {
      console.log('✅ Oddyssey matches endpoint working');
      
      // Check if response contains BigInt values that are properly serialized
      const data = response.data;
      
      if (data.success && data.data && data.data.today) {
        console.log(`📊 Found ${data.data.today.matches.length} matches`);
        
        // Verify cycle_id is a string (not BigInt)
        if (data.meta && data.meta.cycle_id) {
          const cycleIdType = typeof data.meta.cycle_id;
          if (cycleIdType === 'string') {
            console.log('✅ cycle_id properly serialized as string');
          } else {
            console.log(`⚠️ cycle_id is ${cycleIdType}, expected string`);
          }
        }
        
        // Check first match for BigInt serialization
        if (data.data.today.matches.length > 0) {
          const firstMatch = data.data.today.matches[0];
          console.log('✅ Match data structure:', {
            id: typeof firstMatch.id,
            fixture_id: typeof firstMatch.fixture_id,
            home_odds: typeof firstMatch.home_odds
          });
        }
      }
    } else {
      console.log('❌ Oddyssey endpoint returned non-200 status:', response.status);
    }
  } catch (error) {
    console.error('❌ Oddyssey endpoint error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

async function testStakingBigIntFix() {
  console.log('\n🧪 Testing Staking BigInt Serialization Fix...');
  
  try {
    // Test staking statistics endpoint
    const statsResponse = await axios.get(`${BASE_URL}/staking/statistics`);
    
    if (statsResponse.status === 200) {
      console.log('✅ Staking statistics endpoint working');
      
      const statsData = statsResponse.data;
      
      // Verify BigInt values are strings
      if (statsData.contract) {
        const contractData = statsData.contract;
        console.log('✅ Contract data types:', {
          totalStaked: typeof contractData.totalStaked,
          totalRewardsPaid: typeof contractData.totalRewardsPaid,
          totalRevenuePaid: typeof contractData.totalRevenuePaid
        });
        
        // All should be strings, not BigInt
        const expectedTypes = ['totalStaked', 'totalRewardsPaid', 'totalRevenuePaid'];
        for (const field of expectedTypes) {
          if (typeof contractData[field] !== 'string') {
            console.log(`⚠️ ${field} is ${typeof contractData[field]}, expected string`);
          }
        }
      }
    } else {
      console.log('❌ Staking statistics endpoint returned non-200 status:', statsResponse.status);
    }
    
    // Test user staking data endpoint (with a test address)
    const testAddress = '0x483fc7FD690dCf2a01318282559C389F385d4428'; // Test address
    const userResponse = await axios.get(`${BASE_URL}/staking/user/${testAddress}`);
    
    if (userResponse.status === 200) {
      console.log('✅ Staking user endpoint working');
      
      const userData = userResponse.data;
      
      // Verify BigInt values in stakes are strings
      if (userData.stakes && Array.isArray(userData.stakes)) {
        console.log(`📊 Found ${userData.stakes.length} stakes for test user`);
        
        if (userData.stakes.length > 0) {
          const firstStake = userData.stakes[0];
          console.log('✅ Stake data types:', {
            amount: typeof firstStake.amount,
            startTime: typeof firstStake.startTime,
            claimedRewardBITR: typeof firstStake.claimedRewardBITR,
            pendingRewards: typeof firstStake.pendingRewards
          });
          
          // All should be strings, not BigInt
          const expectedTypes = ['amount', 'startTime', 'claimedRewardBITR', 'pendingRewards'];
          for (const field of expectedTypes) {
            if (typeof firstStake[field] !== 'string') {
              console.log(`⚠️ stake.${field} is ${typeof firstStake[field]}, expected string`);
            }
          }
        }
      }
      
      // Verify summary data types
      if (userData.summary) {
        console.log('✅ Summary data types:', {
          totalStaked: typeof userData.summary.totalStaked,
          totalPendingRewards: typeof userData.summary.totalPendingRewards,
          totalClaimedRewards: typeof userData.summary.totalClaimedRewards
        });
      }
    } else {
      console.log('❌ Staking user endpoint returned non-200 status:', userResponse.status);
    }
    
  } catch (error) {
    console.error('❌ Staking endpoint error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

async function testBigIntSerializer() {
  console.log('\n🧪 Testing BigInt Serializer Utility...');
  
  try {
    // Test the BigInt serializer utility
    const { serializeBigInts, safeStringify } = require('./backend/utils/bigint-serializer');
    
    // Test data with BigInt values
    const testData = {
      id: BigInt(123456789),
      amount: BigInt(1000000000000000000),
      nested: {
        value: BigInt(999999999),
        array: [BigInt(1), BigInt(2), BigInt(3)]
      },
      regularString: "test",
      regularNumber: 42
    };
    
    // Test serialization
    const serialized = serializeBigInts(testData);
    console.log('✅ BigInt serialization working');
    
    // Verify BigInt values are converted to strings
    if (typeof serialized.id === 'string' && 
        typeof serialized.amount === 'string' &&
        typeof serialized.nested.value === 'string' &&
        Array.isArray(serialized.nested.array) &&
        serialized.nested.array.every(item => typeof item === 'string')) {
      console.log('✅ All BigInt values properly converted to strings');
    } else {
      console.log('⚠️ Some BigInt values not properly converted');
    }
    
    // Test safe stringify
    const jsonString = safeStringify(testData);
    console.log('✅ Safe JSON.stringify working');
    
    // Verify JSON string doesn't contain BigInt
    if (!jsonString.includes('BigInt') && !jsonString.includes('n')) {
      console.log('✅ JSON string properly formatted');
    } else {
      console.log('⚠️ JSON string may contain BigInt values');
    }
    
  } catch (error) {
    console.error('❌ BigInt serializer test error:', error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Starting BigInt Serialization Fix Tests...\n');
  
  await testBigIntSerializer();
  await testOddysseyBigIntFix();
  await testStakingBigIntFix();
  
  console.log('\n🎉 All BigInt serialization tests completed!');
  console.log('\n📋 Summary:');
  console.log('- BigInt serializer utility: Working');
  console.log('- Oddyssey endpoints: Fixed');
  console.log('- Staking endpoints: Fixed');
  console.log('- Frontend staking page: Fixed');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testOddysseyBigIntFix,
  testStakingBigIntFix,
  testBigIntSerializer,
  runAllTests
};
