#!/usr/bin/env node

/**
 * Simple Odds Test
 * 
 * This script tests different odds values to find the minimum working odds
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function simpleOddsTest() {
  console.log('🔍 Simple Odds Test...');
  
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
    
    // Test different odds values
    const testOdds = [150, 200, 250, 300, 400, 500, 1000, 1500, 2000];
    
    console.log('\n📊 Odds Calculation Test:');
    console.log('Odds | Contract Format | Division | Max Stake (100 BITR)');
    console.log('-----|-----------------|----------|---------------------');
    
    for (const odds of testOdds) {
      const contractFormat = odds;
      const division = odds / 100 - 1;
      const creatorStake = 100; // 100 BITR
      const maxStake = creatorStake / division;
      
      console.log(`${odds / 100}x | ${contractFormat} | ${division} | ${maxStake} BITR`);
    }
    
    // Test with the contract's static call
    console.log('\n🔧 Testing with Contract Static Call:');
    
    const baseParams = {
      predictedOutcome: ethers.encodeBytes32String("YES"),
      creatorStake: ethers.parseEther("100"),
      eventStartTime: Math.floor(Date.now() / 1000) + 600,
      eventEndTime: Math.floor(Date.now() / 1000) + 7200,
      league: "Test League",
      category: "football",
      region: "Test",
      isPrivate: false,
      maxBetPerUser: ethers.parseEther("500"),
      useBitr: true,
      oracleType: 0,
      marketId: ethers.encodeBytes32String("TEST_ODDS")
    };
    
    for (const odds of testOdds) {
      console.log(`\nTesting odds: ${odds / 100}x (${odds})`);
      
      try {
        const staticResult = await bitredictPool.createPool.staticCall(
          baseParams.predictedOutcome,
          odds,
          baseParams.creatorStake,
          baseParams.eventStartTime,
          baseParams.eventEndTime,
          baseParams.league,
          baseParams.category,
          baseParams.region,
          baseParams.isPrivate,
          baseParams.maxBetPerUser,
          baseParams.useBitr,
          baseParams.oracleType,
          baseParams.marketId
        );
        console.log(`  ✅ Static call successful: ${staticResult}`);
      } catch (error) {
        console.log(`  ❌ Static call failed: ${error.message}`);
        
        if (error.data) {
          try {
            const decodedError = bitredictPool.interface.parseError(error.data);
            console.log(`    Decoded error: ${decodedError.name} - ${decodedError.args}`);
          } catch (decodeError) {
            console.log(`    Could not decode error: ${decodeError.message}`);
          }
        }
      }
    }
    
    // Find the minimum working odds
    console.log('\n🎯 Finding Minimum Working Odds:');
    
    let minWorkingOdds = null;
    for (let odds = 200; odds <= 1000; odds += 50) {
      try {
        const staticResult = await bitredictPool.createPool.staticCall(
          baseParams.predictedOutcome,
          odds,
          baseParams.creatorStake,
          baseParams.eventStartTime,
          baseParams.eventEndTime,
          baseParams.league,
          baseParams.category,
          baseParams.region,
          baseParams.isPrivate,
          baseParams.maxBetPerUser,
          baseParams.useBitr,
          baseParams.oracleType,
          baseParams.marketId
        );
        
        if (staticResult !== undefined) {
          minWorkingOdds = odds;
          console.log(`✅ Minimum working odds found: ${odds / 100}x (${odds})`);
          break;
        }
      } catch (error) {
        // Continue testing
      }
    }
    
    if (minWorkingOdds) {
      console.log(`\n🎉 Minimum working odds: ${minWorkingOdds / 100}x (${minWorkingOdds})`);
    } else {
      console.log('❌ No working odds found in range 2.00x - 10.00x');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

simpleOddsTest();
