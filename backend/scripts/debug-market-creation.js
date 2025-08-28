#!/usr/bin/env node

/**
 * Debug Market Creation Script
 * 
 * This script helps identify why market creation is failing
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function debugMarketCreation() {
  console.log('🔍 Debugging Market Creation...');
  
  // Check environment variables
  console.log('\n📋 Environment Variables:');
  console.log(`BITREDICT_POOL_ADDRESS: ${process.env.BITREDICT_POOL_ADDRESS || 'NOT SET'}`);
  console.log(`BITR_TOKEN_ADDRESS: ${process.env.BITR_TOKEN_ADDRESS || 'NOT SET'}`);
  console.log(`GUIDED_ORACLE_ADDRESS: ${process.env.GUIDED_ORACLE_ADDRESS || 'NOT SET'}`);
  console.log(`OPTIMISTIC_ORACLE_ADDRESS: ${process.env.OPTIMISTIC_ORACLE_ADDRESS || 'NOT SET'}`);
  console.log(`PRIVATE_KEY: ${process.env.PRIVATE_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`RPC_URL: ${process.env.RPC_URL || 'NOT SET'}`);
  
  if (!process.env.BITREDICT_POOL_ADDRESS || !process.env.BITR_TOKEN_ADDRESS || !process.env.PRIVATE_KEY) {
    console.log('\n❌ Missing required environment variables!');
    return;
  }
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`\n✅ Wallet: ${wallet.address}`);
    
    // Load contract ABIs
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    const BitrTokenABI = require('../../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json').abi;
    
    // Initialize contracts
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, BitredictPoolABI, wallet);
    const bitrToken = new ethers.Contract(process.env.BITR_TOKEN_ADDRESS, BitrTokenABI, wallet);
    
    console.log('\n📊 Contract State Check:');
    
    // Check contract addresses
    console.log(`BitredictPool address: ${await bitredictPool.getAddress()}`);
    console.log(`BitrToken address: ${await bitrToken.getAddress()}`);
    
    // Check BITR balance
    const balance = await bitrToken.balanceOf(wallet.address);
    console.log(`BITR Balance: ${ethers.formatEther(balance)} BITR`);
    
    // Check pool count
    const poolCount = await bitredictPool.poolCount();
    console.log(`Current Pool Count: ${poolCount}`);
    
    // Check contract constants
    console.log('\n📋 Contract Constants:');
    try {
      const creationFee = await bitredictPool.creationFee();
      console.log(`Creation Fee: ${ethers.formatEther(creationFee)}`);
    } catch (e) {
      console.log(`Creation Fee: Error - ${e.message}`);
    }
    
    try {
      const minPoolStake = await bitredictPool.minPoolStake();
      console.log(`Min Pool Stake: ${ethers.formatEther(minPoolStake)}`);
    } catch (e) {
      console.log(`Min Pool Stake: Error - ${e.message}`);
    }
    
    try {
      const bettingGracePeriod = await bitredictPool.bettingGracePeriod();
      console.log(`Betting Grace Period: ${bettingGracePeriod} seconds`);
    } catch (e) {
      console.log(`Betting Grace Period: Error - ${e.message}`);
    }
    
    // Test function encoding
    console.log('\n🔧 Testing Function Encoding:');
    
    const testParams = {
      predictedOutcome: ethers.encodeBytes32String("YES"),
      odds: 165,
      creatorStake: ethers.parseEther("2000"),
      eventStartTime: Math.floor(Date.now() / 1000) + 3600,
      eventEndTime: Math.floor(Date.now() / 1000) + 7200,
      league: "DFB Pokal",
      category: "football",
      region: "Germany",
      isPrivate: false,
      maxBetPerUser: ethers.parseEther("1000"),
      useBitr: true,
      oracleType: 0,
      marketId: ethers.encodeBytes32String("DFB_SCHWEINFURT_DUSSELDORF")
    };
    
    console.log('Test Parameters:');
    Object.entries(testParams).forEach(([key, value]) => {
      if (typeof value === 'bigint') {
        console.log(`  ${key}: ${value.toString()}`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });
    
    // Test if the function call would be valid
    console.log('\n🔍 Validating Parameters:');
    
    // Check if odds are valid
    if (testParams.odds <= 100 || testParams.odds > 10000) {
      console.log(`❌ Invalid odds: ${testParams.odds} (must be > 100 and <= 10000)`);
    } else {
      console.log(`✅ Odds valid: ${testParams.odds}`);
    }
    
    // Check if stake meets minimum
    try {
      const minStake = await bitredictPool.minPoolStake();
      if (testParams.creatorStake < minStake) {
        console.log(`❌ Stake too low: ${ethers.formatEther(testParams.creatorStake)} < ${ethers.formatEther(minStake)}`);
      } else {
        console.log(`✅ Stake valid: ${ethers.formatEther(testParams.creatorStake)}`);
      }
    } catch (e) {
      console.log(`⚠️ Could not validate stake: ${e.message}`);
    }
    
    // Check event timing
    const now = Math.floor(Date.now() / 1000);
    if (testParams.eventStartTime <= now) {
      console.log(`❌ Event start time in past: ${testParams.eventStartTime} <= ${now}`);
    } else {
      console.log(`✅ Event start time valid: ${testParams.eventStartTime}`);
    }
    
    if (testParams.eventEndTime <= testParams.eventStartTime) {
      console.log(`❌ Event end time before start: ${testParams.eventEndTime} <= ${testParams.eventStartTime}`);
    } else {
      console.log(`✅ Event end time valid: ${testParams.eventEndTime}`);
    }
    
    // Check if we have enough balance
    const requiredAmount = testParams.creatorStake + ethers.parseEther("50"); // + creation fee
    if (balance < requiredAmount) {
      console.log(`❌ Insufficient balance: ${ethers.formatEther(balance)} < ${ethers.formatEther(requiredAmount)}`);
    } else {
      console.log(`✅ Sufficient balance: ${ethers.formatEther(balance)} >= ${ethers.formatEther(requiredAmount)}`);
    }
    
    console.log('\n🎯 Ready to test market creation!');
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugMarketCreation();
