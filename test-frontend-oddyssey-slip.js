#!/usr/bin/env node

/**
 * Frontend Oddyssey Slip Test Script
 * 
 * This script tests the frontend Oddyssey slip placement functionality
 * by simulating user interactions and testing the complete flow
 */

const axios = require('axios');
const { createPublicClient, http, createWalletClient, custom } = require('viem');

// Configuration
const FRONTEND_BASE_URL = 'http://localhost:8080';
const BACKEND_BASE_URL = 'https://bitredict-backend.fly.dev';
const ADMIN_KEY = 'be67004f5780d8cb37825b8cb010a126440fd0d198be8c9d78591a787a38f961';

// Somnia chain configuration (same as frontend)
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
      http: ['https://testnet-rpc.somnia.zone'],
    },
    public: {
      http: ['https://testnet-rpc.somnia.zone'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Explorer',
      url: 'https://testnet-explorer.somnia.zone',
    },
  },
};

class OddysseySlipTester {
  constructor() {
    this.testResults = [];
    this.sessionData = {};
    this.availableMatches = [];
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔍';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async testFrontendHealth() {
    try {
      const response = await axios.get(`${FRONTEND_BASE_URL}/`);
      if (response.status === 200) {
        await this.log('Frontend is running and accessible', 'success');
        return true;
      }
    } catch (error) {
      await this.log(`Frontend health check failed: ${error.message}`, 'error');
      return false;
    }
  }

  async fetchAvailableMatches() {
    try {
      await this.log('Fetching available Oddyssey matches...');
      
      const response = await axios.get(`${FRONTEND_BASE_URL}/api/oddyssey/matches?date=today`);
      
      if (response.status === 200 && response.data.success) {
        const matches = response.data.data.today.matches;
        await this.log(`Found ${matches.length} matches available for today`, 'success');
        
        this.availableMatches = matches;
        return matches;
      } else {
        await this.log('Failed to fetch matches', 'error');
        return [];
      }
    } catch (error) {
      await this.log(`Error fetching matches: ${error.message}`, 'error');
      return [];
    }
  }

  async testMatchSelection() {
    if (this.availableMatches.length === 0) {
      await this.log('No matches available for testing', 'warning');
      return false;
    }

    const testMatch = this.availableMatches[0];
    await this.log(`Testing with match: ${testMatch.home_team} vs ${testMatch.away_team}`, 'info');
    
    return testMatch;
  }

  async testSlipCreation(match) {
    try {
      await this.log('Testing slip creation...');
      
      // Test data for slip creation
      const slipData = {
        matchId: match.id,
        fixtureId: match.fixture_id,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        selection: 'home', // home, away, draw
        odds: match.home_odds,
        stake: 10, // STT amount
        marketType: 'moneyline'
      };

      await this.log(`Creating slip with data: ${JSON.stringify(slipData, null, 2)}`, 'info');

      // Test the slip creation endpoint
      const response = await axios.post(`${FRONTEND_BASE_URL}/api/oddyssey/slips`, slipData, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.status === 200) {
        await this.log('Slip creation endpoint responded successfully', 'success');
        return response.data;
      } else {
        await this.log(`Slip creation failed with status: ${response.status}`, 'error');
        return null;
      }
    } catch (error) {
      await this.log(`Error creating slip: ${error.message}`, 'error');
      if (error.response) {
        await this.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
      }
      return null;
    }
  }

  async testWalletConnection() {
    try {
      await this.log('Testing wallet connection...');
      
      // Test wallet connection endpoint
      const response = await axios.get(`${FRONTEND_BASE_URL}/api/auth/nonce`);
      
      if (response.status === 200) {
        await this.log('Wallet connection endpoint accessible', 'success');
        return response.data;
      } else {
        await this.log(`Wallet connection failed with status: ${response.status}`, 'error');
        return null;
      }
    } catch (error) {
      await this.log(`Error testing wallet connection: ${error.message}`, 'error');
      return null;
    }
  }

  async testTransactionSimulation() {
    try {
      await this.log('Testing transaction simulation...');
      
      // Simulate a transaction request
      const transactionData = {
        matchId: this.availableMatches[0]?.id,
        selection: 'home',
        stake: 10,
        walletAddress: '0x1234567890123456789012345678901234567890',
        signature: 'test_signature_123'
      };

      const response = await axios.post(`${FRONTEND_BASE_URL}/api/oddyssey/place-bet`, transactionData, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.status === 200) {
        await this.log('Transaction simulation successful', 'success');
        return response.data;
      } else {
        await this.log(`Transaction simulation failed with status: ${response.status}`, 'error');
        return null;
      }
    } catch (error) {
      await this.log(`Error in transaction simulation: ${error.message}`, 'error');
      if (error.response) {
        await this.log(`Response data: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
      }
      return null;
    }
  }

  async testContractInteraction() {
    try {
      await this.log('Testing contract interaction...');
      
      // Test contract endpoints
      const endpoints = [
        '/api/contracts/oddyssey/cycle',
        '/api/contracts/oddyssey/matches'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await axios.get(`${FRONTEND_BASE_URL}${endpoint}`);
          await this.log(`${endpoint} - Status: ${response.status}`, 'success');
        } catch (error) {
          await this.log(`${endpoint} - Error: ${error.message}`, 'error');
        }
      }
    } catch (error) {
      await this.log(`Error testing contract interaction: ${error.message}`, 'error');
    }
  }

  async runFullTest() {
    await this.log('🚀 Starting Frontend Oddyssey Slip Test', 'info');
    await this.log('=====================================', 'info');

    // Test 1: Frontend Health
    const frontendHealthy = await this.testFrontendHealth();
    if (!frontendHealthy) {
      await this.log('❌ Frontend is not accessible. Stopping tests.', 'error');
      return;
    }

    // Test 2: Fetch Available Matches
    const matches = await this.fetchAvailableMatches();
    if (matches.length === 0) {
      await this.log('❌ No matches available. Stopping tests.', 'error');
      return;
    }

    // Test 3: Match Selection
    const selectedMatch = await this.testMatchSelection();

    // Test 4: Wallet Connection
    await this.testWalletConnection();

    // Test 5: Contract Interaction
    await this.testContractInteraction();

    // Test 6: Slip Creation
    const slipResult = await this.testSlipCreation(selectedMatch);

    // Test 7: Transaction Simulation
    const transactionResult = await this.testTransactionSimulation();

    // Summary
    await this.log('📊 Test Summary', 'info');
    await this.log('================', 'info');
    await this.log(`Frontend Health: ${frontendHealthy ? '✅' : '❌'}`, 'info');
    await this.log(`Available Matches: ${matches.length}`, 'info');
    await this.log(`Slip Creation: ${slipResult ? '✅' : '❌'}`, 'info');
    await this.log(`Transaction Simulation: ${transactionResult ? '✅' : '❌'}`, 'info');

    if (slipResult) {
      await this.log('✅ Slip creation is working!', 'success');
    } else {
      await this.log('❌ Slip creation is failing - check the error details above', 'error');
    }

    if (transactionResult) {
      await this.log('✅ Transaction simulation is working!', 'success');
    } else {
      await this.log('❌ Transaction simulation is failing - check the error details above', 'error');
    }
  }
}

// Run the test
async function main() {
  const tester = new OddysseySlipTester();
  await tester.runFullTest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = OddysseySlipTester;
