#!/usr/bin/env node

/**
 * Frontend Transaction Test Script
 * 
 * This script specifically tests the transaction functionality that's failing in the frontend
 * including prediction market creation and oddyssey slip placement
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
      http: ['https://dream-rpc.somnia.network/'],
    },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: 'https://somnia-testnet.explorer.caldera.xyz' },
  },
  testnet: true,
};

// Contract addresses
const ODDYSSEY_ADDRESS = '0x9f9D719041C8F0EE708440f15AE056Cd858DCF4e';
const PREDICTION_ADDRESS = '0x1234567890123456789012345678901234567890'; // Replace with actual address

class TransactionTester {
  constructor() {
    this.testResults = [];
    this.publicClient = createPublicClient({
      chain: somniaChain,
      transport: http()
    });
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '🔍';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async testFrontendEndpoint(endpoint, method = 'GET', data = null, description = '') {
    try {
      const url = `${FRONTEND_BASE_URL}${endpoint}`;
      const config = {
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TransactionTester/1.0'
        },
        timeout: 15000
      };

      if (data) {
        config.data = data;
      }

      this.log(`Testing Frontend: ${description || endpoint}`);
      const response = await axios(config);
      
      this.testResults.push({
        endpoint,
        description,
        status: response.status,
        success: true,
        data: response.data
      });

      this.log(`✅ Frontend Success: ${response.status}`, 'success');
      return response.data;
    } catch (error) {
      this.testResults.push({
        endpoint,
        description,
        status: error.response?.status || 'ERROR',
        success: false,
        error: error.message,
        response: error.response?.data
      });

      this.log(`❌ Frontend Failed: ${error.message}`, 'error');
      if (error.response?.data) {
        this.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
      }
      return null;
    }
  }

  async testBackendEndpoint(endpoint, method = 'GET', data = null, description = '') {
    try {
      const url = `${BACKEND_BASE_URL}${endpoint}`;
      const config = {
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_KEY,
          'User-Agent': 'TransactionTester/1.0'
        },
        timeout: 15000
      };

      if (data) {
        config.data = data;
      }

      this.log(`Testing Backend: ${description || endpoint}`);
      const response = await axios(config);
      
      this.log(`✅ Backend Success: ${response.status}`, 'success');
      return response.data;
    } catch (error) {
      this.log(`❌ Backend Failed: ${error.message}`, 'error');
      return null;
    }
  }

  async testContractRead(functionName, args = [], description = '') {
    try {
      this.log(`Testing Contract Read: ${description || functionName}`);
      
      const result = await this.publicClient.readContract({
        address: ODDYSSEY_ADDRESS,
        abi: [], // We'll need to load the actual ABI
        functionName,
        args
      });

      this.log(`✅ Contract Read Success: ${functionName}`, 'success');
      return result;
    } catch (error) {
      this.log(`❌ Contract Read Failed: ${functionName} - ${error.message}`, 'error');
      return null;
    }
  }

  async testOdysseySlipCreation() {
    this.log('\n🎫 Testing Odyssey Slip Creation...');
    
    // First, get current cycle info
    const cycleInfo = await this.testBackendEndpoint('/api/oddyssey/cycles/current', 'GET', null, 'Get Current Cycle');
    
    if (!cycleInfo?.data?.cycle_id) {
      this.log('❌ No active cycle found', 'error');
      return;
    }

    const cycleId = cycleInfo.data.cycle_id;
    this.log(`📅 Active Cycle ID: ${cycleId}`);

    // Get matches for the current cycle
    const matches = await this.testBackendEndpoint(`/api/oddyssey/matches?cycle_id=${cycleId}`, 'GET', null, 'Get Cycle Matches');
    
    if (!matches?.data?.matches || matches.data.matches.length === 0) {
      this.log('❌ No matches found for current cycle', 'error');
      return;
    }

    const firstMatch = matches.data.matches[0];
    this.log(`⚽ Using match: ${firstMatch.home_team} vs ${firstMatch.away_team}`);

    // Test creating an odyssey slip through frontend
    const slipData = {
      cycle_id: cycleId,
      selections: [
        {
          fixture_id: firstMatch.id,
          outcome: 'home', // or 'away', 'draw'
          odds: firstMatch.home_odds
        }
      ],
      stake: '0.001', // Small stake for testing
      wallet_address: '0x1234567890123456789012345678901234567890'
    };

    await this.testFrontendEndpoint('/api/oddyssey/slips/create', 'POST', slipData, 'Create Odyssey Slip (Frontend)');
    
    // Compare with backend
    await this.testBackendEndpoint('/api/oddyssey/slips/create', 'POST', slipData, 'Create Odyssey Slip (Backend)');
  }

  async testPredictionMarketCreation() {
    this.log('\n📊 Testing Prediction Market Creation...');
    
    // Get available fixtures
    const fixtures = await this.testBackendEndpoint('/api/fixtures/upcoming?limit=5', 'GET', null, 'Get Available Fixtures');
    
    if (!fixtures?.data?.fixtures || fixtures.data.fixtures.length === 0) {
      this.log('❌ No fixtures available', 'error');
      return;
    }

    const fixture = fixtures.data.fixtures[0];
    this.log(`⚽ Using fixture: ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`);

    // Test creating a prediction market through frontend
    const marketData = {
      fixture_id: fixture.id,
      market_type: '1x2', // Home, Draw, Away
      description: `Test Market: ${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
      outcomes: [
        { label: 'Home', odds: 2.5 },
        { label: 'Draw', odds: 3.2 },
        { label: 'Away', odds: 2.8 }
      ],
      creator_wallet: '0x1234567890123456789012345678901234567890',
      entry_fee: '0.001'
    };

    await this.testFrontendEndpoint('/api/predictions/markets/create', 'POST', marketData, 'Create Prediction Market (Frontend)');
    
    // Compare with backend
    await this.testBackendEndpoint('/api/predictions/markets/create', 'POST', marketData, 'Create Prediction Market (Backend)');
  }

  async testWalletConnection() {
    this.log('\n👛 Testing Wallet Connection...');
    
    // Test wallet connection endpoints
    await this.testFrontendEndpoint('/api/auth/nonce', 'GET', null, 'Get Auth Nonce');
    
    const authData = {
      wallet: '0x1234567890123456789012345678901234567890',
      signature: '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890',
      message: 'Test authentication message'
    };
    
    await this.testFrontendEndpoint('/api/auth/verify', 'POST', authData, 'Verify Wallet Auth');
  }

  async testTransactionSimulation() {
    this.log('\n🔄 Testing Transaction Simulation...');
    
    // Test transaction simulation endpoints
    const simulationData = {
      to: ODDYSSEY_ADDRESS,
      data: '0x1234567890', // Mock transaction data
      value: '0',
      from: '0x1234567890123456789012345678901234567890'
    };
    
    await this.testFrontendEndpoint('/api/transactions/simulate', 'POST', simulationData, 'Simulate Transaction');
  }

  async testErrorHandling() {
    this.log('\n🚨 Testing Error Handling...');
    
    // Test with invalid data to see how frontend handles errors
    const invalidSlipData = {
      cycle_id: 999999, // Invalid cycle
      selections: [], // Empty selections
      stake: 'invalid_stake'
    };
    
    await this.testFrontendEndpoint('/api/oddyssey/slips/create', 'POST', invalidSlipData, 'Create Invalid Slip (Error Test)');
    
    const invalidMarketData = {
      fixture_id: 'invalid_id',
      market_type: 'invalid_type',
      outcomes: []
    };
    
    await this.testFrontendEndpoint('/api/predictions/markets/create', 'POST', invalidMarketData, 'Create Invalid Market (Error Test)');
  }

  async generateDetailedReport() {
    this.log('\n📋 Generating Detailed Transaction Test Report...');
    
    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - successfulTests;
    
    console.log('\n' + '='.repeat(70));
    console.log('🧪 FRONTEND TRANSACTION TEST REPORT');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Successful: ${successfulTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Success Rate: ${((successfulTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ FAILED TRANSACTION TESTS:');
      this.testResults
        .filter(r => !r.success)
        .forEach(test => {
          console.log(`\n🔍 ${test.description || test.endpoint}`);
          console.log(`   Status: ${test.status}`);
          console.log(`   Error: ${test.error}`);
          if (test.response) {
            console.log(`   Response: ${JSON.stringify(test.response, null, 2)}`);
          }
        });
    }
    
    console.log('\n✅ SUCCESSFUL TRANSACTION TESTS:');
    this.testResults
      .filter(r => r.success)
      .forEach(test => {
        console.log(`   ${test.description || test.endpoint} (${test.status})`);
      });
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    if (failedTests > 0) {
      console.log('   • Check frontend API routes and handlers');
      console.log('   • Verify contract addresses and ABIs');
      console.log('   • Test wallet connection and authentication');
      console.log('   • Review error handling and user feedback');
    } else {
      console.log('   • All transaction tests passed!');
      console.log('   • Frontend transaction functionality appears working');
    }
    
    console.log('\n' + '='.repeat(70));
  }

  async runTransactionTests() {
    this.log('🚀 Starting Frontend Transaction Tests...');
    
    try {
      // Test wallet connection first
      await this.testWalletConnection();
      
      // Test transaction simulation
      await this.testTransactionSimulation();
      
      // Test odyssey slip creation
      await this.testOdysseySlipCreation();
      
      // Test prediction market creation
      await this.testPredictionMarketCreation();
      
      // Test error handling
      await this.testErrorHandling();
      
      // Generate detailed report
      await this.generateDetailedReport();
      
    } catch (error) {
      this.log(`❌ Transaction test suite failed: ${error.message}`, 'error');
    }
  }
}

// Run the transaction tests
async function main() {
  const tester = new TransactionTester();
  await tester.runTransactionTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = TransactionTester;
