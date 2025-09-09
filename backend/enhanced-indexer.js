const { ethers } = require('ethers');
const path = require('path');
const config = require('./config');
const RpcManager = require('./utils/rpc-manager');

/**
 * Enhanced Indexer that covers ALL contract events
 * - BitrPool: All pool-related events
 * - Oddyssey: All game events  
 * - BitrFaucet: All faucet events
 * - BitrStaking: All staking events
 * - ReputationSystem: All reputation events
 * - OptimisticOracle: All oracle events
 * - GuidedOracle: All guided oracle events
 */
class EnhancedContractIndexer {
  constructor() {
    this.rpcManager = new RpcManager(
      config.blockchain.rpcUrls || [
        'https://rpc.ankr.com/monad_testnet/df5096a95ddedfa5ec32ad231b63250e719aef9ee7edcbbcea32b8539ae47205',
        'https://testnet-rpc.monad.xyz/',
        'https://frosty-summer-model.monad-testnet.quiknode.pro/bfedff2990828aad13692971d0dbed22de3c9783/',
      ], 
      {
        maxRetries: 8,
        baseDelay: 200,
        maxDelay: 10000,
        circuitBreakerThreshold: 8,
        circuitBreakerTimeout: 30000
      }
    );
    
    this.isRunning = false;
    this.lastIndexedBlock = parseInt(config.blockchain.startBlock) || 0;
    
    // Contract ABIs with ALL events
    this.contractABIs = {
      bitrPool: [
        "event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, uint8 oracleType, bytes32 indexed marketId, uint8 marketType, string league, string category)",
        "event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)",
        "event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount)",
        "event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp)",
        "event RewardClaimed(uint256 indexed poolId, address indexed user, uint256 amount)",
        "event PoolRefunded(uint256 indexed poolId, string reason)",
        "event UserWhitelisted(uint256 indexed poolId, address indexed user)",
        "event PoolFilledAboveThreshold(uint256 indexed poolId, uint256 fillPercentage, uint256 timestamp)",
        "event UserBetPlaced(uint256 indexed poolId, address indexed user, uint256 amount, uint256 totalUserBets)",
        "event UserLiquidityAdded(uint256 indexed poolId, address indexed user, uint256 amount, uint256 totalUserLiquidity)",
        "event PoolVolumeUpdated(uint256 indexed poolId, uint256 totalVolume, uint256 participantCount)",
        "event ReputationActionOccurred(address indexed user, uint8 action, uint256 poolId, uint256 amount, uint256 timestamp)",
        "event PoolBoosted(uint256 indexed poolId, uint8 tier, uint256 expiry, uint256 fee)",
        "event BoostExpired(uint256 indexed poolId, uint8 tier)",
        "event ComboPoolCreated(uint256 indexed comboPoolId, address indexed creator, uint256 conditionCount, uint16 totalOdds)",
        "event ComboBetPlaced(uint256 indexed comboPoolId, address indexed bettor, uint256 amount)",
        "event ComboPoolSettled(uint256 indexed comboPoolId, bool creatorSideWon, uint256 timestamp)"
      ],
      
      oddyssey: [
        "event OracleSet(address indexed newOracle)",
        "event EntryFeeSet(uint256 indexed newFee)",
        "event CycleStarted(uint256 indexed cycleId, uint256 endTime)",
        "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)",
        "event SlipEvaluated(uint256 indexed slipId, address indexed player, uint256 indexed cycleId, uint8 correctCount, uint256 finalScore)",
        "event CycleResolved(uint256 indexed cycleId, uint256 prizePool)",
        "event CycleEnded(uint256 indexed cycleId, uint256 endTime, uint32 totalSlips)",
        "event PrizeClaimed(uint256 indexed cycleId, address indexed player, uint256 rank, uint256 amount)",
        "event PrizeRollover(uint256 indexed fromCycleId, uint256 indexed toCycleId, uint256 amount)",
        "event UserStatsUpdated(address indexed user, uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 winRate)",
        "event OddysseyReputationUpdated(address indexed user, uint256 pointsEarned, uint256 correctPredictions, uint256 totalReputation)",
        "event LeaderboardUpdated(uint256 indexed cycleId, address indexed player, uint256 indexed slipId, uint8 rank, uint256 finalScore)",
        "event AnalyticsUpdated(uint256 indexed cycleId, uint256 totalVolume, uint32 totalSlips, uint256 averageScore)"
      ],
      
      bitrFaucet: [
        "event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp)",
        "event FaucetDeactivated(uint256 timestamp)",
        "event FaucetReactivated(uint256 timestamp)",
        "event FaucetRefilled(uint256 amount, uint256 timestamp)",
        "event EmergencyWithdraw(address indexed owner, uint256 amount, uint256 timestamp)"
      ],
      
      bitrStaking: [
        "event Staked(address indexed user, uint256 amount, uint8 tier, uint8 duration)",
        "event Claimed(address indexed user, uint256 bitrAmount)",
        "event Unstaked(address indexed user, uint256 amount)",
        "event RevenueAdded(uint256 bitrAmount, uint256 monAmount)",
        "event RevenueDistributed()",
        "event RevenueClaimed(address indexed user, uint256 bitrAmount, uint256 monAmount)",
        "event PoolAuthorized(address indexed pool, bool authorized)"
      ],
      
      reputationSystem: [
        "event ReputationUpdated(address indexed user, uint256 oldReputation, uint256 newReputation)",
        "event UpdaterAuthorized(address indexed updater, bool authorized)"
      ],
      
      optimisticOracle: [
        "event MarketCreated(bytes32 indexed marketId, uint256 indexed poolId, string question, string category, uint256 eventEndTime)",
        "event OutcomeProposed(bytes32 indexed marketId, address indexed proposer, bytes32 outcome, uint256 bond)",
        "event OutcomeDisputed(bytes32 indexed marketId, address indexed disputer, uint256 bond)",
        "event VoteCast(bytes32 indexed marketId, address indexed voter, bytes32 outcome, uint256 votingPower)",
        "event MarketResolved(bytes32 indexed marketId, bytes32 finalOutcome, address winner, uint256 reward)",
        "event BondClaimed(bytes32 indexed marketId, address indexed claimer, uint256 amount)",
        "event ReputationUpdated(address indexed user, uint256 oldReputation, uint256 newReputation)",
        "event ReputationAction(address indexed user, string action, bytes32 marketId, uint256 amount, uint256 timestamp)"
      ],
      
      guidedOracle: [
        "event OutcomeSubmitted(bytes32 indexed marketId, bytes resultData, uint256 timestamp)",
        "event OracleBotUpdated(address newBot)",
        "event CallExecuted(address indexed target, bytes data)"
      ]
    };
    
    this.healthStats = {
      totalBlocks: 0,
      totalEvents: 0,
      totalErrors: 0,
      lastSuccessfulBlock: 0,
      startTime: Date.now(),
      lastHealthLog: Date.now()
    };
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Enhanced Contract Indexer...');
      
      const currentBlock = await this.rpcManager.getBlockNumber();
      console.log(`✅ RPC connection successful. Current block: ${currentBlock}`);
      
      const tempProvider = await this.rpcManager.getProvider();
      
      // Initialize all contracts
      this.contracts = {
        bitrPool: new ethers.Contract(
          config.blockchain.contractAddresses.bitrPool,
          this.contractABIs.bitrPool,
          tempProvider
        ),
        oddyssey: new ethers.Contract(
          config.blockchain.contractAddresses.oddyssey,
          this.contractABIs.oddyssey,
          tempProvider
        ),
        bitrFaucet: new ethers.Contract(
          config.blockchain.contractAddresses.bitrFaucet,
          this.contractABIs.bitrFaucet,
          tempProvider
        ),
        bitrStaking: new ethers.Contract(
          config.blockchain.contractAddresses.bitrStaking,
          this.contractABIs.bitrStaking,
          tempProvider
        ),
        reputationSystem: new ethers.Contract(
          config.blockchain.contractAddresses.reputationSystem,
          this.contractABIs.reputationSystem,
          tempProvider
        ),
        optimisticOracle: new ethers.Contract(
          config.blockchain.contractAddresses.optimisticOracle,
          this.contractABIs.optimisticOracle,
          tempProvider
        ),
        guidedOracle: new ethers.Contract(
          config.blockchain.contractAddresses.guidedOracle,
          this.contractABIs.guidedOracle,
          tempProvider
        )
      };
      
      // Get last indexed block from database
      const db = require('./db/db');
      const result = await db.query('SELECT MAX(block_number) as last_block FROM oracle.indexed_blocks');
      const dbLastBlock = result.rows[0]?.last_block || 0;
      const startBlock = parseInt(config.blockchain.startBlock) || 0;
      
      this.lastIndexedBlock = Math.max(dbLastBlock, startBlock);
      console.log(`📊 Starting from block: ${this.lastIndexedBlock}`);
      
      console.log('✅ Enhanced contract indexer initialized successfully');
      this.rpcManager.logStatus();
      
    } catch (error) {
      console.error('❌ Failed to initialize enhanced contract indexer:', error);
      throw error;
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('Enhanced indexer already running');
      return;
    }

