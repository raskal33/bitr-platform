const { ethers } = require('ethers');
const path = require('path');

// Test the frontend contract service approach
async function testFrontendContractService() {
  console.log('🔍 Testing Frontend Contract Service...');
  
  try {
    // Load the ABI
    const OddysseyABI = require('./backend/oddyssey-contract-abi.json').abi;
    
    // Create provider using the same RPC URL as frontend
    const provider = new ethers.JsonRpcProvider('https://dream-rpc.somnia.network/');
    
    // Create contract instance
    const contractAddress = process.env.ODDYSSEY_ADDRESS || '0x9f9D719041C8F0EE708440f15AE056Cd858DCF4e';
    const contract = new ethers.Contract(contractAddress, OddysseyABI, provider);
    
    console.log('✅ Contract initialized');
    
    // Test getCurrentCycleInfo (like frontend does)
    console.log('🎯 Testing getCurrentCycleInfo...');
    const cycleInfo = await contract.getCurrentCycleInfo();
    console.log('✅ Cycle info:', cycleInfo);
    
    // Extract cycle ID
    const cycleId = cycleInfo[0];
    console.log('📊 Cycle ID:', cycleId.toString());
    
    // Test getDailyMatches (like frontend does)
    console.log('🎯 Testing getDailyMatches...');
    const matches = await contract.getDailyMatches(cycleId);
    console.log('✅ Matches count:', matches.length);
    console.log('📊 First match:', matches[0]);
    
    // Test entryFee (like frontend does)
    console.log('🎯 Testing entryFee...');
    const entryFee = await contract.entryFee();
    console.log('✅ Entry fee:', ethers.formatEther(entryFee));
    
    console.log('🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Error in frontend contract service test:', error);
  }
}

// Test the backend approach for comparison
async function testBackendApproach() {
  console.log('\n🔍 Testing Backend Approach...');
  
  try {
    const Web3Service = require('./backend/services/web3-service');
    const web3Service = new Web3Service();
    
    console.log('✅ Web3Service initialized');
    
    // Test getCurrentCycleInfo
    console.log('🎯 Testing getCurrentCycleInfo...');
    const cycleInfo = await web3Service.getOddysseyContract().then(c => c.getCurrentCycleInfo());
    console.log('✅ Cycle info:', cycleInfo);
    
    // Test getDailyMatches
    console.log('🎯 Testing getDailyMatches...');
    const cycleId = cycleInfo[0];
    const matches = await web3Service.getOddysseyContract().then(c => c.getDailyMatches(cycleId));
    console.log('✅ Matches count:', matches.length);
    console.log('📊 First match:', matches[0]);
    
    // Test entryFee
    console.log('🎯 Testing entryFee...');
    const entryFee = await web3Service.getEntryFee();
    console.log('✅ Entry fee:', ethers.formatEther(entryFee));
    
    console.log('🎉 All backend tests passed!');
    
  } catch (error) {
    console.error('❌ Error in backend approach test:', error);
  }
}

// Run both tests
async function runTests() {
  console.log('🚀 Starting contract service comparison tests...\n');
  
  await testFrontendContractService();
  await testBackendApproach();
  
  console.log('\n✅ All tests completed!');
}

runTests().catch(console.error);
