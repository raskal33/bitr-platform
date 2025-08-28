#!/usr/bin/env node

/**
 * Create Working Market Script
 * 
 * This script creates a market with conservative parameters that should work
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function createWorkingMarket() {
  console.log('🎯 Creating Working Market...');
  
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
    
    // Conservative parameters that should work
    const params = {
      predictedOutcome: ethers.encodeBytes32String("YES"),
      odds: 300, // 3.00x - safe from division by zero
      creatorStake: ethers.parseEther("20"), // Minimum stake
      eventStartTime: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
      eventEndTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      league: "Test League",
      category: "football",
      region: "Test",
      isPrivate: false,
      maxBetPerUser: ethers.parseEther("100"),
      useBitr: true,
      oracleType: 0, // GUIDED
      marketId: ethers.encodeBytes32String("TEST_WORKING")
    };
    
    console.log('\nMarket Parameters:');
    console.log(`Predicted Outcome: ${ethers.decodeBytes32String(params.predictedOutcome)}`);
    console.log(`Odds: ${params.odds / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(params.creatorStake)} BITR`);
    console.log(`Event Start: ${new Date(params.eventStartTime * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(params.eventEndTime * 1000).toLocaleString()}`);
    console.log(`Oracle Type: ${params.oracleType === 0 ? 'GUIDED' : 'OPEN'}`);
    
    // Check balance and allowance
    const balance = await bitrToken.balanceOf(wallet.address);
    const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    const requiredAmount = params.creatorStake + ethers.parseEther("50"); // + creation fee
    
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
    
    // Create the pool
    console.log('\n📝 Creating pool...');
    const createPoolTx = await bitredictPool.createPool(
      params.predictedOutcome,
      params.odds,
      params.creatorStake,
      params.eventStartTime,
      params.eventEndTime,
      params.league,
      params.category,
      params.region,
      params.isPrivate,
      params.maxBetPerUser,
      params.useBitr,
      params.oracleType,
      params.marketId,
      { gasLimit: 1000000 }
    );
    
    console.log(`Transaction hash: ${createPoolTx.hash}`);
    console.log('Waiting for confirmation...');
    
    const receipt = await createPoolTx.wait();
    
    if (receipt.status === 1) {
      console.log('✅ Pool created successfully!');
      
      // Get the new pool ID
      const newPoolCount = await bitredictPool.poolCount();
      const poolId = newPoolCount - 1n;
      console.log(`Pool ID: ${poolId}`);
      
      // Get pool details
      const pool = await bitredictPool.pools(poolId);
      console.log('\nPool Details:');
      console.log(`Creator: ${pool.creator}`);
      console.log(`Predicted Outcome: ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
      console.log(`Odds: ${pool.odds / 100}x`);
      console.log(`Creator Stake: ${ethers.formatEther(pool.creatorStake)} BITR`);
      console.log(`Event Start: ${new Date(Number(pool.eventStartTime) * 1000).toLocaleString()}`);
      console.log(`Event End: ${new Date(Number(pool.eventEndTime) * 1000).toLocaleString()}`);
      console.log(`League: ${pool.league}`);
      console.log(`Category: ${pool.category}`);
      console.log(`Region: ${pool.region}`);
      console.log(`Is Private: ${pool.isPrivate}`);
      console.log(`Uses BITR: ${pool.usesBitr}`);
      console.log(`Oracle Type: ${pool.oracleType === 0n ? 'GUIDED' : 'OPEN'}`);
      console.log(`Market ID: ${ethers.decodeBytes32String(pool.marketId)}`);
      
      console.log('\n🎉 Market created successfully!');
      console.log('You can now use this poolId for frontend integration.');
      
      return { poolId: Number(poolId), pool };
      
    } else {
      console.log('❌ Transaction failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Try to get more details about the error
    if (error.data) {
      console.log('Error data:', error.data);
    }
    
    if (error.reason) {
      console.log('Error reason:', error.reason);
    }
  }
}

createWorkingMarket();
