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
      console.log('✅ Enhanced indexer initialized successfully');
      
      // Log initial RPC status
      this.rpcManager.logStatus();
      
    } catch (error) {
      console.error('❌ Failed to initialize enhanced indexer:', error);
      throw error;
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
    
    if (this.lastIndexedBlock >= confirmationBlock) {
      return; // No new blocks to index
    }

    // Safety check: If gap is too large, start from a recent block
    const maxGap = 10000; // Maximum gap to process
    let fromBlock = this.lastIndexedBlock + 1;
    
    if (confirmationBlock - this.lastIndexedBlock > maxGap) {
      console.warn(`⚠️ Large gap detected (${confirmationBlock - this.lastIndexedBlock} blocks). Starting from recent block to avoid RPC issues.`);
      fromBlock = confirmationBlock - 1000; // Start from 1000 blocks ago
      this.lastIndexedBlock = fromBlock - 1;
    }

    // Process blocks in batches
    const toBlock = Math.min(fromBlock + config.indexer.batchSize - 1, confirmationBlock);
    
    console.log(`🔍 Indexing blocks ${fromBlock} to ${toBlock} (current: ${currentBlock})`);
    
    // Index events from all contracts
    await this.indexPoolEvents(fromBlock, toBlock);
    await this.indexOracleEvents(fromBlock, toBlock);
    await this.indexOddysseyEvents(fromBlock, toBlock);
    await this.indexReputationEvents(fromBlock, toBlock);
    
    // Update last indexed block
    await this.updateLastIndexedBlock(toBlock);
    this.lastIndexedBlock = toBlock;
    
    this.healthStats.totalBlocks += (toBlock - fromBlock + 1);
    this.healthStats.lastSuccessfulBlock = toBlock;
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
            const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
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
    // ... existing implementation
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
