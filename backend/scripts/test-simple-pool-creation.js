#!/usr/bin/env node

/**
 * Simple Pool Creation Test
 * 
 * This script tests a minimal pool creation to identify the issue
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function testSimplePoolCreation() {
  console.log('🧪 Testing Simple Pool Creation...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    
    // Load contract ABI
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    const BitrTokenABI = require('../../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json').abi;
    
    // Initialize contracts
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, BitredictPoolABI, wallet);
    const bitrToken = new ethers.Contract(process.env.BITR_TOKEN_ADDRESS, BitrTokenABI, wallet);
    
    console.log('Contracts initialized');
    
    // Check current pool count
    const currentPoolCount = await bitredictPool.poolCount();
    console.log(`Current pool count: ${currentPoolCount}`);
    
    // Test minimal parameters
    const testParams = {
      predictedOutcome: ethers.encodeBytes32String("YES"),
      odds: 150, // 1.50x
      creatorStake: ethers.parseEther("20"), // Minimum stake
      eventStartTime: Math.floor(Date.now() / 1000) + 120, // 2 minutes from now
      eventEndTime: Math.floor(Date.now() / 1000) + 1800, // 30 minutes from now
      league: "Test League",
      category: "test",
      region: "Test",
      isPrivate: false,
      maxBetPerUser: ethers.parseEther("100"),
      useBitr: true,
      oracleType: 0, // GUIDED
      marketId: ethers.encodeBytes32String("TEST_MARKET")
    };
    
    console.log('\nTest Parameters:');
    console.log(`Predicted Outcome: ${ethers.decodeBytes32String(testParams.predictedOutcome)}`);
    console.log(`Odds: ${testParams.odds / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(testParams.creatorStake)} BITR`);
    console.log(`Event Start: ${new Date(testParams.eventStartTime * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(testParams.eventEndTime * 1000).toLocaleString()}`);
    
    // Check balance and allowance
    const balance = await bitrToken.balanceOf(wallet.address);
    const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    const requiredAmount = testParams.creatorStake + ethers.parseEther("50"); // + creation fee
    
    console.log(`\nBalance: ${ethers.formatEther(balance)} BITR`);
    console.log(`Allowance: ${ethers.formatEther(allowance)} BITR`);
    console.log(`Required: ${ethers.formatEther(requiredAmount)} BITR`);
    
    if (balance < requiredAmount) {
      console.log('❌ Insufficient balance');
      return;
    }
    
    if (allowance < requiredAmount) {
      console.log('Approving tokens...');
      const approveTx = await bitrToken.approve(process.env.BITREDICT_POOL_ADDRESS, requiredAmount);
      await approveTx.wait();
      console.log('✅ Tokens approved');
    }
    
    // Test the function call data encoding
    console.log('\n🔧 Testing function call encoding...');
    
    try {
      const encodedData = bitredictPool.interface.encodeFunctionData('createPool', [
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
        testParams.marketId
      ]);
      
      console.log(`Encoded data length: ${encodedData.length}`);
      console.log(`Encoded data: ${encodedData.substring(0, 100)}...`);
      
      // Try to create the pool
      console.log('\n📝 Creating pool...');
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
        { gasLimit: 1000000 }
      );
      
      console.log(`Transaction hash: ${createPoolTx.hash}`);
      console.log('Waiting for confirmation...');
      
      const receipt = await createPoolTx.wait();
      
      if (receipt.status === 1) {
        console.log('✅ Pool created successfully!');
        const newPoolCount = await bitredictPool.poolCount();
        const poolId = newPoolCount - 1n;
        console.log(`Pool ID: ${poolId}`);
      } else {
        console.log('❌ Transaction failed');
      }
      
    } catch (error) {
      console.error('❌ Function call error:', error.message);
      
      // Try to get more details about the error
      if (error.data) {
        console.log('Error data:', error.data);
      }
      
      if (error.reason) {
        console.log('Error reason:', error.reason);
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testSimplePoolCreation();
