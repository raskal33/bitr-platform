#!/usr/bin/env node

/**
 * Frontend Transaction Flow Test Script
 * 
 * This script specifically tests the transaction flow for Oddyssey slips
 * by simulating the exact steps a user would take
 */

const axios = require('axios');

// Configuration
const FRONTEND_BASE_URL = 'http://localhost:8080';
const BACKEND_BASE_URL = 'https://bitredict-backend.fly.dev';

class TransactionFlowTester {
  constructor() {
    this.testMatch = null;
    this.testSlip = null;
  }

  async log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '🔍';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async step1_getMatches() {
    await this.log('Step 1: Getting available matches...');
    
    try {
      const response = await axios.get(`${FRONTEND_BASE_URL}/api/oddyssey/matches?date=today`);
      
      if (response.status === 200 && response.data.success) {
        const matches = response.data.data.today.matches;
        if (matches.length > 0) {
          this.testMatch = matches[0];
          await this.log(`✅ Found match: ${this.testMatch.home_team} vs ${this.testMatch.away_team}`, 'success');
          return true;
        }
      }
      
      await this.log('❌ No matches available', 'error');
      return false;
    } catch (error) {
      await this.log(`❌ Error getting matches: ${error.message}`, 'error');
      return false;
    }
  }

  async step2_createSlip() {
    if (!this.testMatch) {
      await this.log('❌ No test match available', 'error');
      return false;
    }

    await this.log('Step 2: Creating slip...');
    
    try {
      // First, get the actual contract matches to ensure correct order
      await this.log('Getting contract matches for correct order...');
      const contractResponse = await axios.get(`${BACKEND_BASE_URL}/api/oddyssey/contract-matches`);
      
      if (!contractResponse.data.success) {
        await this.log('❌ Failed to get contract matches', 'error');
        return false;
      }
      
      const contractMatches = contractResponse.data.data;
      const cycleId = contractResponse.data.cycleId;
      
      await this.log(`Using cycle ID: ${cycleId} with ${contractMatches.length} matches`, 'info');
      
      // Create 10 predictions with correct matchIds in the exact order from contract
      const predictions = contractMatches.map((match, index) => ({
        matchId: parseInt(match.id), // Convert to number to match contract data type
        betType: 'MONEYLINE',
        selection: '1'
      }));

      const slipData = {
        playerAddress: '0x1234567890123456789012345678901234567890',
        predictions: predictions,
        cycleId: parseInt(cycleId)
      };

      await this.log(`Creating slip with ${predictions.length} predictions for cycle ${cycleId}`);
      await this.log(`First prediction: matchId=${predictions[0].matchId}, betType=${predictions[0].betType}, selection=${predictions[0].selection}`);

      const response = await axios.post(`${FRONTEND_BASE_URL}/api/oddyssey/place-slip`, slipData, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.status === 200) {
        this.testSlip = response.data;
        await this.log('✅ Slip created successfully', 'success');
        await this.log(`Slip ID: ${this.testSlip.data?.slipId || 'N/A'}`, 'info');
        return true;
      } else {
        await this.log(`❌ Slip creation failed: ${response.status}`, 'error');
        return false;
      }
    } catch (error) {
      await this.log(`❌ Error creating slip: ${error.message}`, 'error');
      if (error.response?.data) {
        await this.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
      }
      return false;
    }
  }

