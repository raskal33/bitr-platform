#!/usr/bin/env node

/**
 * Create DFB Pokal Market
 * 
 * This script creates the guided prediction market for the DFB Pokal match:
 * DFB Pokal - Schweinfurt vs Fortuna Düsseldorf
 * Market: Fortuna Düsseldorf wins - YES
 * Odds: 2.65x (265 in contract format)
 * Creator Stake: 2000 BITR
 * 
 * Usage: node scripts/create-dfb-pokal-market.js
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function createDfbPokalMarket() {
  console.log('🎯 Creating DFB Pokal Market...');
  
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
    
    // DFB Pokal market parameters
    const params = {
      predictedOutcome: ethers.encodeBytes32String("YES"), // Fortuna Düsseldorf wins
      odds: 265, // 2.65x in contract format (must be > 200 to avoid division by zero)
      creatorStake: ethers.parseEther("2000"), // 2000 BITR
      eventStartTime: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
      eventEndTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      league: "DFB Pokal",
      category: "football",
      region: "Germany",
      isPrivate: false, // Public market
      maxBetPerUser: ethers.parseEther("1000"), // 1000 BITR max per user
      useBitr: true, // BITR market
      oracleType: 0, // GUIDED oracle
      marketId: ethers.encodeBytes32String("DFB_SCHWEINFURT_DUSSELDORF")
    };
    
    console.log('\n🎯 DFB Pokal Market Details:');
    console.log(`League: ${params.league}`);
    console.log(`Match: Schweinfurt vs Fortuna Düsseldorf`);
    console.log(`Prediction: Fortuna Düsseldorf wins - ${ethers.decodeBytes32String(params.predictedOutcome)}`);
    console.log(`Odds: ${params.odds / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(params.creatorStake)} BITR`);
    console.log(`Event Start: ${new Date(params.eventStartTime * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(params.eventEndTime * 1000).toLocaleString()}`);
    console.log(`Market Type: ${params.isPrivate ? 'Private' : 'Public'}`);
    console.log(`Token: ${params.useBitr ? 'BITR' : 'STT'}`);
    console.log(`Oracle: ${params.oracleType === 0 ? 'Guided' : 'Open'}`);
    console.log(`Max Bet Per User: ${ethers.formatEther(params.maxBetPerUser)} BITR`);
    
    // Check balance and allowance
    const balance = await bitrToken.balanceOf(wallet.address);
    const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    const requiredAmount = params.creatorStake + ethers.parseEther("50"); // + creation fee
    
    console.log(`\n💰 Wallet Status:`);
    console.log(`Balance: ${ethers.formatEther(balance)} BITR`);
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
    
    // Get current pool count
    const currentPoolCount = await bitredictPool.poolCount();
    console.log(`\n📊 Current Pool Count: ${currentPoolCount}`);
    
    // Create the pool
    console.log('\n📝 Creating DFB Pokal market...');
    
    // Estimate gas first
    try {
      const gasEstimate = await bitredictPool.createPool.estimateGas(
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
        params.marketId
      );
      
      console.log(`Estimated gas: ${gasEstimate.toString()}`);
      
      // Add 20% buffer
      const gasLimit = gasEstimate * 120n / 100n;
      console.log(`Using gas limit: ${gasLimit.toString()}`);
      
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
        { gasLimit }
      );
      
      console.log(`Transaction hash: ${createPoolTx.hash}`);
      console.log('Waiting for confirmation...');
      
      const receipt = await createPoolTx.wait();
      
      if (receipt.status === 1) {
        console.log('✅ DFB Pokal market created successfully!');
        
        // Get the new pool ID
        const newPoolCount = await bitredictPool.poolCount();
        const poolId = newPoolCount - 1n;
        console.log(`Pool ID: ${poolId}`);
        
        // Get pool details
        const pool = await bitredictPool.pools(poolId);
        console.log('\n📊 Market Details:');
        console.log(`Creator: ${pool.creator}`);
        console.log(`Predicted Outcome: ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
        console.log(`Odds: ${pool.odds / 100}x`);
        console.log(`Creator Stake: ${ethers.formatEther(pool.creatorStake)} BITR`);
        console.log(`Event Start: ${new Date(Number(pool.eventStartTime) * 1000).toLocaleString()}`);
        console.log(`Event End: ${new Date(Number(pool.eventEndTime) * 1000).toLocaleString()}`);
        console.log(`Betting End: ${new Date(Number(pool.bettingEndTime) * 1000).toLocaleString()}`);
        console.log(`League: ${pool.league}`);
        console.log(`Category: ${pool.category}`);
        console.log(`Region: ${pool.region}`);
        console.log(`Is Private: ${pool.isPrivate}`);
        console.log(`Uses BITR: ${pool.usesBitr}`);
        console.log(`Oracle Type: ${pool.oracleType === 0n ? 'GUIDED' : 'OPEN'}`);
        console.log(`Market ID: ${ethers.decodeBytes32String(pool.marketId)}`);
        console.log(`Max Bet Per User: ${ethers.formatEther(pool.maxBetPerUser)} BITR`);
        
        // Calculate max bettor stake
        const maxBettorStake = ethers.formatEther(pool.maxBettorStake);
        console.log(`Max Bettor Stake: ${maxBettorStake} BITR`);
        
        console.log('\n🎉 DFB Pokal Market Created Successfully!');
        console.log('==========================================');
        console.log(`Pool ID: ${poolId}`);
        console.log(`Market: ${pool.league} - Schweinfurt vs Fortuna Düsseldorf`);
        console.log(`Prediction: Fortuna Düsseldorf wins - ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
        console.log(`Odds: ${pool.odds / 100}x`);
        console.log(`Creator Stake: ${ethers.formatEther(pool.creatorStake)} BITR`);
        console.log(`Event Time: ${new Date(Number(pool.eventStartTime) * 1000).toLocaleString()}`);
        console.log(`Market Type: ${pool.isPrivate ? 'Private' : 'Public'} ${pool.oracleType === 0n ? 'GUIDED' : 'OPEN'}`);
        
        console.log('\n🔗 Frontend Integration:');
        console.log('Use the following information for frontend integration:');
        console.log(`- Pool ID: ${poolId}`);
        console.log(`- Contract Address: ${process.env.BITREDICT_POOL_ADDRESS}`);
        console.log(`- Market Type: Guided Prediction Market`);
        console.log(`- Token: BITR`);
        console.log(`- Max Bet Per User: ${ethers.formatEther(pool.maxBetPerUser)} BITR`);
        console.log(`- Max Bettor Stake: ${maxBettorStake} BITR`);
        
        return { poolId: Number(poolId), pool };
        
      } else {
        console.log('❌ Transaction failed');
      }
      
    } catch (error) {
      console.error('❌ Error creating market:', error.message);
      
      // Try to get more details about the error
      if (error.data) {
        console.log('Error data:', error.data);
      }
      
      if (error.reason) {
        console.log('Error reason:', error.reason);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createDfbPokalMarket();
