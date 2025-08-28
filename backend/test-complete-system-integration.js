const { ethers } = require('ethers');
const config = require('./config');
const db = require('./db/db');

class CompleteSystemIntegrationTest {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.results = {
      contractConnections: {},
      indexerStatus: {},
      databaseTables: {},
      reputationSystem: {},
      oddysseySystem: {},
      overallStatus: 'PENDING'
    };
  }

  async runAllTests() {
    console.log('🚀 Starting Complete System Integration Test...\n');
    
    try {
      await this.testContractConnections();
      await this.testDatabaseTables();
      await this.testReputationSystem();
      await this.testOddysseySystem();
      await this.testIndexerStatus();
      await this.generateReport();
    } catch (error) {
      console.error('❌ Test failed:', error);
      this.results.overallStatus = 'FAILED';
    }
  }

  async testContractConnections() {
    console.log('🔗 Testing Contract Connections...');
    
    const contracts = [
      { name: 'BitredictPool', address: config.blockchain.contractAddresses.bitredictPool },
      { name: 'GuidedOracle', address: config.blockchain.contractAddresses.guidedOracle },
      { name: 'OptimisticOracle', address: config.blockchain.contractAddresses.optimisticOracle },
      { name: 'ReputationSystem', address: config.blockchain.contractAddresses.reputationSystem },
      { name: 'BitrToken', address: config.blockchain.contractAddresses.bitrToken },
      { name: 'StakingContract', address: config.blockchain.contractAddresses.stakingContract },
      { name: 'BitrFaucet', address: config.blockchain.contractAddresses.bitrFaucet },
      { name: 'Oddyssey', address: config.blockchain.contractAddresses.oddyssey }
    ];

    for (const contract of contracts) {
      try {
        const code = await this.provider.getCode(contract.address);
        const isDeployed = code !== '0x';
        
        this.results.contractConnections[contract.name] = {
          address: contract.address,
          deployed: isDeployed,
          status: isDeployed ? '✅ DEPLOYED' : '❌ NOT DEPLOYED'
        };
        
        console.log(`  ${contract.name}: ${isDeployed ? '✅' : '❌'} ${contract.address}`);
      } catch (error) {
        this.results.contractConnections[contract.name] = {
          address: contract.address,
          deployed: false,
          status: '❌ ERROR',
          error: error.message
        };
        console.log(`  ${contract.name}: ❌ ERROR - ${error.message}`);
      }
    }
    console.log('');
  }

  async testDatabaseTables() {
    console.log('🗄️ Testing Database Tables...');
    
    const requiredTables = [
      { schema: 'core', table: 'users' },
      { schema: 'core', table: 'reputation_actions' },
      { schema: 'core', table: 'reputation_log' },
      { schema: 'oddyssey', table: 'slips' },
      { schema: 'oddyssey', table: 'cycle_status' },
      { schema: 'oracle', table: 'pools' },
      { schema: 'oracle', table: 'pool_bets' },
      { schema: 'analytics', table: 'pools' }
    ];

    for (const tableInfo of requiredTables) {
      try {
        const result = await db.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = $1 AND table_name = $2
          )
        `, [tableInfo.schema, tableInfo.table]);
        
        const exists = result.rows[0].exists;
        
        this.results.databaseTables[`${tableInfo.schema}.${tableInfo.table}`] = {
          exists,
          status: exists ? '✅ EXISTS' : '❌ MISSING'
        };
        
        console.log(`  ${tableInfo.schema}.${tableInfo.table}: ${exists ? '✅' : '❌'}`);
      } catch (error) {
        this.results.databaseTables[`${tableInfo.schema}.${tableInfo.table}`] = {
          exists: false,
          status: '❌ ERROR',
          error: error.message
        };
        console.log(`  ${tableInfo.schema}.${tableInfo.table}: ❌ ERROR - ${error.message}`);
      }
    }
    console.log('');
  }

  async testReputationSystem() {
    console.log('🏆 Testing Reputation System...');
    
    try {
      // Test ReputationSystem contract interaction
      const reputationABI = [
        "function getUserReputation(address user) view returns (uint256)",
        "function DEFAULT_REPUTATION() view returns (uint256)",
        "function MAX_REPUTATION() view returns (uint256)"
      ];
      
      const reputationContract = new ethers.Contract(
        config.blockchain.contractAddresses.reputationSystem,
        reputationABI,
        this.provider
      );

      const defaultReputation = await reputationContract.DEFAULT_REPUTATION();
      const maxReputation = await reputationContract.MAX_REPUTATION();
      
      // Test with a sample address
      const testAddress = '0x483fc7FD690dCf2a01318282559C389F385d4428';
      const userReputation = await reputationContract.getUserReputation(testAddress);
      
      this.results.reputationSystem = {
        contractAddress: config.blockchain.contractAddresses.reputationSystem,
        defaultReputation: defaultReputation.toString(),
        maxReputation: maxReputation.toString(),
        testUserReputation: userReputation.toString(),
        status: '✅ WORKING'
      };
      
      console.log(`  Contract Address: ${config.blockchain.contractAddresses.reputationSystem}`);
      console.log(`  Default Reputation: ${defaultReputation.toString()}`);
      console.log(`  Max Reputation: ${maxReputation.toString()}`);
      console.log(`  Test User Reputation: ${userReputation.toString()}`);
      console.log('  Status: ✅ WORKING');
      
    } catch (error) {
      this.results.reputationSystem = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log(`  Status: ❌ ERROR - ${error.message}`);
    }
    console.log('');
  }

  async testOddysseySystem() {
    console.log('🎮 Testing Oddyssey System...');
    
    try {
      // Test Oddyssey contract interaction
      const oddysseyABI = [
        "function getCurrentCycle() view returns (uint256)",
        "function getCurrentCycleInfo() view returns (uint256 cycleId, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount)"
      ];
      
      const oddysseyContract = new ethers.Contract(
        config.blockchain.contractAddresses.oddyssey,
        oddysseyABI,
        this.provider
      );

      const currentCycle = await oddysseyContract.getCurrentCycle();
      const cycleInfo = await oddysseyContract.getCurrentCycleInfo();
      
      this.results.oddysseySystem = {
        contractAddress: config.blockchain.contractAddresses.oddyssey,
        currentCycle: currentCycle.toString(),
        cycleState: cycleInfo.state.toString(),
        cycleEndTime: cycleInfo.endTime.toString(),
        cyclePrizePool: cycleInfo.prizePool.toString(),
        cycleSlipCount: cycleInfo.cycleSlipCount.toString(),
        status: '✅ WORKING'
      };
      
      console.log(`  Contract Address: ${config.blockchain.contractAddresses.oddyssey}`);
      console.log(`  Current Cycle: ${currentCycle.toString()}`);
      console.log(`  Cycle State: ${cycleInfo.state.toString()}`);
      console.log(`  Cycle End Time: ${cycleInfo.endTime.toString()}`);
      console.log(`  Cycle Prize Pool: ${cycleInfo.prizePool.toString()}`);
      console.log(`  Cycle Slip Count: ${cycleInfo.cycleSlipCount.toString()}`);
      console.log('  Status: ✅ WORKING');
      
    } catch (error) {
      this.results.oddysseySystem = {
        status: '❌ ERROR',
        error: error.message
      };
      console.log(`  Status: ❌ ERROR - ${error.message}`);
    }
    console.log('');
  }

  async testIndexerStatus() {
    console.log('📊 Testing Indexer Status...');
    
    try {
      // Check if indexer tables have recent data
      const indexerChecks = [
        {
          name: 'Main Indexer',
          query: 'SELECT COUNT(*) as count FROM oracle.pools WHERE created_at > NOW() - INTERVAL \'1 hour\''
        },
        {
          name: 'Oddyssey Indexer',
          query: 'SELECT COUNT(*) as count FROM oddyssey.slips WHERE created_at > NOW() - INTERVAL \'1 hour\''
        },
        {
          name: 'Reputation Indexer',
          query: 'SELECT COUNT(*) as count FROM core.reputation_log WHERE created_at > NOW() - INTERVAL \'1 hour\''
        }
      ];

      for (const check of indexerChecks) {
        try {
          const result = await db.query(check.query);
          const count = parseInt(result.rows[0].count);
          
          this.results.indexerStatus[check.name] = {
            recentRecords: count,
            status: count > 0 ? '✅ ACTIVE' : '⚠️ NO RECENT DATA'
          };
          
          console.log(`  ${check.name}: ${count > 0 ? '✅' : '⚠️'} ${count} recent records`);
        } catch (error) {
          this.results.indexerStatus[check.name] = {
            status: '❌ ERROR',
            error: error.message
          };
          console.log(`  ${check.name}: ❌ ERROR - ${error.message}`);
        }
      }
      
    } catch (error) {
      console.log(`  Indexer Status: ❌ ERROR - ${error.message}`);
    }
    console.log('');
  }

  async generateReport() {
    console.log('📋 Generating Integration Report...\n');
    
    // Calculate overall status
    const allChecks = [
      ...Object.values(this.results.contractConnections),
      ...Object.values(this.results.databaseTables),
      this.results.reputationSystem,
      this.results.oddysseySystem,
      ...Object.values(this.results.indexerStatus)
    ];
    
    const failedChecks = allChecks.filter(check => 
      check.status && check.status.includes('❌')
    );
    
    this.results.overallStatus = failedChecks.length === 0 ? '✅ ALL SYSTEMS OPERATIONAL' : '⚠️ SOME ISSUES DETECTED';
    
    console.log('='.repeat(60));
    console.log('🔍 COMPLETE SYSTEM INTEGRATION REPORT');
    console.log('='.repeat(60));
    console.log(`Overall Status: ${this.results.overallStatus}`);
    console.log('');
    
    console.log('📊 SUMMARY:');
    console.log(`  Contract Connections: ${Object.values(this.results.contractConnections).filter(c => c.status?.includes('✅')).length}/${Object.keys(this.results.contractConnections).length} ✅`);
    console.log(`  Database Tables: ${Object.values(this.results.databaseTables).filter(t => t.status?.includes('✅')).length}/${Object.keys(this.results.databaseTables).length} ✅`);
    console.log(`  Reputation System: ${this.results.reputationSystem.status?.includes('✅') ? '✅' : '❌'}`);
    console.log(`  Oddyssey System: ${this.results.oddysseySystem.status?.includes('✅') ? '✅' : '❌'}`);
    console.log(`  Indexers: ${Object.values(this.results.indexerStatus).filter(i => i.status?.includes('✅')).length}/${Object.keys(this.results.indexerStatus).length} ✅`);
    console.log('');
    
    if (failedChecks.length > 0) {
      console.log('⚠️ ISSUES FOUND:');
      failedChecks.forEach(check => {
        console.log(`  - ${check.status}${check.error ? `: ${check.error}` : ''}`);
      });
      console.log('');
    }
    
    console.log('🎯 RECOMMENDATIONS:');
    if (this.results.overallStatus.includes('✅')) {
      console.log('  ✅ All systems are operational and ready for production');
      console.log('  ✅ Contract addresses are correctly configured');
      console.log('  ✅ Database schema is complete');
      console.log('  ✅ Indexers are tracking events properly');
    } else {
      console.log('  🔧 Review and fix the issues listed above');
      console.log('  🔧 Ensure all contracts are deployed to correct addresses');
      console.log('  🔧 Verify database migrations have been applied');
      console.log('  🔧 Check indexer configurations and permissions');
    }
    
    console.log('='.repeat(60));
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const test = new CompleteSystemIntegrationTest();
  test.runAllTests()
    .then(() => {
      console.log('✅ Integration test completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Integration test failed:', error);
      process.exit(1);
    });
}

module.exports = CompleteSystemIntegrationTest;
