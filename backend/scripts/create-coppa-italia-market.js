#!/usr/bin/env node

/**
 * Create Coppa Italia Market
 * 
 * This script creates a guided prediction market for the Coppa Italia match:
 * Coppa Italia - Udinese vs Carrarese
 * Market: Udinese wins - YES
 * Odds: 1.5x (150 in contract format)
 * Creator Stake: 100 BITR
 * 
 * This tests the contract with full real data to ensure it works correctly.
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function createCoppaItaliaMarket() {
  console.log('🎯 Creating Coppa Italia Market...');
  
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
    
    // Coppa Italia market parameters
    const params = {
      predictedOutcome: ethers.encodeBytes32String("YES"), // Udinese wins
      odds: 150, // 1.5x in contract format (150 = 1.5)
      creatorStake: ethers.parseEther("100"), // 100 BITR
      eventStartTime: Math.floor(Date.now() / 1000) + 600, // 10 minutes from now
      eventEndTime: Math.floor(Date.now() / 1000) + 7200, // 2 hours from now
      league: "Coppa Italia",
      category: "football",
      region: "Italy",
      isPrivate: false, // Public market
      maxBetPerUser: ethers.parseEther("500"), // 500 BITR max per user
      useBitr: true, // BITR market
      oracleType: 0, // GUIDED oracle
      marketId: ethers.encodeBytes32String("COPPA_UDINESE_CARRARESE")
    };
    
    console.log('\n🎯 Coppa Italia Market Details:');
    console.log(`League: ${params.league}`);
    console.log(`Match: Udinese vs Carrarese`);
    console.log(`Prediction: Udinese wins - ${ethers.decodeBytes32String(params.predictedOutcome)}`);
    console.log(`Odds: ${params.odds / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(params.creatorStake)} BITR`);
    console.log(`Event Start: ${new Date(params.eventStartTime * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(params.eventEndTime * 1000).toLocaleString()}`);
    console.log(`Market Type: ${params.isPrivate ? 'Private' : 'Public'}`);
    console.log(`Token: ${params.useBitr ? 'BITR' : 'STT'}`);
    console.log(`Oracle: ${params.oracleType === 0 ? 'Guided' : 'Open'}`);
    console.log(`Max Bet Per User: ${ethers.formatEther(params.maxBetPerUser)} BITR`);
    console.log(`Market ID: ${ethers.decodeBytes32String(params.marketId)}`);
    
    // Check current state
    console.log('\n📊 Current State:');
    const poolCount = await bitredictPool.poolCount();
    console.log(`Pool Count: ${poolCount}`);
    
    const balance = await bitrToken.balanceOf(wallet.address);
    const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    console.log(`Balance: ${ethers.formatEther(balance)} BITR`);
    console.log(`Allowance: ${ethers.formatEther(allowance)} BITR`);
    
    // Check if we need to approve more tokens
    const creationFee = await bitredictPool.creationFee();
    const totalRequired = params.creatorStake + creationFee;
    console.log(`Required: ${ethers.formatEther(totalRequired)} BITR (stake + creation fee)`);
    
    if (allowance < totalRequired) {
      console.log('\n🔧 Approving additional tokens...');
      const approveTx = await bitrToken.approve(process.env.BITREDICT_POOL_ADDRESS, ethers.parseEther("100000"));
      console.log(`Approval transaction: ${approveTx.hash}`);
      
      const receipt = await approveTx.wait();
      if (receipt.status === 1) {
        console.log('✅ Tokens approved');
      } else {
        console.log('❌ Approval failed');
        return;
      }
    }
    
    // Validate all parameters before creating
    console.log('\n🔍 Parameter Validation:');
    
    // 1. Odds validation: _odds > 100 && _odds <= 10000
    if (params.odds > 100 && params.odds <= 10000) {
      console.log('✅ Odds are valid');
    } else {
      console.log('❌ Odds are invalid');
      return;
    }
    
    // 2. Creator stake validation
    const minPoolStake = await bitredictPool.minPoolStake();
    if (params.creatorStake >= minPoolStake) {
      console.log('✅ Creator stake is valid');
    } else {
      console.log('❌ Creator stake is too low');
      return;
    }
    
    // 3. Event time validation
    const currentTime = Math.floor(Date.now() / 1000);
    const bettingGracePeriod = await bitredictPool.bettingGracePeriod();
    const minEventStartTime = currentTime + Number(bettingGracePeriod);
    
    if (params.eventStartTime > minEventStartTime) {
      console.log('✅ Event start time respects grace period');
    } else {
      console.log('❌ Event start time is too soon');
      return;
    }
    
    if (params.eventEndTime > params.eventStartTime) {
      console.log('✅ Event end time is after start time');
    } else {
      console.log('❌ Event end time is not after start time');
      return;
    }
    
    // Create the pool
    console.log('\n📝 Creating Coppa Italia market...');
    
    try {
      // First, try a static call to see if it would succeed
      console.log('Testing static call...');
      const staticResult = await bitredictPool.createPool.staticCall(
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
      console.log(`✅ Static call successful: ${staticResult}`);
      
      // If static call succeeds, try the actual transaction
      console.log('Creating actual transaction...');
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
        { gasLimit: 8000000 }
      );
      
      console.log(`Transaction hash: ${createPoolTx.hash}`);
      console.log('Waiting for confirmation...');
      
      const receipt = await createPoolTx.wait();
      
      if (receipt.status === 1) {
        console.log('✅ Coppa Italia market created successfully!');
        
        // Get the new pool ID
        const newPoolCount = await bitredictPool.poolCount();
        const poolId = newPoolCount - 1n;
        console.log(`Pool ID: ${poolId}`);
        
        // Get pool details
        const pool = await bitredictPool.pools(poolId);
        console.log('\n📊 Market Details:');
        console.log(`Creator: ${pool.creator}`);
        console.log(`Predicted Outcome: ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
        console.log(`Odds: ${Number(pool.odds) / 100}x`);
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
        console.log(`Settled: ${pool.settled}`);
        console.log(`Creator Side Won: ${pool.creatorSideWon}`);
        
        // Calculate max bettor stake
        const maxBettorStake = ethers.formatEther(pool.maxBettorStake);
        console.log(`Max Bettor Stake: ${maxBettorStake} BITR`);
        
        console.log('\n🎉 Coppa Italia Market Created Successfully!');
        console.log('=============================================');
        console.log(`Pool ID: ${poolId}`);
        console.log(`Market: ${pool.league} - Udinese vs Carrarese`);
        console.log(`Prediction: Udinese wins - ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
        console.log(`Odds: ${Number(pool.odds) / 100}x`);
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
        console.log('Receipt:', receipt);
      }
      
    } catch (error) {
      console.error('❌ Error creating pool:', error.message);
      
      // Try to decode the error
      if (error.data) {
        console.log(`Error data: ${error.data}`);
        
        // Try to decode as a custom error
        try {
          const decodedError = bitredictPool.interface.parseError(error.data);
          console.log(`Decoded error: ${decodedError.name} - ${decodedError.args}`);
        } catch (decodeError) {
          console.log(`Could not decode error: ${decodeError.message}`);
          
          // Try to decode as a revert string
          try {
            const decodedRevert = ethers.toUtf8String(error.data);
            console.log(`Decoded revert: ${decodedRevert}`);
          } catch (revertError) {
            console.log(`Could not decode revert: ${revertError.message}`);
          }
        }
      }
      
      if (error.reason) {
        console.log(`Error reason: ${error.reason}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

createCoppaItaliaMarket();
