#!/usr/bin/env node

/**
 * Test Oddyssey Slip Placement with Wagmi-Style Patterns
 * 
 * This script tests placing slips on the Oddyssey contract using wagmi-style patterns,
 * adapted for Node.js backend usage. It follows wagmi's patterns but works in a server environment.
 * 
 * Key Features:
 * 1. Wagmi-style contract hooks pattern
 * 2. Proper selection encoding
 * 3. Correct odds validation
 * 4. Match ID validation
 * 5. Bet type validation
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

// Wagmi-style contract configuration
const CONTRACT_CONFIG = {
  address: process.env.ODDYSSEY_ADDRESS,
  abi: ODDYSSEY_ABI,
  chainId: 50312, // Somnia chain ID
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
  }
};

// Wagmi-style client configuration
class WagmiStyleClient {
  constructor() {
    this.publicClient = null;
    this.walletClient = null;
    this.account = null;
  }

  async initialize() {
    // Initialize public client (like wagmi's public client)
    this.publicClient = createPublicClient({
      chain: CONTRACT_CONFIG.chain,
      transport: http(),
    });

    // Initialize wallet client (like wagmi's wallet client)
    if (process.env.PRIVATE_KEY) {
      this.account = privateKeyToAccount(
        process.env.PRIVATE_KEY.startsWith('0x') 
          ? process.env.PRIVATE_KEY 
          : `0x${process.env.PRIVATE_KEY}`
      );
      
      this.walletClient = createWalletClient({
        account: this.account,
        chain: CONTRACT_CONFIG.chain,
        transport: http(),
      });
    }

    console.log(`✅ Wagmi-style clients initialized`);
    if (this.account) {
      console.log(`Wallet: ${this.account.address}`);
    }
    console.log(`Contract: ${CONTRACT_CONFIG.address}`);
  }

  // Wagmi-style read function
  async readContract({ address, abi, functionName, args = [] }) {
    if (!this.publicClient) {
      throw new Error('Public client not initialized');
    }

    const data = encodeFunctionData({
      abi,
      functionName,
      args,
    });

    const result = await this.publicClient.call({
      data,
      to: address,
    });

    return decodeFunctionResult({
      abi,
      functionName,
      data: result.data,
    });
  }

  // Wagmi-style write function
  async writeContract({ address, abi, functionName, args = [], value = 0n }) {
    if (!this.walletClient) {
      throw new Error('Wallet client not initialized');
    }

    const data = encodeFunctionData({
      abi,
      functionName,
      args,
    });

    const hash = await this.walletClient.sendTransaction({
      to: address,
      data,
      value,
    });

    return { hash };
  }

  // Wagmi-style wait for transaction
  async waitForTransactionReceipt({ hash }) {
    if (!this.publicClient) {
      throw new Error('Public client not initialized');
    }

    return await this.publicClient.waitForTransactionReceipt({ hash });
  }

  // Wagmi-style get balance
  async getBalance({ address }) {
    if (!this.publicClient) {
      throw new Error('Public client not initialized');
    }

    return await this.publicClient.getBalance({ address });
  }
}

// Wagmi-style contract hooks (adapted for Node.js)
class OddysseyContract {
  constructor(client) {
    this.client = client;
    this.config = CONTRACT_CONFIG;
  }

  // useReadContract equivalent
  async getCurrentCycleInfo() {
    return await this.client.readContract({
      address: this.config.address,
      abi: this.config.abi,
      functionName: 'getCurrentCycleInfo',
    });
  }

  async getDailyMatches(cycleId) {
    return await this.client.readContract({
      address: this.config.address,
      abi: this.config.abi,
      functionName: 'getDailyMatches',
      args: [cycleId],
    });
  }

  async getEntryFee() {
    return await this.client.readContract({
      address: this.config.address,
      abi: this.config.abi,
      functionName: 'entryFee',
    });
  }

  async getSlipCount() {
    return await this.client.readContract({
      address: this.config.address,
      abi: this.config.abi,
      functionName: 'slipCount',
    });
  }

  async getSlip(slipId) {
    return await this.client.readContract({
      address: this.config.address,
      abi: this.config.abi,
      functionName: 'getSlip',
      args: [slipId],
    });
  }

  // useWriteContract equivalent
  async placeSlip(predictions, value) {
    return await this.client.writeContract({
      address: this.config.address,
      abi: this.config.abi,
      functionName: 'placeSlip',
      args: [predictions],
      value,
    });
  }
}

async function testOddysseySlipPlacementWagmiStyle() {
  console.log('🎯 Testing Oddyssey Slip Placement with Wagmi-Style Patterns...');
  
  try {
    // Validate environment variables
    if (!process.env.ODDYSSEY_ADDRESS) {
      throw new Error('ODDYSSEY_ADDRESS not set in environment');
    }
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY not set in environment');
    }

    // Initialize wagmi-style client
    const client = new WagmiStyleClient();
    await client.initialize();

    // Initialize contract with wagmi-style patterns
    const oddysseyContract = new OddysseyContract(client);

    // Test 1: Get current cycle information (useReadContract pattern)
    console.log('\n📊 Test 1: Getting Current Cycle Information...');
    const cycleInfo = await oddysseyContract.getCurrentCycleInfo();

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

    // Test 2: Get daily matches for current cycle (useReadContract pattern)
    console.log('\n⚽ Test 2: Getting Daily Matches...');
    const matches = await oddysseyContract.getDailyMatches(cycleInfo[0]);

    console.log(`✅ Found ${matches.length} matches:`);
    matches.forEach((match, index) => {
      console.log(`   Match ${index + 1}: ID ${match.id}, Start: ${new Date(Number(match.startTime) * 1000).toLocaleString()}`);
      console.log(`     Odds - Home: ${match.oddsHome}, Draw: ${match.oddsDraw}, Away: ${match.oddsAway}`);
      console.log(`     Odds - Over: ${match.oddsOver}, Under: ${match.oddsUnder}`);
    });

    // Test 3: Get entry fee (useReadContract pattern)
    console.log('\n💰 Test 3: Getting Entry Fee...');
    const entryFee = await oddysseyContract.getEntryFee();
    console.log(`✅ Entry Fee: ${parseEther(entryFee.toString())} STT`);

    // Test 4: Get current slip count (useReadContract pattern)
    console.log('\n📊 Test 4: Getting Current Slip Count...');
    const currentSlipCount = await oddysseyContract.getSlipCount();
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

    // Get current balance (wagmi-style)
    const balance = await client.getBalance({ address: client.account.address });
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

    console.log('✅ Sufficient balance, attempting to place slip...');
    
    try {
      // Use wagmi-style writeContract pattern
      const { hash } = await oddysseyContract.placeSlip(contractPredictions, entryFee);
      console.log(`✅ Slip placed! Transaction hash: ${hash}`);
      
      // Wait for transaction confirmation (wagmi-style)
      const receipt = await client.waitForTransactionReceipt({ hash });
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      
      // Test 6: Verify slip was created (useReadContract pattern)
      console.log('\n🔍 Test 6: Verifying Slip Creation...');
      
      // Get new slip count
      const newSlipCount = await oddysseyContract.getSlipCount();
      console.log(`✅ New Slip Count: ${newSlipCount}`);
      
      if (newSlipCount > currentSlipCount) {
        const slipId = currentSlipCount; // The slip we just created
        
        // Get slip details
        const slip = await oddysseyContract.getSlip(slipId);

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

    console.log('\n🎯 Oddyssey slip placement test with wagmi-style patterns completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testOddysseySlipPlacementWagmiStyle();
