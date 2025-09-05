const { ethers } = require('ethers');
const path = require('path');
const config = require('./config');
const RpcManager = require('./utils/rpc-manager');

// Try to load real deployed ABIs with multiple path attempts
let BitredictPoolABI, GuidedOracleABI;

// Try multiple possible paths for BitredictPool ABI (Docker container paths)
const poolPaths = [
  './solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json',
  '../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json',
  '../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json',
  path.join(__dirname, './solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json'),
  path.join(__dirname, '../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json'),
  path.join(__dirname, '../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json')
];

BitredictPoolABI = null;
for (const path of poolPaths) {
  try {
    BitredictPoolABI = require(path).abi;
    console.log(`✅ BitredictPool ABI loaded successfully from: ${path}`);
    break;
  } catch (error) {
    // Continue to next path
  }
}

if (!BitredictPoolABI) {
  console.warn('⚠️ BitredictPool ABI not found in any path, using minimal ABI');
  BitredictPoolABI = [
    "event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, uint8 oracleType, bytes32 indexed marketId)",
    "event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)",
    "event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp)",
    "event PoolRefunded(uint256 indexed poolId, string reason)"
  ];
}

// Try multiple possible paths for GuidedOracle ABI
const oraclePaths = [
  './solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
  '../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
  '../../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
  path.join(__dirname, './solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json'),
  path.join(__dirname, '../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json'),
  path.join(__dirname, '../../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json')
];

GuidedOracleABI = null;
for (const path of oraclePaths) {
  try {
    GuidedOracleABI = require(path).abi;
    console.log(`✅ GuidedOracle ABI loaded successfully from: ${path}`);
    break;
  } catch (error) {
    // Continue to next path
  }
}

if (!GuidedOracleABI) {
  console.warn('⚠️ GuidedOracle ABI not found in any path, using minimal ABI');
  GuidedOracleABI = [
    "event OutcomeSubmitted(bytes32 indexed marketId, bytes32 outcome, address indexed submitter, uint256 timestamp)"
  ];
}

