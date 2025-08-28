#!/usr/bin/env node

/**
 * Create Guided Prediction Market Script
 * 
 * This script creates a guided prediction market for the DFB Pokal match:
 * DFB Pokal - Schweinfurt vs Fortuna Düsseldorf
 * Market: Fortuna Düsseldorf wins - YES
 * Odds: 1.65
 * Creator Stake: 2000 BITR
 * 
 * Usage: node scripts/create-guided-market.js
 */

const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config();

// Contract addresses from environment
const BITREDICT_POOL_ADDRESS = process.env.BITREDICT_POOL_ADDRESS;
const BITR_TOKEN_ADDRESS = process.env.BITR_TOKEN_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Market parameters
const MARKET_PARAMS = {
  predictedOutcome: ethers.encodeBytes32String("YES"), // Fortuna Düsseldorf wins
  odds: 265, // 2.65x in contract format (265 = 2.65) - must be > 200 to avoid division by zero
  creatorStake: ethers.parseEther("2000"), // 2000 BITR
  eventStartTime: Math.floor(Date.now() / 1000) + 120, // 2 minutes from now (to ensure > 60s grace period)
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

class GuidedMarketCreator {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.bitredictPool = null;
    this.bitrToken = null;
  }

  /**
   * Initialize provider, wallet, and contracts
   */
  async initialize() {
    console.log('🚀 Initializing Guided Market Creator...');
    
    // Validate environment variables
    if (!BITREDICT_POOL_ADDRESS) {
      throw new Error('BITREDICT_POOL_ADDRESS not set in environment');
    }
    if (!BITR_TOKEN_ADDRESS) {
      throw new Error('BITR_TOKEN_ADDRESS not set in environment');
    }
    if (!PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY not set in environment');
    }

    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    console.log('✅ Provider initialized');

    // Initialize wallet
    this.wallet = new ethers.Wallet(PRIVATE_KEY, this.provider);
    console.log(`✅ Wallet initialized: ${this.wallet.address}`);

    // Load contract ABIs
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    const BitrTokenABI = require('../../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json').abi;

    // Initialize contracts
    this.bitredictPool = new ethers.Contract(BITREDICT_POOL_ADDRESS, BitredictPoolABI, this.wallet);
    this.bitrToken = new ethers.Contract(BITR_TOKEN_ADDRESS, BitrTokenABI, this.wallet);
    
    console.log('✅ Contracts initialized');
    console.log(`   BitredictPool: ${BITREDICT_POOL_ADDRESS}`);
    console.log(`   BitrToken: ${BITR_TOKEN_ADDRESS}`);
  }

  /**
   * Check wallet balance and approve tokens
   */
  async checkAndApproveTokens() {
    console.log('\n💰 Checking wallet balance and approvals...');
    
    // Check BITR balance
    const bitrBalance = await this.bitrToken.balanceOf(this.wallet.address);
    console.log(`   BITR Balance: ${ethers.formatEther(bitrBalance)} BITR`);
    
    // Check if we have enough BITR
    const requiredAmount = MARKET_PARAMS.creatorStake + ethers.parseEther("50"); // +50 for creation fee
    if (bitrBalance < requiredAmount) {
      throw new Error(`Insufficient BITR balance. Need ${ethers.formatEther(requiredAmount)} BITR, have ${ethers.formatEther(bitrBalance)} BITR`);
    }
    
    // Check allowance
    const allowance = await this.bitrToken.allowance(this.wallet.address, BITREDICT_POOL_ADDRESS);
    console.log(`   Current allowance: ${ethers.formatEther(allowance)} BITR`);
    
    if (allowance < requiredAmount) {
      console.log('   Approving BITR tokens...');
      const approveTx = await this.bitrToken.approve(BITREDICT_POOL_ADDRESS, requiredAmount);
      console.log(`   Approval transaction: ${approveTx.hash}`);
      
      const receipt = await approveTx.wait();
      console.log(`   ✅ Approval confirmed in block ${receipt.blockNumber}`);
    } else {
      console.log('   ✅ Sufficient allowance already exists');
    }
  }

  /**
   * Create the guided prediction market
   */
  async createMarket() {
    console.log('\n🎯 Creating Guided Prediction Market...');
    console.log('Market Details:');
    console.log(`   League: ${MARKET_PARAMS.league}`);
    console.log(`   Match: Schweinfurt vs Fortuna Düsseldorf`);
    console.log(`   Prediction: Fortuna Düsseldorf wins - ${ethers.decodeBytes32String(MARKET_PARAMS.predictedOutcome)}`);
    console.log(`   Odds: ${MARKET_PARAMS.odds / 100}x`);
    console.log(`   Creator Stake: ${ethers.formatEther(MARKET_PARAMS.creatorStake)} BITR`);
    console.log(`   Event Start: ${new Date(MARKET_PARAMS.eventStartTime * 1000).toLocaleString()}`);
    console.log(`   Event End: ${new Date(MARKET_PARAMS.eventEndTime * 1000).toLocaleString()}`);
    console.log(`   Market Type: ${MARKET_PARAMS.isPrivate ? 'Private' : 'Public'}`);
    console.log(`   Token: ${MARKET_PARAMS.useBitr ? 'BITR' : 'STT'}`);
    console.log(`   Oracle: ${MARKET_PARAMS.oracleType === 0 ? 'Guided' : 'Open'}`);
    
    // Get current pool count
    const currentPoolCount = await this.bitredictPool.poolCount();
    console.log(`   Current Pool Count: ${currentPoolCount}`);
    
    // Create the pool
    console.log('\n📝 Creating pool transaction...');
    const createPoolTx = await this.bitredictPool.createPool(
      MARKET_PARAMS.predictedOutcome,
      MARKET_PARAMS.odds,
      MARKET_PARAMS.creatorStake,
      MARKET_PARAMS.eventStartTime,
      MARKET_PARAMS.eventEndTime,
      MARKET_PARAMS.league,
      MARKET_PARAMS.category,
      MARKET_PARAMS.region,
      MARKET_PARAMS.isPrivate,
      MARKET_PARAMS.maxBetPerUser,
      MARKET_PARAMS.useBitr,
      MARKET_PARAMS.oracleType,
      MARKET_PARAMS.marketId,
      { gasLimit: 500000 }
    );
    
    console.log(`   Transaction hash: ${createPoolTx.hash}`);
    console.log('   Waiting for confirmation...');
    
    const receipt = await createPoolTx.wait();
    console.log(`   ✅ Pool created in block ${receipt.blockNumber}`);
    
    // Get the new pool ID
    const newPoolCount = await this.bitredictPool.poolCount();
    const poolId = newPoolCount - 1n;
    console.log(`   🎉 Pool ID: ${poolId}`);
    
    return poolId;
  }

  /**
   * Verify the created market
   */
  async verifyMarket(poolId) {
    console.log('\n🔍 Verifying created market...');
    
    const pool = await this.bitredictPool.pools(poolId);
    
    console.log('Pool Details:');
    console.log(`   Creator: ${pool.creator}`);
    console.log(`   Predicted Outcome: ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
    console.log(`   Odds: ${pool.odds / 100}x`);
    console.log(`   Creator Stake: ${ethers.formatEther(pool.creatorStake)} BITR`);
    console.log(`   Event Start: ${new Date(Number(pool.eventStartTime) * 1000).toLocaleString()}`);
    console.log(`   Event End: ${new Date(Number(pool.eventEndTime) * 1000).toLocaleString()}`);
    console.log(`   Betting End: ${new Date(Number(pool.bettingEndTime) * 1000).toLocaleString()}`);
    console.log(`   League: ${pool.league}`);
    console.log(`   Category: ${pool.category}`);
    console.log(`   Region: ${pool.region}`);
    console.log(`   Is Private: ${pool.isPrivate}`);
    console.log(`   Uses BITR: ${pool.usesBitr}`);
    console.log(`   Oracle Type: ${pool.oracleType === 0n ? 'Guided' : 'Open'}`);
    console.log(`   Market ID: ${ethers.decodeBytes32String(pool.marketId)}`);
    console.log(`   Settled: ${pool.settled}`);
    console.log(`   Creator Side Won: ${pool.creatorSideWon}`);
    
    // Verify the market matches our parameters
    const verificationChecks = [
      pool.creator === this.wallet.address,
      pool.predictedOutcome === MARKET_PARAMS.predictedOutcome,
      pool.odds === BigInt(MARKET_PARAMS.odds),
      pool.creatorStake === MARKET_PARAMS.creatorStake,
      pool.eventStartTime === BigInt(MARKET_PARAMS.eventStartTime),
      pool.eventEndTime === BigInt(MARKET_PARAMS.eventEndTime),
      pool.league === MARKET_PARAMS.league,
      pool.category === MARKET_PARAMS.category,
      pool.region === MARKET_PARAMS.region,
      pool.isPrivate === MARKET_PARAMS.isPrivate,
      pool.usesBitr === MARKET_PARAMS.useBitr,
      pool.oracleType === BigInt(MARKET_PARAMS.oracleType),
      pool.marketId === MARKET_PARAMS.marketId
    ];
    
    const allChecksPassed = verificationChecks.every(check => check);
    
    if (allChecksPassed) {
      console.log('   ✅ All verification checks passed!');
    } else {
      console.log('   ❌ Some verification checks failed');
      verificationChecks.forEach((check, index) => {
        if (!check) {
          console.log(`      Check ${index + 1} failed`);
        }
      });
    }
    
    return allChecksPassed;
  }

  /**
   * Get market information for frontend integration
   */
  async getMarketInfo(poolId) {
    console.log('\n📊 Market Information for Frontend Integration:');
    
    const pool = await this.bitredictPool.pools(poolId);
    
    const marketInfo = {
      poolId: Number(poolId),
      creator: pool.creator,
      predictedOutcome: ethers.decodeBytes32String(pool.predictedOutcome),
      odds: Number(pool.odds) / 100,
      creatorStake: ethers.formatEther(pool.creatorStake),
      totalCreatorSideStake: ethers.formatEther(pool.totalCreatorSideStake),
      maxBettorStake: ethers.formatEther(pool.maxBettorStake),
      totalBettorStake: ethers.formatEther(pool.totalBettorStake),
      eventStartTime: new Date(Number(pool.eventStartTime) * 1000).toISOString(),
      eventEndTime: new Date(Number(pool.eventEndTime) * 1000).toISOString(),
      bettingEndTime: new Date(Number(pool.bettingEndTime) * 1000).toISOString(),
      league: pool.league,
      category: pool.category,
      region: pool.region,
      isPrivate: pool.isPrivate,
      usesBitr: pool.usesBitr,
      oracleType: pool.oracleType === 0n ? 'GUIDED' : 'OPEN',
      marketId: ethers.decodeBytes32String(pool.marketId),
      settled: pool.settled,
      creatorSideWon: pool.creatorSideWon,
      maxBetPerUser: ethers.formatEther(pool.maxBetPerUser)
    };
    
    console.log('Market Info JSON:');
    console.log(JSON.stringify(marketInfo, null, 2));
    
    return marketInfo;
  }

  /**
   * Main execution method
   */
  async run() {
    try {
      await this.initialize();
      await this.checkAndApproveTokens();
      
      const poolId = await this.createMarket();
      const verificationPassed = await this.verifyMarket(poolId);
      const marketInfo = await this.getMarketInfo(poolId);
      
      console.log('\n🎉 Guided Prediction Market Created Successfully!');
      console.log('==================================================');
      console.log(`Pool ID: ${poolId}`);
      console.log(`Market: ${marketInfo.league} - Schweinfurt vs Fortuna Düsseldorf`);
      console.log(`Prediction: Fortuna Düsseldorf wins - ${marketInfo.predictedOutcome}`);
      console.log(`Odds: ${marketInfo.odds}x`);
      console.log(`Creator Stake: ${marketInfo.creatorStake} BITR`);
      console.log(`Event Time: ${marketInfo.eventStartTime}`);
      console.log(`Market Type: ${marketInfo.isPrivate ? 'Private' : 'Public'} ${marketInfo.oracleType}`);
      
      console.log('\n🔗 Frontend Integration:');
      console.log('Use the marketInfo object above to display the market on your frontend.');
      console.log('The poolId can be used to place bets, add liquidity, and claim rewards.');
      
      return { poolId, marketInfo, verificationPassed };
      
    } catch (error) {
      console.error('❌ Error creating guided market:', error);
      throw error;
    }
  }
}

// CLI usage
if (require.main === module) {
  const creator = new GuidedMarketCreator();
  
  creator.run()
    .then((result) => {
      console.log('\n✅ Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = GuidedMarketCreator;
