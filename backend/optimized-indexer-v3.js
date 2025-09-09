const { ethers } = require('ethers');
const config = require('./config');
const RpcManager = require('./utils/rpc-manager');

/**
 * Optimized Indexer V3 - Monad Testnet Optimized
 * 
 * Key Features:
 * - Monad-optimized batch sizes (100-250 blocks for 400ms block times)
 * - Multiple Monad RPC endpoints with failover
 * - Proper event filtering and storage
 * - State management and checkpointing
 * - Error recovery and monitoring
 * - Memory-efficient processing
 * - Optimized for 10,000 TPS and 800ms finality
 */

class OptimizedIndexerV3 {
  constructor() {
    // Initialize RPC Manager with PREMIUM ANKR RPC (main + fallbacks)
    this.rpcManager = new RpcManager([
      'https://rpc.ankr.com/monad_testnet/df5096a95ddedfa5ec32ad231b63250e719aef9ee7edcbbcea32b8539ae47205', // PREMIUM ANKR!
      'https://testnet-rpc.monad.xyz/', // Fallback RPC
      'https://frosty-summer-model.monad-testnet.quiknode.pro/bfedff2990828aad13692971d0dbed22de3c9783/' // Emergency RPC
    ], {
      maxRetries: 8, // More retries for premium reliability
      baseDelay: 100, // 5x faster retry for premium RPC
      maxDelay: 5000, // 2x faster max delay
      circuitBreakerThreshold: 8, // Higher threshold for premium
      circuitBreakerTimeout: 15000 // 2x faster timeout for premium
    });
    
    this.isRunning = false;
    this.isProcessing = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 15;
    
    // PREMIUM RPC optimized batch processing settings (400ms blocks, 10k TPS)
    this.batchSize = 300; // MUCH larger batches for premium RPC
    this.maxBatchSize = 500; // INCREASED max for premium RPC capabilities
    this.processingDelay = 50; // 50ms between batches (2x faster!)
    this.maxParallelQueries = 15; // 3x higher concurrency for premium RPC
    
    // State management
    this.state = {
      lastIndexedBlock: 0,
      lastProcessedBlock: 0,
      totalBlocks: 0,
      totalEvents: 0,
      startTime: Date.now(),
      errors: [],
      lastErrorTime: null
    };
    
    // Contract addresses
    this.poolAddress = config.blockchain.contractAddresses.bitredictPool;
    this.oracleAddress = config.blockchain.contractAddresses.guidedOracle;
    this.oddysseyAddress = config.blockchain.contractAddresses.oddyssey;
    this.reputationAddress = config.blockchain.contractAddresses.reputationSystem;
    
    // Contract instances
    this.poolContract = null;
    this.oracleContract = null;
    this.oddysseyContract = null;
    this.reputationContract = null;
    this.provider = null;
    
    // Performance tracking
    this.performanceStats = {
      blocksPerSecond: 0,
      eventsPerSecond: 0,
      averageBatchTime: 0,
      lastBatchTime: 0
    };
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Optimized Indexer V3...');
      
      // Initialize provider using RPC manager
      this.provider = await this.rpcManager.getProvider();
      
      // Test RPC connectivity
      await this.testRpcConnectivity();
      
      // Initialize contracts
      await this.initializeContracts();
      
      // Initialize database state
      await this.initializeState();
      
      // Load last indexed block
      await this.loadState();
      
      console.log('✅ Optimized Indexer V3 initialized successfully');
      console.log(`📊 Last indexed block: ${this.state.lastIndexedBlock}`);
      
    } catch (error) {
      console.error('❌ Failed to initialize Optimized Indexer V3:', error);
      throw error;
    }
  }

  async testRpcConnectivity() {
    console.log('🌐 Testing RPC connectivity...');
    
    try {
      const blockNumber = await this.rpcManager.getBlockNumber();
      console.log(`✅ RPC connected successfully. Current block: ${blockNumber}`);
      
      // Test a few more calls to ensure stability
      const block = await this.rpcManager.getBlock(blockNumber);
      console.log(`✅ Block retrieval successful. Block hash: ${block.hash}`);
      
    } catch (error) {
      console.error('❌ RPC connectivity test failed:', error);
      throw error;
    }
  }

  async initializeContracts() {
    // Correct ABIs based on actual smart contracts
    const poolABI = [
      "event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, uint8 oracleType, bytes32 marketId, uint8 marketType, string league, string category)",
      "event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)",
      "event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount)",
      "event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp)",
      "event RewardClaimed(uint256 indexed poolId, address indexed user, uint256 amount)",
      "event PoolRefunded(uint256 indexed poolId, string reason)",
      "event UserWhitelisted(uint256 indexed poolId, address indexed user)",
      "event PoolBoosted(uint256 indexed poolId, uint8 tier, uint256 expiry, uint256 fee)",
      "event BoostExpired(uint256 indexed poolId, uint8 tier)",
      "event ComboPoolCreated(uint256 indexed comboPoolId, address indexed creator, uint256 conditionCount, uint16 totalOdds)",
      "event ComboBetPlaced(uint256 indexed comboPoolId, address indexed bettor, uint256 amount)",
      "event ComboPoolSettled(uint256 indexed comboPoolId, bool creatorSideWon, uint256 timestamp)",
      "event ReputationActionOccurred(address indexed user, uint8 action, uint256 value, bytes32 indexed poolId, uint256 timestamp)",
      "event PoolFilledAboveThreshold(uint256 indexed poolId, uint256 fillPercentage, uint256 timestamp)",
      "event UserBetPlaced(uint256 indexed poolId, address indexed user, uint256 amount, uint256 totalUserBets)",
      "event UserLiquidityAdded(uint256 indexed poolId, address indexed user, uint256 amount, uint256 totalUserLiquidity)",
      "event PoolVolumeUpdated(uint256 indexed poolId, uint256 totalVolume, uint256 participantCount)"
    ];
    
    const oracleABI = [
      "event OutcomeSubmitted(bytes32 indexed marketId, bytes32 outcome, address indexed submitter, uint256 timestamp)"
    ];
    
    const oddysseyABI = [
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
    ];
    
    const reputationABI = [
      "event ReputationUpdated(address indexed user, uint256 newReputation, uint256 change, string reason)"
    ];
    
    // Initialize contract instances
    this.poolContract = new ethers.Contract(this.poolAddress, poolABI, this.provider);
    this.oracleContract = new ethers.Contract(this.oracleAddress, oracleABI, this.provider);
    this.oddysseyContract = new ethers.Contract(this.oddysseyAddress, oddysseyABI, this.provider);
    this.reputationContract = new ethers.Contract(this.reputationAddress, reputationABI, this.provider);
    
    console.log('✅ Contracts initialized');
  }

  async initializeState() {
    const db = require('./db/db');
    
    // Create indexer state table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS oracle.indexer_state (
        id SERIAL PRIMARY KEY,
        last_indexed_block BIGINT NOT NULL DEFAULT 0,
        last_processed_block BIGINT NOT NULL DEFAULT 0,
        is_processing BOOLEAN DEFAULT FALSE,
        total_blocks BIGINT DEFAULT 0,
        total_events BIGINT DEFAULT 0,
        start_time TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Create indexed blocks table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS oracle.indexed_blocks (
        block_number BIGINT PRIMARY KEY,
        indexed_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Add indexes for better performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_indexed_blocks_number ON oracle.indexed_blocks(block_number);
      CREATE INDEX IF NOT EXISTS idx_blockchain_events_block ON oracle.blockchain_events(block_number);
      CREATE INDEX IF NOT EXISTS idx_blockchain_events_tx ON oracle.blockchain_events(transaction_hash);
    `).catch(() => {
      // Indexes might already exist
    });
    
    console.log('✅ Database state initialized');
  }

  async loadState() {
    try {
      const db = require('./db/db');
      const result = await db.query('SELECT * FROM oracle.indexer_state ORDER BY id DESC LIMIT 1');
      
      if (result.rows.length > 0) {
        const state = result.rows[0];
        this.state.lastIndexedBlock = parseInt(state.last_indexed_block) || 0;
        this.state.lastProcessedBlock = parseInt(state.last_processed_block) || 0;
        this.state.totalBlocks = parseInt(state.total_blocks) || 0;
        this.state.totalEvents = parseInt(state.total_events) || 0;
        this.state.startTime = new Date(state.start_time).getTime();
      } else {
        // No previous state found - start from configured block instead of 0
        const configuredStartBlock = process.env.START_BLOCK || '164312555';
        if (configuredStartBlock !== 'latest') {
          this.state.lastIndexedBlock = parseInt(configuredStartBlock);
          console.log(`🚀 No previous state found. Starting from configured block: ${this.state.lastIndexedBlock}`);
        } else {
          // If 'latest', start from recent block
          const currentBlock = await this.rpcManager.getBlockNumber();
          this.state.lastIndexedBlock = currentBlock - 1000; // Start from 1000 blocks ago
          console.log(`🚀 No previous state found. Starting from recent block: ${this.state.lastIndexedBlock}`);
        }
      }
      
      console.log(`📊 Loaded state: last indexed block = ${this.state.lastIndexedBlock}`);
    } catch (error) {
      console.error('❌ Error loading state:', error);
      // Continue with default state - use configured start block
      const configuredStartBlock = process.env.START_BLOCK || '164312555';
      if (configuredStartBlock !== 'latest') {
        this.state.lastIndexedBlock = parseInt(configuredStartBlock);
        console.log(`🚀 Error loading state. Starting from configured block: ${this.state.lastIndexedBlock}`);
      }
    }
  }

  async saveState() {
    try {
      const db = require('./db/db');
      await db.query(`
        INSERT INTO oracle.indexer_state (
          last_indexed_block, last_processed_block, is_processing, 
          total_blocks, total_events, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (id) DO UPDATE SET
          last_indexed_block = EXCLUDED.last_indexed_block,
          last_processed_block = EXCLUDED.last_processed_block,
          is_processing = EXCLUDED.is_processing,
          total_blocks = EXCLUDED.total_blocks,
          total_events = EXCLUDED.total_events,
          updated_at = NOW()
      `, [
        this.state.lastIndexedBlock,
        this.state.lastProcessedBlock,
        this.isProcessing,
        this.state.totalBlocks,
        this.state.totalEvents
      ]);
    } catch (error) {
      console.error('❌ Error saving state:', error);
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Indexer is already running');
      return;
    }
    
    console.log('🚀 Starting Optimized Indexer V3...');
    this.isRunning = true;
    
    // Start the main indexing loop
    this.indexingLoop();
    
    // Start health monitoring
    this.healthMonitor();
  }

  async indexingLoop() {
    while (this.isRunning) {
      try {
        if (this.isProcessing) {
          await this.sleep(200); // Reduced from 1000ms for Monad's fast blocks
          continue;
        }
        
        this.isProcessing = true;
        const batchStartTime = Date.now();
        
        // Get current blockchain state
        const currentBlock = await this.rpcManager.getBlockNumber();
        const confirmationBlock = currentBlock - config.indexer.confirmationBlocks;
        
        // Determine batch size based on lag
        const lag = confirmationBlock - this.state.lastIndexedBlock;
        const dynamicBatchSize = this.calculateOptimalBatchSize(lag);
        
        // Check if we need to catch up
        if (lag > dynamicBatchSize) {
          await this.catchUp(confirmationBlock, dynamicBatchSize);
        } else {
          // Process new blocks
          await this.processNewBlocks(confirmationBlock);
        }
        
        this.isProcessing = false;
        this.consecutiveErrors = 0; // Reset error counter on success
        
        // Update performance stats
        const batchTime = Date.now() - batchStartTime;
        this.updatePerformanceStats(batchTime, dynamicBatchSize);
        
        // Save state periodically
        await this.saveState();
        
        // Adaptive delay based on performance
        const adaptiveDelay = this.calculateAdaptiveDelay();
        await this.sleep(adaptiveDelay);
        
      } catch (error) {
        this.isProcessing = false;
        this.consecutiveErrors++;
        
        console.error(`❌ Error in indexing loop (consecutive: ${this.consecutiveErrors}):`, error);
        
        // Handle errors more gracefully
        await this.handleError(error);
        
        // Save error state
        this.state.errors.push({
          timestamp: new Date(),
          error: error.message,
          blockNumber: this.state.lastIndexedBlock
        });
        
        // Keep only last 100 errors
        if (this.state.errors.length > 100) {
          this.state.errors = this.state.errors.slice(-100);
        }
        
        this.state.lastErrorTime = Date.now();
        await this.saveState();
      }
    }
  }

  calculateOptimalBatchSize(lag) {
    // Adaptive batch sizing based on lag and performance
    if (lag > 10000) {
      return this.maxBatchSize; // Large lag, use maximum batch size
    } else if (lag > 1000) {
      return Math.min(400, this.maxBatchSize); // Medium lag
    } else {
      return this.batchSize; // Normal operation
    }
  }

  calculateAdaptiveDelay() {
    // Adaptive delay based on performance and errors
    if (this.consecutiveErrors > 5) {
      return Math.min(5000 * this.consecutiveErrors, 30000); // Slower on errors
    } else if (this.performanceStats.averageBatchTime > 5000) {
      return this.processingDelay * 2; // Slower if batches are taking long
    } else {
      return this.processingDelay; // Normal speed
    }
  }

  updatePerformanceStats(batchTime, batchSize) {
    this.performanceStats.lastBatchTime = batchTime;
    this.performanceStats.averageBatchTime = 
      (this.performanceStats.averageBatchTime * 0.9) + (batchTime * 0.1);
    
    if (batchTime > 0) {
      this.performanceStats.blocksPerSecond = (batchSize / batchTime) * 1000;
    }
  }

  async catchUp(targetBlock, batchSize) {
    console.log(`🔍 Catching up from block ${this.state.lastIndexedBlock} to ${targetBlock} (batch size: ${batchSize})`);
    
    const fromBlock = this.state.lastIndexedBlock + 1;
    const toBlock = Math.min(fromBlock + batchSize - 1, targetBlock);
    
    // Process in optimized batches
    await this.processBatch(fromBlock, toBlock);
    
    // Update state
    this.state.lastIndexedBlock = toBlock;
    this.state.totalBlocks += (toBlock - fromBlock + 1);
    
    console.log(`✅ Caught up to block ${toBlock}`);
  }

  async processNewBlocks(targetBlock) {
    const fromBlock = this.state.lastIndexedBlock + 1;
    const toBlock = targetBlock;
    
    if (fromBlock > toBlock) {
      return; // No new blocks to process
    }
    
    console.log(`📊 Processing new blocks: ${fromBlock} to ${toBlock}`);
    await this.processBatch(fromBlock, toBlock);
    
    // Update state
    this.state.lastIndexedBlock = toBlock;
    this.state.totalBlocks += (toBlock - fromBlock + 1);
  }

  async processBatch(fromBlock, toBlock) {
    console.log(`🔧 Processing batch: ${fromBlock} to ${toBlock}`);
    
    // Process events with controlled concurrency and track event counts
    const [poolEvents, oracleEvents, oddysseyEvents, reputationEvents] = await Promise.all([
      this.processPoolEvents(fromBlock, toBlock),
      this.processOracleEvents(fromBlock, toBlock),
      this.processOddysseyEvents(fromBlock, toBlock),
      this.processReputationEvents(fromBlock, toBlock)
    ]);
    
    const totalEvents = (poolEvents || 0) + (oracleEvents || 0) + (oddysseyEvents || 0) + (reputationEvents || 0);
    
    // Only mark blocks as indexed if we found events or if this is a checkpoint range
    if (totalEvents > 0 || (fromBlock % 100 === 0)) {
      await this.markBlocksIndexed(fromBlock, toBlock);
      console.log(`💾 Saved batch ${fromBlock}-${toBlock} (${totalEvents} events found)`);
    } else {
      console.log(`⏭️ Skipped saving batch ${fromBlock}-${toBlock} (no events found)`);
    }
  }

  async processPoolEvents(fromBlock, toBlock) {
    try {
      console.log(`📊 Processing pool events: ${fromBlock} to ${toBlock}`);
      
      let totalEvents = 0;
      
      // PoolCreated events
      const poolCreatedEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.PoolCreated(),
        fromBlock,
        toBlock
      );
      
      for (const event of poolCreatedEvents) {
        await this.handlePoolCreated(event);
        totalEvents++;
      }
      
      // BetPlaced events
      const betPlacedEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.BetPlaced(),
        fromBlock,
        toBlock
      );
      
      for (const event of betPlacedEvents) {
        await this.handleBetPlaced(event);
        totalEvents++;
      }
      
      // LiquidityAdded events
      const liquidityAddedEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.LiquidityAdded(),
        fromBlock,
        toBlock
      );
      
      for (const event of liquidityAddedEvents) {
        await this.handleLiquidityAdded(event);
        totalEvents++;
      }
      
      // PoolSettled events
      const poolSettledEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.PoolSettled(),
        fromBlock,
        toBlock
      );
      
      for (const event of poolSettledEvents) {
        await this.handlePoolSettled(event);
        totalEvents++;
      }
      
      // RewardClaimed events
      const rewardClaimedEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.RewardClaimed(),
        fromBlock,
        toBlock
      );
      
      for (const event of rewardClaimedEvents) {
        await this.handleRewardClaimed(event);
        totalEvents++;
      }
      
      // PoolRefunded events
      const poolRefundedEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.PoolRefunded(),
        fromBlock,
        toBlock
      );
      
      for (const event of poolRefundedEvents) {
        await this.handlePoolRefunded(event);
        totalEvents++;
      }
      
      // ComboPoolCreated events
      const comboPoolCreatedEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.ComboPoolCreated(),
        fromBlock,
        toBlock
      );
      
      for (const event of comboPoolCreatedEvents) {
        await this.handleComboPoolCreated(event);
        totalEvents++;
      }
      
      // New enhanced events for stats tracking
      const poolFilledEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.PoolFilledAboveThreshold(),
        fromBlock,
        toBlock
      );
      
      for (const event of poolFilledEvents) {
        await this.handlePoolFilledAboveThreshold(event);
        totalEvents++;
      }
      
      const userBetEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.UserBetPlaced(),
        fromBlock,
        toBlock
      );
      
      for (const event of userBetEvents) {
        await this.handleUserBetPlaced(event);
        totalEvents++;
      }
      
      const userLiquidityEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.UserLiquidityAdded(),
        fromBlock,
        toBlock
      );
      
      for (const event of userLiquidityEvents) {
        await this.handleUserLiquidityAdded(event);
        totalEvents++;
      }
      
      const poolVolumeEvents = await this.queryEventsWithRetry(
        this.poolContract,
        this.poolContract.filters.PoolVolumeUpdated(),
        fromBlock,
        toBlock
      );
      
      for (const event of poolVolumeEvents) {
        await this.handlePoolVolumeUpdated(event);
        totalEvents++;
      }
      
      console.log(`✅ Processed ${totalEvents} pool events`);
      this.state.totalEvents += totalEvents;
      
      return totalEvents;
    } catch (error) {
      console.error('❌ Error processing pool events:', error);
      throw error;
    }
  }

  async queryEventsWithRetry(contract, filter, fromBlock, toBlock) {
    try {
      const events = await this.rpcManager.queryFilter(contract, filter, fromBlock, toBlock);
      return events;
    } catch (error) {
      console.error('❌ Event query failed:', error.message);
      throw error;
    }
  }

  async processOracleEvents(fromBlock, toBlock) {
    try {
      console.log(`🔮 Processing oracle events: ${fromBlock} to ${toBlock}`);
      
      const oracleEvents = await this.queryEventsWithRetry(
        this.oracleContract,
        this.oracleContract.filters.OutcomeSubmitted(),
        fromBlock,
        toBlock
      );
      
      for (const event of oracleEvents) {
        await this.handleOutcomeSubmitted(event);
        this.state.totalEvents++;
      }
      
      console.log(`✅ Processed ${oracleEvents.length} oracle events`);
      
      return oracleEvents.length;
    } catch (error) {
      console.error('❌ Error processing oracle events:', error);
      throw error;
    }
  }

  async processOddysseyEvents(fromBlock, toBlock) {
    try {
      console.log(`🎯 Processing Oddyssey events: ${fromBlock} to ${toBlock}`);
      
      let totalEvents = 0;
      
      // CycleStarted events
      const cycleStartedEvents = await this.queryEventsWithRetry(
        this.oddysseyContract,
        this.oddysseyContract.filters.CycleStarted(),
        fromBlock,
        toBlock
      );
      
      for (const event of cycleStartedEvents) {
        await this.handleCycleStarted(event);
        totalEvents++;
      }
      
      // SlipPlaced events
      const slipPlacedEvents = await this.queryEventsWithRetry(
        this.oddysseyContract,
        this.oddysseyContract.filters.SlipPlaced(),
        fromBlock,
        toBlock
      );
      
      for (const event of slipPlacedEvents) {
        await this.handleSlipPlaced(event);
        totalEvents++;
      }
      
      // CycleResolved events
      const cycleResolvedEvents = await this.queryEventsWithRetry(
        this.oddysseyContract,
        this.oddysseyContract.filters.CycleResolved(),
        fromBlock,
        toBlock
      );
      
      for (const event of cycleResolvedEvents) {
        await this.handleCycleResolved(event);
        totalEvents++;
      }
      
      // PrizeClaimed events
      const prizeClaimedEvents = await this.queryEventsWithRetry(
        this.oddysseyContract,
        this.oddysseyContract.filters.PrizeClaimed(),
        fromBlock,
        toBlock
      );
      
      for (const event of prizeClaimedEvents) {
        await this.handlePrizeClaimed(event);
        totalEvents++;
      }

      // SlipEvaluated events
      const slipEvaluatedEvents = await this.queryEventsWithRetry(
        this.oddysseyContract,
        this.oddysseyContract.filters.SlipEvaluated(),
        fromBlock,
        toBlock
      );
      
      for (const event of slipEvaluatedEvents) {
        await this.handleSlipEvaluated(event);
        totalEvents++;
      }

      // CycleEnded events
      const cycleEndedEvents = await this.queryEventsWithRetry(
        this.oddysseyContract,
        this.oddysseyContract.filters.CycleEnded(),
        fromBlock,
        toBlock
      );
      
      for (const event of cycleEndedEvents) {
        await this.handleCycleEnded(event);
        totalEvents++;
      }

      // LeaderboardUpdated events
      const leaderboardEvents = await this.queryEventsWithRetry(
        this.oddysseyContract,
        this.oddysseyContract.filters.LeaderboardUpdated(),
        fromBlock,
        toBlock
      );
      
      for (const event of leaderboardEvents) {
        await this.handleLeaderboardUpdated(event);
        totalEvents++;
      }

      // OddysseyReputationUpdated events
      const reputationEvents = await this.queryEventsWithRetry(
        this.oddysseyContract,
        this.oddysseyContract.filters.OddysseyReputationUpdated(),
        fromBlock,
        toBlock
      );
      
      for (const event of reputationEvents) {
        await this.handleOddysseyReputationUpdated(event);
        totalEvents++;
      }
      
      console.log(`✅ Processed ${totalEvents} Oddyssey events`);
      this.state.totalEvents += totalEvents;
      
      return totalEvents;
    } catch (error) {
      console.error('❌ Error processing Oddyssey events:', error);
      throw error;
    }
  }

  async processReputationEvents(fromBlock, toBlock) {
    try {
      console.log(`⭐ Processing reputation events: ${fromBlock} to ${toBlock}`);
      
      const reputationEvents = await this.queryEventsWithRetry(
        this.reputationContract,
        this.reputationContract.filters.ReputationUpdated(),
        fromBlock,
        toBlock
      );
      
      for (const event of reputationEvents) {
        await this.handleReputationUpdated(event);
        this.state.totalEvents++;
      }
      
      console.log(`✅ Processed ${reputationEvents.length} reputation events`);
      
      return reputationEvents.length;
    } catch (error) {
      console.error('❌ Error processing reputation events:', error);
      throw error;
    }
  }


  async handleError(error) {
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      console.error(`🚫 Too many consecutive errors (${this.consecutiveErrors}), attempting recovery...`);
      
      // Try switching RPC endpoint
      this.rpcManager.switchToNextProvider();
      this.consecutiveErrors = 0;
      
      // Wait before retrying
      await this.sleep(5000);
    } else {
      // Progressive delay based on consecutive errors
      const delay = Math.min(2000 * this.consecutiveErrors, 30000);
      console.log(`⏳ Waiting ${delay}ms before retry due to errors...`);
      await this.sleep(delay);
    }
  }

  // Event handlers (optimized for performance)
  async handlePoolCreated(event) {
    try {
      console.log(`✅ Processing PoolCreated: ${event.args.poolId}`);
      
      const db = require('./db/db');
      const TitleTemplatesService = require('./services/title-templates.js');
      const titleService = new TitleTemplatesService();
      
      const { poolId, creator, eventStartTime, eventEndTime, oracleType, marketId, marketType, league, category } = event.args;
      
      // FIXED: Fetch complete pool data from blockchain instead of using defaults
      console.log(`🔍 Fetching complete pool data from blockchain for pool ${poolId}...`);
      
      try {
        // Get the complete pool data from the contract
        // Note: Pool ID 1 = index 0, Pool ID 2 = index 1, etc.
        const poolIndex = parseInt(poolId.toString()) - 1;
        const poolData = await this.poolContract.pools(poolIndex);
        
        console.log(`📋 Complete pool data fetched:`);
        console.log(`   Predicted Outcome: ${poolData.predictedOutcome}`);
        console.log(`   Odds: ${Number(poolData.odds) / 100}`);
        console.log(`   Creator Stake: ${ethers.formatEther(poolData.creatorStake)} ${poolData.usesBitr ? 'BITR' : 'MON'}`);
        console.log(`   Uses BITR: ${poolData.usesBitr}`);
        console.log(`   League: ${poolData.league}`);
        console.log(`   Category: ${poolData.category}`);
        console.log(`   Region: ${poolData.region}`);
        console.log(`   Is Private: ${poolData.isPrivate}`);
        console.log(`   Max Bet Per User: ${ethers.formatEther(poolData.maxBetPerUser)}`);
        
        // ENHANCED: Get fixture mapping data for correct league and team information
        let fixtureLeague = null;
        let fixtureCategory = null;
        let fixtureRegion = null;
        let homeTeam = null;
        let awayTeam = null;
        let fixtureId = null;
        let readableOutcome = null;
        let betMarketType = null;
        let binarySelection = null;
        
        try {
          const fixtureResult = await db.query(`
            SELECT 
              league_name, category, region, home_team, away_team, fixture_id,
              predicted_outcome, readable_outcome, market_type, binary_selection
            FROM oracle.fixture_mappings 
            WHERE market_id_hash = $1
          `, [marketId]);
          
          if (fixtureResult.rows.length > 0) {
            const fixture = fixtureResult.rows[0];
            fixtureLeague = fixture.league_name;
            fixtureCategory = fixture.category;
            fixtureRegion = fixture.region;
            homeTeam = fixture.home_team;
            awayTeam = fixture.away_team;
            fixtureId = fixture.fixture_id;
            readableOutcome = fixture.predicted_outcome;
            betMarketType = fixture.market_type;
            binarySelection = fixture.binary_selection;
            
            console.log(`🏟️ Fixture mapping found:`);
            console.log(`   Home Team: ${homeTeam}`);
            console.log(`   Away Team: ${awayTeam}`);
            console.log(`   League: ${fixtureLeague}`);
            console.log(`   Readable Outcome: ${readableOutcome}`);
            console.log(`   Market Type: ${betMarketType}`);
            console.log(`   Binary Selection: ${binarySelection}`);
            console.log(`   Fixture ID: ${fixtureId}`);
            console.log(`   Market ID: ${marketId}`);
          }
        } catch (fixtureError) {
          console.warn(`Could not fetch fixture mapping for pool ${poolId}:`, fixtureError.message);
        }
        
        // ENHANCED: Decode predicted outcome if not available from fixture mapping
        if (!readableOutcome) {
          try {
            // Try to decode the predicted outcome hash
            const decodedOutcome = ethers.toUtf8String(poolData.predictedOutcome);
            if (decodedOutcome && decodedOutcome.trim() && !decodedOutcome.includes('\u0000')) {
              readableOutcome = decodedOutcome;
              console.log(`🔍 Decoded predicted outcome: ${readableOutcome}`);
            }
          } catch (decodeError) {
            console.warn(`Could not decode predicted outcome for pool ${poolId}:`, decodeError.message);
            readableOutcome = `Prediction ${poolId}`; // Fallback
          }
        }
        
        // ENHANCED: Create user-friendly title using title templates
        let title = readableOutcome;
        if (homeTeam && awayTeam && betMarketType) {
          title = titleService.generateTitle(betMarketType, homeTeam, awayTeam, readableOutcome, fixtureLeague);
          console.log(`📝 Generated title: ${title}`);
        } else if (homeTeam && awayTeam) {
          title = `Will ${homeTeam} vs ${awayTeam} be ${readableOutcome}?`;
        }
        
        // Insert pool into database with COMPLETE data from blockchain
        // All numeric columns now use NUMERIC(78,0) which can handle large numbers
        // Use fixture mapping data for league/category/region instead of contract data
        await db.query(`
          INSERT INTO oracle.pools (
            pool_id, creator_address, predicted_outcome, odds, creator_stake,
            market_id, oracle_type, event_start_time, event_end_time, 
            status, tx_hash, block_number, created_at,
            league, category, region, is_private, max_bet_per_user, use_bitr,
            total_creator_side_stake, max_bettor_stake, total_bettor_stake,
            betting_end_time, arbitration_deadline,
            home_team, away_team, fixture_id, readable_outcome, market_type, title,
            binary_selection
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11, NOW(), $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
          ON CONFLICT (pool_id) DO UPDATE SET
            predicted_outcome = EXCLUDED.predicted_outcome,
            odds = EXCLUDED.odds,
            creator_stake = EXCLUDED.creator_stake,
            league = EXCLUDED.league,
            category = EXCLUDED.category,
            region = EXCLUDED.region,
            is_private = EXCLUDED.is_private,
            max_bet_per_user = EXCLUDED.max_bet_per_user,
            use_bitr = EXCLUDED.use_bitr,
            total_creator_side_stake = EXCLUDED.total_creator_side_stake,
            max_bettor_stake = EXCLUDED.max_bettor_stake,
            betting_end_time = EXCLUDED.betting_end_time,
            arbitration_deadline = EXCLUDED.arbitration_deadline,
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            fixture_id = EXCLUDED.fixture_id,
            readable_outcome = EXCLUDED.readable_outcome,
            market_type = EXCLUDED.market_type,
            title = EXCLUDED.title,
            binary_selection = EXCLUDED.binary_selection,
            tx_hash = EXCLUDED.tx_hash,
            block_number = EXCLUDED.block_number,
            updated_at = NOW()
        `, [
          poolId.toString(),
          creator,
          poolData.predictedOutcome, // REAL predicted outcome from blockchain
          Number(poolData.odds),     // REAL odds from blockchain
          poolData.creatorStake.toString(), // REAL creator stake from blockchain
          marketId,
          parseInt(oracleType.toString()),
          eventStartTime.toString(),
          eventEndTime.toString(),
          event.transactionHash,
          event.blockNumber,
          fixtureLeague || poolData.league || null, // Use fixture league first, fallback to contract
          fixtureCategory || poolData.category || null, // Use fixture category first, fallback to contract
          fixtureRegion || poolData.region || null, // Use fixture region first, fallback to contract
          poolData.isPrivate,
          poolData.maxBetPerUser.toString(),
          poolData.usesBitr,
          poolData.totalCreatorSideStake.toString(),
          poolData.maxBettorStake.toString(),
          '0', // total_bettor_stake starts at 0
          (eventStartTime - 60).toString(), // betting_end_time = event_start_time - 60 seconds
          (eventEndTime + (24 * 60 * 60)).toString(), // arbitration_deadline = event_end_time + 24 hours
          homeTeam,
          awayTeam,
          fixtureId,
          readableOutcome,
          betMarketType,
          title,
          binarySelection
        ]);
        
        console.log(`✅ Pool ${poolId} indexed successfully with complete data`);
        console.log(`   Title: ${title}`);
        console.log(`   Readable Outcome: ${readableOutcome}`);
        console.log(`   Market Type: ${betMarketType}`);
        console.log(`   Teams: ${homeTeam} vs ${awayTeam}`);
        console.log(`   Fixture ID: ${fixtureId}`);
        console.log(`   Market ID: ${marketId}`);
        console.log(`   Binary Selection: ${binarySelection}`);
        
      } catch (poolDataError) {
        console.error(`❌ Error fetching pool data for pool ${poolId}:`, poolDataError);
        
        // Fallback: Insert with event data only
        await db.query(`
          INSERT INTO oracle.pools (
            pool_id, creator_address, market_id, oracle_type, event_start_time, event_end_time,
            status, tx_hash, block_number, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, NOW())
          ON CONFLICT (pool_id) DO NOTHING
        `, [
          poolId.toString(),
          creator,
          marketId,
          parseInt(oracleType.toString()),
          eventStartTime.toString(),
          eventEndTime.toString(),
          event.transactionHash,
          event.blockNumber
        ]);
        
        console.log(`⚠️ Pool ${poolId} indexed with fallback data only`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing PoolCreated event for pool ${event.args.poolId}:`, error);
      throw error;
    }
  }

  async handleBetPlaced(event) {
    try {
      const { poolId, bettor, amount, isForOutcome } = event.args;
      console.log(`✅ Processing BetPlaced: Pool ${poolId}, Bettor ${bettor}, Amount ${amount}`);
      
      // Store event
      await this.storeEvent(event, 'BetPlaced');
      
    } catch (error) {
      console.error('❌ Error handling BetPlaced:', error);
      throw error;
    }
  }

  async handlePoolSettled(event) {
    try {
      const { poolId, result, creatorSideWon, timestamp } = event.args;
      console.log(`✅ Processing PoolSettled: Pool ${poolId}, Result ${result}`);
      
      // Store event
      await this.storeEvent(event, 'PoolSettled');
      
    } catch (error) {
      console.error('❌ Error handling PoolSettled:', error);
      throw error;
    }
  }

  async handleOutcomeSubmitted(event) {
    try {
      const { marketId, outcome, submitter, timestamp } = event.args;
      console.log(`✅ Processing OutcomeSubmitted: Market ${marketId}, Outcome ${outcome}`);
      
      // Store event
      await this.storeEvent(event, 'OutcomeSubmitted');
      
    } catch (error) {
      console.error('❌ Error handling OutcomeSubmitted:', error);
      throw error;
    }
  }

  async handleSlipPlaced(event) {
    try {
      const { cycleId, player, slipId } = event.args;
      console.log(`✅ Processing SlipPlaced: Cycle ${cycleId}, Player ${player}, Slip ${slipId}`);
      
      // Store event
      await this.storeEvent(event, 'SlipPlaced');
      
    } catch (error) {
      console.error('❌ Error handling SlipPlaced:', error);
      throw error;
    }
  }

  async handleLiquidityAdded(event) {
    try {
      const { poolId, provider, amount } = event.args;
      console.log(`✅ Processing LiquidityAdded: Pool ${poolId}, Provider ${provider}, Amount ${amount}`);
      
      // Store event
      await this.storeEvent(event, 'LiquidityAdded');
      
    } catch (error) {
      console.error('❌ Error handling LiquidityAdded:', error);
      throw error;
    }
  }

  async handleRewardClaimed(event) {
    try {
      const { poolId, user, amount } = event.args;
      console.log(`✅ Processing RewardClaimed: Pool ${poolId}, User ${user}, Amount ${amount}`);
      
      // Store event
      await this.storeEvent(event, 'RewardClaimed');
      
    } catch (error) {
      console.error('❌ Error handling RewardClaimed:', error);
      throw error;
    }
  }

  async handlePoolRefunded(event) {
    try {
      const { poolId, reason } = event.args;
      console.log(`✅ Processing PoolRefunded: Pool ${poolId}, Reason ${reason}`);
      
      // Store event
      await this.storeEvent(event, 'PoolRefunded');
      
    } catch (error) {
      console.error('❌ Error handling PoolRefunded:', error);
      throw error;
    }
  }

  async handleComboPoolCreated(event) {
    try {
      const { comboPoolId, creator, conditionCount, totalOdds } = event.args;
      console.log(`✅ Processing ComboPoolCreated: Combo Pool ${comboPoolId}, Creator ${creator}`);
      
      // Store event
      await this.storeEvent(event, 'ComboPoolCreated');
      
    } catch (error) {
      console.error('❌ Error handling ComboPoolCreated:', error);
      throw error;
    }
  }

  async handleCycleStarted(event) {
    try {
      const { cycleId, endTime } = event.args;
      console.log(`✅ Processing CycleStarted: Cycle ${cycleId}, End Time ${endTime}`);
      
      // Store event
      await this.storeEvent(event, 'CycleStarted');
      
    } catch (error) {
      console.error('❌ Error handling CycleStarted:', error);
      throw error;
    }
  }

  async handleCycleResolved(event) {
    try {
      const { cycleId, prizePool } = event.args;
      console.log(`✅ Processing CycleResolved: Cycle ${cycleId}, Prize Pool ${prizePool}`);
      
      // Store event
      await this.storeEvent(event, 'CycleResolved');
      
    } catch (error) {
      console.error('❌ Error handling CycleResolved:', error);
      throw error;
    }
  }

  async handleSlipEvaluated(event) {
    try {
      const { slipId, player, cycleId, correctCount, finalScore } = event.args;
      console.log(`✅ Processing SlipEvaluated: Slip ${slipId}, Player ${player}, Correct: ${correctCount}, Score: ${finalScore}`);
      
      // Store the event
      await this.storeEvent(event, 'SlipEvaluated');
      
      // Update slip evaluation in database
      await this.db.query(`
        UPDATE oracle.oddyssey_slips 
        SET 
          correct_count = $1,
          final_score = $2,
          is_evaluated = true,
          evaluated_at = NOW()
        WHERE slip_id = $3
      `, [correctCount.toString(), finalScore.toString(), slipId.toString()]);
      
    } catch (error) {
      console.error('❌ Error handling SlipEvaluated:', error);
      throw error;
    }
  }

  async handleCycleEnded(event) {
    try {
      const { cycleId, endTime, totalSlips } = event.args;
      console.log(`✅ Processing CycleEnded: Cycle ${cycleId}, End Time ${endTime}, Total Slips: ${totalSlips}`);
      
      // Store the event
      await this.storeEvent(event, 'CycleEnded');
      
      // Update cycle status
      await this.db.query(`
        UPDATE oracle.oddyssey_cycles 
        SET 
          state = 'Ended',
          total_slips = $1,
          ended_at = to_timestamp($2)
        WHERE cycle_id = $3
      `, [totalSlips.toString(), endTime.toString(), cycleId.toString()]);
      
    } catch (error) {
      console.error('❌ Error handling CycleEnded:', error);
      throw error;
    }
  }

  async handleLeaderboardUpdated(event) {
    try {
      const { cycleId, player, slipId, rank, finalScore } = event.args;
      console.log(`✅ Processing LeaderboardUpdated: Cycle ${cycleId}, Player ${player}, Rank ${rank}`);
      
      // Store the event
      await this.storeEvent(event, 'LeaderboardUpdated');
      
      // Update leaderboard entry
      await this.db.query(`
        INSERT INTO oracle.oddyssey_leaderboard (
          cycle_id, player_address, slip_id, rank, final_score, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (cycle_id, rank) 
        DO UPDATE SET 
          player_address = EXCLUDED.player_address,
          slip_id = EXCLUDED.slip_id,
          final_score = EXCLUDED.final_score
      `, [cycleId.toString(), player, slipId.toString(), rank.toString(), finalScore.toString()]);
      
    } catch (error) {
      console.error('❌ Error handling LeaderboardUpdated:', error);
      throw error;
    }
  }

  async handleOddysseyReputationUpdated(event) {
    try {
      const { user, pointsEarned, correctPredictions, totalReputation } = event.args;
      console.log(`✅ Processing OddysseyReputationUpdated: User ${user}, Points: ${pointsEarned}, Total: ${totalReputation}`);
      
      // Store the event
      await this.storeEvent(event, 'OddysseyReputationUpdated');
      
      // Insert reputation action
      await this.db.query(`
        INSERT INTO core.reputation_actions (
          user_address, action_type, reputation_delta, associated_value,
          timestamp, block_number, transaction_hash, created_at
        ) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7, NOW())
      `, [
        user,
        'ODDYSSEY_PERFORMANCE',
        pointsEarned.toString(),
        `${correctPredictions} correct predictions`,
        event.blockNumber ? (await this.provider.getBlock(event.blockNumber)).timestamp : Math.floor(Date.now() / 1000),
        event.blockNumber || 0,
        event.transactionHash || ''
      ]);
      
      // Update user's total reputation
      await this.db.query(`
        UPDATE core.users 
        SET reputation = reputation + $1
        WHERE address = $2
      `, [pointsEarned.toString(), user]);
      
    } catch (error) {
      console.error('❌ Error handling OddysseyReputationUpdated:', error);
      throw error;
    }
  }

  async handlePrizeClaimed(event) {
    try {
      const { cycleId, player, rank, amount } = event.args;
      console.log(`✅ Processing PrizeClaimed: Cycle ${cycleId}, Player ${player}, Rank ${rank}`);
      
      // Store event
      await this.storeEvent(event, 'PrizeClaimed');
      
    } catch (error) {
      console.error('❌ Error handling PrizeClaimed:', error);
      throw error;
    }
  }

  async handleReputationUpdated(event) {
    try {
      const { user, newReputation, change, reason } = event.args;
      console.log(`✅ Processing ReputationUpdated: User ${user}, New Reputation ${newReputation}`);
      
      // Store event
      await this.storeEvent(event, 'ReputationUpdated');
      
    } catch (error) {
      console.error('❌ Error handling ReputationUpdated:', error);
      throw error;
    }
  }

  // New enhanced event handlers for stats tracking
  async handlePoolFilledAboveThreshold(event) {
    try {
      const { poolId, fillPercentage, timestamp } = event.args;
      console.log(`✅ Processing PoolFilledAboveThreshold: Pool ${poolId}, Fill ${fillPercentage}%`);
      
      const db = require('./db/db');
      
      // Update pool stats
      await db.query(`
        UPDATE oracle.pools 
        SET fill_percentage = $1, filled_above_threshold = true, updated_at = NOW()
        WHERE pool_id = $2
      `, [fillPercentage.toString(), poolId.toString()]);
      
      // Store event
      await this.storeEvent(event, 'PoolFilledAboveThreshold');
      
    } catch (error) {
      console.error('❌ Error handling PoolFilledAboveThreshold:', error);
      throw error;
    }
  }

  async handleUserBetPlaced(event) {
    try {
      const { poolId, user, amount, totalUserBets } = event.args;
      console.log(`✅ Processing UserBetPlaced: Pool ${poolId}, User ${user}, Amount ${ethers.formatEther(amount)}`);
      
      const db = require('./db/db');
      
      // Update user stats
      await db.query(`
        INSERT INTO oracle.user_stats (user_address, total_bets, total_bet_amount, last_activity)
        VALUES ($1, 1, $2, NOW())
        ON CONFLICT (user_address) DO UPDATE SET
          total_bets = oracle.user_stats.total_bets + 1,
          total_bet_amount = oracle.user_stats.total_bet_amount + $2,
          last_activity = NOW()
      `, [user, amount.toString()]);
      
      // Store event
      await this.storeEvent(event, 'UserBetPlaced');
      
    } catch (error) {
      console.error('❌ Error handling UserBetPlaced:', error);
      throw error;
    }
  }

  async handleUserLiquidityAdded(event) {
    try {
      const { poolId, user, amount, totalUserLiquidity } = event.args;
      console.log(`✅ Processing UserLiquidityAdded: Pool ${poolId}, User ${user}, Amount ${ethers.formatEther(amount)}`);
      
      const db = require('./db/db');
      
      // Update user stats
      await db.query(`
        INSERT INTO oracle.user_stats (user_address, total_liquidity, total_liquidity_amount, last_activity)
        VALUES ($1, 1, $2, NOW())
        ON CONFLICT (user_address) DO UPDATE SET
          total_liquidity = oracle.user_stats.total_liquidity + 1,
          total_liquidity_amount = oracle.user_stats.total_liquidity_amount + $2,
          last_activity = NOW()
      `, [user, amount.toString()]);
      
      // Store event
      await this.storeEvent(event, 'UserLiquidityAdded');
      
    } catch (error) {
      console.error('❌ Error handling UserLiquidityAdded:', error);
      throw error;
    }
  }

  async handlePoolVolumeUpdated(event) {
    try {
      const { poolId, totalVolume, participantCount } = event.args;
      console.log(`✅ Processing PoolVolumeUpdated: Pool ${poolId}, Volume ${ethers.formatEther(totalVolume)}, Participants ${participantCount}`);
      
      const db = require('./db/db');
      
      // Update pool volume stats
      await db.query(`
        UPDATE oracle.pools 
        SET total_volume = $1, participant_count = $2, updated_at = NOW()
        WHERE pool_id = $2
      `, [totalVolume.toString(), participantCount.toString(), poolId.toString()]);
      
      // Store event
      await this.storeEvent(event, 'PoolVolumeUpdated');
      
    } catch (error) {
      console.error('❌ Error handling PoolVolumeUpdated:', error);
      throw error;
    }
  }

  async storeEvent(event, eventType) {
    try {
      const db = require('./db/db');
      
      await db.query(`
        INSERT INTO oracle.blockchain_events (
          block_number, transaction_hash, log_index, event_type,
          contract_address, event_data, processed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (block_number, transaction_hash, log_index) DO NOTHING
      `, [
        event.blockNumber,
        event.transactionHash,
        event.logIndex,
        eventType,
        event.address,
        JSON.stringify(event.args, (key, value) => typeof value === 'bigint' ? value.toString() : value)
      ]);
      
    } catch (error) {
      console.error('❌ Error storing event:', error);
    }
  }

  async healthMonitor() {
    // Monad-optimized health monitoring (more frequent for fast blocks)
    setInterval(() => {
      const uptime = Date.now() - this.state.startTime;
      const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(2);
      
      console.log('📊 Optimized Indexer V3 Health Stats:');
      console.log(`⏱️  Uptime: ${uptimeHours} hours`);
      console.log(`🧱 Total blocks processed: ${this.state.totalBlocks}`);
      console.log(`📡 Total events indexed: ${this.state.totalEvents}`);
      console.log(`✅ Last indexed block: ${this.state.lastIndexedBlock}`);
      console.log(`❌ Consecutive errors: ${this.consecutiveErrors}`);
      console.log(`🔄 Is processing: ${this.isProcessing}`);
      console.log(`⚡ Blocks per second: ${this.performanceStats.blocksPerSecond.toFixed(2)}`);
      console.log(`📈 Average batch time: ${this.performanceStats.averageBatchTime.toFixed(0)}ms`);
      
      // Check for lag (adjusted for Monad's fast blocks)
      this.rpcManager.getBlockNumber().then(currentBlock => {
        const lag = currentBlock - this.state.lastIndexedBlock;
        if (lag > 500) { // Reduced threshold for Monad's 400ms blocks
          console.warn(`⚠️ Indexer lag detected: ${lag} blocks behind`);
        }
      });
      
    }, 30000); // Log every 30 seconds (more frequent for Monad)
  }

  async markBlocksIndexed(fromBlock, toBlock) {
    try {
      const db = require('./db/db');
      
      // Only save blocks if we found events or if this is a checkpoint block
      const blockRange = toBlock - fromBlock + 1;
      const checkpointInterval = 100; // Save every 100th block as checkpoint
      
      // Check if any blocks in this range should be saved as checkpoints
      const checkpointBlocks = [];
      for (let block = fromBlock; block <= toBlock; block++) {
        if (block % checkpointInterval === 0) {
          checkpointBlocks.push(block);
        }
      }
      
      // Save checkpoint blocks
      for (const block of checkpointBlocks) {
        await db.query(`
          INSERT INTO oracle.indexed_blocks (last_block, indexed_at)
          VALUES ($1, NOW())
          ON CONFLICT (id) DO UPDATE SET
            last_block = $1,
            indexed_at = NOW()
        `, [block]);
      }
      
      console.log(`💾 Saved ${checkpointBlocks.length} checkpoint blocks (${fromBlock}-${toBlock})`);
      
    } catch (error) {
      console.error('❌ Error marking blocks as indexed:', error);
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    console.log('🛑 Stopping Optimized Indexer V3...');
    this.isRunning = false;
    this.saveState();
  }
}

// Initialize and start indexer if run directly
if (require.main === module) {
  const indexer = new OptimizedIndexerV3();
  
  indexer.initialize()
    .then(() => indexer.start())
    .catch(error => {
      console.error('❌ Failed to start Optimized Indexer V3:', error);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGTERM', () => indexer.stop());
  process.on('SIGINT', () => indexer.stop());
}

module.exports = OptimizedIndexerV3;
