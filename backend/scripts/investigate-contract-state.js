#!/usr/bin/env node

/**
 * Investigate Contract State
 * 
 * This script thoroughly investigates the contract state to understand
 * what's really happening with the market creation
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function investigateContractState() {
  console.log('🔍 Investigating Contract State...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    console.log(`BitredictPool Address: ${process.env.BITREDICT_POOL_ADDRESS}`);
    
    // Load contract ABI
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    
    // Initialize contract
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, BitredictPoolABI, wallet);
    
    console.log('\n📊 Contract State Investigation:');
    
    // Check if contract exists
    const code = await provider.getCode(process.env.BITREDICT_POOL_ADDRESS);
    if (code === '0x') {
      console.log('❌ No contract deployed at this address');
      return;
    }
    console.log(`✅ Contract deployed (code length: ${code.length})`);
    
    // Check basic contract state
    console.log('\n📋 Basic Contract State:');
    
    try {
      const poolCount = await bitredictPool.poolCount();
      console.log(`Pool Count: ${poolCount}`);
      
      if (poolCount > 0) {
        console.log('\n🔍 Examining Existing Pools:');
        
        for (let i = 0; i < Number(poolCount); i++) {
          try {
            const pool = await bitredictPool.pools(i);
            console.log(`\nPool ${i}:`);
            console.log(`  Creator: ${pool.creator}`);
            console.log(`  Predicted Outcome: ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
            console.log(`  Odds: ${pool.odds / 100}x`);
            console.log(`  Creator Stake: ${ethers.formatEther(pool.creatorStake)}`);
            console.log(`  Event Start: ${new Date(Number(pool.eventStartTime) * 1000).toLocaleString()}`);
            console.log(`  Event End: ${new Date(Number(pool.eventEndTime) * 1000).toLocaleString()}`);
            console.log(`  League: ${pool.league}`);
            console.log(`  Category: ${pool.category}`);
            console.log(`  Region: ${pool.region}`);
            console.log(`  Is Private: ${pool.isPrivate}`);
            console.log(`  Uses BITR: ${pool.usesBitr}`);
            console.log(`  Oracle Type: ${pool.oracleType === 0n ? 'GUIDED' : 'OPEN'}`);
            console.log(`  Market ID: ${ethers.decodeBytes32String(pool.marketId)}`);
            console.log(`  Settled: ${pool.settled}`);
            console.log(`  Creator Side Won: ${pool.creatorSideWon}`);
          } catch (e) {
            console.log(`  ❌ Error reading pool ${i}: ${e.message}`);
          }
        }
      } else {
        console.log('No pools exist yet');
      }
      
    } catch (e) {
      console.log(`❌ Error reading pool count: ${e.message}`);
    }
    
    // Check contract constants
    console.log('\n📋 Contract Constants:');
    
    try {
      const creationFee = await bitredictPool.creationFee();
      console.log(`Creation Fee: ${ethers.formatEther(creationFee)}`);
    } catch (e) {
      console.log(`❌ Creation Fee: ${e.message}`);
    }
    
    try {
      const minPoolStake = await bitredictPool.minPoolStake();
      console.log(`Min Pool Stake: ${ethers.formatEther(minPoolStake)}`);
    } catch (e) {
      console.log(`❌ Min Pool Stake: ${e.message}`);
    }
    
    try {
      const bettingGracePeriod = await bitredictPool.bettingGracePeriod();
      console.log(`Betting Grace Period: ${bettingGracePeriod} seconds`);
    } catch (e) {
      console.log(`❌ Betting Grace Period: ${e.message}`);
    }
    
    try {
      const bitrToken = await bitredictPool.bitrToken();
      console.log(`BITR Token: ${bitrToken}`);
    } catch (e) {
      console.log(`❌ BITR Token: ${e.message}`);
    }
    
    try {
      const guidedOracle = await bitredictPool.guidedOracle();
      console.log(`Guided Oracle: ${guidedOracle}`);
    } catch (e) {
      console.log(`❌ Guided Oracle: ${e.message}`);
    }
    
    try {
      const optimisticOracle = await bitredictPool.optimisticOracle();
      console.log(`Optimistic Oracle: ${optimisticOracle}`);
    } catch (e) {
      console.log(`❌ Optimistic Oracle: ${e.message}`);
    }
    
    // Test a simple function call to see if the contract is responsive
    console.log('\n🔧 Testing Contract Responsiveness:');
    
    try {
      // Test a simple view function
      const testResult = await bitredictPool.poolCount();
      console.log(`✅ Contract is responsive - poolCount: ${testResult}`);
    } catch (e) {
      console.log(`❌ Contract is not responsive: ${e.message}`);
    }
    
    // Check if there are any events emitted
    console.log('\n📋 Checking Recent Events:');
    
    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = currentBlock - 100; // Check last 100 blocks
      
      const poolCreatedEvents = await bitredictPool.queryFilter(
        bitredictPool.filters.PoolCreated(),
        fromBlock,
        currentBlock
      );
      
      console.log(`Found ${poolCreatedEvents.length} PoolCreated events in last 100 blocks:`);
      
      for (const event of poolCreatedEvents) {
        console.log(`  Block ${event.blockNumber}: Pool ${event.args.poolId} created by ${event.args.creator}`);
        console.log(`    Event Start: ${new Date(Number(event.args.eventStartTime) * 1000).toLocaleString()}`);
        console.log(`    Oracle Type: ${event.args.oracleType === 0 ? 'GUIDED' : 'OPEN'}`);
        console.log(`    Market ID: ${ethers.decodeBytes32String(event.args.marketId)}`);
      }
      
    } catch (e) {
      console.log(`❌ Error checking events: ${e.message}`);
    }
    
    // Test the exact parameters that were used in the failed transactions
    console.log('\n🔧 Testing Failed Transaction Parameters:');
    
    const testParams = {
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
    
    console.log('Test Parameters:');
    console.log(`  Predicted Outcome: ${ethers.decodeBytes32String(testParams.predictedOutcome)}`);
    console.log(`  Odds: ${testParams.odds / 100}x`);
    console.log(`  Creator Stake: ${ethers.formatEther(testParams.creatorStake)}`);
    console.log(`  Event Start: ${new Date(testParams.eventStartTime * 1000).toLocaleString()}`);
    console.log(`  Event End: ${new Date(testParams.eventEndTime * 1000).toLocaleString()}`);
    console.log(`  League: ${testParams.league}`);
    console.log(`  Category: ${testParams.category}`);
    console.log(`  Region: ${testParams.region}`);
    console.log(`  Is Private: ${testParams.isPrivate}`);
    console.log(`  Max Bet Per User: ${ethers.formatEther(testParams.maxBetPerUser)}`);
    console.log(`  Use BITR: ${testParams.useBitr}`);
    console.log(`  Oracle Type: ${testParams.oracleType}`);
    console.log(`  Market ID: ${ethers.decodeBytes32String(testParams.marketId)}`);
    
    // Test static call to see if the function would succeed
    try {
      console.log('\n🔧 Testing Static Call:');
      const result = await bitredictPool.createPool.staticCall(
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
      );
      console.log(`✅ Static call successful: ${result}`);
    } catch (e) {
      console.log(`❌ Static call failed: ${e.message}`);
      
      // Try to decode the error
      if (e.data) {
        console.log(`Error data: ${e.data}`);
        try {
          const decodedError = bitredictPool.interface.parseError(e.data);
          console.log(`Decoded error: ${decodedError.name} - ${decodedError.args}`);
        } catch (decodeError) {
          console.log(`Could not decode error: ${decodeError.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Investigation error:', error.message);
  }
}

investigateContractState();
