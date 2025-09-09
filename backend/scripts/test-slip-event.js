#!/usr/bin/env node

/**
 * Test Script to Check SlipPlaced Event Detection
 * 
 * This script will manually check if the SlipPlaced event exists in the specified transaction
 */

const { ethers } = require('ethers');
const config = require('../config');

async function testSlipEvent() {
  console.log('🔍 Testing SlipPlaced Event Detection...');
  
  // Transaction details from user
  const txHash = '0xa3eade6fcdba3eb48ff9c8dbf52b9b8271e295c37d36ad9c2591fb70d3c3b531';
  const blockNumber = 35856012;
  const contractAddress = '0x6E51d91Adb14395B43Ad5b2A1A4f3F6C99332A5A';
  
  try {
    // Initialize provider with premium ANKR RPC
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    console.log(`📊 Using RPC: ${config.blockchain.rpcUrl}`);
    console.log(`🔗 Transaction: ${txHash}`);
    console.log(`📦 Block: ${blockNumber}`);
    console.log(`📋 Contract: ${contractAddress}`);
    
    // Get transaction receipt
    console.log('\n1️⃣ Getting transaction receipt...');
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      console.log('❌ Transaction receipt not found');
      return;
    }
    
    console.log(`✅ Transaction found in block ${receipt.blockNumber}`);
    console.log(`📊 Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
    console.log(`📝 Logs count: ${receipt.logs.length}`);
    
    // Check logs for our contract
    console.log('\n2️⃣ Checking logs for Oddyssey contract...');
    const oddysseyLogs = receipt.logs.filter(log => 
      log.address.toLowerCase() === contractAddress.toLowerCase()
    );
    
    console.log(`📋 Oddyssey contract logs: ${oddysseyLogs.length}`);
    
    if (oddysseyLogs.length === 0) {
      console.log('❌ No logs found for Oddyssey contract');
      console.log('📊 All log addresses:');
      receipt.logs.forEach((log, i) => {
        console.log(`   ${i}: ${log.address}`);
      });
      return;
    }
    
    // Initialize contract to decode events
    console.log('\n3️⃣ Initializing contract for event decoding...');
    const oddysseyABI = [
      "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)",
      "event CycleStarted(uint256 indexed cycleId, uint256 endTime)",
      "event CycleResolved(uint256 indexed cycleId, uint256 prizePool)"
    ];
    
    const contract = new ethers.Contract(contractAddress, oddysseyABI, provider);
    
    // Decode events
    console.log('\n4️⃣ Decoding events...');
    for (let i = 0; i < oddysseyLogs.length; i++) {
      const log = oddysseyLogs[i];
      try {
        const parsedLog = contract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        
        console.log(`✅ Event ${i + 1}: ${parsedLog.name}`);
        console.log(`   📊 Args:`, parsedLog.args);
        
        if (parsedLog.name === 'SlipPlaced') {
          console.log(`🎉 FOUND SLIPPLACED EVENT!`);
          console.log(`   🆔 Cycle ID: ${parsedLog.args.cycleId}`);
          console.log(`   👤 Player: ${parsedLog.args.player}`);
          console.log(`   📝 Slip ID: ${parsedLog.args.slipId}`);
        }
      } catch (parseError) {
        console.log(`❌ Could not parse log ${i + 1}:`, parseError.message);
        console.log(`   📊 Topics:`, log.topics);
        console.log(`   📊 Data:`, log.data);
      }
    }
    
    // Test direct event query
    console.log('\n5️⃣ Testing direct event query...');
    try {
      const filter = contract.filters.SlipPlaced();
      const events = await contract.queryFilter(filter, blockNumber, blockNumber);
      
      console.log(`📊 Direct query found ${events.length} SlipPlaced events in block ${blockNumber}`);
      
      for (const event of events) {
        console.log(`✅ Event found:`);
        console.log(`   🆔 Cycle ID: ${event.args.cycleId}`);
        console.log(`   👤 Player: ${event.args.player}`);
        console.log(`   📝 Slip ID: ${event.args.slipId}`);
        console.log(`   🔗 Tx Hash: ${event.transactionHash}`);
      }
    } catch (queryError) {
      console.log(`❌ Direct query failed:`, queryError.message);
    }
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
testSlipEvent()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
