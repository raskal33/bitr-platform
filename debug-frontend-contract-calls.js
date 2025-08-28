#!/usr/bin/env node

/**
 * Debug Frontend Contract Calls
 * 
 * This script replicates the exact contract calls that the frontend is making
 * to identify why it's getting "No active matches found in contract"
 */

const { createPublicClient, createWalletClient, http, parseEther, encodeFunctionData, decodeFunctionResult, keccak256, stringToHex } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

// Load the actual contract ABI
const OddysseyArtifact = require('./solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json');
const ODDYSSEY_ABI = OddysseyArtifact.abi;

// Frontend-style chain configuration
const somniaChain = {
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'STT',
    symbol: 'STT',
  },
  rpcUrls: {
    default: {
      http: ['https://dream-rpc.somnia.network/'],
    },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: 'https://somnia-testnet.explorer.caldera.xyz' },
  },
  testnet: true,
};

// Frontend-style client wrapper (exact copy from frontend)
class WagmiStyleClient {
  constructor() {
    this.publicClient = createPublicClient({
      chain: somniaChain,
      transport: http()
    });
  }

  async readContract({ address, abi, functionName, args = [] }) {
    return await this.publicClient.readContract({
      address,
      abi,
      functionName,
      args
    });
  }
}

// Frontend-style contract wrapper (exact copy from frontend)
class OddysseyContract {
  constructor(client) {
    this.client = client;
  }

  async getCurrentCycleInfo() {
    return await this.client.readContract({
      address: process.env.ODDYSSEY_ADDRESS,
      abi: ODDYSSEY_ABI,
      functionName: 'getCurrentCycleInfo'
    });
  }

  async getDailyMatches(cycleId) {
    return await this.client.readContract({
      address: process.env.ODDYSSEY_ADDRESS,
      abi: ODDYSSEY_ABI,
      functionName: 'getDailyMatches',
      args: [cycleId]
    });
  }
}

async function debugFrontendContractCalls() {
  console.log('🔍 Debugging Frontend Contract Calls...');
  
  try {
    // Initialize frontend-style client
    const client = new WagmiStyleClient();
    const oddysseyContract = new OddysseyContract(client);

    console.log(`\n📊 Contract Address: ${process.env.ODDYSSEY_ADDRESS}`);
    console.log(`🌐 Network: ${somniaChain.name} (${somniaChain.id})`);

    // Test 1: Get current cycle information (frontend call)
    console.log('\n🎯 Test 1: getCurrentCycleInfo() - Frontend Call');
    try {
      const cycleInfo = await oddysseyContract.getCurrentCycleInfo();
      console.log('✅ getCurrentCycleInfo() Result:', cycleInfo);
      console.log(`   Cycle ID: ${cycleInfo[0]}`);
      console.log(`   State: ${cycleInfo[1]}`);
      console.log(`   End Time: ${new Date(Number(cycleInfo[2]) * 1000).toLocaleString()}`);
      console.log(`   Prize Pool: ${cycleInfo[3]}`);
      console.log(`   Slip Count: ${cycleInfo[4]}`);
    } catch (error) {
      console.error('❌ getCurrentCycleInfo() Error:', error.message);
      return;
    }

    // Test 2: Get daily matches (frontend call)
    console.log('\n🎯 Test 2: getDailyMatches() - Frontend Call');
    try {
      const cycleInfo = await oddysseyContract.getCurrentCycleInfo();
      const cycleId = cycleInfo[0];
      
      console.log(`   Calling getDailyMatches(${cycleId})...`);
      const matches = await oddysseyContract.getDailyMatches(cycleId);
      
      console.log('✅ getDailyMatches() Result:', matches);
      console.log(`   Match Count: ${matches.length}`);
      
      if (matches.length > 0) {
        matches.forEach((match, index) => {
          console.log(`   Match ${index + 1}: ID ${match.id}, Start: ${new Date(Number(match.startTime) * 1000).toLocaleString()}`);
        });
      } else {
        console.log('   ⚠️ No matches returned!');
      }
    } catch (error) {
      console.error('❌ getDailyMatches() Error:', error.message);
    }

    // Test 3: Compare with backend-style calls
    console.log('\n🎯 Test 3: Backend-Style Calls (for comparison)');
    try {
      // Backend-style direct call
      const data = encodeFunctionData({
        abi: ODDYSSEY_ABI,
        functionName: 'getCurrentCycleInfo',
      });

      const publicClient = createPublicClient({
        chain: somniaChain,
        transport: http()
      });

      const result = await publicClient.call({
        data,
        to: process.env.ODDYSSEY_ADDRESS,
      });

      const cycleInfo = decodeFunctionResult({
        abi: ODDYSSEY_ABI,
        functionName: 'getCurrentCycleInfo',
        data: result.data,
      });

      console.log('✅ Backend-style getCurrentCycleInfo() Result:', cycleInfo);
      console.log(`   Cycle ID: ${cycleInfo[0]}`);
      console.log(`   State: ${cycleInfo[1]}`);

      // Backend-style getDailyMatches
      const cycleId = cycleInfo[0];
      const matchesData = encodeFunctionData({
        abi: ODDYSSEY_ABI,
        functionName: 'getDailyMatches',
        args: [cycleId],
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

      console.log('✅ Backend-style getDailyMatches() Result:', matches);
      console.log(`   Match Count: ${matches.length}`);
    } catch (error) {
      console.error('❌ Backend-style calls Error:', error.message);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugFrontendContractCalls();

