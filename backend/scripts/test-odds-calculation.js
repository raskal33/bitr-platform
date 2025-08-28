#!/usr/bin/env node

/**
 * Test Odds Calculation
 * 
 * This script tests different odds values to understand the minimum working odds
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function testOddsCalculation() {
  console.log('🔍 Testing Odds Calculation...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    
    // Load contract ABIs
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    const BitrTokenABI = require('../../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json').abi;
    
    // Initialize contracts
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, BitredictPoolABI, wallet);
    const bitrToken = new ethers.Contract(process.env.BITR_TOKEN_ADDRESS, BitrTokenABI, wallet);
    
    console.log('Contracts initialized');
    
    // Test different odds values
    const testOdds = [150, 200, 250, 300, 400, 500, 1000, 1500, 2000];
    
    console.log('\n📊 Odds Calculation Test:');
    console.log('Odds | Contract Format | Division | Max Stake Calculation');
    console.log('-----|-----------------|----------|---------------------');
    
    for (const odds of testOdds) {
      const contractFormat = odds;
      const division = odds / 100 - 1;
      const creatorStake = ethers.parseEther("100"); // 100 BITR
      const maxStake = creatorStake / division;
      
      console.log(`${odds / 100}x | ${contractFormat} | ${division} | ${ethers.formatEther(maxStake)} BITR`);
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
    for (let odds = 101; odds <= 1000; odds += 1) {
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
      
      // Test creating a real pool with the minimum working odds
      console.log('\n📝 Testing Real Pool Creation with Minimum Odds:');
      
      const testParams = {
        ...baseParams,
        odds: minWorkingOdds,
        marketId: ethers.encodeBytes32String("MIN_ODDS_TEST")
      };
      
      try {
        const createPoolTx = await bitredictPool.createPool(
          testParams.predictedOutcome,
          testParams.odds,
          testParams.creatorStake,
          testParams.eventStartTime,
          testParams.eventEndTime,
          testParams.league,
          testParams.category,
          testParams.region,
          testParams.isPrivate,
          testParams.maxBetPerUser,
          testParams.useBitr,
          testParams.oracleType,
          testParams.marketId,
          { gasLimit: 8000000 }
        );
        
        console.log(`Transaction hash: ${createPoolTx.hash}`);
        console.log('Waiting for confirmation...');
        
        const receipt = await createPoolTx.wait();
        
        if (receipt.status === 1) {
          console.log('✅ Pool created successfully with minimum odds!');
          
          const newPoolCount = await bitredictPool.poolCount();
          const poolId = newPoolCount - 1n;
          console.log(`Pool ID: ${poolId}`);
          
          const pool = await bitredictPool.pools(poolId);
          console.log(`Odds: ${Number(pool.odds) / 100}x`);
          console.log(`Max Bettor Stake: ${ethers.formatEther(pool.maxBettorStake)} BITR`);
          
        } else {
          console.log('❌ Transaction failed');
        }
        
      } catch (error) {
        console.error('❌ Error creating pool:', error.message);
      }
      
    } else {
      console.log('❌ No working odds found');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testOddsCalculation();
