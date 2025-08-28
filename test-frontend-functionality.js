#!/usr/bin/env node

/**
 * Frontend Functionality Test Script
 * 
 * This script tests the frontend functionality by making requests to the frontend endpoints
 * to identify issues with prediction markets and oddyssey slips
 */

const axios = require('axios');

// Configuration
const FRONTEND_BASE_URL = 'http://localhost:8080'; // Frontend dev server
const BACKEND_BASE_URL = 'https://bitredict-backend.fly.dev';
const ADMIN_KEY = 'be67004f5780d8cb37825b8cb010a126440fd0d198be8c9d78591a787a38f961';

// Test data
const TEST_USER = {
  wallet: '0x1234567890123456789012345678901234567890',
  signature: 'test_signature_123'
};

class FrontendTester {
  constructor() {
    this.testResults = [];
    this.sessionData = {};
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '🔍';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async testEndpoint(endpoint, method = 'GET', data = null, description = '') {
    try {
      const url = `${FRONTEND_BASE_URL}${endpoint}`;
      const config = {
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'FrontendTester/1.0'
        },
        timeout: 10000
      };

      if (data) {
        config.data = data;
      }

      this.log(`Testing: ${description || endpoint}`);
      const response = await axios(config);
      
      this.testResults.push({
        endpoint,
        description,
        status: response.status,
        success: true,
        data: response.data
      });

      this.log(`✅ Success: ${response.status}`, 'success');
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

      this.log(`❌ Failed: ${error.message}`, 'error');
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
          'User-Agent': 'FrontendTester/1.0'
        },
        timeout: 10000
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

  async testFrontendHealth() {
    this.log('\n🏥 Testing Frontend Health...');
    
    // Test basic frontend endpoints
    await this.testEndpoint('/', 'GET', null, 'Frontend Homepage');
    await this.testEndpoint('/api/health', 'GET', null, 'Frontend Health Check');
    
    // Test if frontend is serving static assets
    await this.testEndpoint('/_next/static/chunks/main.js', 'GET', null, 'Frontend Static Assets');
  }

  async testFixturesAPI() {
    this.log('\n⚽ Testing Fixtures API...');
    
    // Test fixtures endpoints
    const today = new Date().toISOString().split('T')[0];
    await this.testEndpoint(`/api/fixtures/upcoming?date=${today}&limit=5`, 'GET', null, 'Upcoming Fixtures');
    await this.testEndpoint('/api/fixtures/today', 'GET', null, 'Today\'s Fixtures');
    
    // Test backend fixtures for comparison
    await this.testBackendEndpoint('/api/fixtures/upcoming?date=${today}&limit=5', 'GET', null, 'Backend Fixtures');
  }

  async testOdysseyAPI() {
    this.log('\n🎯 Testing Odyssey API...');
    
    // Test odyssey endpoints
    await this.testEndpoint('/api/oddyssey/matches?date=today', 'GET', null, 'Odyssey Matches');
    await this.testEndpoint('/api/oddyssey/cycles', 'GET', null, 'Odyssey Cycles');
    
    // Test backend odyssey for comparison
    await this.testBackendEndpoint('/api/oddyssey/matches?date=today', 'GET', null, 'Backend Odyssey');
  }

  async testPredictionMarkets() {
    this.log('\n📊 Testing Prediction Markets...');
    
    // Test prediction market endpoints
    await this.testEndpoint('/api/predictions/markets', 'GET', null, 'Prediction Markets');
    await this.testEndpoint('/api/predictions/pools', 'GET', null, 'Prediction Pools');
    
    // Test creating a prediction market (if endpoint exists)
    const testMarket = {
      fixture_id: '19427473', // Newcastle vs Liverpool
      market_type: '1x2',
      description: 'Test Market'
    };
    
    await this.testEndpoint('/api/predictions/markets', 'POST', testMarket, 'Create Prediction Market');
  }

  async testOdysseySlips() {
    this.log('\n🎫 Testing Odyssey Slips...');
    
    // Test odyssey slip endpoints
    await this.testEndpoint('/api/oddyssey/slips', 'GET', null, 'Odyssey Slips');
    
    // Test creating an odyssey slip
    const testSlip = {
      cycle_id: 1,
      selections: [
        {
          fixture_id: '19427473',
          outcome: 'home',
          odds: 2.5
        }
      ]
    };
    
    await this.testEndpoint('/api/oddyssey/slips', 'POST', testSlip, 'Create Odyssey Slip');
  }

  async testWalletIntegration() {
    this.log('\n👛 Testing Wallet Integration...');
    
    // Test wallet-related endpoints
    await this.testEndpoint('/api/auth/nonce', 'GET', null, 'Get Auth Nonce');
    
    const authData = {
      wallet: TEST_USER.wallet,
      signature: TEST_USER.signature,
      message: 'Test authentication message'
    };
    
    await this.testEndpoint('/api/auth/verify', 'POST', authData, 'Verify Wallet Auth');
  }

  async testContractInteraction() {
    this.log('\n📜 Testing Contract Interaction...');
    
    // Test contract-related endpoints
    await this.testEndpoint('/api/contracts/oddyssey/cycle', 'GET', null, 'Get Current Cycle');
    await this.testEndpoint('/api/contracts/oddyssey/matches', 'GET', null, 'Get Contract Matches');
  }

  async generateReport() {
    this.log('\n📋 Generating Test Report...');
    
    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - successfulTests;
    
    console.log('\n' + '='.repeat(60));
    console.log('🧪 FRONTEND FUNCTIONALITY TEST REPORT');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Successful: ${successfulTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Success Rate: ${((successfulTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:');
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
    
    console.log('\n✅ SUCCESSFUL TESTS:');
    this.testResults
      .filter(r => r.success)
      .forEach(test => {
        console.log(`   ${test.description || test.endpoint} (${test.status})`);
      });
    
    console.log('\n' + '='.repeat(60));
  }

  async runAllTests() {
    this.log('🚀 Starting Frontend Functionality Tests...');
    
    try {
      // Test frontend health first
      await this.testFrontendHealth();
      
      // Test API endpoints
      await this.testFixturesAPI();
      await this.testOdysseyAPI();
      await this.testPredictionMarkets();
      await this.testOdysseySlips();
      await this.testWalletIntegration();
      await this.testContractInteraction();
      
      // Generate report
      await this.generateReport();
      
    } catch (error) {
      this.log(`❌ Test suite failed: ${error.message}`, 'error');
    }
  }
}

// Run the tests
async function main() {
  const tester = new FrontendTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = FrontendTester;
