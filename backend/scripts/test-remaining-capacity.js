#!/usr/bin/env node

/**
 * Test Remaining Betting Capacity
 * 
 * This script tests the remaining 40 BITR betting capacity in the pool
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function testRemainingCapacity() {
  console.log('🎯 Testing Remaining Betting Capacity...');
  
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
    
    // Get current pool state
    const pool = await bitredictPool.pools(poolId);
    console.log('\n📋 Current Pool State:');
    console.log(`Creator Stake: ${ethers.formatEther(pool.creatorStake)} BITR`);
    console.log(`Total Creator Side Stake: ${ethers.formatEther(pool.totalCreatorSideStake)} BITR`);
    console.log(`Max Bettor Stake: ${ethers.formatEther(pool.maxBettorStake)} BITR`);
    console.log(`Total Bettor Stake: ${ethers.formatEther(pool.totalBettorStake)} BITR`);
    console.log(`Odds: ${Number(pool.odds) / 100}x`);
    
    // Calculate remaining capacity
    const maxBettorStake = pool.maxBettorStake;
    const totalBettorStake = pool.totalBettorStake;
    const remainingCapacity = maxBettorStake - totalBettorStake;
    
    console.log(`\n📊 Capacity Analysis:`);
    console.log(`Max Bettor Stake: ${ethers.formatEther(maxBettorStake)} BITR`);
    console.log(`Current Bettor Stake: ${ethers.formatEther(totalBettorStake)} BITR`);
    console.log(`Remaining Capacity: ${ethers.formatEther(remainingCapacity)} BITR`);
    
    // Check wallet balance and allowance
    const balance = await bitrToken.balanceOf(wallet.address);
    const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    console.log(`\n💰 Wallet Status:`);
    console.log(`Balance: ${ethers.formatEther(balance)} BITR`);
    console.log(`Allowance: ${ethers.formatEther(allowance)} BITR`);
    
    // Test 1: Try to bet 100 BITR (should fail - exceeds remaining capacity)
    console.log('\n🎯 Test 1: Try to bet 100 BITR (should fail)');
    
    const testBet100 = ethers.parseEther("100");
    
    if (balance < testBet100) {
      console.log('❌ Insufficient balance for 100 BITR bet');
    } else if (allowance < testBet100) {
      console.log('❌ Insufficient allowance for 100 BITR bet');
    } else {
      try {
        console.log(`Attempting to place ${ethers.formatEther(testBet100)} BITR bet...`);
        
        // Check if this would exceed capacity
        const totalAfterBet = totalBettorStake + testBet100;
        console.log(`Total after bet: ${ethers.formatEther(totalAfterBet)} BITR`);
        console.log(`Would exceed max: ${totalAfterBet > maxBettorStake ? 'Yes' : 'No'}`);
        
        // Test static call first
        const staticBetResult = await bitredictPool.placeBet.staticCall(poolId, testBet100);
        console.log(`✅ Static call successful: ${staticBetResult}`);
        
        // Place the bet
        const betTx = await bitredictPool.placeBet(poolId, testBet100);
        console.log(`Bet transaction: ${betTx.hash}`);
        
        const betReceipt = await betTx.wait();
        if (betReceipt.status === 1) {
          console.log('✅ 100 BITR bet successful!');
          
          // Check updated state
          const updatedPool = await bitredictPool.pools(poolId);
          console.log(`Updated Total Bettor Stake: ${ethers.formatEther(updatedPool.totalBettorStake)} BITR`);
          
        } else {
          console.log('❌ 100 BITR bet failed');
        }
        
      } catch (error) {
        console.log(`❌ 100 BITR bet error: ${error.message}`);
        
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
    
    // Test 2: Try to bet exactly the remaining capacity (40 BITR)
    console.log('\n🎯 Test 2: Try to bet exactly remaining capacity (40 BITR)');
    
    const testBet40 = ethers.parseEther("40");
    
    if (balance < testBet40) {
      console.log('❌ Insufficient balance for 40 BITR bet');
    } else if (allowance < testBet40) {
      console.log('❌ Insufficient allowance for 40 BITR bet');
    } else {
      try {
        console.log(`Attempting to place ${ethers.formatEther(testBet40)} BITR bet...`);
        
        // Check if this would exceed capacity
        const totalAfterBet = totalBettorStake + testBet40;
        console.log(`Total after bet: ${ethers.formatEther(totalAfterBet)} BITR`);
        console.log(`Would exceed max: ${totalAfterBet > maxBettorStake ? 'Yes' : 'No'}`);
        
        // Test static call first
        const staticBetResult = await bitredictPool.placeBet.staticCall(poolId, testBet40);
        console.log(`✅ Static call successful: ${staticBetResult}`);
        
        // Place the bet
        const betTx = await bitredictPool.placeBet(poolId, testBet40);
        console.log(`Bet transaction: ${betTx.hash}`);
        
        const betReceipt = await betTx.wait();
        if (betReceipt.status === 1) {
          console.log('✅ 40 BITR bet successful!');
          
          // Check updated state
          const updatedPool = await bitredictPool.pools(poolId);
          console.log(`Updated Total Bettor Stake: ${ethers.formatEther(updatedPool.totalBettorStake)} BITR`);
          
          // Check if pool is now full
          const newTotalBettorStake = updatedPool.totalBettorStake;
          const newRemainingCapacity = maxBettorStake - newTotalBettorStake;
          console.log(`New Remaining Capacity: ${ethers.formatEther(newRemainingCapacity)} BITR`);
          console.log(`Pool Full: ${newRemainingCapacity <= 0 ? 'Yes' : 'No'}`);
          
        } else {
          console.log('❌ 40 BITR bet failed');
        }
        
      } catch (error) {
        console.log(`❌ 40 BITR bet error: ${error.message}`);
        
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
    
    // Test 3: Try to bet 1 BITR after pool is full (should fail)
    console.log('\n🎯 Test 3: Try to bet 1 BITR after pool is full (should fail)');
    
    const testBet1 = ethers.parseEther("1");
    
    if (balance < testBet1) {
      console.log('❌ Insufficient balance for 1 BITR bet');
    } else if (allowance < testBet1) {
      console.log('❌ Insufficient allowance for 1 BITR bet');
    } else {
      try {
        console.log(`Attempting to place ${ethers.formatEther(testBet1)} BITR bet...`);
        
        // Get current state
        const currentPool = await bitredictPool.pools(poolId);
        const currentTotalBettorStake = currentPool.totalBettorStake;
        const currentMaxBettorStake = currentPool.maxBettorStake;
        
        console.log(`Current Total Bettor Stake: ${ethers.formatEther(currentTotalBettorStake)} BITR`);
        console.log(`Current Max Bettor Stake: ${ethers.formatEther(currentMaxBettorStake)} BITR`);
        
        // Check if this would exceed capacity
        const totalAfterBet = currentTotalBettorStake + testBet1;
        console.log(`Total after bet: ${ethers.formatEther(totalAfterBet)} BITR`);
        console.log(`Would exceed max: ${totalAfterBet > currentMaxBettorStake ? 'Yes' : 'No'}`);
        
        // Test static call first
        const staticBetResult = await bitredictPool.placeBet.staticCall(poolId, testBet1);
        console.log(`✅ Static call successful: ${staticBetResult}`);
        
        // Place the bet
        const betTx = await bitredictPool.placeBet(poolId, testBet1);
        console.log(`Bet transaction: ${betTx.hash}`);
        
        const betReceipt = await betTx.wait();
        if (betReceipt.status === 1) {
          console.log('✅ 1 BITR bet successful!');
          
        } else {
          console.log('❌ 1 BITR bet failed');
        }
        
      } catch (error) {
        console.log(`❌ 1 BITR bet error: ${error.message}`);
        
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
    console.log(`Pool Full: ${finalPool.totalBettorStake >= finalPool.maxBettorStake ? 'Yes' : 'No'}`);
    console.log(`Settled: ${finalPool.settled}`);
    
    console.log('\n🎉 Remaining Capacity Testing Complete!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testRemainingCapacity();
