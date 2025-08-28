#!/usr/bin/env node

/**
 * Test Betting Sequence
 * 
 * Tests betting sequence on Pool ID 4:
 * 1. Bet 20 BITR (should succeed)
 * 2. Bet 50 BITR (should succeed) 
 * 3. Bet 70 BITR (should fail - exceeds remaining capacity)
 * 4. Bet 30 BITR (should succeed and close pool)
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function testBettingSequence() {
  console.log('🎯 Testing Betting Sequence on Pool ID 4...');
  
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
    
    const poolId = 4;
    
    // Get initial pool state
    console.log(`\n📊 Initial Pool State (ID: ${poolId}):`);
    const initialPool = await bitredictPool.pools(poolId);
    console.log(`Creator Stake: ${ethers.formatEther(initialPool.creatorStake)} BITR`);
    console.log(`Max Bettor Stake: ${ethers.formatEther(initialPool.maxBettorStake)} BITR`);
    console.log(`Current Bettor Stake: ${ethers.formatEther(initialPool.totalBettorStake)} BITR`);
    console.log(`Remaining Capacity: ${ethers.formatEther(initialPool.maxBettorStake - initialPool.totalBettorStake)} BITR`);
    console.log(`Betting Active: ${Date.now() / 1000 < Number(initialPool.bettingEndTime) ? '✅ Yes' : '❌ No'}`);
    
    // Check BITR balance and allowance
    const balance = await bitrToken.balanceOf(wallet.address);
    const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    console.log(`\n💰 Wallet State:`);
    console.log(`BITR Balance: ${ethers.formatEther(balance)} BITR`);
    console.log(`Allowance: ${ethers.formatEther(allowance)} BITR`);
    
    // Approve if needed
    if (allowance < ethers.parseEther('200')) {
      console.log('\nApproving BITR tokens...');
      const approveTx = await bitrToken.approve(process.env.BITREDICT_POOL_ADDRESS, ethers.parseEther('10000'));
      await approveTx.wait();
      console.log('✅ Approval confirmed');
    }
    
    // Test 1: Bet 20 BITR
    console.log('\n🎲 Test 1: Betting 20 BITR...');
    try {
      const bet1Amount = ethers.parseEther('20');
      const gasEstimate1 = await bitredictPool.placeBet.estimateGas(poolId, bet1Amount);
      
      const tx1 = await bitredictPool.placeBet(poolId, bet1Amount, { gasLimit: gasEstimate1 + BigInt(50000) });
      console.log(`Transaction hash: ${tx1.hash}`);
      
      const receipt1 = await tx1.wait();
      console.log(`✅ Bet 1 successful! Block: ${receipt1.blockNumber}`);
      
      // Get updated pool state
      const poolAfter1 = await bitredictPool.pools(poolId);
      console.log(`Current Bettor Stake: ${ethers.formatEther(poolAfter1.totalBettorStake)} BITR`);
      console.log(`Remaining Capacity: ${ethers.formatEther(poolAfter1.maxBettorStake - poolAfter1.totalBettorStake)} BITR`);
      
    } catch (error) {
      console.error(`❌ Bet 1 failed: ${error.message}`);
    }
    
    // Test 2: Bet 50 BITR
    console.log('\n🎲 Test 2: Betting 50 BITR...');
    try {
      const bet2Amount = ethers.parseEther('50');
      const gasEstimate2 = await bitredictPool.placeBet.estimateGas(poolId, bet2Amount);
      
      const tx2 = await bitredictPool.placeBet(poolId, bet2Amount, { gasLimit: gasEstimate2 + BigInt(50000) });
      console.log(`Transaction hash: ${tx2.hash}`);
      
      const receipt2 = await tx2.wait();
      console.log(`✅ Bet 2 successful! Block: ${receipt2.blockNumber}`);
      
      // Get updated pool state
      const poolAfter2 = await bitredictPool.pools(poolId);
      console.log(`Current Bettor Stake: ${ethers.formatEther(poolAfter2.totalBettorStake)} BITR`);
      console.log(`Remaining Capacity: ${ethers.formatEther(poolAfter2.maxBettorStake - poolAfter2.totalBettorStake)} BITR`);
      
    } catch (error) {
      console.error(`❌ Bet 2 failed: ${error.message}`);
    }
    
    // Test 3: Bet 70 BITR (should fail)
    console.log('\n🎲 Test 3: Betting 70 BITR (should fail - exceeds remaining capacity)...');
    try {
      const bet3Amount = ethers.parseEther('70');
      const gasEstimate3 = await bitredictPool.placeBet.estimateGas(poolId, bet3Amount);
      
      const tx3 = await bitredictPool.placeBet(poolId, bet3Amount, { gasLimit: gasEstimate3 + BigInt(50000) });
      console.log(`Transaction hash: ${tx3.hash}`);
      
      const receipt3 = await tx3.wait();
      console.log(`❌ Bet 3 should have failed but succeeded! Block: ${receipt3.blockNumber}`);
      
    } catch (error) {
      console.log(`✅ Bet 3 correctly failed: ${error.message}`);
    }
    
    // Test 4: Bet 30 BITR (should succeed and close pool)
    console.log('\n🎲 Test 4: Betting 30 BITR (should succeed and close pool)...');
    try {
      const bet4Amount = ethers.parseEther('30');
      const gasEstimate4 = await bitredictPool.placeBet.estimateGas(poolId, bet4Amount);
      
      const tx4 = await bitredictPool.placeBet(poolId, bet4Amount, { gasLimit: gasEstimate4 + BigInt(50000) });
      console.log(`Transaction hash: ${tx4.hash}`);
      
      const receipt4 = await tx4.wait();
      console.log(`✅ Bet 4 successful! Block: ${receipt4.blockNumber}`);
      
      // Get final pool state
      const finalPool = await bitredictPool.pools(poolId);
      console.log(`\n📊 Final Pool State:`);
      console.log(`Creator Stake: ${ethers.formatEther(finalPool.creatorStake)} BITR`);
      console.log(`Max Bettor Stake: ${ethers.formatEther(finalPool.maxBettorStake)} BITR`);
      console.log(`Current Bettor Stake: ${ethers.formatEther(finalPool.totalBettorStake)} BITR`);
      console.log(`Remaining Capacity: ${ethers.formatEther(finalPool.maxBettorStake - finalPool.totalBettorStake)} BITR`);
      console.log(`Pool Full: ${finalPool.totalBettorStake >= finalPool.maxBettorStake ? '✅ Yes' : '❌ No'}`);
      
    } catch (error) {
      console.error(`❌ Bet 4 failed: ${error.message}`);
    }
    
    console.log('\n🎯 Betting sequence test completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testBettingSequence();
