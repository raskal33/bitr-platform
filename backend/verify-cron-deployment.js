#!/usr/bin/env node

/**
 * Cron Deployment Verification Script
 * Verifies that all cron jobs are properly deployed and coordinated
 */

const cronCoordinator = require('./services/cron-coordinator');
const db = require('./db/db');

class CronDeploymentVerifier {
  constructor() {
    this.serviceName = 'CronDeploymentVerifier';
  }

  /**
   * Run comprehensive deployment verification
   */
  async verify() {
    console.log('🔍 Starting Cron Deployment Verification...\n');

    const results = {
      database: false,
      coordination: false,
      tables: false,
      jobs: false,
      locks: false,
      overall: false
    };

    try {
      // Test 1: Database Connection
      console.log('📊 Test 1: Database Connection');
      results.database = await this.testDatabaseConnection();
      console.log(results.database ? '✅ PASS' : '❌ FAIL');
      console.log('');

      // Test 2: Coordination System
      console.log('🎯 Test 2: Coordination System');
      results.coordination = await this.testCoordinationSystem();
      console.log(results.coordination ? '✅ PASS' : '❌ FAIL');
      console.log('');

      // Test 3: Required Tables
      console.log('🗄️ Test 3: Required Tables');
      results.tables = await this.testRequiredTables();
      console.log(results.tables ? '✅ PASS' : '❌ FAIL');
      console.log('');

      // Test 4: Cron Jobs Configuration
      console.log('⏰ Test 4: Cron Jobs Configuration');
      results.jobs = await this.testCronJobsConfiguration();
      console.log(results.jobs ? '✅ PASS' : '❌ FAIL');
      console.log('');

      // Test 5: Lock Management
      console.log('🔒 Test 5: Lock Management');
      results.locks = await this.testLockManagement();
      console.log(results.locks ? '✅ PASS' : '❌ FAIL');
      console.log('');

      // Overall Result (exclude 'overall' itself from the check)
      const testResults = { ...results };
      delete testResults.overall;
      results.overall = Object.values(testResults).every(result => result === true);
      
      console.log('📋 VERIFICATION SUMMARY:');
      console.log(`   Database Connection: ${results.database ? '✅' : '❌'}`);
      console.log(`   Coordination System: ${results.coordination ? '✅' : '❌'}`);
      console.log(`   Required Tables: ${results.tables ? '✅' : '❌'}`);
      console.log(`   Cron Jobs Config: ${results.jobs ? '✅' : '❌'}`);
      console.log(`   Lock Management: ${results.locks ? '✅' : '❌'}`);
      console.log('');
      console.log(`🎯 OVERALL RESULT: ${results.overall ? '✅ DEPLOYMENT VERIFIED' : '❌ DEPLOYMENT ISSUES DETECTED'}`);

      return results;

    } catch (error) {
      console.error('❌ Verification failed with error:', error);
      return { ...results, error: error.message };
    }
  }

  /**
   * Test database connection
   */
  async testDatabaseConnection() {
    try {
      const result = await db.query('SELECT NOW() as current_time');
      console.log(`   • Database connected: ${result.rows[0].current_time}`);
      return true;
    } catch (error) {
      console.error('   • Database connection failed:', error.message);
      return false;
    }
  }

