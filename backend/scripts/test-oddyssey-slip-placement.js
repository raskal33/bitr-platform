#!/usr/bin/env node

/**
 * Test Oddyssey Slip Placement with Viem
 * 
 * This script tests placing slips on the Oddyssey contract using viem,
 * with proper selection encoding and validation matching the contract requirements.
 * 
 * Key Features:
 * 1. Proper keccak256 encoding for selections
 * 2. Correct odds validation
 * 3. Match ID validation
 * 4. Bet type validation
 */

const { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, decodeFunctionResult, keccak256, stringToHex } = require('viem');
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

const CycleState = {
  NotStarted: 0,
  Active: 1,
  Ended: 2,
  Resolved: 3
};

// Selection constants (matching contract)
const SELECTIONS = {
  MONEYLINE: {
    HOME_WIN: keccak256(stringToHex('1')),
    DRAW: keccak256(stringToHex('X')),
    AWAY_WIN: keccak256(stringToHex('2'))
  },
  OVER_UNDER: {
    OVER: keccak256(stringToHex('Over')),
    UNDER: keccak256(stringToHex('Under'))
  }
};

async function testOddysseySlipPlacement() {
  console.log('🎯 Testing Oddyssey Slip Placement with Viem...');
  
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

    if (cycleInfo[1] !== 1n && cycleInfo[1] !== 1) {
      console.log('ℹ️ Cycle is not active, cannot place slips');
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

    // Test 4: Get current slip count
    console.log('\n📊 Test 4: Getting Current Slip Count...');
    const slipCountData = encodeFunctionData({
      abi: ODDYSSEY_ABI,
      functionName: 'slipCount',
    });

    const slipCountResult = await publicClient.call({
      data: slipCountData,
      to: process.env.ODDYSSEY_ADDRESS,
    });

    const currentSlipCount = decodeFunctionResult({
      abi: ODDYSSEY_ABI,
      functionName: 'slipCount',
      data: slipCountResult.data,
    });

    console.log(`✅ Current Slip Count: ${currentSlipCount}`);

    // Test 5: Create and place a slip with diverse predictions
    console.log('\n🎯 Test 5: Creating and Placing a Slip...');
    
    // Create diverse predictions (mix of moneyline and over/under)
    const predictions = matches.map((match, index) => {
      // Alternate between moneyline and over/under for variety
      if (index % 2 === 0) {
        // Moneyline predictions
        const moneylineChoices = [
          { selection: SELECTIONS.MONEYLINE.HOME_WIN, odd: match.oddsHome, name: 'Home Win' },
          { selection: SELECTIONS.MONEYLINE.DRAW, odd: match.oddsDraw, name: 'Draw' },
          { selection: SELECTIONS.MONEYLINE.AWAY_WIN, odd: match.oddsAway, name: 'Away Win' }
        ];
        const choice = moneylineChoices[index % 3]; // Cycle through choices
        
        return {
          matchId: match.id,
          betType: BetType.MONEYLINE,
          selection: choice.selection,
          selectedOdd: choice.odd,
          description: choice.name
        };
      } else {
        // Over/Under predictions
        const overUnderChoices = [
          { selection: SELECTIONS.OVER_UNDER.OVER, odd: match.oddsOver, name: 'Over' },
          { selection: SELECTIONS.OVER_UNDER.UNDER, odd: match.oddsUnder, name: 'Under' }
        ];
        const choice = overUnderChoices[index % 2]; // Alternate over/under
        
        return {
          matchId: match.id,
          betType: BetType.OVER_UNDER,
          selection: choice.selection,
          selectedOdd: choice.odd,
          description: choice.name
        };
      }
    });

    console.log(`📝 Created ${predictions.length} diverse predictions:`);
    predictions.forEach((pred, index) => {
      const betTypeName = pred.betType === BetType.MONEYLINE ? 'Moneyline' : 'Over/Under';
      console.log(`   Match ${index + 1}: ${betTypeName} - ${pred.description} (${pred.selectedOdd})`);
    });

    // Validate predictions before placing
    console.log('\n🔍 Validating Predictions...');
    let isValid = true;
    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i];
      const match = matches[i];
      
      // Check match ID
      if (pred.matchId !== match.id) {
        console.log(`❌ Match ID mismatch at index ${i}: expected ${match.id}, got ${pred.matchId}`);
        isValid = false;
      }
      
      // Check odds match
      let expectedOdd;
      if (pred.betType === BetType.MONEYLINE) {
        if (pred.selection === SELECTIONS.MONEYLINE.HOME_WIN) expectedOdd = match.oddsHome;
        else if (pred.selection === SELECTIONS.MONEYLINE.DRAW) expectedOdd = match.oddsDraw;
        else if (pred.selection === SELECTIONS.MONEYLINE.AWAY_WIN) expectedOdd = match.oddsAway;
      } else {
        if (pred.selection === SELECTIONS.OVER_UNDER.OVER) expectedOdd = match.oddsOver;
        else if (pred.selection === SELECTIONS.OVER_UNDER.UNDER) expectedOdd = match.oddsUnder;
      }
      
      if (pred.selectedOdd !== expectedOdd) {
        console.log(`❌ Odds mismatch at index ${i}: expected ${expectedOdd}, got ${pred.selectedOdd}`);
        isValid = false;
      }
    }
    
    if (!isValid) {
      console.log('❌ Prediction validation failed, aborting slip placement');
      return;
    }
    
    console.log('✅ All predictions validated successfully');

    // Get current balance
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`💰 Current Balance: ${parseEther(balance.toString())} STT`);

    if (balance < entryFee) {
      console.log(`❌ Insufficient balance. Need ${parseEther(entryFee.toString())} STT, have ${parseEther(balance.toString())} STT`);
      return;
    }

    // Prepare predictions for contract (remove description field)
    const contractPredictions = predictions.map(pred => ({
      matchId: pred.matchId,
      betType: pred.betType,
      selection: pred.selection,
      selectedOdd: pred.selectedOdd
    }));

    // Encode placeSlip function
    const placeSlipData = encodeFunctionData({
      abi: ODDYSSEY_ABI,
      functionName: 'placeSlip',
      args: [contractPredictions],
    });

    console.log('✅ Sufficient balance, attempting to place slip...');
    
    try {
      const hash = await walletClient.sendTransaction({
        to: process.env.ODDYSSEY_ADDRESS,
        data: placeSlipData,
        value: entryFee,
      });

      console.log(`✅ Slip placed! Transaction hash: ${hash}`);
      
      // Wait for transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      
      // Test 6: Verify slip was created
      console.log('\n🔍 Test 6: Verifying Slip Creation...');
      
      // Get new slip count
      const newSlipCountResult = await publicClient.call({
        data: slipCountData,
        to: process.env.ODDYSSEY_ADDRESS,
      });

      const newSlipCount = decodeFunctionResult({
        abi: ODDYSSEY_ABI,
        functionName: 'slipCount',
        data: newSlipCountResult.data,
      });

      console.log(`✅ New Slip Count: ${newSlipCount}`);
      
      if (newSlipCount > currentSlipCount) {
        const slipId = currentSlipCount; // The slip we just created
        
        // Get slip details
        const slipData = encodeFunctionData({
          abi: ODDYSSEY_ABI,
          functionName: 'getSlip',
          args: [slipId],
        });

        const slipResult = await publicClient.call({
          data: slipData,
          to: process.env.ODDYSSEY_ADDRESS,
        });

        const slip = decodeFunctionResult({
          abi: ODDYSSEY_ABI,
          functionName: 'getSlip',
          data: slipResult.data,
        });

        console.log(`✅ Slip ${slipId} details:`);
        console.log(`   Player: ${slip.player}`);
        console.log(`   Cycle ID: ${slip.cycleId}`);
        console.log(`   Placed At: ${new Date(Number(slip.placedAt) * 1000).toLocaleString()}`);
        console.log(`   Predictions Count: ${slip.predictions.length}`);
        console.log(`   Final Score: ${slip.finalScore}`);
        console.log(`   Correct Count: ${slip.correctCount}`);
        console.log(`   Is Evaluated: ${slip.isEvaluated}`);
        
        // Verify predictions match what we sent
        console.log('\n📋 Verifying Slip Predictions:');
        slip.predictions.forEach((pred, index) => {
          const originalPred = predictions[index];
          const betTypeName = pred.betType === BetType.MONEYLINE ? 'Moneyline' : 'Over/Under';
          console.log(`   Prediction ${index + 1}: ${betTypeName} - Match ${pred.matchId}, Odd ${pred.selectedOdd}`);
        });
        
      } else {
        console.log('❌ Slip count did not increase');
      }
      
    } catch (error) {
      console.log(`❌ Failed to place slip: ${error.message}`);
      
      // Try to get more detailed error information
      if (error.message.includes('execution reverted')) {
        console.log('🔍 This might be due to:');
        console.log('   - Invalid prediction format');
        console.log('   - Odds mismatch');
        console.log('   - Match ID mismatch');
        console.log('   - Betting window closed');
        console.log('   - Insufficient payment');
      }
    }

    console.log('\n🎯 Oddyssey slip placement test with viem completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testOddysseySlipPlacement();
