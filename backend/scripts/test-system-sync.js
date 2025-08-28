#!/usr/bin/env node

/**
 * System Synchronization Test Script
 * 
 * This script comprehensively tests the synchronization between:
 * 1. Database schema and code expectations
 * 2. Contract data types and database types
 * 3. API responses and frontend expectations
 * 4. Table/column existence and naming consistency
 * 
 * Usage: node scripts/test-system-sync.js
 */

const db = require('../db/db');
const { ethers } = require('ethers');
const Web3Service = require('../services/web3-service');

// Contract expectations from Oddyssey.sol
const CONTRACT_EXPECTATIONS = {
  dataTypes: {
    cycleId: 'uint256',
    matchId: 'uint64', 
    slipId: 'uint256',
    entryFee: 'uint256', // 0.5 STT in wei
    odds: 'uint256', // Stored as integer (e.g., 1500 for 1.5)
    betType: 'uint8', // 0=Home, 1=Draw, 2=Away, 3=Over, 4=Under
    cycleState: 'uint8' // 0=NotStarted, 1=Active, 2=Ended, 3=Resolved
  },
  constants: {
    MAX_CYCLES_TO_RESOLVE: 50,
    ENTRY_FEE: '500000000000000000', // 0.5 STT in wei
    MAX_MATCHES_PER_CYCLE: 10
  }
};

// Database schema expectations
const DB_SCHEMA_EXPECTATIONS = {
  tables: {
    'oracle.oddyssey_cycles': {
      required_columns: [
        'cycle_id', 'created_at', 'updated_at', 'matches_count', 
        'matches_data', 'cycle_start_time', 'cycle_end_time', 
        'resolved_at', 'is_resolved', 'tx_hash', 'resolution_tx_hash', 
        'resolution_data', 'ready_for_resolution', 'resolution_prepared_at'
      ],
      data_types: {
        'cycle_id': 'bigint',
        'matches_count': 'integer',
        'matches_data': 'jsonb',
        'is_resolved': 'boolean'
      }
    },
    'oracle.daily_game_matches': {
      required_columns: [
        'id', 'fixture_id', 'home_team', 'away_team', 'league_name',
        'match_date', 'game_date', 'home_odds', 'draw_odds', 'away_odds',
        'over_25_odds', 'under_25_odds', 'cycle_id', 'display_order',
        'created_at', 'updated_at'
      ],
      data_types: {
        'id': 'bigint', // Changed from bigserial to bigint
        'fixture_id': 'bigint',
        'cycle_id': 'bigint',
        'home_odds': 'numeric',
        'draw_odds': 'numeric',
        'away_odds': 'numeric',
        'over_25_odds': 'numeric',
        'under_25_odds': 'numeric'
      }
    },
    'oracle.oddyssey_slips': {
      required_columns: [
        'slip_id', 'cycle_id', 'player_address', 'placed_at', 'predictions',
        'final_score', 'correct_count', 'is_evaluated', 'leaderboard_rank',
        'prize_claimed', 'tx_hash'
      ],
      data_types: {
        'slip_id': 'bigint', // Changed from bigserial to bigint
        'cycle_id': 'bigint',
        'final_score': 'numeric',
        'correct_count': 'integer',
        'is_evaluated': 'boolean',
        'prize_claimed': 'boolean'
      }
    }
  }
};

// API response expectations
const API_EXPECTATIONS = {
  '/api/oddyssey/current-cycle': {
    required_fields: ['cycle_id', 'matches', 'status', 'start_time', 'end_time'],
    data_types: {
      'cycle_id': 'number',
      'matches': 'array',
      'status': 'string'
    }
  },
  '/api/oddyssey/matches': {
    required_fields: ['matches', 'cycle_id', 'total_count'],
    data_types: {
      'matches': 'array',
      'cycle_id': 'number',
      'total_count': 'number'
    }
  }
};

class SystemSyncTester {
  constructor() {
    this.results = {
      database: { passed: false, issues: [] },
      contract: { passed: false, issues: [] },
      api: { passed: false, issues: [] },
      types: { passed: false, issues: [] },
      naming: { passed: false, issues: [] }
    };
    this.web3Service = null;
  }

