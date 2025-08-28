#!/usr/bin/env node

/**
 * Check Real Pool Data
 * 
 * This script checks the actual pool data to see what event times were used
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function checkRealPoolData() {
  console.log('🔍 Checking Real Pool Data...');
  
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
    
    // Get all pools
    const poolCount = await bitredictPool.poolCount();
    console.log(`\n📊 Total Pools: ${poolCount}`);
    
    for (let i = 0; i < Number(poolCount); i++) {
      console.log(`\n🔍 Pool ${i}:`);
      
      const pool = await bitredictPool.pools(i);
      
      console.log(`Creator: ${pool.creator}`);
      console.log(`League: ${pool.league}`);
      console.log(`Market ID: ${ethers.decodeBytes32String(pool.marketId)}`);
      console.log(`Predicted Outcome: ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
      console.log(`Odds: ${Number(pool.odds) / 100}x`);
      console.log(`Creator Stake: ${ethers.formatEther(pool.creatorStake)} BITR`);
      
      // Timing analysis
      const eventStartTime = Number(pool.eventStartTime);
      const eventEndTime = Number(pool.eventEndTime);
      const bettingEndTime = Number(pool.bettingEndTime);
      const currentTime = Math.floor(Date.now() / 1000);
      
      console.log(`\n⏰ Timing Analysis:`);
      console.log(`Event Start: ${eventStartTime} (${new Date(eventStartTime * 1000).toLocaleString()})`);
      console.log(`Event End: ${eventEndTime} (${new Date(eventEndTime * 1000).toLocaleString()})`);
      console.log(`Betting End: ${bettingEndTime} (${new Date(bettingEndTime * 1000).toLocaleString()})`);
      console.log(`Current Time: ${currentTime} (${new Date(currentTime * 1000).toLocaleString()})`);
      
      // Calculate time differences
      const timeUntilEvent = eventStartTime - currentTime;
      const timeUntilBettingEnd = bettingEndTime - currentTime;
      
      console.log(`\n📅 Time Remaining:`);
      console.log(`Until Event Start: ${Math.floor(timeUntilEvent / 3600)}h ${Math.floor((timeUntilEvent % 3600) / 60)}m`);
      console.log(`Until Betting End: ${Math.floor(timeUntilBettingEnd / 3600)}h ${Math.floor((timeUntilBettingEnd % 3600) / 60)}m`);
      
      // Check if betting is active
      const bettingActive = currentTime < bettingEndTime;
      console.log(`Betting Active: ${bettingActive ? '✅ Yes' : '❌ No'}`);
      
      // Check if this is the Coppa Italia pool
      if (pool.league === "Coppa Italia") {
        console.log(`\n🎯 This is the Coppa Italia pool!`);
        console.log(`Expected Event Time: Today • 21:45 (9:45 PM)`);
        console.log(`Actual Event Time: ${new Date(eventStartTime * 1000).toLocaleString()}`);
        
        // Check if the timing matches
        const expectedTime = new Date();
        expectedTime.setHours(21, 45, 0, 0); // 9:45 PM today
        const expectedTimestamp = Math.floor(expectedTime.getTime() / 1000);
        
        console.log(`Expected Timestamp: ${expectedTimestamp} (${expectedTime.toLocaleString()})`);
        console.log(`Actual Timestamp: ${eventStartTime} (${new Date(eventStartTime * 1000).toLocaleString()})`);
        console.log(`Time Difference: ${Math.abs(eventStartTime - expectedTimestamp)} seconds`);
        
        if (Math.abs(eventStartTime - expectedTimestamp) < 3600) { // Within 1 hour
          console.log(`✅ Timing is close to expected!`);
        } else {
          console.log(`❌ Timing is significantly different from expected!`);
        }
      }
      
      console.log(`\n${'='.repeat(50)}`);
    }
    
    // Check current time in different timezones
    console.log('\n🌍 Current Time Analysis:');
    const now = new Date();
    console.log(`Local Time: ${now.toLocaleString()}`);
    console.log(`UTC Time: ${now.toUTCString()}`);
    console.log(`ISO String: ${now.toISOString()}`);
    console.log(`Timestamp: ${Math.floor(now.getTime() / 1000)}`);
    
    // Expected Coppa Italia time
    const expectedCoppaTime = new Date();
    expectedCoppaTime.setHours(21, 45, 0, 0); // 9:45 PM today
    console.log(`\nExpected Coppa Italia Time:`);
    console.log(`Local: ${expectedCoppaTime.toLocaleString()}`);
    console.log(`UTC: ${expectedCoppaTime.toUTCString()}`);
    console.log(`Timestamp: ${Math.floor(expectedCoppaTime.getTime() / 1000)}`);
    
  } catch (error) {
    console.error('❌ Check error:', error.message);
  }
}

checkRealPoolData();
