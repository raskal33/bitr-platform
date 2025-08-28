#!/usr/bin/env node

/**
 * Create Coppa Italia Pool with Correct Timing
 * 
 * Creates a pool for the real Coppa Italia match with correct 9:45 PM timing
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function createCoppaItaliaPool() {
  console.log('⚽ Creating Coppa Italia Pool with Correct Timing...');
  
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
    
    // Check BITR balance
    const balance = await bitrToken.balanceOf(wallet.address);
    console.log(`BITR Balance: ${ethers.formatEther(balance)} BITR`);
    
    // Check allowance
    const allowance = await bitrToken.allowance(wallet.address, process.env.BITREDICT_POOL_ADDRESS);
    console.log(`Current Allowance: ${ethers.formatEther(allowance)} BITR`);
    
    // Approve if needed
    if (allowance < ethers.parseEther('1000')) {
      console.log('Approving BITR tokens...');
      const approveTx = await bitrToken.approve(process.env.BITREDICT_POOL_ADDRESS, ethers.parseEther('10000'));
      await approveTx.wait();
      console.log('✅ Approval confirmed');
    }
    
    // Calculate correct event timing
    const now = new Date();
    const eventTime = new Date();
    eventTime.setHours(21, 45, 0, 0); // 9:45 PM today
    const eventStartTime = Math.floor(eventTime.getTime() / 1000);
    
    console.log(`\n⏰ Event Timing:`);
    console.log(`Current Time: ${now.toLocaleString()}`);
    console.log(`Event Start: ${eventTime.toLocaleString()} (${eventStartTime})`);
    console.log(`Time Until Event: ${Math.floor((eventStartTime - Math.floor(now.getTime() / 1000)) / 3600)}h ${Math.floor(((eventStartTime - Math.floor(now.getTime() / 1000)) % 3600) / 60)}m`);
    
    // Pool parameters - using correct function signature
    const poolParams = {
      _predictedOutcome: ethers.encodeBytes32String("Udinese Wins"),
      _odds: 200, // 2.0x (minimum working odds)
      _creatorStake: ethers.parseEther('100'), // 100 BITR
      _eventStartTime: eventStartTime,
      _eventEndTime: eventStartTime + 7200, // 2 hours duration
      _league: "Coppa Italia",
      _category: "Football",
      _region: "Italy",
      _isPrivate: false,
      _maxBetPerUser: ethers.parseEther('500'), // 500 BITR max per user
      _useBitr: true, // Use BITR token
      _oracleType: 0, // Guided Oracle
      _marketId: ethers.encodeBytes32String("COPPA_UDINESE_CARRARESE_V2")
    };
    
    console.log('\n📋 Pool Parameters:');
    console.log(`Prediction: ${ethers.decodeBytes32String(poolParams._predictedOutcome)}`);
    console.log(`Odds: ${poolParams._odds / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(poolParams._creatorStake)} BITR`);
    console.log(`Event Start: ${new Date(poolParams._eventStartTime * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(poolParams._eventEndTime * 1000).toLocaleString()}`);
    console.log(`League: ${poolParams._league}`);
    console.log(`Category: ${poolParams._category}`);
    console.log(`Region: ${poolParams._region}`);
    console.log(`Private: ${poolParams._isPrivate}`);
    console.log(`Max Bet Per User: ${ethers.formatEther(poolParams._maxBetPerUser)} BITR`);
    console.log(`Use BITR: ${poolParams._useBitr}`);
    console.log(`Oracle Type: ${poolParams._oracleType === 0 ? 'Guided' : 'Optimistic'}`);
    console.log(`Market ID: ${ethers.decodeBytes32String(poolParams._marketId)}`);
    
    // Estimate gas
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
    
    console.log(`\n⛽ Gas Estimate: ${gasEstimate.toString()}`);
    
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
      { gasLimit: gasEstimate + BigInt(50000) }
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
    console.log(`Market ID: ${ethers.decodeBytes32String(newPool.marketId)}`);
    console.log(`Prediction: ${ethers.decodeBytes32String(newPool.predictedOutcome)}`);
    console.log(`Odds: ${Number(newPool.odds) / 100}x`);
    console.log(`Creator Stake: ${ethers.formatEther(newPool.creatorStake)} BITR`);
    console.log(`Event Start: ${new Date(Number(newPool.eventStartTime) * 1000).toLocaleString()}`);
    console.log(`Event End: ${new Date(Number(newPool.eventEndTime) * 1000).toLocaleString()}`);
    console.log(`Betting End: ${new Date(Number(newPool.bettingEndTime) * 1000).toLocaleString()}`);
    console.log(`Max Bet Per User: ${ethers.formatEther(newPool.maxBetPerUser)} BITR`);
    console.log(`Max Bettor Stake: ${ethers.formatEther(newPool.maxBettorStake)} BITR`);
    
    // Calculate remaining capacity
    const remainingCapacity = newPool.maxBettorStake - newPool.totalBettorStake;
    console.log(`\n💰 Pool Capacity:`);
    console.log(`Total Creator Stake: ${ethers.formatEther(newPool.totalCreatorSideStake)} BITR`);
    console.log(`Max Bettor Stake: ${ethers.formatEther(newPool.maxBettorStake)} BITR`);
    console.log(`Current Bettor Stake: ${ethers.formatEther(newPool.totalBettorStake)} BITR`);
    console.log(`Remaining Capacity: ${ethers.formatEther(remainingCapacity)} BITR`);
    
    console.log('\n✅ Pool created successfully with correct timing!');
    console.log(`Pool ID: ${newPoolId}`);
    console.log(`Ready for betting tests!`);
    
  } catch (error) {
    console.error('❌ Pool creation error:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
  }
}

createCoppaItaliaPool();
