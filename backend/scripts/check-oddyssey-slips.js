#!/usr/bin/env node

/**
 * Check Oddyssey Slips
 * 
 * This script checks the slips we placed in the Oddyssey contract
 * to verify they are properly recorded.
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

// Wagmi-style client configuration
class WagmiStyleClient {
  constructor() {
    this.publicClient = null;
    this.walletClient = null;
    this.account = null;
  }

  async initialize() {
    // Initialize public client
    this.publicClient = createPublicClient({
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

    // Initialize wallet client
    if (process.env.PRIVATE_KEY) {
      this.account = privateKeyToAccount(
        process.env.PRIVATE_KEY.startsWith('0x') 
          ? process.env.PRIVATE_KEY 
          : `0x${process.env.PRIVATE_KEY}`
      );
      
      this.walletClient = createWalletClient({
        account: this.account,
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
    }

    console.log(`✅ Wagmi-style clients initialized`);
    if (this.account) {
      console.log(`Wallet: ${this.account.address}`);
    }
    console.log(`Contract: ${process.env.ODDYSSEY_ADDRESS}`);
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
}

// Wagmi-style contract wrapper
class OddysseyContract {
  constructor(client) {
    this.client = client;
    this.config = {
      address: process.env.ODDYSSEY_ADDRESS,
      abi: ODDYSSEY_ABI,
    };
  }

  async getCurrentCycleInfo() {
    return await this.client.readContract({
      address: this.config.address,
      abi: this.config.abi,
      functionName: 'getCurrentCycleInfo',
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

  async getUserSlips(userAddress) {
    return await this.client.readContract({
      address: this.config.address,
      abi: this.config.abi,
      functionName: 'getUserSlips',
      args: [userAddress],
    });
  }
}

async function checkOddysseySlips() {
  console.log('🔍 Checking Oddyssey Slips...');
  
  try {
    // Validate environment variables
    if (!process.env.ODDYSSEY_ADDRESS) {
      throw new Error('ODDYSSEY_ADDRESS not set in environment');
    }

    // Initialize wagmi-style client
    const client = new WagmiStyleClient();
    await client.initialize();

    // Initialize contract
    const oddysseyContract = new OddysseyContract(client);

    // Get current cycle information
    console.log('\n📊 Current Cycle Information:');
    const cycleInfo = await oddysseyContract.getCurrentCycleInfo();
    console.log(`✅ Cycle ID: ${cycleInfo[0]}`);
    console.log(`✅ Cycle State: ${CycleState[cycleInfo[1]] || cycleInfo[1]}`);
    console.log(`✅ End Time: ${new Date(Number(cycleInfo[2]) * 1000).toLocaleString()}`);
    console.log(`✅ Prize Pool: ${parseEther(cycleInfo[3].toString())} STT`);
    console.log(`✅ Slip Count: ${cycleInfo[4]}`);

    // Get total slip count
    console.log('\n📊 Total Slip Count:');
    const totalSlipCount = await oddysseyContract.getSlipCount();
    console.log(`✅ Total Slips: ${totalSlipCount}`);

    // Check each slip
    console.log('\n📋 Checking Individual Slips:');
    for (let i = 0; i < Number(totalSlipCount); i++) {
      console.log(`\n🔍 Slip ${i}:`);
      try {
        const slip = await oddysseyContract.getSlip(i);
        
        console.log(`   Player: ${slip.player}`);
        console.log(`   Cycle ID: ${slip.cycleId}`);
        console.log(`   Placed At: ${new Date(Number(slip.placedAt) * 1000).toLocaleString()}`);
        console.log(`   Predictions Count: ${slip.predictions.length}`);
        console.log(`   Final Score: ${slip.finalScore}`);
        console.log(`   Correct Count: ${slip.correctCount}`);
        console.log(`   Is Evaluated: ${slip.isEvaluated}`);
        
        // Show predictions
        console.log(`   Predictions:`);
        slip.predictions.forEach((pred, index) => {
          const betTypeName = pred.betType === BetType.MONEYLINE ? 'Moneyline' : 'Over/Under';
          console.log(`     ${index + 1}. ${betTypeName} - Match ${pred.matchId}, Odd ${pred.selectedOdd}`);
        });

        // Check if this is our slip
        if (slip.player.toLowerCase() === client.account.address.toLowerCase()) {
          console.log(`   🎯 This is OUR slip!`);
        }
        
      } catch (error) {
        console.log(`   ❌ Error reading slip ${i}: ${error.message}`);
      }
    }

    // Get user slips specifically
    if (client.account) {
      console.log('\n👤 Our User Slips:');
      try {
        const userSlips = await oddysseyContract.getUserSlips(client.account.address);
        console.log(`✅ User has ${userSlips.length} slips:`);
        
        userSlips.forEach((slipId, index) => {
          console.log(`   ${index + 1}. Slip ID: ${slipId}`);
        });
      } catch (error) {
        console.log(`❌ Error getting user slips: ${error.message}`);
      }
    }

    console.log('\n🎯 Oddyssey slips check completed!');
    
  } catch (error) {
    console.error('❌ Check error:', error.message);
  }
}

checkOddysseySlips();
