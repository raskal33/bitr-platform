#!/usr/bin/env node

/**
 * Test Pool Resolution and Claiming
 * 
 * Resolves both pools and tests claiming functionality:
 * 1. Resolve Pool 3 (wrong timing) with 2-1 home win
 * 2. Try to resolve Pool 4 (correct timing) - should fail as event hasn't started
 * 3. Test claiming from both creator and bettor perspectives
 */

// NOTE: This script uses ethers for BitredictPool contract testing
// For Oddyssey contract, use the viem-based scripts instead:
// - test-oddyssey-with-viem.js
// - test-oddyssey-slip-placement.js

const { ethers } = require('ethers');
require('dotenv').config();

async function testPoolResolutionAndClaiming() {
  console.log('🎯 Testing Pool Resolution and Claiming...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    
    // Load contract ABIs
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    const BitredictTokenABI = require('../../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json').abi;
    
    // Initialize contracts
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, BitredictPoolABI, wallet);
    const bitrToken = new ethers.Contract(process.env.BITR_TOKEN_ADDRESS, BitredictTokenABI, wallet);
    
    console.log('Contracts initialized');
    
    // Check current time
    const currentTime = Math.floor(Date.now() / 1000);
    console.log(`\n⏰ Current Time: ${new Date(currentTime * 1000).toLocaleString()}`);
    
    // ===== POOL 3 (Wrong Timing) =====
    console.log('\n🔍 Pool 3 (Wrong Timing) Analysis:');
    const pool3 = await bitredictPool.pools(3);
    console.log(`Event Start: ${new Date(Number(pool3.eventStartTime) * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(Number(pool3.eventEndTime) * 1000).toLocaleString()}`);
    console.log(`Current Time: ${new Date(currentTime * 1000).toLocaleString()}`);
    console.log(`Event Started: ${currentTime > Number(pool3.eventStartTime) ? '✅ Yes' : '❌ No'}`);
    console.log(`Event Ended: ${currentTime > Number(pool3.eventEndTime) ? '✅ Yes' : '❌ No'}`);
    console.log(`Can Resolve: ${currentTime > Number(pool3.eventEndTime) ? '✅ Yes' : '❌ No'}`);
    
    // Resolve Pool 3 (wrong timing - event has ended)
    if (currentTime > Number(pool3.eventEndTime)) {
      console.log('\n🎯 Resolving Pool 3 (Wrong Timing)...');
      try {
        // Resolve with 2-1 home win (Udinese wins)
        const outcome = ethers.encodeBytes32String("Udinese Wins");
        
        const gasEstimate = await bitredictPool.settlePool.estimateGas(3, outcome);
        
        const tx = await bitredictPool.settlePool(3, outcome, { gasLimit: gasEstimate + BigInt(50000) });
        console.log(`Transaction hash: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Pool 3 resolved! Block: ${receipt.blockNumber}`);
        
        // Check pool state after resolution
        const pool3After = await bitredictPool.pools(3);
        console.log(`Pool Settled: ${pool3After.settled ? '✅ Yes' : '❌ No'}`);
        console.log(`Result: ${ethers.decodeBytes32String(pool3After.result)}`);
        console.log(`Creator Side Won: ${pool3After.creatorSideWon ? '✅ Yes' : '❌ No'}`);
        
      } catch (error) {
        console.error(`❌ Pool 3 resolution failed: ${error.message}`);
      }
    }
    
    // ===== POOL 4 (Correct Timing) =====
    console.log('\n🔍 Pool 4 (Correct Timing) Analysis:');
    const pool4 = await bitredictPool.pools(4);
    console.log(`Event Start: ${new Date(Number(pool4.eventStartTime) * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(Number(pool4.eventEndTime) * 1000).toLocaleString()}`);
    console.log(`Current Time: ${new Date(currentTime * 1000).toLocaleString()}`);
    console.log(`Event Started: ${currentTime > Number(pool4.eventStartTime) ? '✅ Yes' : '❌ No'}`);
    console.log(`Event Ended: ${currentTime > Number(pool4.eventEndTime) ? '✅ Yes' : '❌ No'}`);
    console.log(`Can Resolve: ${currentTime > Number(pool4.eventEndTime) ? '✅ Yes' : '❌ No'}`);
    
    // Try to resolve Pool 4 (should fail as event hasn't started)
    if (currentTime <= Number(pool4.eventEndTime)) {
      console.log('\n🎯 Attempting to resolve Pool 4 (should fail)...');
      try {
        const outcome = ethers.encodeBytes32String("Udinese Wins");
        
        const gasEstimate = await bitredictPool.settlePool.estimateGas(4, outcome);
        
        const tx = await bitredictPool.settlePool(4, outcome, { gasLimit: gasEstimate + BigInt(50000) });
        console.log(`Transaction hash: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`❌ Pool 4 resolution should have failed but succeeded! Block: ${receipt.blockNumber}`);
        
      } catch (error) {
        console.log(`✅ Pool 4 resolution correctly failed: ${error.message}`);
      }
    }
    
    // ===== TEST CLAIMING =====
    console.log('\n💰 Testing Claiming Functionality...');
    
    // Check if Pool 3 is resolved and can be claimed
    const pool3Final = await bitredictPool.pools(3);
    if (pool3Final.settled) {
      console.log('\n🎯 Testing claims for Pool 3 (Resolved)...');
      
      // Test claiming (handles both creator and bettor automatically)
      console.log('\n💰 Testing Claim...');
      try {
        // Check if already claimed
        const claimed = await bitredictPool.claimed(3, wallet.address);
        console.log(`Already Claimed: ${claimed ? '✅ Yes' : '❌ No'}`);
        
        if (!claimed) {
          const gasEstimate = await bitredictPool.claim.estimateGas(3);
          
          const tx = await bitredictPool.claim(3, { gasLimit: gasEstimate + BigInt(50000) });
          console.log(`Claim transaction hash: ${tx.hash}`);
          
          const receipt = await tx.wait();
          console.log(`✅ Claim successful! Block: ${receipt.blockNumber}`);
          
          // Check what was claimed
          const poolAfterClaim = await bitredictPool.pools(3);
          console.log(`Pool Creator Side Won: ${poolAfterClaim.creatorSideWon ? '✅ Yes' : '❌ No'}`);
          console.log(`Pool Result: ${ethers.decodeBytes32String(poolAfterClaim.result)}`);
          
          // Check our stakes
          const lpStake = await bitredictPool.lpStakes(3, wallet.address);
          const bettorStake = await bitredictPool.bettorStakes(3, wallet.address);
          console.log(`Our LP Stake: ${ethers.formatEther(lpStake)} BITR`);
          console.log(`Our Bettor Stake: ${ethers.formatEther(bettorStake)} BITR`);
          
        } else {
          console.log('ℹ️ Already claimed for this pool');
        }
        
      } catch (error) {
        console.error(`❌ Claim failed: ${error.message}`);
      }
    } else {
      console.log('\nℹ️ Pool 3 is not settled yet, cannot test claiming');
    }
    
    // Check final BITR balance
    const finalBalance = await bitrToken.balanceOf(wallet.address);
    console.log(`\n💰 Final BITR Balance: ${ethers.formatEther(finalBalance)} BITR`);
    
    console.log('\n🎯 Pool resolution and claiming test completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testPoolResolutionAndClaiming();
