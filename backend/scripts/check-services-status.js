#!/usr/bin/env node

const config = require('../config');
const db = require('../db/db');
const { ethers } = require('ethers');

class ServiceStatusChecker {
  constructor() {
    this.status = {
      database: { status: 'unknown', details: '' },
      blockchain: { status: 'unknown', details: '' },
      cron: { status: 'unknown', details: '' },
      fixtures: { status: 'unknown', details: '' },
      crypto: { status: 'unknown', details: '' },
      indexer: { status: 'unknown', details: '' }
    };
  }

  async checkDatabase() {
    try {
      const result = await db.query('SELECT NOW() as current_time, version() as version');
      this.status.database = {
        status: 'healthy',
        details: `Connected to PostgreSQL ${result.rows[0].version.split(' ')[1]}`
      };
    } catch (error) {
      this.status.database = {
        status: 'error',
        details: error.message
      };
    }
  }

  async checkBlockchain() {
    try {
      const RpcManager = require('../utils/rpc-manager');
      const rpcManager = new RpcManager();
      const provider = await rpcManager.getProvider();
      const blockNumber = await provider.getBlockNumber();
      const network = await provider.getNetwork();
      
      this.status.blockchain = {
        status: 'healthy',
        details: `Connected to ${network.name} (Chain ID: ${network.chainId}), Current block: ${blockNumber}`
      };
    } catch (error) {
      this.status.blockchain = {
        status: 'error',
        details: error.message
      };
    }
  }

  async checkCronSystem() {
    try {
      // Check cron execution log
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN status = 'started' THEN 1 END) as running_jobs,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
          MAX(completed_at) as last_completion
        FROM system.cron_execution_log 
        WHERE started_at > NOW() - INTERVAL '1 hour'
      `);

      const stats = result.rows[0];
      this.status.cron = {
        status: 'healthy',
        details: `${stats.total_jobs} jobs in last hour (${stats.completed_jobs} completed, ${stats.failed_jobs} failed)`
      };
    } catch (error) {
      this.status.cron = {
        status: 'error',
        details: error.message
      };
    }
  }

  async checkFixtures() {
    try {
      // Check fixtures table
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_fixtures,
          COUNT(CASE WHEN match_date >= CURRENT_DATE THEN 1 END) as today_fixtures,
          COUNT(CASE WHEN match_date >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_fixtures,
          MAX(updated_at) as last_update
        FROM oracle.fixtures
      `);

      const stats = result.rows[0];
      this.status.fixtures = {
        status: 'healthy',
        details: `${stats.total_fixtures} total fixtures (${stats.week_fixtures} in last 7 days), last update: ${stats.last_update}`
      };
    } catch (error) {
      this.status.fixtures = {
        status: 'error',
        details: error.message
      };
    }
  }

  async checkCrypto() {
    try {
      // Check crypto coins table
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_coins,
          COUNT(CASE WHEN is_active = true THEN 1 END) as active_coins,
          COUNT(CASE WHEN is_popular = true THEN 1 END) as popular_coins,
          MAX(updated_at) as last_update
        FROM oracle.crypto_coins
      `);

      const stats = result.rows[0];
      this.status.crypto = {
        status: 'healthy',
        details: `${stats.total_coins} total coins (${stats.active_coins} active, ${stats.popular_coins} popular), last update: ${stats.last_update}`
      };
    } catch (error) {
      this.status.crypto = {
        status: 'error',
        details: error.message
      };
    }
  }

  async checkIndexer() {
    try {
      // Check indexed blocks
      const result = await db.query(`
        SELECT 
          MAX(block_number) as last_indexed_block,
          MAX(indexed_at) as last_index_time,
          COUNT(*) as total_checkpoints
        FROM oracle.indexed_blocks
      `);

      const stats = result.rows[0];
      this.status.indexer = {
        status: 'healthy',
        details: `Last indexed block: ${stats.last_indexed_block}, last update: ${stats.last_index_time}`
      };
    } catch (error) {
      this.status.indexer = {
        status: 'error',
        details: error.message
      };
    }
  }

  async checkAll() {
    console.log('🔍 Checking all services status...\n');
    
    await Promise.all([
      this.checkDatabase(),
      this.checkBlockchain(),
      this.checkCronSystem(),
      this.checkFixtures(),
      this.checkCrypto(),
      this.checkIndexer()
    ]);

    // Display results
    console.log('📊 SERVICE STATUS REPORT');
    console.log('========================\n');

    Object.entries(this.status).forEach(([service, info]) => {
      const icon = info.status === 'healthy' ? '✅' : '❌';
      console.log(`${icon} ${service.toUpperCase()}: ${info.status.toUpperCase()}`);
      console.log(`   ${info.details}\n`);
    });

    // Summary
    const healthyCount = Object.values(this.status).filter(s => s.status === 'healthy').length;
    const totalCount = Object.keys(this.status).length;
    
    console.log(`📈 SUMMARY: ${healthyCount}/${totalCount} services healthy`);
    
    if (healthyCount === totalCount) {
      console.log('🎉 All services are running properly!');
    } else {
      console.log('⚠️  Some services need attention.');
    }
  }
}

// Run the check
if (require.main === module) {
  const checker = new ServiceStatusChecker();
  checker.checkAll().catch(console.error);
}

module.exports = ServiceStatusChecker;
