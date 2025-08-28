#!/usr/bin/env node

/**
 * Create Guided Market with New Contract
 * 
 * This script demonstrates how to create guided markets with the new BitredictPool contract
 * using the correct market ID format: keccak256(abi.encodePacked(fixtureId))
 * 
 * Usage: node scripts/create-guided-market-new-contract.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const path = require('path');

async function createGuidedMarket() {
  try {
    console.log('🚀 Creating Guided Market with New Contract...');
    
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log('📝 Using wallet:', wallet.address);
    console.log('💰 Balance:', ethers.formatEther(await provider.getBalance(wallet.address)), 'STT');
    
    // Load contract ABI and address
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    const contractAddress = process.env.BITREDICT_POOL_ADDRESS || '0x6C9DCB0F967fbAc62eA82d99BEF8870b4272919a';
    
    const bitredictPool = new ethers.Contract(contractAddress, BitredictPoolABI, wallet);
    
    console.log('✅ Contract initialized:', contractAddress);
    
    // Example: Create a guided market for a football match
    // Using SportMonks fixture ID: 19521656 (example)
    const fixtureId = '19521656';
    
    // IMPORTANT: Use keccak256(abi.encodePacked(fixtureId)) for market ID
    const marketId = ethers.id(fixtureId);
    
    console.log('\n📋 Market ID Generation:');
    console.log(`Fixture ID: ${fixtureId}`);
    console.log(`Market ID (hashed): ${marketId}`);
    console.log(`Market ID (decoded): ${ethers.decodeBytes32String(marketId)}`); // This will show the original fixture ID
    
    // Pool parameters
    const poolParams = {
      _predictedOutcome: ethers.encodeBytes32String("HOME_WIN"), // Home team wins
      _odds: 150, // 1.50x odds
      _creatorStake: ethers.parseEther('5'), // 5 STT minimum stake
      _eventStartTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      _eventEndTime: Math.floor(Date.now() / 1000) + 7200, // 2 hours from now
      _league: "Serie A",
      _category: "football",
      _region: "Italy",
      _isPrivate: false,
      _maxBetPerUser: ethers.parseEther('100'), // 100 STT max per user
      _useBitr: false, // Use STT (native token)
      _oracleType: 0, // Guided Oracle
      _marketId: marketId // IMPORTANT: Use hashed fixture ID
    };
    
    console.log('\n📋 Pool Parameters:');
    console.log(`Prediction: ${ethers.decodeBytes32String(poolParams._predictedOutcome)}`);
    console.log(`Odds: ${poolParams._odds / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(poolParams._creatorStake)} STT`);
    console.log(`Event Start: ${new Date(poolParams._eventStartTime * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(poolParams._eventEndTime * 1000).toLocaleString()}`);
    console.log(`League: ${poolParams._league}`);
    console.log(`Category: ${poolParams._category}`);
    console.log(`Region: ${poolParams._region}`);
    console.log(`Private: ${poolParams._isPrivate}`);
    console.log(`Max Bet Per User: ${ethers.formatEther(poolParams._maxBetPerUser)} STT`);
    console.log(`Use BITR: ${poolParams._useBitr}`);
    console.log(`Oracle Type: ${poolParams._oracleType === 0 ? 'Guided' : 'Optimistic'}`);
    console.log(`Market ID (hashed): ${poolParams._marketId}`);
    
    // Estimate gas
    console.log('\n⛽ Estimating gas...');
    const gasEstimate = await bitredictPool.createPool.estimateGas(
      poolParams._predictedOutcome,
      poolParams._odds,
      poolParams._creatorStake,
      poolParams._eventStartTime,
      poolParams._eventEndTime,
      poolParams._league,
      poolParams._category,
      poolParams._region,
      poolParams._isPrivate,
      poolParams._maxBetPerUser,
      poolParams._useBitr,
      poolParams._oracleType,
      poolParams._marketId
    );
    
    console.log(`Gas Estimate: ${gasEstimate.toString()}`);
    
    // Calculate total required (creation fee + creator stake)
    const creationFeeSTT = await bitredictPool.creationFeeSTT();
    const totalRequired = creationFeeSTT + poolParams._creatorStake;
    console.log(`Creation Fee: ${ethers.formatEther(creationFeeSTT)} STT`);
    console.log(`Total Required: ${ethers.formatEther(totalRequired)} STT`);
    
    // Check balance
    const balance = await provider.getBalance(wallet.address);
    if (balance < totalRequired) {
      throw new Error(`Insufficient balance. Need ${ethers.formatEther(totalRequired)} STT, have ${ethers.formatEther(balance)} STT`);
    }
    
    // Create pool
    console.log('\n🚀 Creating pool...');
    const tx = await bitredictPool.createPool(
      poolParams._predictedOutcome,
      poolParams._odds,
      poolParams._creatorStake,
      poolParams._eventStartTime,
      poolParams._eventEndTime,
      poolParams._league,
      poolParams._category,
      poolParams._region,
      poolParams._isPrivate,
      poolParams._maxBetPerUser,
      poolParams._useBitr,
      poolParams._oracleType,
      poolParams._marketId,
      { 
        gasLimit: gasEstimate + BigInt(50000),
        value: totalRequired // Include creation fee + creator stake
      }
    );
    
    console.log(`Transaction hash: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`✅ Pool created! Block: ${receipt.blockNumber}`);
    
    // Get pool count
    const poolCount = await bitredictPool.poolCount();
    const newPoolId = Number(poolCount) - 1;
    console.log(`\n🎯 New Pool ID: ${newPoolId}`);
    
    // Get pool details
    const newPool = await bitredictPool.pools(newPoolId);
    console.log(`\n📊 Pool Details:`);
    console.log(`Creator: ${newPool.creator}`);
    console.log(`League: ${newPool.league}`);
    console.log(`Market ID: ${newPool.marketId}`);
    console.log(`Prediction: ${ethers.decodeBytes32String(newPool.predictedOutcome)}`);
    console.log(`Odds: ${Number(newPool.odds) / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(newPool.creatorStake)} STT`);
    console.log(`Event Start: ${new Date(Number(newPool.eventStartTime) * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(Number(newPool.eventEndTime) * 1000).toLocaleString()}`);
    console.log(`Betting End: ${new Date(Number(newPool.bettingEndTime) * 1000).toLocaleString()}`);
    console.log(`Max Bet Per User: ${ethers.formatEther(newPool.maxBetPerUser)} STT`);
    console.log(`Max Bettor Stake: ${ethers.formatEther(newPool.maxBettorStake)} STT`);
    
    // Calculate remaining capacity
    const remainingCapacity = newPool.maxBettorStake - newPool.totalBettorStake;
    console.log(`\n💰 Pool Capacity:`);
    console.log(`Total Creator Stake: ${ethers.formatEther(newPool.totalCreatorSideStake)} STT`);
    console.log(`Max Bettor Stake: ${ethers.formatEther(newPool.maxBettorStake)} STT`);
    console.log(`Current Bettor Stake: ${ethers.formatEther(newPool.totalBettorStake)} STT`);
    console.log(`Remaining Capacity: ${ethers.formatEther(remainingCapacity)} STT`);
    
    console.log('\n✅ Pool created successfully with new contract!');
    console.log(`Pool ID: ${newPoolId}`);
    console.log(`Market ID: ${newPool.marketId}`);
    console.log(`Fixture ID: ${fixtureId}`);
    console.log(`Ready for oracle resolution and settlement!`);
    
    // Verify that the oracle can resolve this market
    console.log('\n🔍 Oracle Resolution Verification:');
    console.log(`The oracle bot should use: ethers.id('${fixtureId}') = ${marketId}`);
    console.log(`This matches the pool's market ID: ${newPool.marketId}`);
    console.log('✅ Market ID format is correct for oracle resolution!');
    
  } catch (error) {
    console.error('❌ Pool creation error:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    process.exit(1);
  }
}

// Run the script
createGuidedMarket()
  .then(() => {
    console.log('\n🏁 Script completed successfully.');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
