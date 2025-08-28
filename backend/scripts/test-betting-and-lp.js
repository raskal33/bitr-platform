#!/usr/bin/env node

/**
 * Test Betting and Liquidity Provision
 * 
 * This script tests placing bets and adding liquidity to the created market
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function testBettingAndLP() {
  console.log('🎯 Testing Betting and Liquidity Provision...');
  
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
    
    // Get the latest pool (Pool ID 3 - Coppa Italia)
    const poolCount = await bitredictPool.poolCount();
    const poolId = poolCount - 1n;
    console.log(`\n📊 Testing Pool ID: ${poolId}`);
    
    // Get pool details
    const pool = await bitredictPool.pools(poolId);
    console.log('\n📋 Pool Details:');
    console.log(`Creator: ${pool.creator}`);
    console.log(`Predicted Outcome: ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
    console.log(`Odds: ${Number(pool.odds) / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(pool.creatorStake)} BITR`);
    console.log(`Total Creator Side Stake: ${ethers.formatEther(pool.totalCreatorSideStake)} BITR`);
    console.log(`Max Bettor Stake: ${ethers.formatEther(pool.maxBettorStake)} BITR`);
    console.log(`Total Bettor Stake: ${ethers.formatEther(pool.totalBettorStake)} BITR`);
    console.log(`Event Start: ${new Date(Number(pool.eventStartTime) * 1000).toLocaleString()}`);
    console.log(`Betting End: ${new Date(Number(pool.bettingEndTime) * 1000).toLocaleString()}`);
    console.log(`Max Bet Per User: ${ethers.formatEther(pool.maxBetPerUser)} BITR`);
    console.log(`Is Private: ${pool.isPrivate}`);
    console.log(`Uses BITR: ${pool.usesBitr}`);
    console.log(`Settled: ${pool.settled}`);
    
    // Check current time vs betting end time
    const currentTime = Math.floor(Date.now() / 1000);
    const bettingEndTime = Number(pool.bettingEndTime);
    console.log(`\n⏰ Time Check:`);
    console.log(`Current Time: ${currentTime} (${new Date(currentTime * 1000).toLocaleString()})`);
    console.log(`Betting End: ${bettingEndTime} (${new Date(bettingEndTime * 1000).toLocaleString()})`);
    console.log(`Betting Active: ${currentTime < bettingEndTime ? '✅ Yes' : '❌ No'}`);
    
    if (currentTime >= bettingEndTime) {
      console.log('❌ Betting period has ended');
      return;
    }
    
    // Check wallet balance and allowance
    const balance = await bitrToken.balanceOf(wallet.address);
    const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    console.log(`\n💰 Wallet Status:`);
    console.log(`Balance: ${ethers.formatEther(balance)} BITR`);
    console.log(`Allowance: ${ethers.formatEther(allowance)} BITR`);
    
    // Test 1: Can creator place bets?
    console.log('\n🎯 Test 1: Can Creator Place Bets?');
    
    const creatorBetAmount = ethers.parseEther("10"); // 10 BITR bet
    
    if (balance < creatorBetAmount) {
      console.log('❌ Insufficient balance for creator bet');
    } else if (allowance < creatorBetAmount) {
      console.log('❌ Insufficient allowance for creator bet');
    } else {
      try {
        console.log(`Attempting to place ${ethers.formatEther(creatorBetAmount)} BITR bet as creator...`);
        
        // Check if creator can bet (should be allowed)
        const currentBettorStake = await bitredictPool.bettorStakes(poolId, wallet.address);
        console.log(`Current bettor stake: ${ethers.formatEther(currentBettorStake)} BITR`);
        
        // Test static call first
        const staticBetResult = await bitredictPool.placeBet.staticCall(poolId, creatorBetAmount);
        console.log(`✅ Static call successful: ${staticBetResult}`);
        
        // Place the actual bet
        const betTx = await bitredictPool.placeBet(poolId, creatorBetAmount);
        console.log(`Bet transaction: ${betTx.hash}`);
        
        const betReceipt = await betTx.wait();
        if (betReceipt.status === 1) {
          console.log('✅ Creator bet placed successfully!');
          
          // Check updated pool state
          const updatedPool = await bitredictPool.pools(poolId);
          console.log(`Updated Total Bettor Stake: ${ethers.formatEther(updatedPool.totalBettorStake)} BITR`);
          
          // Check bettor stakes
          const updatedBettorStake = await bitredictPool.bettorStakes(poolId, wallet.address);
          console.log(`Updated Creator Bettor Stake: ${ethers.formatEther(updatedBettorStake)} BITR`);
          
        } else {
          console.log('❌ Creator bet failed');
        }
        
      } catch (error) {
        console.log(`❌ Creator bet error: ${error.message}`);
        
        if (error.data) {
          try {
            const decodedError = bitredictPool.interface.parseError(error.data);
            console.log(`Decoded error: ${decodedError.name} - ${decodedError.args}`);
          } catch (decodeError) {
            console.log(`Could not decode error: ${decodeError.message}`);
          }
        }
      }
    }
    
    // Test 2: Add Liquidity (LP)
    console.log('\n🎯 Test 2: Add Liquidity (LP)');
    
    const lpAmount = ethers.parseEther("50"); // 50 BITR liquidity
    
    if (balance < lpAmount) {
      console.log('❌ Insufficient balance for LP');
    } else if (allowance < lpAmount) {
      console.log('❌ Insufficient allowance for LP');
    } else {
      try {
        console.log(`Attempting to add ${ethers.formatEther(lpAmount)} BITR liquidity...`);
        
        // Check current LP stakes
        const currentLPStake = await bitredictPool.lpStakes(poolId, wallet.address);
        console.log(`Current LP stake: ${ethers.formatEther(currentLPStake)} BITR`);
        
        // Test static call first
        const staticLPResult = await bitredictPool.addLiquidity.staticCall(poolId, lpAmount);
        console.log(`✅ Static call successful: ${staticLPResult}`);
        
        // Add liquidity
        const lpTx = await bitredictPool.addLiquidity(poolId, lpAmount);
        console.log(`LP transaction: ${lpTx.hash}`);
        
        const lpReceipt = await lpTx.wait();
        if (lpReceipt.status === 1) {
          console.log('✅ Liquidity added successfully!');
          
          // Check updated pool state
          const updatedPool = await bitredictPool.pools(poolId);
          console.log(`Updated Total Creator Side Stake: ${ethers.formatEther(updatedPool.totalCreatorSideStake)} BITR`);
          
          // Check LP stakes
          const updatedLPStake = await bitredictPool.lpStakes(poolId, wallet.address);
          console.log(`Updated LP Stake: ${ethers.formatEther(updatedLPStake)} BITR`);
          
          // Get LP providers
          const lpProviders = await bitredictPool.poolLPs(poolId);
          console.log(`LP Providers: ${lpProviders.length}`);
          console.log(`LP Providers: ${lpProviders.join(', ')}`);
          
        } else {
          console.log('❌ LP addition failed');
        }
        
      } catch (error) {
        console.log(`❌ LP error: ${error.message}`);
        
        if (error.data) {
          try {
            const decodedError = bitredictPool.interface.parseError(error.data);
            console.log(`Decoded error: ${decodedError.name} - ${decodedError.args}`);
          } catch (decodeError) {
            console.log(`Could not decode error: ${decodeError.message}`);
          }
        }
      }
    }
    
    // Test 3: Place a larger bet to test max bet per user
    console.log('\n🎯 Test 3: Test Max Bet Per User');
    
    const maxBetAmount = pool.maxBetPerUser;
    console.log(`Max Bet Per User: ${ethers.formatEther(maxBetAmount)} BITR`);
    
    // Try to place a bet at the max limit
    const testBetAmount = ethers.parseEther("100"); // 100 BITR bet
    
    if (balance < testBetAmount) {
      console.log('❌ Insufficient balance for max bet test');
    } else if (allowance < testBetAmount) {
      console.log('❌ Insufficient allowance for max bet test');
    } else {
      try {
        console.log(`Attempting to place ${ethers.formatEther(testBetAmount)} BITR bet (testing max bet limit)...`);
        
        // Check current bettor stake
        const currentBettorStake = await bitredictPool.bettorStakes(poolId, wallet.address);
        console.log(`Current bettor stake: ${ethers.formatEther(currentBettorStake)} BITR`);
        
        // Calculate if this bet would exceed max bet per user
        const totalAfterBet = currentBettorStake + testBetAmount;
        console.log(`Total after bet: ${ethers.formatEther(totalAfterBet)} BITR`);
        console.log(`Would exceed max: ${totalAfterBet > maxBetAmount ? 'Yes' : 'No'}`);
        
        if (totalAfterBet <= maxBetAmount) {
          // Test static call first
          const staticBetResult = await bitredictPool.placeBet.staticCall(poolId, testBetAmount);
          console.log(`✅ Static call successful: ${staticBetResult}`);
          
          // Place the bet
          const betTx = await bitredictPool.placeBet(poolId, testBetAmount);
          console.log(`Bet transaction: ${betTx.hash}`);
          
          const betReceipt = await betTx.wait();
          if (betReceipt.status === 1) {
            console.log('✅ Max bet test successful!');
            
            // Check final state
            const finalPool = await bitredictPool.pools(poolId);
            console.log(`Final Total Bettor Stake: ${ethers.formatEther(finalPool.totalBettorStake)} BITR`);
            
            const finalBettorStake = await bitredictPool.bettorStakes(poolId, wallet.address);
            console.log(`Final Bettor Stake: ${ethers.formatEther(finalBettorStake)} BITR`);
            
          } else {
            console.log('❌ Max bet test failed');
          }
        } else {
          console.log('❌ Bet would exceed max bet per user limit');
        }
        
      } catch (error) {
        console.log(`❌ Max bet test error: ${error.message}`);
        
        if (error.data) {
          try {
            const decodedError = bitredictPool.interface.parseError(error.data);
            console.log(`Decoded error: ${decodedError.name} - ${decodedError.args}`);
          } catch (decodeError) {
            console.log(`Could not decode error: ${decodeError.message}`);
          }
        }
      }
    }
    
    // Final pool state
    console.log('\n📊 Final Pool State:');
    const finalPool = await bitredictPool.pools(poolId);
    console.log(`Creator Stake: ${ethers.formatEther(finalPool.creatorStake)} BITR`);
    console.log(`Total Creator Side Stake: ${ethers.formatEther(finalPool.totalCreatorSideStake)} BITR`);
    console.log(`Total Bettor Stake: ${ethers.formatEther(finalPool.totalBettorStake)} BITR`);
    console.log(`Max Bettor Stake: ${ethers.formatEther(finalPool.maxBettorStake)} BITR`);
    console.log(`Settled: ${finalPool.settled}`);
    
    console.log('\n🎉 Betting and LP Testing Complete!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testBettingAndLP();
