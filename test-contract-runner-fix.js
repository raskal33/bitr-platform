#!/usr/bin/env node

/**
 * Test Contract Runner Fix
 * 
 * This script tests if the contract runner issue is fixed.
 */

const Web3Service = require('./backend/services/web3-service.js');

async function testContractRunner() {
  console.log('🧪 Testing Contract Runner Fix...');
  
  try {
    const web3Service = new Web3Service();
    
    console.log('1️⃣ Initializing Web3Service...');
    await web3Service.initialize();
    
    console.log('2️⃣ Getting Oddyssey contract...');
    const contract = await web3Service.getOddysseyContract();
    
    console.log('3️⃣ Testing contract call...');
    const currentCycleId = await contract.dailyCycleId();
    
    console.log(`✅ Contract call successful! Current cycle ID: ${currentCycleId}`);
    
    console.log('4️⃣ Testing additional contract calls...');
    const slipCount = await contract.slipCount();
    const entryFee = await contract.entryFee();
    
    console.log(`✅ Additional calls successful!`);
    console.log(`   - Slip count: ${slipCount}`);
    console.log(`   - Entry fee: ${entryFee}`);
    
    console.log('🎉 All contract runner tests passed!');
    
  } catch (error) {
    console.error('❌ Contract runner test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testContractRunner().catch(console.error);
}

module.exports = testContractRunner;
