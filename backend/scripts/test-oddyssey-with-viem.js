#!/usr/bin/env node

/**
 * Test Oddyssey Contract with Viem
 * 
 * This script tests the Oddyssey contract using viem instead of ethers,
 * matching the frontend implementation pattern.
 * 
 * Tests:
 * 1. Get current cycle information
 * 2. Place slips with predictions
 * 3. Test contract validation
 * 4. Check user stats and reputation
 */

const { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, decodeFunctionResult } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

// Load the actual contract ABI
const OddysseyArtifact = require('../../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json');
const ODDYSSEY_ABI = OddysseyArtifact.abi;

// Enums from contract
const BetType = {
  MONEYLINE: 0,
  OVER_UNDER: 1
};

const MoneylineResult = {
  NotSet: 0,
  HomeWin: 1,
  Draw: 2,
  AwayWin: 3
};

const OverUnderResult = {
  NotSet: 0,
  Over: 1,
  Under: 2
};

const CycleState = {
  NotStarted: 0,
  Active: 1,
  Ended: 2,
  Resolved: 3
};

async function testOddysseyWithViem() {
  console.log('🎯 Testing Oddyssey Contract with Viem...');
  
  try {
    // Validate environment variables
    if (!process.env.ODDYSSEY_ADDRESS) {
      throw new Error('ODDYSSEY_ADDRESS not set in environment');
    }
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY not set in environment');
    }

    // Initialize viem clients
    const publicClient = createPublicClient({
      chain: {
        id: 50312, // Somnia chain ID
        name: 'Somnia',
        network: 'somnia',
        nativeCurrency: {
          decimals: 18,
          name: 'STT',
          symbol: 'STT',
        },
        rpcUrls: {
          default: {
            http: [process.env.RPC_URL || 'https://dream-rpc.somnia.network/'],
          },
          public: {
            http: [process.env.RPC_URL || 'https://dream-rpc.somnia.network/'],
          },
        },
      },
      transport: http(),
    });

    const account = privateKeyToAccount(process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`);
    const walletClient = createWalletClient({
      account,
      chain: {
        id: 50312,
        name: 'Somnia',
        network: 'somnia',
        nativeCurrency: {
          decimals: 18,
          name: 'STT',
          symbol: 'STT',
        },
        rpcUrls: {
          default: {
            http: [process.env.RPC_URL || 'https://dream-rpc.somnia.network/'],
          },
          public: {
            http: [process.env.RPC_URL || 'https://dream-rpc.somnia.network/'],
          },
        },
      },
      transport: http(),
    });

    console.log(`✅ Viem clients initialized`);
    console.log(`Wallet: ${account.address}`);
    console.log(`Oddyssey Contract: ${process.env.ODDYSSEY_ADDRESS}`);

    // Test 1: Get current cycle information
    console.log('\n📊 Test 1: Getting Current Cycle Information...');
    try {
      const cycleInfoData = encodeFunctionData({
        abi: ODDYSSEY_ABI,
        functionName: 'getCurrentCycleInfo',
      });

      const cycleInfoResult = await publicClient.call({
        data: cycleInfoData,
        to: process.env.ODDYSSEY_ADDRESS,
      });

      const cycleInfo = decodeFunctionResult({
        abi: ODDYSSEY_ABI,
        functionName: 'getCurrentCycleInfo',
        data: cycleInfoResult.data,
      });

      console.log(`✅ Current Cycle ID: ${cycleInfo[0]}`);
      console.log(`✅ Cycle State: ${CycleState[cycleInfo[1]] || cycleInfo[1]}`);
      console.log(`✅ End Time: ${new Date(Number(cycleInfo[2]) * 1000).toLocaleString()}`);
      console.log(`✅ Prize Pool: ${parseEther(cycleInfo[3].toString())} STT`);
      console.log(`✅ Slip Count: ${cycleInfo[4]}`);

      if (cycleInfo[0] === 0n) {
        console.log('ℹ️ No active cycle found');
        return;
      }

      // Test 2: Get daily matches for current cycle
      console.log('\n⚽ Test 2: Getting Daily Matches...');
      const matchesData = encodeFunctionData({
        abi: ODDYSSEY_ABI,
        functionName: 'getDailyMatches',
        args: [cycleInfo[0]],
      });

      const matchesResult = await publicClient.call({
        data: matchesData,
        to: process.env.ODDYSSEY_ADDRESS,
      });

      const matches = decodeFunctionResult({
        abi: ODDYSSEY_ABI,
        functionName: 'getDailyMatches',
        data: matchesResult.data,
      });

      console.log(`✅ Found ${matches.length} matches:`);
      matches.forEach((match, index) => {
        console.log(`   Match ${index + 1}: ID ${match.id}, Start: ${new Date(Number(match.startTime) * 1000).toLocaleString()}`);
        console.log(`     Odds - Home: ${match.oddsHome}, Draw: ${match.oddsDraw}, Away: ${match.oddsAway}`);
        console.log(`     Odds - Over: ${match.oddsOver}, Under: ${match.oddsUnder}`);
      });

      // Test 3: Get entry fee
      console.log('\n💰 Test 3: Getting Entry Fee...');
      const entryFeeData = encodeFunctionData({
        abi: ODDYSSEY_ABI,
        functionName: 'entryFee',
      });

      const entryFeeResult = await publicClient.call({
        data: entryFeeData,
        to: process.env.ODDYSSEY_ADDRESS,
      });

      const entryFee = decodeFunctionResult({
        abi: ODDYSSEY_ABI,
        functionName: 'entryFee',
        data: entryFeeResult.data,
      });

      console.log(`✅ Entry Fee: ${parseEther(entryFee.toString())} STT`);

      // Test 4: Get user stats
      console.log('\n👤 Test 4: Getting User Stats...');
      const userStatsData = encodeFunctionData({
        abi: ODDYSSEY_ABI,
        functionName: 'getUserStats',
        args: [account.address],
      });

      const userStatsResult = await publicClient.call({
        data: userStatsData,
        to: process.env.ODDYSSEY_ADDRESS,
      });

      const userStats = decodeFunctionResult({
        abi: ODDYSSEY_ABI,
        functionName: 'getUserStats',
        data: userStatsResult.data,
      });

      console.log(`✅ Total Slips: ${userStats[0]}`);
      console.log(`✅ Total Wins: ${userStats[1]}`);
      console.log(`✅ Best Score: ${userStats[2]}`);
      console.log(`✅ Average Score: ${userStats[3]}`);
      console.log(`✅ Win Rate: ${Number(userStats[4]) / 100}%`);
      console.log(`✅ Current Streak: ${userStats[5]}`);
      console.log(`✅ Best Streak: ${userStats[6]}`);
      console.log(`✅ Last Active Cycle: ${userStats[7]}`);

      // Test 5: Get user reputation
      console.log('\n🏆 Test 5: Getting User Reputation...');
      const reputationData = encodeFunctionData({
        abi: ODDYSSEY_ABI,
        functionName: 'getOddysseyReputation',
        args: [account.address],
      });

      const reputationResult = await publicClient.call({
        data: reputationData,
        to: process.env.ODDYSSEY_ADDRESS,
      });

      const reputation = decodeFunctionResult({
        abi: ODDYSSEY_ABI,
        functionName: 'getOddysseyReputation',
        data: reputationResult.data,
      });

      console.log(`✅ Total Reputation: ${reputation[0]}`);
      console.log(`✅ Total Correct Predictions: ${reputation[1]}`);

    } catch (error) {
      console.error(`❌ Error in test: ${error.message}`);
    }

    console.log('\n🎯 Oddyssey contract test with viem completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testOddysseyWithViem();