  /**
   * Test coordination system initialization
   */
  async testCoordinationSystem() {
    try {
      await cronCoordinator.initialize();
      console.log('   • Coordination system initialized successfully');
      return true;
    } catch (error) {
      console.error('   • Coordination system initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Test required tables exist
   */
  async testRequiredTables() {
    try {
      const requiredTables = [
        { schema: 'system', table: 'cron_locks' },
        { schema: 'system', table: 'cron_execution_log' },
        { schema: 'oracle', table: 'oddyssey_cycles' },
        { schema: 'oracle', table: 'oddyssey_slips' },
        { schema: 'oracle', table: 'fixture_results' }
      ];

      let allTablesExist = true;

      for (const { schema, table } of requiredTables) {
        try {
          const result = await db.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = $1 AND table_name = $2
            )
          `, [schema, table]);

          const exists = result.rows[0].exists;
          console.log(`   • ${schema}.${table}: ${exists ? '✅' : '❌'}`);
          
          if (!exists) {
            allTablesExist = false;
          }
        } catch (error) {
          console.error(`   • Error checking ${schema}.${table}:`, error.message);
          allTablesExist = false;
        }
      }

      return allTablesExist;
    } catch (error) {
      console.error('   • Table verification failed:', error.message);
      return false;
    }
  }

  /**
   * Test cron jobs configuration
   */
  async testCronJobsConfiguration() {
    try {
      const expectedJobs = [
        'oddyssey_scheduler',
        'oddyssey_creator',
        'contract_sync',
        'crypto_scheduler',
        'football_scheduler',
        'oracle_cron',
        'fixtures_scheduler',
        'unified_results_manager',
        'slip_evaluator',
        'auto_evaluation',
        'fixture_mapping_maintainer',
        'fixture_status_updater',
        'results_resolver',
        'airdrop_scheduler',
        'health_monitoring',
        'reputation_sync'
      ];

      console.log(`   • Expected ${expectedJobs.length} cron jobs`);
      
      // Check if consolidated workers file exists
      const fs = require('fs');
      const workersPath = './cron/consolidated-workers.js';
      
      if (!fs.existsSync(workersPath)) {
        console.error('   • Consolidated workers file not found');
        return false;
      }

      const workersContent = fs.readFileSync(workersPath, 'utf8');
      
      let missingJobs = [];
      for (const job of expectedJobs) {
        if (!workersContent.includes(job)) {
          missingJobs.push(job);
        }
      }

      if (missingJobs.length > 0) {
        console.error(`   • Missing jobs: ${missingJobs.join(', ')}`);
        return false;
      }

      console.log('   • All expected jobs found in configuration');
      return true;

    } catch (error) {
      console.error('   • Cron jobs configuration test failed:', error.message);
      return false;
    }
  }

  /**
   * Test lock management functionality
   */
  async testLockManagement() {
    try {
      const testJobName = 'deployment-verification-test';
      
      // Test acquiring a lock
      const executionId = await cronCoordinator.acquireLock(testJobName, 60000);
      if (!executionId) {
        console.error('   • Failed to acquire test lock');
        return false;
      }
      console.log('   • Lock acquisition: ✅');

      // Test checking lock status
      const isLocked = await cronCoordinator.isLocked(testJobName);
      if (!isLocked) {
        console.error('   • Lock status check failed');
        return false;
      }
      console.log('   • Lock status check: ✅');

      // Test releasing the lock
      await cronCoordinator.releaseLock(testJobName, executionId, 'completed');
      console.log('   • Lock release: ✅');

      // Verify lock is released
      const isStillLocked = await cronCoordinator.isLocked(testJobName);
      if (isStillLocked) {
        console.error('   • Lock was not properly released');
        return false;
      }
      console.log('   • Lock cleanup verification: ✅');

      return true;

    } catch (error) {
      console.error('   • Lock management test failed:', error.message);
      return false;
    }
  }

  /**
   * Generate deployment report
   */
  async generateReport() {
    try {
      const results = await this.verify();
      
      const report = {
        timestamp: new Date().toISOString(),
        deployment_status: results.overall ? 'SUCCESS' : 'FAILED',
        test_results: results,
        recommendations: []
      };

      if (!results.database) {
        report.recommendations.push('Check database connection configuration');
      }
      
      if (!results.coordination) {
        report.recommendations.push('Initialize coordination system manually');
      }
      
      if (!results.tables) {
        report.recommendations.push('Run database migrations to create required tables');
      }
      
      if (!results.jobs) {
        report.recommendations.push('Verify consolidated workers configuration');
      }
      
      if (!results.locks) {
        report.recommendations.push('Check lock management system');
      }

      // Save report to file
      const fs = require('fs');
      const reportPath = './deployment-verification-report.json';
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      
      console.log(`📄 Detailed report saved to: ${reportPath}`);
      
      return report;

    } catch (error) {
      console.error('❌ Failed to generate report:', error);
      return null;
    }
  }
}

// Create and run verifier
const verifier = new CronDeploymentVerifier();

// Export for use in other modules
module.exports = verifier;

// Auto-run if executed directly
if (require.main === module) {
  verifier.generateReport()
    .then((report) => {
      if (report && report.deployment_status === 'SUCCESS') {
        console.log('\n🎉 Deployment verification completed successfully!');
        process.exit(0);
      } else {
        console.log('\n❌ Deployment verification failed!');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Verification script failed:', error);
      process.exit(1);
    });
}
