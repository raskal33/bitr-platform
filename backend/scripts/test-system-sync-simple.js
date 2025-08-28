#!/usr/bin/env node

/**
 * Simplified System Synchronization Test
 * 
 * This script tests the core synchronization between database and code
 * without requiring contract integration that might have ABI issues.
 * 
 * Usage: node scripts/test-system-sync-simple.js
 */

const db = require('../db/db');

// Core database expectations
const CORE_EXPECTATIONS = {
  tables: {
    'oracle.oddyssey_cycles': {
      required_columns: ['cycle_id', 'matches_count', 'is_resolved', 'created_at'],
      data_types: {
        'cycle_id': 'bigint',
        'matches_count': 'integer',
        'is_resolved': 'boolean'
      }
    },
    'oracle.daily_game_matches': {
      required_columns: ['id', 'fixture_id', 'cycle_id', 'home_team', 'away_team'],
      data_types: {
        'id': 'bigint',
        'fixture_id': 'bigint',
        'cycle_id': 'bigint'
      }
    },
    'oracle.oddyssey_slips': {
      required_columns: ['slip_id', 'cycle_id', 'player_address', 'predictions'],
      data_types: {
        'slip_id': 'bigint',
        'cycle_id': 'bigint'
      }
    }
  }
};

class SimpleSystemSyncTester {
  constructor() {
    this.results = {
      database: { passed: false, issues: [] },
      api: { passed: false, issues: [] },
      naming: { passed: false, issues: [] }
    };
  }

  /**
   * Main execution method
   */
  async run() {
    console.log('🔍 Starting Simplified System Sync Test...');
    console.log('==========================================');

    try {
      // Connect to database
      await db.connect();
      console.log('✅ Connected to database\n');

      // Run core tests
      await this.testDatabaseSchema();
      await this.testApiQueries();
      await this.testNamingConventions();

      // Print results
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
    
    for (const [tableName, expectations] of Object.entries(CORE_EXPECTATIONS.tables)) {
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
          SELECT column_name, data_type
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
          console.log(`   ✅ ${tableName}: All required columns present`);
        }

        // Check data types for key columns
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
   * Test API-like queries
   */
  async testApiQueries() {
    console.log('\n🌐 Testing API Queries...');
    
    try {
      // Test current cycle query
      const currentCycle = await db.query(`
        SELECT cycle_id, matches_count, is_resolved
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id DESC LIMIT 1
      `);

      if (currentCycle.rows.length > 0) {
        const cycle = currentCycle.rows[0];
        console.log(`   ✅ Current cycle: ${cycle.cycle_id} (${cycle.matches_count} matches, resolved: ${cycle.is_resolved})`);
        
        // Validate data types
        if (typeof cycle.cycle_id !== 'number' && typeof cycle.cycle_id !== 'string') {
          this.results.api.issues.push(`Invalid cycle_id type: ${typeof cycle.cycle_id}`);
        }
        if (typeof cycle.is_resolved !== 'boolean') {
          this.results.api.issues.push(`Invalid is_resolved type: ${typeof cycle.is_resolved}`);
        }
      } else {
        console.log(`   ℹ️  No cycles found in database`);
      }

      // Test matches query
      const matches = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.daily_game_matches
      `);

      console.log(`   ✅ Total matches: ${matches.rows[0].count}`);

      // Test slips query
      const slips = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.oddyssey_slips
      `);

      console.log(`   ✅ Total slips: ${slips.rows[0].count}`);

    } catch (error) {
      this.results.api.issues.push(`API query error: ${error.message}`);
      console.log(`   ❌ API queries: Error - ${error.message}`);
    }

    this.results.api.passed = this.results.api.issues.length === 0;
  }

  /**
   * Test naming conventions
   */
  async testNamingConventions() {
    console.log('\n📝 Testing Naming Conventions...');
    
    try {
      // Check for expected tables
      const tables = await db.query(`
        SELECT table_schema, table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'oracle'
        AND (table_name LIKE '%oddyssey%' OR table_name LIKE '%daily_game%')
        ORDER BY table_name
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

      // Check for consistent column naming
      const cycleColumns = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'oracle' 
        AND table_name = 'oddyssey_cycles'
        AND column_name LIKE '%cycle%'
      `);

      if (cycleColumns.rows.length === 0) {
        this.results.naming.issues.push('No cycle-related columns found in oddyssey_cycles');
        console.log(`   ⚠️  No cycle-related columns found`);
      } else {
        console.log(`   ✅ Cycle column naming consistent (${cycleColumns.rows.length} columns)`);
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
    console.log('\n📊 Simplified System Sync Test Results:');
    console.log('========================================');
    
    const allPassed = Object.values(this.results).every(r => r.passed);
    
    console.log(`📊 Database Schema: ${this.results.database.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`🌐 API Queries: ${this.results.api.passed ? '✅ PASSED' : '❌ FAILED'}`);
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
      
      console.log('\n🔧 Recommended Actions:');
      if (!this.results.database.passed) {
        console.log('   1. Check database schema and ensure all required tables/columns exist');
        console.log('   2. Verify data types match expectations');
      }
      if (!this.results.api.passed) {
        console.log('   3. Test API endpoints manually to ensure they work');
      }
      if (!this.results.naming.passed) {
        console.log('   4. Verify table naming conventions are consistent');
      }
    } else {
      console.log('\n🎉 Core system is synchronized!');
      console.log('✅ Database schema is complete');
      console.log('✅ API queries are working');
      console.log('✅ Naming conventions are consistent');
      console.log('\n🚀 Ready for contract integration testing!');
    }
  }
}

// CLI usage
if (require.main === module) {
  const tester = new SimpleSystemSyncTester();
  
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

module.exports = SimpleSystemSyncTester;