class EnhancedBitredictIndexer {
  constructor() {
    // Initialize RPC Manager with Monad Testnet endpoints
    this.rpcManager = new RpcManager([
      'https://testnet-rpc.monad.xyz/',
      'https://frosty-summer-model.monad-testnet.quiknode.pro/bfedff2990828aad13692971d0dbed22de3c9783/'
    ], {
      maxRetries: 5,
      baseDelay: 2000,
      maxDelay: 60000,
      circuitBreakerThreshold: 3,
      circuitBreakerTimeout: 120000 // 2 minutes
    });
    
    this.isRunning = false;
    this.lastIndexedBlock = 0;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 10;
    
    // Use real deployed ABIs instead of manual definitions
    this.poolABI = BitredictPoolABI;
    this.oracleABI = GuidedOracleABI;
    
    // Oddyssey contract ABI for events
    this.oddysseyABI = [
      "event OracleSet(address indexed newOracle)",
      "event EntryFeeSet(uint256 indexed newFee)",
      "event CycleStarted(uint256 indexed cycleId, uint256 endTime)",
      "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)",
      "event CycleResolved(uint256 indexed cycleId, uint256 prizePool)",
      "event PrizeClaimed(uint256 indexed cycleId, address indexed player, uint256 rank, uint256 amount)",
      "event PrizeRollover(uint256 indexed fromCycleId, uint256 indexed toCycleId, uint256 amount)",
      "event UserPreferencesUpdated(address indexed user, bool autoEvaluate, bool autoClaim, bool notifications)",
      "event UserStatsUpdated(address indexed user, uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 winRate)",
      "event OddysseyReputationUpdated(address indexed user, uint256 pointsEarned, uint256 correctPredictions, uint256 totalReputation)"
    ];
    
    // ReputationSystem contract ABI for events
    this.reputationABI = [
      "event ReputationUpdated(address indexed user, uint256 oldReputation, uint256 newReputation)",
      "event UpdaterAuthorized(address indexed updater, bool authorized)",
      "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)"
    ];
    
    // Health monitoring
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
      console.log('🚀 Initializing Enhanced Bitredict Indexer...');
      
      // Test RPC connection
      const currentBlock = await this.rpcManager.getBlockNumber();
      console.log(`✅ RPC connection successful. Current block: ${currentBlock}`);
      
      // Initialize contracts with a temporary provider (will be replaced by RPC manager)
      const tempProvider = await this.rpcManager.getProvider();
      
      this.poolContract = new ethers.Contract(
        config.blockchain.contractAddresses.bitredictPool,
        this.poolABI,
        tempProvider
      );
      
      this.oracleContract = new ethers.Contract(
        config.blockchain.contractAddresses.guidedOracle,
        this.oracleABI,
        tempProvider
      );
      
      this.oddysseyContract = new ethers.Contract(
        config.blockchain.contractAddresses.oddyssey,
        this.oddysseyABI,
        tempProvider
      );
      
      this.reputationContract = new ethers.Contract(
        config.blockchain.contractAddresses.reputationSystem,
        this.reputationABI,
        tempProvider
      );
      
      // Get last indexed block from database
      const db = require('./db/db');
      const result = await db.query('SELECT MAX(block_number) as last_block FROM oracle.indexed_blocks');
      this.lastIndexedBlock = result.rows[0]?.last_block || 0;
      
      console.log(`📊 Starting from block: ${this.lastIndexedBlock}`);
      
      // Check for missing blocks and catch up if needed
      await this.catchUpMissingBlocks();
      
      console.log('✅ Enhanced indexer initialized successfully');
      
      // Log initial RPC status
      this.rpcManager.logStatus();
      
    } catch (error) {
      console.error('❌ Failed to initialize enhanced indexer:', error);
      throw error;
    }
  }

  async catchUpMissingBlocks() {
    try {
      console.log('🔍 Checking for missing blocks...');
      
      // Get all indexed blocks to find gaps
      const db = require('./db/db');
      const result = await db.query(`
        SELECT block_number 
        FROM oracle.indexed_blocks 
        WHERE block_number >= $1 
        ORDER BY block_number
      `, [Math.max(0, this.lastIndexedBlock - 1000)]); // Check last 1000 blocks
      
      const indexedBlocks = new Set(result.rows.map(row => parseInt(row.block_number)));
      const currentBlock = await this.rpcManager.getBlockNumber();
      
      // Find missing blocks
      const missingBlocks = [];
      for (let block = Math.max(0, this.lastIndexedBlock - 1000); block <= currentBlock; block++) {
        if (!indexedBlocks.has(block)) {
          missingBlocks.push(block);
        }
      }
      
      if (missingBlocks.length > 0) {
        console.log(`⚠️ Found ${missingBlocks.length} missing blocks, attempting to catch up...`);
        
        // Process missing blocks in chunks
        const chunkSize = 20;
        for (let i = 0; i < missingBlocks.length; i += chunkSize) {
          const chunk = missingBlocks.slice(i, i + chunkSize);
          const startBlock = Math.min(...chunk);
          const endBlock = Math.max(...chunk);
          
          console.log(`🔄 Catching up blocks ${startBlock} to ${endBlock}...`);
          
          try {
            await this.indexPoolEvents(startBlock, endBlock);
            await this.indexOracleEvents(startBlock, endBlock);
            await this.indexOddysseyEvents(startBlock, endBlock);
            await this.indexReputationEvents(startBlock, endBlock);
            
            // Mark blocks as indexed
            for (const block of chunk) {
              await this.updateLastIndexedBlock(block);
            }
            
            console.log(`✅ Caught up ${chunk.length} blocks`);
            
            // Small delay between chunks
            if (i + chunkSize < missingBlocks.length) {
              await this.sleep(500);
            }
            
          } catch (error) {
            console.error(`❌ Failed to catch up blocks ${startBlock} to ${endBlock}:`, error.message);
            // Continue with next chunk instead of stopping
          }
        }
        
        // Update last indexed block to the highest processed block
        const maxProcessedBlock = Math.max(...missingBlocks.filter(block => 
          indexedBlocks.has(block) || block <= this.lastIndexedBlock
        ));
        this.lastIndexedBlock = Math.max(this.lastIndexedBlock, maxProcessedBlock);
        
        console.log(`✅ Catch-up completed. Last indexed block: ${this.lastIndexedBlock}`);
      } else {
        console.log('✅ No missing blocks found');
      }
      
    } catch (error) {
      console.error('❌ Error during catch-up process:', error);
      // Don't throw - allow indexer to continue
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('Enhanced indexer is already running');
      return;
    }

    this.isRunning = true;
    this.healthStats.startTime = Date.now();
    console.log('🚀 Starting Enhanced Bitredict Indexer...');

    while (this.isRunning) {
      try {
        await this.indexNewBlocks();
        this.consecutiveErrors = 0; // Reset error count on success
        
        // Log health stats periodically
        if (Date.now() - this.healthStats.lastHealthLog > 300000) { // Every 5 minutes
          this.logHealthStats();
          this.rpcManager.logStatus();
          this.healthStats.lastHealthLog = Date.now();
        }
        
        await this.sleep(config.indexer.pollInterval);
        
      } catch (error) {
        this.consecutiveErrors++;
        this.healthStats.totalErrors++;
        
        console.error(`❌ Error during indexing (consecutive: ${this.consecutiveErrors}):`, error);
        
        // If too many consecutive errors, increase delay
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          console.error(`🚫 Too many consecutive errors (${this.consecutiveErrors}), stopping indexer`);
          this.stop();
          break;
        }
        
        // Progressive delay based on consecutive errors
        const delay = Math.min(5000 * this.consecutiveErrors, 60000);
        console.log(`⏳ Waiting ${delay}ms before retry due to errors...`);
        await this.sleep(delay);
      }
    }
  }

  async indexNewBlocks() {
    const currentBlock = await this.rpcManager.getBlockNumber();
    const confirmationBlock = currentBlock - config.indexer.confirmationBlocks;
    
    // FIXED APPROACH: Index all blocks from last indexed to confirmation block
    const fromBlock = this.lastIndexedBlock + 1;
    const toBlock = confirmationBlock;
    
    // Skip if we already processed this range
    if (fromBlock > toBlock) {
      return; // No new blocks to index
    }
    
    console.log(`🔍 Indexing blocks: ${fromBlock} to ${toBlock} (current: ${currentBlock})`);
    
    // Process blocks ONE BY ONE to ensure no blocks are missed
    let processedBlocks = 0;
    
    for (let block = fromBlock; block <= toBlock; block++) {
      try {
        console.log(`📦 Processing block ${block}...`);
        
        // Index events from all contracts for this single block
        await this.indexPoolEvents(block, block);
        await this.indexOracleEvents(block, block);
        await this.indexOddysseyEvents(block, block);
        await this.indexReputationEvents(block, block);
        
        // Update last indexed block for this block
        await this.updateLastIndexedBlock(block);
        this.lastIndexedBlock = block;
        
        processedBlocks++;
        this.healthStats.totalBlocks++;
        this.healthStats.lastSuccessfulBlock = block;
        
        // Small delay between blocks to avoid overwhelming RPC
        if (block < toBlock) {
          await this.sleep(50);
        }
        
      } catch (error) {
        console.error(`❌ Error processing block ${block}:`, error.message);
        // Continue with next block instead of stopping
        // Don't update lastIndexedBlock for failed blocks
      }
    }
    
    if (processedBlocks > 0) {
      console.log(`✅ Successfully processed ${processedBlocks} blocks`);
    }
  }

  async indexPoolEvents(fromBlock, toBlock) {
    try {
      console.log(`📊 Indexing pool events from block ${fromBlock} to ${toBlock}`);
      
      // Pool Created events
      if (this.poolContract.filters.PoolCreated) {
        try {
          const poolCreatedEvents = await this.rpcManager.queryFilter(
            this.poolContract,
            this.poolContract.filters.PoolCreated(),
            fromBlock,
            toBlock
          );

          for (const event of poolCreatedEvents) {
            await this.handlePoolCreated(event);
            this.healthStats.totalEvents++;
          }
        } catch (error) {
          if (error.message && error.message.includes('block range exceeds')) {
            console.warn(`⚠️ Block range too large for PoolCreated events, skipping`);
          } else {
            throw error; // Re-throw to be handled by RPC manager
          }
        }
      }
      
      // Bet Placed events
      if (this.poolContract.filters.BetPlaced) {
        try {
          const betPlacedEvents = await this.rpcManager.queryFilter(
            this.poolContract,
            this.poolContract.filters.BetPlaced(),
            fromBlock,
            toBlock
          );

          for (const event of betPlacedEvents) {
            // CRITICAL FIX: Check transaction success before processing event
            const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
            if (receipt && receipt.status === 1) {
              await this.handleBetPlaced(event);
              this.healthStats.totalEvents++;
            } else {
              console.warn(`⚠️ Skipping BetPlaced event from failed transaction: ${event.transactionHash}`);
            }
          }
        } catch (error) {
          if (error.message && error.message.includes('block range exceeds')) {
            console.warn(`⚠️ Block range too large for BetPlaced events, skipping`);
          } else {
            throw error; // Re-throw to be handled by RPC manager
          }
        }
      }

      // Pool Settled events
      if (this.poolContract.filters.PoolSettled) {
        try {
          const poolSettledEvents = await this.rpcManager.queryFilter(
            this.poolContract,
            this.poolContract.filters.PoolSettled(),
            fromBlock,
            toBlock
          );

          for (const event of poolSettledEvents) {
            // CRITICAL FIX: Check transaction success before processing event
            const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
            if (receipt && receipt.status === 1) {
              await this.handlePoolSettled(event);
              this.healthStats.totalEvents++;
            } else {
              console.warn(`⚠️ Skipping PoolSettled event from failed transaction: ${event.transactionHash}`);
            }
          }
        } catch (error) {
          if (error.message && error.message.includes('block range exceeds')) {
            console.warn(`⚠️ Block range too large for PoolSettled events, skipping`);
          } else {
            throw error;
          }
        }
      }

      // Pool Refunded events
      if (this.poolContract.filters.PoolRefunded) {
        try {
          const poolRefundedEvents = await this.rpcManager.queryFilter(
            this.poolContract,
            this.poolContract.filters.PoolRefunded(),
            fromBlock,
            toBlock
          );

          for (const event of poolRefundedEvents) {
            await this.handlePoolRefunded(event);
            this.healthStats.totalEvents++;
          }
        } catch (error) {
          if (error.message && error.message.includes('block range exceeds')) {
            console.warn(`⚠️ Block range too large for PoolRefunded events, skipping`);
          } else {
            throw error;
          }
        }
      }

    } catch (error) {
      console.error('❌ Error indexing pool events:', error);
      throw error; // Re-throw to trigger RPC failover
    }
  }

  async indexOracleEvents(fromBlock, toBlock) {
    try {
      console.log(`🔮 Indexing oracle events from block ${fromBlock} to ${toBlock}`);
      
      // Outcome Submitted events
      if (this.oracleContract.filters.OutcomeSubmitted) {
        try {
          const outcomeEvents = await this.rpcManager.queryFilter(
            this.oracleContract,
            this.oracleContract.filters.OutcomeSubmitted(),
            fromBlock,
            toBlock
          );

          for (const event of outcomeEvents) {
            // CRITICAL FIX: Check transaction success before processing event
            const receipt = await this.rpcManager.getTransactionReceipt(event.transactionHash);
            if (receipt && receipt.status === 1) {
              await this.handleOutcomeSubmitted(event);
              this.healthStats.totalEvents++;
            } else {
              console.warn(`⚠️ Skipping OutcomeSubmitted event from failed transaction: ${event.transactionHash}`);
            }
          }
        } catch (error) {
          if (error.message && error.message.includes('block range exceeds')) {
            console.warn(`⚠️ Block range too large for OutcomeSubmitted events, skipping`);
          } else {
            throw error;
          }
        }
      }

    } catch (error) {
      console.error('❌ Error indexing oracle events:', error);
      throw error;
    }
  }

  async indexOddysseyEvents(fromBlock, toBlock) {
    try {
      console.log(`🎯 Indexing Oddyssey events from block ${fromBlock} to ${toBlock}`);
      
      const eventTypes = [
        'CycleStarted', 'SlipPlaced', 'CycleResolved', 
        'PrizeClaimed', 'UserStatsUpdated'
      ];
      
      for (const eventType of eventTypes) {
        if (this.oddysseyContract.filters[eventType]) {
          try {
            const events = await this.rpcManager.queryFilter(
              this.oddysseyContract,
              this.oddysseyContract.filters[eventType](),
              fromBlock,
              toBlock
            );

            for (const event of events) {
              // CRITICAL FIX: Check transaction success before processing event
              const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
              if (receipt && receipt.status === 1) {
                await this.handleOddysseyEvent(event, eventType);
                this.healthStats.totalEvents++;
              } else {
                console.warn(`⚠️ Skipping ${eventType} event from failed transaction: ${event.transactionHash}`);
              }
            }
          } catch (error) {
            if (error.message && error.message.includes('block range exceeds')) {
              console.warn(`⚠️ Block range too large for ${eventType} events, skipping`);
            } else {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error indexing Oddyssey events:', error);
      throw error;
    }
  }

  async indexReputationEvents(fromBlock, toBlock) {
    try {
      console.log(`⭐ Indexing reputation events from block ${fromBlock} to ${toBlock}`);
      
      const eventTypes = ['ReputationUpdated', 'UpdaterAuthorized'];
      
      for (const eventType of eventTypes) {
        if (this.reputationContract.filters[eventType]) {
          try {
            const events = await this.rpcManager.queryFilter(
              this.reputationContract,
              this.reputationContract.filters[eventType](),
              fromBlock,
              toBlock
            );

            for (const event of events) {
              // CRITICAL FIX: Check transaction success before processing event
              const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
              if (receipt && receipt.status === 1) {
                await this.handleReputationEvent(event, eventType);
                this.healthStats.totalEvents++;
              } else {
                console.warn(`⚠️ Skipping ${eventType} event from failed transaction: ${event.transactionHash}`);
              }
            }
          } catch (error) {
            if (error.message && error.message.includes('block range exceeds')) {
              console.warn(`⚠️ Block range too large for ${eventType} events, skipping`);
            } else {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error indexing ReputationSystem events:', error);
      throw error;
    }
  }

  // Event handlers (keeping existing logic)
  async handlePoolCreated(event) {
    // ... existing implementation
  }

  async handleBetPlaced(event) {
    // ... existing implementation  
  }

  async handlePoolSettled(event) {
    // ... existing implementation
  }

  async handlePoolRefunded(event) {
    // ... existing implementation
  }

  async handleOutcomeSubmitted(event) {
    // ... existing implementation
  }

  async handleOddysseyEvent(event, eventType) {
    try {
      console.log(`🎯 Processing Oddyssey ${eventType} event:`, event.args);
      
      const db = require('./db/db');
      
      switch (eventType) {
        case 'SlipPlaced':
          await this.handleSlipPlaced(event);
          break;
        case 'CycleStarted':
          await this.handleCycleStarted(event);
          break;
        case 'CycleResolved':
          await this.handleCycleResolved(event);
          break;
        case 'PrizeClaimed':
          await this.handlePrizeClaimed(event);
          break;
        case 'UserStatsUpdated':
          await this.handleUserStatsUpdated(event);
          break;
        default:
          console.log(`⚠️ Unknown Oddyssey event type: ${eventType}`);
      }
    } catch (error) {
      console.error(`❌ Error handling Oddyssey ${eventType} event:`, error);
      throw error;
    }
  }

  async handleSlipPlaced(event) {
    try {
      const { cycleId, player, slipId } = event.args;
      const db = require('./db/db');
      
      console.log(`📝 Processing SlipPlaced: Cycle ${cycleId}, Player ${player}, Slip ${slipId}`);
      
      // Check if slip already exists
      const existingSlip = await db.query(
        'SELECT slip_id FROM oracle.oddyssey_slips WHERE slip_id = $1',
        [slipId.toString()]
      );
      
      if (existingSlip.rows.length > 0) {
        console.log(`⚠️ Slip ${slipId} already exists in database`);
        return;
      }
      
      // Get block timestamp
      const block = await this.rpcManager.getBlock(event.blockNumber);
      
      // Get slip data from contract
      const slipData = await this.oddysseyContract.getSlip(slipId);
      
      // Insert slip into database
      await db.query(`
        INSERT INTO oracle.oddyssey_slips (
          slip_id, 
          cycle_id, 
          player_address, 
          placed_at, 
          predictions,
          final_score,
          correct_count,
          is_evaluated,
          tx_hash,
          creator_address,
          transaction_hash,
          category,
          uses_bitr,
          creator_stake,
          odds,
          pool_id,
          notification_type,
          message,
          is_read
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $3, $9, 'oddyssey', FALSE, 0.5, 1.0, $1, 'slip_placed', 'Your Oddyssey slip has been placed successfully', FALSE)
      `, [
        slipId.toString(),
        cycleId.toString(),
        player,
        new Date(block.timestamp * 1000),
        JSON.stringify(slipData.predictions || [], (key, value) => typeof value === 'bigint' ? value.toString() : value),
        0, // final_score
        0, // correct_count
        false, // is_evaluated
        event.transactionHash
      ]);
      
      console.log(`✅ Successfully indexed slip ${slipId}`);
      
      // Store the event
      await db.query(`
        INSERT INTO oracle.blockchain_events (
          block_number, transaction_hash, log_index, event_type, 
          contract_address, event_data, processed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
      `, [
        event.blockNumber,
        event.transactionHash,
        event.logIndex,
        'SlipPlaced',
        event.address,
        JSON.stringify({ cycleId: cycleId.toString(), player, slipId: slipId.toString() }, (key, value) => typeof value === 'bigint' ? value.toString() : value)
      ]);
      
    } catch (error) {
      console.error(`❌ Error handling SlipPlaced event:`, error);
      throw error;
    }
  }

  async handleCycleStarted(event) {
    // TODO: Implement cycle started handling
    console.log(`🔄 Cycle started event:`, event.args);
  }

  async handleCycleResolved(event) {
    // TODO: Implement cycle resolved handling
    console.log(`🏁 Cycle resolved event:`, event.args);
  }

  async handlePrizeClaimed(event) {
    // TODO: Implement prize claimed handling
    console.log(`💰 Prize claimed event:`, event.args);
  }

  async handleUserStatsUpdated(event) {
    // TODO: Implement user stats updated handling
    console.log(`📊 User stats updated event:`, event.args);
  }

  async handleReputationEvent(event, eventType) {
    // ... existing implementation
  }

  async updateLastIndexedBlock(blockNumber) {
    const db = require('./db/db');
    await db.query(`
      INSERT INTO oracle.indexed_blocks (block_number, indexed_at)
      VALUES ($1, NOW())
      ON CONFLICT (block_number) DO UPDATE SET indexed_at = NOW()
    `, [blockNumber]);
  }

  logHealthStats() {
    const uptime = Date.now() - this.healthStats.startTime;
    const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(2);
    
    console.log('📊 Enhanced Indexer Health Stats:');
    console.log(`⏱️  Uptime: ${uptimeHours} hours`);
    console.log(`🧱 Blocks processed: ${this.healthStats.totalBlocks}`);
    console.log(`📡 Events indexed: ${this.healthStats.totalEvents}`);
    console.log(`❌ Total errors: ${this.healthStats.totalErrors}`);
    console.log(`🔄 Consecutive errors: ${this.consecutiveErrors}`);
    console.log(`✅ Last successful block: ${this.healthStats.lastSuccessfulBlock}`);
    
    if (this.healthStats.totalBlocks > 0) {
      const eventsPerBlock = (this.healthStats.totalEvents / this.healthStats.totalBlocks).toFixed(2);
      console.log(`📈 Average events per block: ${eventsPerBlock}`);
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    console.log('🛑 Stopping Enhanced Indexer...');
    this.isRunning = false;
    this.logHealthStats();
    this.rpcManager.logStatus();
  }
}

// Initialize and start indexer if run directly
if (require.main === module) {
  const indexer = new EnhancedBitredictIndexer();
  
  indexer.initialize()
    .then(() => indexer.start())
    .catch(error => {
      console.error('❌ Failed to start enhanced indexer:', error);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGTERM', () => indexer.stop());
  process.on('SIGINT', () => indexer.stop());
}

module.exports = EnhancedBitredictIndexer;
