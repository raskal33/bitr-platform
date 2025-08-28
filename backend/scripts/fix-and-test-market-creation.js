#!/usr/bin/env node

/**
 * Fix and Test Market Creation
 * 
 * This script fixes the allowance issue and tests market creation
 * with proper error handling
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function fixAndTestMarketCreation() {
  console.log('🔧 Fixing and Testing Market Creation...');
  
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
    
    // Check current state
    console.log('\n📊 Current State:');
    const poolCount = await bitredictPool.poolCount();
    console.log(`Pool Count: ${poolCount}`);
    
    const balance = await bitrToken.balanceOf(wallet.address);
    const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    console.log(`Balance: ${ethers.formatEther(balance)} BITR`);
    console.log(`Allowance: ${ethers.formatEther(allowance)} BITR`);
    
    // Fix allowance if needed
    if (allowance < ethers.parseEther("10000")) {
      console.log('\n🔧 Fixing allowance...');
      
      // First, try to approve a large amount
      const approveTx = await bitrToken.approve(process.env.BITREDICT_POOL_ADDRESS, ethers.parseEther("100000"));
      console.log(`Approval transaction: ${approveTx.hash}`);
      
      const receipt = await approveTx.wait();
      if (receipt.status === 1) {
        console.log('✅ Allowance fixed successfully');
      } else {
        console.log('❌ Allowance approval failed');
        return;
      }
    } else {
      console.log('✅ Allowance is sufficient');
    }
    
    // Test parameters with more conservative values
    const params = {
      predictedOutcome: ethers.encodeBytes32String("YES"),
      odds: 300, // 3.00x - more conservative
      creatorStake: ethers.parseEther("20"), // Minimum stake
      eventStartTime: Math.floor(Date.now() / 1000) + 600, // 10 minutes from now
      eventEndTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      league: "Test League",
      category: "football",
      region: "Test",
      isPrivate: false,
      maxBetPerUser: ethers.parseEther("100"),
      useBitr: true,
      oracleType: 0, // GUIDED
      marketId: ethers.encodeBytes32String("TEST_FIXED")
    };
    
    console.log('\n🎯 Test Parameters:');
    console.log(`Predicted Outcome: ${ethers.decodeBytes32String(params.predictedOutcome)}`);
    console.log(`Odds: ${params.odds / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(params.creatorStake)} BITR`);
    console.log(`Event Start: ${new Date(params.eventStartTime * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(params.eventEndTime * 1000).toLocaleString()}`);
    console.log(`Oracle Type: ${params.oracleType === 0 ? 'GUIDED' : 'OPEN'}`);
    
    // Check final balance and allowance
    const finalBalance = await bitrToken.balanceOf(wallet.address);
    const finalAllowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    const creationFee = await bitredictPool.creationFee();
    const totalRequired = params.creatorStake + creationFee;
    
    console.log(`\n💰 Final Check:`);
    console.log(`Balance: ${ethers.formatEther(finalBalance)} BITR`);
    console.log(`Allowance: ${ethers.formatEther(finalAllowance)} BITR`);
    console.log(`Required: ${ethers.formatEther(totalRequired)} BITR`);
    
    if (finalBalance < totalRequired) {
      console.log('❌ Insufficient balance');
      return;
    }
    
    if (finalAllowance < totalRequired) {
      console.log('❌ Insufficient allowance');
      return;
    }
    
    // Try to create the pool
    console.log('\n📝 Creating test pool...');
    
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
        console.log('✅ Pool created successfully!');
        
        // Get the new pool ID
        const newPoolCount = await bitredictPool.poolCount();
        const poolId = newPoolCount - 1n;
        console.log(`Pool ID: ${poolId}`);
        
        // Get pool details
        const pool = await bitredictPool.pools(poolId);
        console.log('\n📊 Pool Details:');
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
        
        console.log('\n🎉 Test pool created successfully!');
        console.log('The contract is working correctly.');
        
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

fixAndTestMarketCreation();