    console.log('🚀 Starting Enhanced Contract Indexer...');
    this.isRunning = true;

    try {
      await this.initialize();
      await this.indexingLoop();
    } catch (error) {
      console.error('❌ Enhanced indexer error:', error);
      this.isRunning = false;
      
      setTimeout(() => {
        console.log('🔄 Restarting enhanced indexer...');
        this.start();
      }, 30000);
    }
  }

  async indexingLoop() {
    while (this.isRunning) {
      try {
        const currentBlock = await this.rpcManager.getBlockNumber();
        
        if (currentBlock > this.lastIndexedBlock) {
          const batchSize = Math.min(100, currentBlock - this.lastIndexedBlock);
          const toBlock = this.lastIndexedBlock + batchSize;
          
          console.log(`📊 Indexing blocks ${this.lastIndexedBlock + 1} to ${toBlock}`);
          
          // Index all contract events in parallel
          const eventCounts = await Promise.all([
            this.indexBitrPoolEvents(this.lastIndexedBlock + 1, toBlock),
            this.indexOddysseyEvents(this.lastIndexedBlock + 1, toBlock),
            this.indexBitrFaucetEvents(this.lastIndexedBlock + 1, toBlock),
            this.indexBitrStakingEvents(this.lastIndexedBlock + 1, toBlock),
            this.indexReputationEvents(this.lastIndexedBlock + 1, toBlock),
            this.indexOptimisticOracleEvents(this.lastIndexedBlock + 1, toBlock),
            this.indexGuidedOracleEvents(this.lastIndexedBlock + 1, toBlock)
          ]);
          
          const totalEvents = eventCounts.reduce((sum, count) => sum + count, 0);
          
          if (totalEvents > 0) {
            console.log(`✅ Indexed ${totalEvents} events from blocks ${this.lastIndexedBlock + 1}-${toBlock}`);
          }
          
          // Update indexed blocks
          await this.updateIndexedBlocks(this.lastIndexedBlock + 1, toBlock);
          this.lastIndexedBlock = toBlock;
          this.healthStats.totalBlocks += batchSize;
          this.healthStats.totalEvents += totalEvents;
          this.healthStats.lastSuccessfulBlock = toBlock;
        }
        
        // Wait before next iteration
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        console.error('❌ Error in indexing loop:', error);
        this.healthStats.totalErrors++;
        
        // Wait longer on error
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }
  }

  async indexBitrPoolEvents(fromBlock, toBlock) {
    let eventsFound = 0;
    const eventTypes = [
      'PoolCreated', 'BetPlaced', 'LiquidityAdded', 'PoolSettled', 
      'RewardClaimed', 'PoolRefunded', 'UserWhitelisted', 'PoolFilledAboveThreshold',
      'UserBetPlaced', 'UserLiquidityAdded', 'PoolVolumeUpdated', 
      'ReputationActionOccurred', 'PoolBoosted', 'BoostExpired',
      'ComboPoolCreated', 'ComboBetPlaced', 'ComboPoolSettled'
    ];
    
    for (const eventType of eventTypes) {
      try {
        if (this.contracts.bitrPool.filters[eventType]) {
          const events = await this.rpcManager.queryFilter(
            this.contracts.bitrPool,
            this.contracts.bitrPool.filters[eventType](),
            fromBlock,
            toBlock
          );
          
          for (const event of events) {
            await this.handleBitrPoolEvent(event, eventType);
            eventsFound++;
          }
        }
      } catch (error) {
        console.error(`Error indexing BitrPool ${eventType} events:`, error);
      }
    }
    
    return eventsFound;
  }

  async indexOddysseyEvents(fromBlock, toBlock) {
    let eventsFound = 0;
    const eventTypes = [
      'OracleSet', 'EntryFeeSet', 'CycleStarted', 'SlipPlaced', 'SlipEvaluated',
      'CycleResolved', 'CycleEnded', 'PrizeClaimed', 'PrizeRollover',
      'UserStatsUpdated', 'OddysseyReputationUpdated', 'LeaderboardUpdated', 'AnalyticsUpdated'
    ];
    
    for (const eventType of eventTypes) {
      try {
        if (this.contracts.oddyssey.filters[eventType]) {
          const events = await this.rpcManager.queryFilter(
            this.contracts.oddyssey,
            this.contracts.oddyssey.filters[eventType](),
            fromBlock,
            toBlock
          );
          
          for (const event of events) {
            await this.handleOddysseyEvent(event, eventType);
            eventsFound++;
          }
        }
      } catch (error) {
        console.error(`Error indexing Oddyssey ${eventType} events:`, error);
      }
    }
    
    return eventsFound;
  }

  async indexBitrFaucetEvents(fromBlock, toBlock) {
    let eventsFound = 0;
    const eventTypes = ['FaucetClaimed', 'FaucetDeactivated', 'FaucetReactivated', 'FaucetRefilled', 'EmergencyWithdraw'];
    
    for (const eventType of eventTypes) {
      try {
        if (this.contracts.bitrFaucet.filters[eventType]) {
          const events = await this.rpcManager.queryFilter(
            this.contracts.bitrFaucet,
            this.contracts.bitrFaucet.filters[eventType](),
            fromBlock,
            toBlock
          );
          
          for (const event of events) {
            await this.handleBitrFaucetEvent(event, eventType);
            eventsFound++;
          }
        }
      } catch (error) {
        console.error(`Error indexing BitrFaucet ${eventType} events:`, error);
      }
    }
    
    return eventsFound;
  }

  async indexBitrStakingEvents(fromBlock, toBlock) {
    let eventsFound = 0;
    const eventTypes = ['Staked', 'Claimed', 'Unstaked', 'RevenueAdded', 'RevenueDistributed', 'RevenueClaimed', 'PoolAuthorized'];
    
    for (const eventType of eventTypes) {
      try {
        if (this.contracts.bitrStaking.filters[eventType]) {
          const events = await this.rpcManager.queryFilter(
            this.contracts.bitrStaking,
            this.contracts.bitrStaking.filters[eventType](),
            fromBlock,
            toBlock
          );
          
          for (const event of events) {
            await this.handleBitrStakingEvent(event, eventType);
            eventsFound++;
          }
        }
      } catch (error) {
        console.error(`Error indexing BitrStaking ${eventType} events:`, error);
      }
    }
    
    return eventsFound;
  }

  async indexReputationEvents(fromBlock, toBlock) {
    let eventsFound = 0;
    const eventTypes = ['ReputationUpdated', 'UpdaterAuthorized'];
    
    for (const eventType of eventTypes) {
      try {
        if (this.contracts.reputationSystem.filters[eventType]) {
          const events = await this.rpcManager.queryFilter(
            this.contracts.reputationSystem,
            this.contracts.reputationSystem.filters[eventType](),
            fromBlock,
            toBlock
          );
          
          for (const event of events) {
            await this.handleReputationEvent(event, eventType);
            eventsFound++;
          }
        }
      } catch (error) {
        console.error(`Error indexing ReputationSystem ${eventType} events:`, error);
      }
    }
    
    return eventsFound;
  }

  async indexOptimisticOracleEvents(fromBlock, toBlock) {
    let eventsFound = 0;
    const eventTypes = ['MarketCreated', 'OutcomeProposed', 'OutcomeDisputed', 'VoteCast', 'MarketResolved', 'BondClaimed', 'ReputationUpdated', 'ReputationAction'];
    
    for (const eventType of eventTypes) {
      try {
        if (this.contracts.optimisticOracle.filters[eventType]) {
          const events = await this.rpcManager.queryFilter(
            this.contracts.optimisticOracle,
            this.contracts.optimisticOracle.filters[eventType](),
            fromBlock,
            toBlock
          );
          
          for (const event of events) {
            await this.handleOptimisticOracleEvent(event, eventType);
            eventsFound++;
          }
        }
      } catch (error) {
        console.error(`Error indexing OptimisticOracle ${eventType} events:`, error);
      }
    }
    
    return eventsFound;
  }

  async indexGuidedOracleEvents(fromBlock, toBlock) {
    let eventsFound = 0;
    const eventTypes = ['OutcomeSubmitted', 'OracleBotUpdated', 'CallExecuted'];
    
    for (const eventType of eventTypes) {
      try {
        if (this.contracts.guidedOracle.filters[eventType]) {
          const events = await this.rpcManager.queryFilter(
            this.contracts.guidedOracle,
            this.contracts.guidedOracle.filters[eventType](),
            fromBlock,
            toBlock
          );
          
          for (const event of events) {
            await this.handleGuidedOracleEvent(event, eventType);
            eventsFound++;
          }
        }
      } catch (error) {
        console.error(`Error indexing GuidedOracle ${eventType} events:`, error);
      }
    }
    
    return eventsFound;
  }

  // Event handlers for each contract
  async handleBitrPoolEvent(event, eventType) {
    const db = require('./db/db');
    
    await db.query(`
      INSERT INTO oracle.blockchain_events (
        block_number, transaction_hash, log_index, event_type, 
        contract_address, event_data, processed_at, contract_name
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
    `, [
      event.blockNumber,
      event.transactionHash,
      event.logIndex,
      eventType,
      event.address,
      JSON.stringify(event.args, (key, value) => typeof value === 'bigint' ? value.toString() : value),
      'BitrPool'
    ]);
  }

  async handleOddysseyEvent(event, eventType) {
    const db = require('./db/db');
    
    await db.query(`
      INSERT INTO oracle.blockchain_events (
        block_number, transaction_hash, log_index, event_type, 
        contract_address, event_data, processed_at, contract_name
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
    `, [
      event.blockNumber,
      event.transactionHash,
      event.logIndex,
      eventType,
      event.address,
      JSON.stringify(event.args, (key, value) => typeof value === 'bigint' ? value.toString() : value),
      'Oddyssey'
    ]);
  }

  async handleBitrFaucetEvent(event, eventType) {
    const db = require('./db/db');
    
    await db.query(`
      INSERT INTO oracle.blockchain_events (
        block_number, transaction_hash, log_index, event_type, 
        contract_address, event_data, processed_at, contract_name
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
    `, [
      event.blockNumber,
      event.transactionHash,
      event.logIndex,
      eventType,
      event.address,
      JSON.stringify(event.args, (key, value) => typeof value === 'bigint' ? value.toString() : value),
      'BitrFaucet'
    ]);
  }

  async handleBitrStakingEvent(event, eventType) {
    const db = require('./db/db');
    
    await db.query(`
      INSERT INTO oracle.blockchain_events (
        block_number, transaction_hash, log_index, event_type, 
        contract_address, event_data, processed_at, contract_name
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
    `, [
      event.blockNumber,
      event.transactionHash,
      event.logIndex,
      eventType,
      event.address,
      JSON.stringify(event.args, (key, value) => typeof value === 'bigint' ? value.toString() : value),
      'BitrStaking'
    ]);
  }

  async handleReputationEvent(event, eventType) {
    const db = require('./db/db');
    
    await db.query(`
      INSERT INTO oracle.blockchain_events (
        block_number, transaction_hash, log_index, event_type, 
        contract_address, event_data, processed_at, contract_name
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
    `, [
      event.blockNumber,
      event.transactionHash,
      event.logIndex,
      eventType,
      event.address,
      JSON.stringify(event.args, (key, value) => typeof value === 'bigint' ? value.toString() : value),
      'ReputationSystem'
    ]);
  }

  async handleOptimisticOracleEvent(event, eventType) {
    const db = require('./db/db');
    
    await db.query(`
      INSERT INTO oracle.blockchain_events (
        block_number, transaction_hash, log_index, event_type, 
        contract_address, event_data, processed_at, contract_name
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
    `, [
      event.blockNumber,
      event.transactionHash,
      event.logIndex,
      eventType,
      event.address,
      JSON.stringify(event.args, (key, value) => typeof value === 'bigint' ? value.toString() : value),
      'OptimisticOracle'
    ]);
  }

  async handleGuidedOracleEvent(event, eventType) {
    const db = require('./db/db');
    
    await db.query(`
      INSERT INTO oracle.blockchain_events (
        block_number, transaction_hash, log_index, event_type, 
        contract_address, event_data, processed_at, contract_name
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
    `, [
      event.blockNumber,
      event.transactionHash,
      event.logIndex,
      eventType,
      event.address,
      JSON.stringify(event.args, (key, value) => typeof value === 'bigint' ? value.toString() : value),
      'GuidedOracle'
    ]);
  }

  async updateIndexedBlocks(fromBlock, toBlock) {
    const db = require('./db/db');
    
    for (let block = fromBlock; block <= toBlock; block++) {
      await db.query(`
        INSERT INTO oracle.indexed_blocks (block_number, indexed_at)
        VALUES ($1, NOW())
        ON CONFLICT (block_number) DO UPDATE SET indexed_at = NOW()
      `, [block]);
    }
  }

  async stop() {
    console.log('🛑 Stopping Enhanced Contract Indexer...');
    this.isRunning = false;
  }

  getHealthStats() {
    return {
      ...this.healthStats,
      uptime: Date.now() - this.healthStats.startTime,
      isRunning: this.isRunning,
      lastIndexedBlock: this.lastIndexedBlock
    };
  }
}

module.exports = EnhancedContractIndexer;
