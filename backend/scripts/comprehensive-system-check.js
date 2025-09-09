#!/usr/bin/env node

const db = require('../db/db');

/**
 * Comprehensive System Check
 * Verifies all aspects of the system are working correctly
 */
class ComprehensiveSystemCheck {
  constructor() {
    this.results = {};
  }

  async runAllChecks() {
    console.log('🔍 Running comprehensive system check...\n');
    
    try {
      // 1. Check fixtures and odds
      await this.checkFixturesAndOdds();
      
      // 2. Check results processing
      await this.checkResultsProcessing();
      
      // 3. Check Oddyssey system
      await this.checkOddysseySystem();
      
      // 4. Check cron jobs
      await this.checkCronJobs();
      
      // 5. Check indexer status
      await this.checkIndexerStatus();
      
      // Print summary
      this.printSummary();
      
      return this.results;
      
    } catch (error) {
      console.error('❌ System check failed:', error);
      throw error;
    }
  }

  async checkFixturesAndOdds() {
    console.log('📊 Checking fixtures and odds...');
    
    const fixtures = await db.query('SELECT COUNT(*) as count FROM oracle.fixtures');
    const odds = await db.query('SELECT COUNT(*) as count FROM oracle.fixture_odds');
    const oddysseyReady = await db.query(`
      SELECT COUNT(*) as count FROM oracle.fixtures 
      WHERE odds_mapping_validated = true AND team_assignment_validated = true
    `);
    
    this.results.fixtures = {
      total: parseInt(fixtures.rows[0].count),
      odds: parseInt(odds.rows[0].count),
      oddysseyReady: parseInt(oddysseyReady.rows[0].count),
      status: '✅'
    };
    
    console.log(`   ✅ Fixtures: ${this.results.fixtures.total}`);
    console.log(`   ✅ Odds: ${this.results.fixtures.odds}`);
    console.log(`   ✅ Oddyssey Ready: ${this.results.fixtures.oddysseyReady}`);
  }

  async checkResultsProcessing() {
    console.log('🎯 Checking results processing...');
    
    const fixtureResults = await db.query('SELECT COUNT(*) as count FROM oracle.fixture_results');
    const finishedFixtures = await db.query(`SELECT COUNT(*) as count FROM oracle.fixtures WHERE status = 'FT'`);
    
    this.results.results = {
      fixtureResults: parseInt(fixtureResults.rows[0].count),
      finishedFixtures: parseInt(finishedFixtures.rows[0].count),
      processingRate: finishedFixtures.rows[0].count > 0 ? 
        (fixtureResults.rows[0].count / finishedFixtures.rows[0].count * 100).toFixed(1) + '%' : 'N/A',
      status: fixtureResults.rows[0].count > 0 ? '✅' : '⚠️'
    };
    
    console.log(`   ${this.results.results.status} Finished Fixtures: ${this.results.results.finishedFixtures}`);
    console.log(`   ${this.results.results.status} Results Saved: ${this.results.results.fixtureResults}`);
    console.log(`   ${this.results.results.status} Processing Rate: ${this.results.results.processingRate}`);
  }

  async checkOddysseySystem() {
    console.log('🎮 Checking Oddyssey system...');
    
    const cycles = await db.query('SELECT COUNT(*) as count FROM oddyssey.oddyssey_cycles');
    const slips = await db.query('SELECT COUNT(*) as count FROM oddyssey.oddyssey_slips');
    const dailyGames = await db.query('SELECT COUNT(*) as count FROM oddyssey.daily_games');
    const gameResults = await db.query('SELECT COUNT(*) as count FROM oddyssey.game_results');
    
    this.results.oddyssey = {
      cycles: parseInt(cycles.rows[0].count),
      slips: parseInt(slips.rows[0].count),
      dailyGames: parseInt(dailyGames.rows[0].count),
      gameResults: parseInt(gameResults.rows[0].count),
      status: dailyGames.rows[0].count > 0 ? '✅' : '⚠️'
    };
    
    console.log(`   ${this.results.oddyssey.status} Cycles: ${this.results.oddyssey.cycles}`);
    console.log(`   ${this.results.oddyssey.status} Slips: ${this.results.oddyssey.slips}`);
    console.log(`   ${this.results.oddyssey.status} Daily Games: ${this.results.oddyssey.dailyGames}`);
    console.log(`   ${this.results.oddyssey.status} Game Results: ${this.results.oddyssey.gameResults}`);
  }

