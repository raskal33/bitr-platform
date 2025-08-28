#!/usr/bin/env node

/**
 * Debug Timing Issue
 * 
 * This script debugs the timing issue to understand why betting period ended
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function debugTimingIssue() {
  console.log('🔍 Debugging Timing Issue...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    
    // Load contract ABIs
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    
    // Initialize contract
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, BitredictPoolABI, wallet);
    
    console.log('Contract initialized');
    
    // Get the latest pool (Pool ID 3 - Coppa Italia)
    const poolCount = await bitredictPool.poolCount();
    const poolId = poolCount - 1n;
    console.log(`\n📊 Pool ID: ${poolId}`);
    
    // Get pool details
    const pool = await bitredictPool.pools(poolId);
    
    // Get current time
    const currentTime = Math.floor(Date.now() / 1000);
    const currentBlock = await provider.getBlockNumber();
    const currentBlockData = await provider.getBlock(currentBlock);
    const blockTimestamp = currentBlockData.timestamp;
    
    console.log('\n⏰ Timing Analysis:');
    console.log(`Current Time (JavaScript): ${currentTime} (${new Date(currentTime * 1000).toLocaleString()})`);
    console.log(`Current Block: ${currentBlock}`);
    console.log(`Block Timestamp: ${blockTimestamp} (${new Date(blockTimestamp * 1000).toLocaleString()})`);
    console.log(`Time Difference: ${currentTime - blockTimestamp} seconds`);
    
    console.log('\n📋 Pool Timing:');
    console.log(`Event Start Time: ${Number(pool.eventStartTime)} (${new Date(Number(pool.eventStartTime) * 1000).toLocaleString()})`);
    console.log(`Event End Time: ${Number(pool.eventEndTime)} (${new Date(Number(pool.eventEndTime) * 1000).toLocaleString()})`);
    console.log(`Betting End Time: ${Number(pool.bettingEndTime)} (${new Date(Number(pool.bettingEndTime) * 1000).toLocaleString()})`);
    
    // Get betting grace period
    const bettingGracePeriod = await bitredictPool.bettingGracePeriod();
    console.log(`Betting Grace Period: ${bettingGracePeriod} seconds`);
    
    // Calculate expected betting end
    const expectedBettingEnd = Number(pool.eventStartTime) - Number(bettingGracePeriod);
    console.log(`Expected Betting End: ${expectedBettingEnd} (${new Date(expectedBettingEnd * 1000).toLocaleString()})`);
    console.log(`Actual Betting End: ${Number(pool.bettingEndTime)} (${new Date(Number(pool.bettingEndTime) * 1000).toLocaleString()})`);
    console.log(`Match: ${expectedBettingEnd === Number(pool.bettingEndTime) ? '✅ Yes' : '❌ No'}`);
    
    // Check if betting should be active
    const bettingShouldBeActive = currentTime < Number(pool.bettingEndTime);
    console.log(`\n🎯 Betting Status:`);
    console.log(`Current Time: ${currentTime}`);
    console.log(`Betting End: ${Number(pool.bettingEndTime)}`);
    console.log(`Betting Should Be Active: ${bettingShouldBeActive ? '✅ Yes' : '❌ No'}`);
    
    if (!bettingShouldBeActive) {
      console.log(`\n❌ Betting period ended ${currentTime - Number(pool.bettingEndTime)} seconds ago`);
      console.log(`Time since betting ended: ${Math.floor((currentTime - Number(pool.bettingEndTime)) / 60)} minutes`);
    } else {
      console.log(`\n✅ Betting period is active`);
      console.log(`Time remaining: ${Number(pool.bettingEndTime) - currentTime} seconds`);
      console.log(`Minutes remaining: ${Math.floor((Number(pool.bettingEndTime) - currentTime) / 60)} minutes`);
    }
    
    // Check if there's a timezone issue
    console.log('\n🌍 Timezone Check:');
    console.log(`JavaScript Date: ${new Date().toString()}`);
    console.log(`JavaScript Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`Event Start (Local): ${new Date(Number(pool.eventStartTime) * 1000).toString()}`);
    console.log(`Betting End (Local): ${new Date(Number(pool.bettingEndTime) * 1000).toString()}`);
    
    // Check if the issue is with the test timing
    console.log('\n🔍 Test Timing Analysis:');
    console.log(`When test was run: ~5 hours ago`);
    console.log(`Pool created: ~5 hours ago`);
    console.log(`Event start: Future (8/18/2025, 2:12:26 AM)`);
    console.log(`Betting end: 1 minute before event start`);
    
    // Calculate the actual time when the pool was created
    const poolCreationTime = Number(pool.eventStartTime) - (5 * 60 * 60); // 5 hours before event
    console.log(`Estimated Pool Creation Time: ${poolCreationTime} (${new Date(poolCreationTime * 1000).toLocaleString()})`);
    
    // Check if the test was run after betting ended
    const testRunTime = currentTime - (5 * 60 * 60); // Assuming test was run 5 hours ago
    console.log(`Estimated Test Run Time: ${testRunTime} (${new Date(testRunTime * 1000).toLocaleString()})`);
    
    if (testRunTime > Number(pool.bettingEndTime)) {
      console.log('❌ Test was run AFTER betting period ended');
    } else {
      console.log('✅ Test was run BEFORE betting period ended');
    }
    
    // Check if we can still bet now
    console.log('\n🎯 Current Betting Test:');
    if (bettingShouldBeActive) {
      console.log('✅ Betting should be active now - let\'s test a small bet');
      
      try {
        const testBetAmount = ethers.parseEther("1");
        const staticResult = await bitredictPool.placeBet.staticCall(poolId, testBetAmount);
        console.log(`✅ Static call successful: ${staticResult}`);
        console.log('✅ Betting is working correctly now');
      } catch (error) {
        console.log(`❌ Betting still failing: ${error.message}`);
      }
    } else {
      console.log('❌ Betting period has ended - cannot test now');
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugTimingIssue();
