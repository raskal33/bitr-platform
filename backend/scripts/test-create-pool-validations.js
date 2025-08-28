#!/usr/bin/env node

/**
 * Test Create Pool Validations
 * 
 * This script tests each validation step in the createPool function
 * to identify exactly what's causing the failure
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function testCreatePoolValidations() {
  console.log('🔍 Testing Create Pool Validations...');
  
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
    
    // Test parameters
    const params = {
      predictedOutcome: ethers.encodeBytes32String("YES"),
      odds: 265,
      creatorStake: ethers.parseEther("2000"),
      eventStartTime: Math.floor(Date.now() / 1000) + 300,
      eventEndTime: Math.floor(Date.now() / 1000) + 3600,
      league: "DFB Pokal",
      category: "football",
      region: "Germany",
      isPrivate: false,
      maxBetPerUser: ethers.parseEther("1000"),
      useBitr: true,
      oracleType: 0,
      marketId: ethers.encodeBytes32String("DFB_SCHWEINFURT_DUSSELDORF")
    };
    
    console.log('\n📋 Testing Each Validation Step:');
    
    // 1. Test odds validation: _odds > 100 && _odds <= 10000
    console.log('\n1. Odds Validation:');
    console.log(`   Odds: ${params.odds}`);
    console.log(`   Valid range: > 100 && <= 10000`);
    if (params.odds > 100 && params.odds <= 10000) {
      console.log('   ✅ Odds are valid');
    } else {
      console.log('   ❌ Odds are invalid');
    }
    
    // 2. Test creator stake validation: _creatorStake >= minPoolStake
    console.log('\n2. Creator Stake Validation:');
    try {
      const minPoolStake = await bitredictPool.minPoolStake();
      console.log(`   Creator Stake: ${ethers.formatEther(params.creatorStake)}`);
      console.log(`   Min Pool Stake: ${ethers.formatEther(minPoolStake)}`);
      if (params.creatorStake >= minPoolStake) {
        console.log('   ✅ Creator stake is valid');
      } else {
        console.log('   ❌ Creator stake is too low');
      }
    } catch (e) {
      console.log(`   ❌ Error checking min pool stake: ${e.message}`);
    }
    
    // 3. Test creator stake max validation: _creatorStake <= 1000000 * 1e18
    console.log('\n3. Creator Stake Max Validation:');
    const maxStake = ethers.parseEther("1000000");
    console.log(`   Creator Stake: ${ethers.formatEther(params.creatorStake)}`);
    console.log(`   Max Stake: ${ethers.formatEther(maxStake)}`);
    if (params.creatorStake <= maxStake) {
      console.log('   ✅ Creator stake is within max limit');
    } else {
      console.log('   ❌ Creator stake exceeds max limit');
    }
    
    // 4. Test event start time validation: _eventStartTime > block.timestamp
    console.log('\n4. Event Start Time Validation:');
    const currentTime = Math.floor(Date.now() / 1000);
    console.log(`   Event Start Time: ${params.eventStartTime} (${new Date(params.eventStartTime * 1000).toLocaleString()})`);
    console.log(`   Current Time: ${currentTime} (${new Date(currentTime * 1000).toLocaleString()})`);
    if (params.eventStartTime > currentTime) {
      console.log('   ✅ Event start time is in the future');
    } else {
      console.log('   ❌ Event start time is not in the future');
    }
    
    // 5. Test event end time validation: _eventEndTime > _eventStartTime
    console.log('\n5. Event End Time Validation:');
    console.log(`   Event Start Time: ${params.eventStartTime}`);
    console.log(`   Event End Time: ${params.eventEndTime}`);
    if (params.eventEndTime > params.eventStartTime) {
      console.log('   ✅ Event end time is after start time');
    } else {
      console.log('   ❌ Event end time is not after start time');
    }
    
    // 6. Test betting grace period validation: _eventStartTime > block.timestamp + bettingGracePeriod
    console.log('\n6. Betting Grace Period Validation:');
    try {
      const bettingGracePeriod = await bitredictPool.bettingGracePeriod();
      const minEventStartTime = currentTime + Number(bettingGracePeriod);
      console.log(`   Event Start Time: ${params.eventStartTime}`);
      console.log(`   Min Event Start Time: ${minEventStartTime} (current + ${bettingGracePeriod}s grace period)`);
      if (params.eventStartTime > minEventStartTime) {
        console.log('   ✅ Event start time respects grace period');
      } else {
        console.log('   ❌ Event start time is too soon (within grace period)');
      }
    } catch (e) {
      console.log(`   ❌ Error checking betting grace period: ${e.message}`);
    }
    
    // 7. Test event time limit validation: _eventStartTime < block.timestamp + 365 days
    console.log('\n7. Event Time Limit Validation:');
    const maxEventStartTime = currentTime + (365 * 24 * 60 * 60);
    console.log(`   Event Start Time: ${params.eventStartTime}`);
    console.log(`   Max Event Start Time: ${maxEventStartTime} (current + 365 days)`);
    if (params.eventStartTime < maxEventStartTime) {
      console.log('   ✅ Event start time is within 365 days');
    } else {
      console.log('   ❌ Event start time is too far in the future');
    }
    
    // 8. Test BITR balance and allowance
    console.log('\n8. BITR Balance and Allowance Validation:');
    try {
      const balance = await bitrToken.balanceOf(wallet.address);
      const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
      const creationFee = await bitredictPool.creationFee();
      const totalRequired = params.creatorStake + creationFee;
      
      console.log(`   Balance: ${ethers.formatEther(balance)} BITR`);
      console.log(`   Allowance: ${ethers.formatEther(allowance)} BITR`);
      console.log(`   Required: ${ethers.formatEther(totalRequired)} BITR (stake + creation fee)`);
      
      if (balance >= totalRequired) {
        console.log('   ✅ Sufficient balance');
      } else {
        console.log('   ❌ Insufficient balance');
      }
      
      if (allowance >= totalRequired) {
        console.log('   ✅ Sufficient allowance');
      } else {
        console.log('   ❌ Insufficient allowance');
      }
    } catch (e) {
      console.log(`   ❌ Error checking balance/allowance: ${e.message}`);
    }
    
    // 9. Test the specific error we're getting
    console.log('\n9. Testing the Specific Error:');
    console.log('   Error data: 0xfb8f41b2...');
    console.log('   This appears to be a custom error that is not defined in the ABI');
    console.log('   This suggests the contract at this address might not be the expected BitredictPool contract');
    
    // 10. Check if the contract is actually the right one
    console.log('\n10. Contract Verification:');
    try {
      const poolCount = await bitredictPool.poolCount();
      const creationFee = await bitredictPool.creationFee();
      const minPoolStake = await bitredictPool.minPoolStake();
      
      console.log(`   Pool Count: ${poolCount}`);
      console.log(`   Creation Fee: ${ethers.formatEther(creationFee)}`);
      console.log(`   Min Pool Stake: ${ethers.formatEther(minPoolStake)}`);
      
      // These values should match what we expect from the contract
      if (creationFee === ethers.parseEther("50") && minPoolStake === ethers.parseEther("1000")) {
        console.log('   ✅ Contract constants match expected values');
      } else {
        console.log('   ❌ Contract constants do not match expected values');
        console.log('   This suggests the contract at this address is not the correct BitredictPool contract');
      }
    } catch (e) {
      console.log(`   ❌ Error verifying contract: ${e.message}`);
    }
    
    console.log('\n🎯 Summary:');
    console.log('The issue appears to be that the contract at the given address');
    console.log('is not the expected BitredictPool contract, or there is a mismatch');
    console.log('between the deployed contract and the ABI we are using.');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testCreatePoolValidations();