  async step3_testWalletConnection() {
    await this.log('Step 3: Testing wallet connection...');
    
    try {
      // Test if wallet connection endpoints exist
      const endpoints = [
        '/api/auth/nonce',
        '/api/auth/verify'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await axios.get(`${FRONTEND_BASE_URL}${endpoint}`);
          await this.log(`✅ ${endpoint} - Status: ${response.status}`, 'success');
        } catch (error) {
          await this.log(`⚠️ ${endpoint} - ${error.response?.status || 'Connection failed'}`, 'warning');
        }
      }
      
      return true;
    } catch (error) {
      await this.log(`❌ Error testing wallet connection: ${error.message}`, 'error');
      return false;
    }
  }

  async step4_testTransactionEndpoints() {
    await this.log('Step 4: Testing transaction endpoints...');
    
    try {
      const endpoints = [
        '/api/oddyssey/place-bet',
        '/api/oddyssey/confirm-bet',
        '/api/contracts/oddyssey/cycle',
        '/api/contracts/oddyssey/matches'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await axios.get(`${FRONTEND_BASE_URL}${endpoint}`);
          await this.log(`✅ ${endpoint} - Status: ${response.status}`, 'success');
        } catch (error) {
          if (error.response?.status === 405) {
            // Method not allowed - endpoint exists but doesn't accept GET
            await this.log(`✅ ${endpoint} - Endpoint exists (405 Method Not Allowed)`, 'success');
          } else {
            await this.log(`⚠️ ${endpoint} - ${error.response?.status || 'Connection failed'}`, 'warning');
          }
        }
      }
      
      return true;
    } catch (error) {
      await this.log(`❌ Error testing transaction endpoints: ${error.message}`, 'error');
      return false;
    }
  }

  async step5_simulateTransaction() {
    if (!this.testMatch) {
      await this.log('❌ No test match available for transaction', 'error');
      return false;
    }

    await this.log('Step 5: Simulating transaction...');
    
    try {
      // Create 10 predictions for the transaction
      const predictions = [];
      for (let i = 0; i < 10; i++) {
        predictions.push({
          matchId: this.testMatch.id,
          fixtureId: this.testMatch.fixture_id,
          homeTeam: this.testMatch.home_team,
          awayTeam: this.testMatch.away_team,
          selection: 'home',
          odds: this.testMatch.home_odds,
          stake: 5,
          marketType: 'moneyline'
        });
      }

      const transactionData = {
        playerAddress: '0x1234567890123456789012345678901234567890',
        predictions: predictions,
        cycleId: 1,
        signature: 'test_signature_123',
        nonce: 'test_nonce_123'
      };

      await this.log('Attempting to place slip transaction...');

      const response = await axios.post(`${FRONTEND_BASE_URL}/api/oddyssey/place-slip`, transactionData, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.status === 200) {
        await this.log('✅ Transaction simulation successful', 'success');
        await this.log(`Response: ${JSON.stringify(response.data, null, 2)}`, 'info');
        return true;
      } else {
        await this.log(`❌ Transaction failed: ${response.status}`, 'error');
        return false;
      }
    } catch (error) {
      await this.log(`❌ Error in transaction: ${error.message}`, 'error');
      if (error.response?.data) {
        await this.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`, 'error');
      }
      return false;
    }
  }

  async runTransactionFlowTest() {
    await this.log('🚀 Starting Transaction Flow Test', 'info');
    await this.log('================================', 'info');

    const results = {
      step1: false,
      step2: false,
      step3: false,
      step4: false,
      step5: false
    };

    // Step 1: Get matches
    results.step1 = await this.step1_getMatches();
    if (!results.step1) {
      await this.log('❌ Cannot proceed without matches', 'error');
      return results;
    }

    // Step 2: Create slip
    results.step2 = await this.step2_createSlip();
    if (!results.step2) {
      await this.log('❌ Cannot proceed without slip creation', 'error');
      return results;
    }

    // Step 3: Test wallet connection
    results.step3 = await this.step3_testWalletConnection();

    // Step 4: Test transaction endpoints
    results.step4 = await this.step4_testTransactionEndpoints();

    // Step 5: Simulate transaction
    results.step5 = await this.step5_simulateTransaction();

    // Summary
    await this.log('📊 Transaction Flow Test Summary', 'info');
    await this.log('================================', 'info');
    await this.log(`Step 1 - Get Matches: ${results.step1 ? '✅' : '❌'}`, 'info');
    await this.log(`Step 2 - Create Slip: ${results.step2 ? '✅' : '❌'}`, 'info');
    await this.log(`Step 3 - Wallet Connection: ${results.step3 ? '✅' : '❌'}`, 'info');
    await this.log(`Step 4 - Transaction Endpoints: ${results.step4 ? '✅' : '❌'}`, 'info');
    await this.log(`Step 5 - Transaction Simulation: ${results.step5 ? '✅' : '❌'}`, 'info');

    if (results.step5) {
      await this.log('🎉 Transaction flow is working!', 'success');
    } else {
      await this.log('❌ Transaction flow has issues - check the details above', 'error');
    }

    return results;
  }
}

// Run the test
async function main() {
  const tester = new TransactionFlowTester();
  await tester.runTransactionFlowTest();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = TransactionFlowTester;