  async checkCronJobs() {
    console.log('⏰ Checking cron jobs...');
    
    const recentLogs = await db.query(`
      SELECT job_name, status, COUNT(*) as count
      FROM system.cron_execution_log 
      WHERE started_at > NOW() - INTERVAL '1 hour'
      GROUP BY job_name, status
      ORDER BY job_name, status
    `);
    
    const cronStats = {};
    recentLogs.rows.forEach(row => {
      if (!cronStats[row.job_name]) {
        cronStats[row.job_name] = { completed: 0, failed: 0, timeout: 0 };
      }
      cronStats[row.job_name][row.status] = parseInt(row.count);
    });
    
    this.results.cronJobs = {
      stats: cronStats,
      status: Object.keys(cronStats).length > 0 ? '✅' : '⚠️'
    };
    
    console.log(`   ${this.results.cronJobs.status} Recent Job Executions (last hour):`);
    Object.entries(cronStats).forEach(([jobName, stats]) => {
      const total = stats.completed + stats.failed + stats.timeout;
      const successRate = total > 0 ? (stats.completed / total * 100).toFixed(1) : '0';
      console.log(`     - ${jobName}: ${stats.completed}✅ ${stats.failed}❌ ${stats.timeout}⏱️ (${successRate}% success)`);
    });
  }

  async checkIndexerStatus() {
    console.log('⛓️ Checking indexer status...');
    
    const lastBlock = await db.query(`
      SELECT block_number, indexed_at 
      FROM oracle.indexed_blocks 
      ORDER BY block_number DESC 
      LIMIT 1
    `);
    
    if (lastBlock.rows.length > 0) {
      const blockNumber = parseInt(lastBlock.rows[0].block_number);
      const lastUpdate = new Date(lastBlock.rows[0].indexed_at);
      const timeSinceUpdate = Date.now() - lastUpdate.getTime();
      const minutesSinceUpdate = Math.floor(timeSinceUpdate / (1000 * 60));
      
      this.results.indexer = {
        lastBlock: blockNumber,
        lastUpdate: lastUpdate.toISOString(),
        minutesSinceUpdate,
        status: minutesSinceUpdate < 10 ? '✅' : '⚠️'
      };
      
      console.log(`   ${this.results.indexer.status} Last Block: ${blockNumber}`);
      console.log(`   ${this.results.indexer.status} Last Update: ${minutesSinceUpdate} minutes ago`);
    } else {
      this.results.indexer = {
        status: '❌',
        error: 'No indexed blocks found'
      };
      console.log(`   ❌ No indexed blocks found`);
    }
  }

  printSummary() {
    console.log('\n📋 SYSTEM STATUS SUMMARY:');
    console.log('=' .repeat(50));
    
    console.log(`🏟️  Fixtures & Odds: ${this.results.fixtures.status}`);
    console.log(`   - ${this.results.fixtures.total} fixtures, ${this.results.fixtures.odds} odds`);
    console.log(`   - ${this.results.fixtures.oddysseyReady} Oddyssey-ready`);
    
    console.log(`🎯 Results Processing: ${this.results.results.status}`);
    console.log(`   - ${this.results.results.fixtureResults}/${this.results.results.finishedFixtures} results processed (${this.results.results.processingRate})`);
    
    console.log(`🎮 Oddyssey System: ${this.results.oddyssey.status}`);
    console.log(`   - ${this.results.oddyssey.cycles} cycles, ${this.results.oddyssey.slips} slips`);
    console.log(`   - ${this.results.oddyssey.dailyGames} daily games, ${this.results.oddyssey.gameResults} results`);
    
    console.log(`⏰ Cron Jobs: ${this.results.cronJobs.status}`);
    console.log(`   - ${Object.keys(this.results.cronJobs.stats).length} active jobs`);
    
    console.log(`⛓️  Indexer: ${this.results.indexer.status}`);
    if (this.results.indexer.lastBlock) {
      console.log(`   - Block ${this.results.indexer.lastBlock} (${this.results.indexer.minutesSinceUpdate}m ago)`);
    }
    
    console.log('=' .repeat(50));
    
    const allGood = [
      this.results.fixtures.status,
      this.results.results.status,
      this.results.oddyssey.status,
      this.results.cronJobs.status,
      this.results.indexer.status
    ].every(status => status === '✅');
    
    if (allGood) {
      console.log('🎉 ALL SYSTEMS OPERATIONAL!');
    } else {
      console.log('⚠️  Some systems need attention');
    }
  }
}

// Run the check
if (require.main === module) {
  const checker = new ComprehensiveSystemCheck();
  checker.runAllChecks().catch(console.error);
}

module.exports = ComprehensiveSystemCheck;