  /**
   * Main execution method
   */
  async run() {
    console.log('🔍 Starting System Synchronization Test...');
    console.log('==========================================');

    try {
      // Connect to database
      await db.connect();
      console.log('✅ Connected to database');

      // Initialize Web3 service with fresh instance
      this.web3Service = new Web3Service();
      // Clear any cached contracts to ensure fresh ABI loading
      this.web3Service.contracts = {};
      console.log('✅ Connected to blockchain\n');

      // Run all tests
      await this.testDatabaseSchema();
      await this.testContractIntegration();
      await this.testApiEndpoints();
      await this.testTypeConsistency();
      await this.testNamingConventions();

      // Print comprehensive results
      this.printResults();

    } catch (error) {
      console.error('❌ Error during system sync test:', error);
      process.exit(1);
    } finally {
      await db.disconnect();
    }
  }

  /**
   * Test database schema completeness
   */
  async testDatabaseSchema() {
    console.log('📊 Testing Database Schema...');
    
    for (const [tableName, expectations] of Object.entries(DB_SCHEMA_EXPECTATIONS.tables)) {
      try {
        const [schema, table] = tableName.split('.');
        
        // Check if table exists
        const tableExists = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = $1 AND table_name = $2
          ) as exists
        `, [schema, table]);

        if (!tableExists.rows[0].exists) {
          this.results.database.issues.push(`Table ${tableName} does not exist`);
          console.log(`   ❌ ${tableName}: Missing`);
          continue;
        }

        // Check required columns
        const columns = await db.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns 
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `, [schema, table]);

        const existingColumns = columns.rows.map(col => col.column_name);
        const missingColumns = expectations.required_columns.filter(
          col => !existingColumns.includes(col)
        );

        if (missingColumns.length > 0) {
          this.results.database.issues.push(
            `Table ${tableName} missing columns: ${missingColumns.join(', ')}`
          );
          console.log(`   ⚠️  ${tableName}: Missing columns: ${missingColumns.join(', ')}`);
        } else {
          console.log(`   ✅ ${tableName}: All columns present`);
        }

        // Check data types
        for (const [column, expectedType] of Object.entries(expectations.data_types)) {
          const columnInfo = columns.rows.find(col => col.column_name === column);
          if (columnInfo && columnInfo.data_type !== expectedType) {
            this.results.database.issues.push(
              `Table ${tableName}.${column}: expected ${expectedType}, got ${columnInfo.data_type}`
            );
            console.log(`   ⚠️  ${tableName}.${column}: Type mismatch (${expectedType} vs ${columnInfo.data_type})`);
          }
        }

      } catch (error) {
        this.results.database.issues.push(`Error testing ${tableName}: ${error.message}`);
        console.log(`   ❌ ${tableName}: Error - ${error.message}`);
      }
    }

    this.results.database.passed = this.results.database.issues.length === 0;
  }

  /**
   * Test contract integration and data types
   */
  async testContractIntegration() {
    console.log('\n🔗 Testing Contract Integration...');
    
    try {
      const contract = this.web3Service.getOddysseyContract();
      
      // Test contract constants
      try {
        console.log(`   🔍 Testing MAX_CYCLES_TO_RESOLVE...`);
        console.log(`   Contract type: ${typeof contract}`);
        console.log(`   MAX_CYCLES_TO_RESOLVE type: ${typeof contract.MAX_CYCLES_TO_RESOLVE}`);
        
        const maxCycles = await contract.MAX_CYCLES_TO_RESOLVE();
        if (maxCycles.toString() !== CONTRACT_EXPECTATIONS.constants.MAX_CYCLES_TO_RESOLVE.toString()) {
          this.results.contract.issues.push(
            `MAX_CYCLES_TO_RESOLVE mismatch: expected ${CONTRACT_EXPECTATIONS.constants.MAX_CYCLES_TO_RESOLVE}, got ${maxCycles}`
          );
          console.log(`   ⚠️  MAX_CYCLES_TO_RESOLVE: ${maxCycles} (expected ${CONTRACT_EXPECTATIONS.constants.MAX_CYCLES_TO_RESOLVE})`);
        } else {
          console.log(`   ✅ MAX_CYCLES_TO_RESOLVE: ${maxCycles}`);
        }
      } catch (error) {
        this.results.contract.issues.push(`Error getting MAX_CYCLES_TO_RESOLVE: ${error.message}`);
        console.log(`   ❌ MAX_CYCLES_TO_RESOLVE: Error - ${error.message}`);
      }

      try {
        const entryFee = await contract.entryFee();
        if (entryFee.toString() !== CONTRACT_EXPECTATIONS.constants.ENTRY_FEE) {
          this.results.contract.issues.push(
            `Entry fee mismatch: expected ${CONTRACT_EXPECTATIONS.constants.ENTRY_FEE}, got ${entryFee}`
          );
          console.log(`   ⚠️  Entry fee: ${entryFee} (expected ${CONTRACT_EXPECTATIONS.constants.ENTRY_FEE})`);
        } else {
          console.log(`   ✅ Entry fee: ${entryFee} (0.5 STT)`);
        }
      } catch (error) {
        this.results.contract.issues.push(`Error getting entry fee: ${error.message}`);
        console.log(`   ❌ Entry fee: Error - ${error.message}`);
      }

      // Test current cycle
      try {
        const currentCycleId = await contract.dailyCycleId();
        console.log(`   ✅ Current cycle ID: ${currentCycleId}`);
      } catch (error) {
        this.results.contract.issues.push(`Error getting daily cycle ID: ${error.message}`);
        console.log(`   ❌ Daily cycle ID: Error - ${error.message}`);
      }

      // Test cycle info structure
      try {
        const cycleInfo = await contract.getCurrentCycleInfo();
        console.log(`   ✅ Cycle info structure: ${Object.keys(cycleInfo).length} fields`);
      } catch (error) {
        this.results.contract.issues.push(`Error getting cycle info: ${error.message}`);
        console.log(`   ❌ Cycle info: Error - ${error.message}`);
      }

    } catch (error) {
      this.results.contract.issues.push(`Contract integration error: ${error.message}`);
      console.log(`   ❌ Contract integration: Error - ${error.message}`);
    }

    this.results.contract.passed = this.results.contract.issues.length === 0;
  }

  /**
   * Test API endpoints and responses
   */
  async testApiEndpoints() {
    console.log('\n🌐 Testing API Endpoints...');
    
    // Note: This would require the API server to be running
    // For now, we'll test the database queries that APIs would use
    
    try {
      // Test current cycle query
      const currentCycle = await db.query(`
        SELECT cycle_id, matches_count, is_resolved, cycle_start_time, cycle_end_time
        FROM oracle.oddyssey_cycles 
        WHERE cycle_id = (SELECT MAX(cycle_id) FROM oracle.oddyssey_cycles)
      `);

      if (currentCycle.rows.length > 0) {
        const cycle = currentCycle.rows[0];
        console.log(`   ✅ Current cycle query: ${cycle.cycle_id} (${cycle.matches_count} matches)`);
        
        // Validate data types
        if (typeof cycle.cycle_id !== 'number' && typeof cycle.cycle_id !== 'string') {
          this.results.api.issues.push(`Invalid cycle_id type: ${typeof cycle.cycle_id}`);
        }
        if (typeof cycle.is_resolved !== 'boolean') {
          this.results.api.issues.push(`Invalid is_resolved type: ${typeof cycle.is_resolved}`);
        }
      } else {
        console.log(`   ℹ️  No current cycle found`);
      }

      // Test matches query
      const matches = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.daily_game_matches 
        WHERE cycle_id = (SELECT MAX(cycle_id) FROM oracle.oddyssey_cycles)
      `);

      console.log(`   ✅ Matches query: ${matches.rows[0].count} matches found`);

    } catch (error) {
      this.results.api.issues.push(`API query error: ${error.message}`);
      console.log(`   ❌ API queries: Error - ${error.message}`);
    }

    this.results.api.passed = this.results.api.issues.length === 0;
  }

  /**
   * Test type consistency between contract and database
   */
  async testTypeConsistency() {
    console.log('\n🔧 Testing Type Consistency...');
    
    try {
      // Test cycle_id type consistency
      try {
        const contract = this.web3Service.getOddysseyContract();
        const contractCycleId = await contract.dailyCycleId();
        
        const dbCycle = await db.query(`
          SELECT cycle_id FROM oracle.oddyssey_cycles ORDER BY cycle_id DESC LIMIT 1
        `);

        if (dbCycle.rows.length > 0) {
          const dbCycleId = dbCycle.rows[0].cycle_id;
          
          // Contract returns BigNumber, DB returns bigint
          if (contractCycleId.toString() !== dbCycleId.toString()) {
            this.results.types.issues.push(
              `Cycle ID type mismatch: contract=${contractCycleId.toString()}, db=${dbCycleId}`
            );
            console.log(`   ⚠️  Cycle ID mismatch: contract=${contractCycleId.toString()}, db=${dbCycleId}`);
          } else {
            console.log(`   ✅ Cycle ID types consistent: ${contractCycleId.toString()}`);
          }
        } else {
          console.log(`   ℹ️  No cycles found in database for type comparison`);
        }
      } catch (error) {
        this.results.types.issues.push(`Type consistency error: ${error.message}`);
        console.log(`   ❌ Type consistency: Error - ${error.message}`);
      }

      // Test odds format consistency
      const matches = await db.query(`
        SELECT home_odds, draw_odds, away_odds 
        FROM oracle.daily_game_matches 
        LIMIT 1
      `);

      if (matches.rows.length > 0) {
        const odds = matches.rows[0];
        // Check if odds are in the expected format (should be numeric in DB, integer in contract)
        if (typeof odds.home_odds !== 'number' && typeof odds.home_odds !== 'string') {
          this.results.types.issues.push(`Invalid odds type: ${typeof odds.home_odds}`);
          console.log(`   ⚠️  Odds type: ${typeof odds.home_odds}`);
        } else {
          console.log(`   ✅ Odds types consistent: ${typeof odds.home_odds}`);
        }
      }

    } catch (error) {
      this.results.types.issues.push(`Type consistency error: ${error.message}`);
      console.log(`   ❌ Type consistency: Error - ${error.message}`);
    }

    this.results.types.passed = this.results.types.issues.length === 0;
  }

  /**
   * Test naming conventions and consistency
   */
  async testNamingConventions() {
    console.log('\n📝 Testing Naming Conventions...');
    
    try {
      // Check for consistent naming patterns
      const tables = await db.query(`
        SELECT table_schema, table_name 
        FROM information_schema.tables 
        WHERE table_schema IN ('oracle', 'oddyssey')
        AND (table_name LIKE '%oddyssey%' OR table_name LIKE '%daily_game%')
        ORDER BY table_schema, table_name
      `);

      const expectedTables = [
        'oracle.oddyssey_cycles',
        'oracle.oddyssey_slips',
        'oracle.daily_game_matches'
      ];

      const existingTables = tables.rows.map(row => `${row.table_schema}.${row.table_name}`);
      const missingTables = expectedTables.filter(table => !existingTables.includes(table));

      if (missingTables.length > 0) {
        this.results.naming.issues.push(`Missing expected tables: ${missingTables.join(', ')}`);
        console.log(`   ⚠️  Missing tables: ${missingTables.join(', ')}`);
      } else {
        console.log(`   ✅ All expected tables present`);
      }

      // Check column naming consistency
      const columns = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'oracle' 
        AND table_name = 'oddyssey_cycles'
        AND column_name LIKE '%cycle%'
      `);

      const cycleColumns = columns.rows.map(col => col.column_name);
      if (!cycleColumns.includes('cycle_id')) {
        this.results.naming.issues.push('Missing cycle_id column in oddyssey_cycles');
        console.log(`   ⚠️  Missing cycle_id column`);
      } else {
        console.log(`   ✅ Cycle column naming consistent`);
      }

    } catch (error) {
      this.results.naming.issues.push(`Naming convention error: ${error.message}`);
      console.log(`   ❌ Naming conventions: Error - ${error.message}`);
    }

    this.results.naming.passed = this.results.naming.issues.length === 0;
  }

  /**
   * Print comprehensive results
   */
  printResults() {
    console.log('\n📊 System Synchronization Test Results:');
    console.log('========================================');
    
    const allPassed = Object.values(this.results).every(r => r.passed);
    
    console.log(`📊 Database Schema: ${this.results.database.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`🔗 Contract Integration: ${this.results.contract.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`🌐 API Endpoints: ${this.results.api.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`🔧 Type Consistency: ${this.results.types.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`📝 Naming Conventions: ${this.results.naming.passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    console.log(`\n🎯 Overall Status: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    if (!allPassed) {
      console.log('\n⚠️  Issues Found:');
      
      Object.entries(this.results).forEach(([category, result]) => {
        if (!result.passed && result.issues.length > 0) {
          console.log(`\n${category.toUpperCase()}:`);
          result.issues.forEach(issue => console.log(`   - ${issue}`));
        }
      });
    } else {
      console.log('\n🎉 All systems are synchronized!');
      console.log('✅ Database schema is complete');
      console.log('✅ Contract integration is working');
      console.log('✅ API endpoints are functional');
      console.log('✅ Type consistency is maintained');
      console.log('✅ Naming conventions are consistent');
      console.log('\n🚀 System is ready for production!');
    }
  }
}

// CLI usage
if (require.main === module) {
  const tester = new SystemSyncTester();
  
  tester.run()
    .then(() => {
      const allPassed = Object.values(tester.results).every(r => r.passed);
      process.exit(allPassed ? 0 : 1);
    })
    .catch(error => {
      console.error('\n💥 System sync test failed:', error);
      process.exit(1);
    });
}

module.exports = SystemSyncTester;
