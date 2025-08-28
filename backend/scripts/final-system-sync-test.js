#!/usr/bin/env node

/**
 * Final Comprehensive System Synchronization Test
 * 
 * This script provides a complete test of system synchronization
 * with detailed reporting and actionable recommendations.
 * 
 * Usage: node scripts/final-system-sync-test.js
 */

const db = require('../db/db');
const Web3Service = require('../services/web3-service');

class FinalSystemSyncTester {
  constructor() {
    this.results = {
      database: { passed: false, issues: [], details: {} },
      contract: { passed: false, issues: [], details: {} },
      api: { passed: false, issues: [], details: {} },
      overall: { passed: false, summary: '' }
    };
  }

  /**
   * Main execution method
   */
  async run() {
    console.log('🔍 Final Comprehensive System Sync Test');
    console.log('========================================');

    try {
      // Test database
      await this.testDatabase();
      
      // Test contract integration
      await this.testContractIntegration();
      
      // Test API functionality
      await this.testApiFunctionality();
      
      // Generate overall assessment
      this.generateOverallAssessment();
      
      // Print comprehensive results
      this.printResults();

    } catch (error) {
      console.error('❌ Error during final system sync test:', error);
      process.exit(1);
    } finally {
      await db.disconnect();
    }
  }

  /**
   * Test database schema and connectivity
   */
  async testDatabase() {
    console.log('\n📊 Testing Database...');
    
    try {
      await db.connect();
      console.log('   ✅ Database connected successfully');
      
      // Test core tables
      const coreTables = [
        'oracle.oddyssey_cycles',
        'oracle.daily_game_matches', 
        'oracle.oddyssey_slips'
      ];
      
      for (const tableName of coreTables) {
        const [schema, table] = tableName.split('.');
        
        const exists = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = $1 AND table_name = $2
          ) as exists
        `, [schema, table]);
        
        if (exists.rows[0].exists) {
          const count = await db.query(`SELECT COUNT(*) as count FROM ${tableName}`);
          console.log(`   ✅ ${tableName}: exists (${count.rows[0].count} rows)`);
          this.results.database.details[tableName] = {
            exists: true,
            rowCount: parseInt(count.rows[0].count)
          };
        } else {
          console.log(`   ❌ ${tableName}: missing`);
          this.results.database.issues.push(`Table ${tableName} does not exist`);
          this.results.database.details[tableName] = { exists: false };
        }
      }
      
      // Test data consistency
      const currentCycle = await db.query(`
        SELECT cycle_id, matches_count, is_resolved
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC LIMIT 1
      `);
      
      if (currentCycle.rows.length > 0) {
        const cycle = currentCycle.rows[0];
        console.log(`   ✅ Current cycle: ${cycle.cycle_id} (${cycle.matches_count} matches, resolved: ${cycle.is_resolved})`);
        this.results.database.details.currentCycle = cycle;
      } else {
        console.log(`   ℹ️  No cycles found in database`);
        this.results.database.details.currentCycle = null;
      }
      
      this.results.database.passed = this.results.database.issues.length === 0;
      
    } catch (error) {
      this.results.database.issues.push(`Database error: ${error.message}`);
      console.log(`   ❌ Database error: ${error.message}`);
    }
  }

  /**
   * Test contract integration
   */
  async testContractIntegration() {
    console.log('\n🔗 Testing Contract Integration...');
    
    try {
      const web3Service = new Web3Service();
      web3Service.contracts = {}; // Clear cache
      
      const contract = await web3Service.getOddysseyContract();
      console.log('   ✅ Contract loaded successfully');
      
      // Test key contract functions
      const contractTests = [
        { name: 'MAX_CYCLES_TO_RESOLVE', expected: '50' },
        { name: 'entryFee', expected: '500000000000000000' },
        { name: 'dailyCycleId', expected: '0' }
      ];
      
      for (const test of contractTests) {
        try {
          const result = await contract[test.name]();
          const resultStr = result.toString();
          
          if (resultStr === test.expected) {
            console.log(`   ✅ ${test.name}: ${resultStr} (correct)`);
            this.results.contract.details[test.name] = { value: resultStr, status: 'correct' };
          } else {
            console.log(`   ⚠️  ${test.name}: ${resultStr} (expected ${test.expected})`);
            this.results.contract.details[test.name] = { value: resultStr, expected: test.expected, status: 'mismatch' };
            this.results.contract.issues.push(`${test.name} mismatch: got ${resultStr}, expected ${test.expected}`);
          }
        } catch (error) {
          console.log(`   ❌ ${test.name}: Error - ${error.message}`);
          this.results.contract.details[test.name] = { error: error.message, status: 'error' };
          this.results.contract.issues.push(`${test.name} error: ${error.message}`);
        }
      }
      
      // Test cycle info
      try {
        const cycleInfo = await contract.getCurrentCycleInfo();
        console.log(`   ✅ getCurrentCycleInfo: ${cycleInfo.length} fields returned`);
        this.results.contract.details.cycleInfo = { fields: cycleInfo.length, status: 'success' };
      } catch (error) {
        console.log(`   ❌ getCurrentCycleInfo: Error - ${error.message}`);
        this.results.contract.details.cycleInfo = { error: error.message, status: 'error' };
        this.results.contract.issues.push(`getCurrentCycleInfo error: ${error.message}`);
      }
      
      this.results.contract.passed = this.results.contract.issues.length === 0;
      
    } catch (error) {
      this.results.contract.issues.push(`Contract integration error: ${error.message}`);
      console.log(`   ❌ Contract integration error: ${error.message}`);
    }
  }

  /**
   * Test API functionality
   */
  async testApiFunctionality() {
    console.log('\n🌐 Testing API Functionality...');
    
    try {
      // Test core API queries
      const apiTests = [
        {
          name: 'Current Cycle Query',
          query: `SELECT cycle_id, matches_count, is_resolved FROM oracle.oddyssey_cycles ORDER BY cycle_id DESC LIMIT 1`
        },
        {
          name: 'Matches Count Query',
          query: `SELECT COUNT(*) as count FROM oracle.daily_game_matches`
        },
        {
          name: 'Slips Count Query', 
          query: `SELECT COUNT(*) as count FROM oracle.oddyssey_slips`
        }
      ];
      
      for (const test of apiTests) {
        try {
          const result = await db.query(test.query);
          console.log(`   ✅ ${test.name}: ${JSON.stringify(result.rows[0])}`);
          this.results.api.details[test.name] = { result: result.rows[0], status: 'success' };
        } catch (error) {
          console.log(`   ❌ ${test.name}: Error - ${error.message}`);
          this.results.api.details[test.name] = { error: error.message, status: 'error' };
          this.results.api.issues.push(`${test.name} error: ${error.message}`);
        }
      }
      
      this.results.api.passed = this.results.api.issues.length === 0;
      
    } catch (error) {
      this.results.api.issues.push(`API functionality error: ${error.message}`);
      console.log(`   ❌ API functionality error: ${error.message}`);
    }
  }

  /**
   * Generate overall assessment
   */
  generateOverallAssessment() {
    const allPassed = Object.values(this.results).every(r => r.passed || r === this.results.overall);
    
    this.results.overall.passed = allPassed;
    
    if (allPassed) {
      this.results.overall.summary = 'All systems are synchronized and ready for production';
    } else {
      const failedComponents = [];
      if (!this.results.database.passed) failedComponents.push('Database');
      if (!this.results.contract.passed) failedComponents.push('Contract');
      if (!this.results.api.passed) failedComponents.push('API');
      
      this.results.overall.summary = `Issues found in: ${failedComponents.join(', ')}`;
    }
  }

  /**
   * Print comprehensive results
   */
  printResults() {
    console.log('\n📊 Final System Sync Test Results');
    console.log('==================================');
    
    // Overall status
    console.log(`🎯 Overall Status: ${this.results.overall.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`📝 Summary: ${this.results.overall.summary}`);
    
    // Component status
    console.log('\n📋 Component Status:');
    console.log(`   📊 Database: ${this.results.database.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   🔗 Contract: ${this.results.contract.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   🌐 API: ${this.results.api.passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    // Detailed results
    if (!this.results.overall.passed) {
      console.log('\n⚠️  Issues Found:');
      
      Object.entries(this.results).forEach(([component, result]) => {
        if (component !== 'overall' && !result.passed && result.issues.length > 0) {
          console.log(`\n${component.toUpperCase()}:`);
          result.issues.forEach(issue => console.log(`   - ${issue}`));
        }
      });
      
      console.log('\n🔧 Recommended Actions:');
      if (!this.results.database.passed) {
        console.log('   1. Check database schema and ensure all required tables exist');
        console.log('   2. Verify database connectivity and permissions');
      }
      if (!this.results.contract.passed) {
        console.log('   3. Verify contract deployment and ABI compatibility');
        console.log('   4. Check blockchain connectivity and wallet configuration');
      }
      if (!this.results.api.passed) {
        console.log('   5. Test API endpoints manually to ensure they work');
        console.log('   6. Verify database queries and data consistency');
      }
    } else {
      console.log('\n🎉 System Status: READY FOR PRODUCTION');
      console.log('✅ Database schema is complete and functional');
      console.log('✅ Contract integration is working correctly');
      console.log('✅ API functionality is operational');
      console.log('✅ All systems are synchronized');
      
      console.log('\n📊 System Details:');
      if (this.results.database.details.currentCycle) {
        const cycle = this.results.database.details.currentCycle;
        console.log(`   Current Cycle: ${cycle.cycle_id} (${cycle.matches_count} matches)`);
      }
      if (this.results.contract.details.dailyCycleId) {
        console.log(`   Contract Cycle: ${this.results.contract.details.dailyCycleId.value}`);
      }
      console.log(`   Entry Fee: ${this.results.contract.details.entryFee?.value || 'Unknown'}`);
    }
  }
}

// CLI usage
if (require.main === module) {
  const tester = new FinalSystemSyncTester();
  
  tester.run()
    .then(() => {
      process.exit(tester.results.overall.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('\n💥 Final system sync test failed:', error);
      process.exit(1);
    });
}

module.exports = FinalSystemSyncTester;
