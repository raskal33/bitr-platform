const { ethers } = require('ethers');
const config = require('../config');

/**
 * Pool Settlement Service
 * Listens for oracle resolution events and automatically settles pools
 */
class PoolSettlementService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Try to load contract ABIs with multiple path attempts
    let BitrPoolABI, GuidedOracleABI;
    
    // Try multiple possible paths for BitrPool ABI
    const poolPaths = [
      './solidity/artifacts/contracts/BitrPool.sol/BitrPool.json',
      '../solidity/artifacts/contracts/BitrPool.sol/BitrPool.json',
      '../../solidity/artifacts/contracts/BitrPool.sol/BitrPool.json'
    ];
    
    BitrPoolABI = null;
    for (const path of poolPaths) {
      try {
        BitrPoolABI = require(path).abi;
        console.log(`✅ BitrPool ABI loaded successfully from: ${path}`);
        break;
      } catch (error) {
        // Continue to next path
      }
    }
    
    if (!BitrPoolABI) {
      console.warn('⚠️ BitrPool ABI not found in any path, using minimal ABI');
      BitrPoolABI = [
        'event MarketResolved(uint256 indexed marketId, string outcome)',
        'function resolveMarket(uint256 marketId, string outcome) external'
      ];
    }
    
    // Try multiple possible paths for GuidedOracle ABI
    const oraclePaths = [
      './solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
      '../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
      '../../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json'
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
        'event OutcomeSubmitted(uint256 indexed marketId, string resultData, uint256 timestamp)',
        'function submitOutcome(uint256 marketId, string resultData) external'
      ];
    }
    
    // Initialize contracts only if addresses are available
    if (config.blockchain.contractAddresses?.bitrPool) {
      this.poolContract = new ethers.Contract(
        config.blockchain.contractAddresses.bitrPool,
        BitrPoolABI,
        this.wallet
      );
    } else {
      console.warn('⚠️ BitrPool contract address not configured');
      this.poolContract = null;
    }
    
    if (config.blockchain.contractAddresses?.guidedOracle) {
      this.oracleContract = new ethers.Contract(
        config.blockchain.contractAddresses.guidedOracle,
        GuidedOracleABI,
        this.provider
      );
    } else {
      console.warn('⚠️ GuidedOracle contract address not configured');
      this.oracleContract = null;
    }
    
    this.isRunning = false;
    this.lastProcessedBlock = 0;
  }

  /**
   * Start the settlement service
   */
  async start() {
    if (this.isRunning) {
      console.log('Pool Settlement Service is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Pool Settlement Service...');

    try {
      // Check if contracts are available
      if (!this.oracleContract) {
        console.log('⚠️ Oracle contract not available, skipping event listening');
        console.log('✅ Pool Settlement Service started (limited functionality)');
        return;
      }

      // Get current block
      const currentBlock = await this.provider.getBlockNumber();
      this.lastProcessedBlock = currentBlock - 1000; // Start from 1000 blocks ago to catch recent events
      
      console.log(`Starting from block: ${this.lastProcessedBlock}`);
      console.log(`Current block: ${currentBlock}`);

      // Start listening for new events
      this.startEventListener();
      
      // Process any missed events
      await this.processHistoricalEvents();
      
      console.log('✅ Pool Settlement Service started successfully');
    } catch (error) {
      console.error('❌ Failed to start Pool Settlement Service:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the settlement service
   */
  async stop() {
    this.isRunning = false;
    
    // Remove all listeners if contract exists
    if (this.oracleContract) {
      this.oracleContract.removeAllListeners();
    }
    
    console.log('🛑 Pool Settlement Service stopped');
  }

  /**
   * Start listening for real-time events
   */
  startEventListener() {
    if (!this.oracleContract) {
      console.log('⚠️ Oracle contract not available, skipping event listener');
      return;
    }

    console.log('👂 Starting real-time event listener...');
    
    // Listen for OutcomeSubmitted events
    this.oracleContract.on('OutcomeSubmitted', async (marketId, resultData, timestamp, event) => {
      try {
        console.log(`\\n🎯 New OutcomeSubmitted event detected!`);
        console.log(`Market ID: ${marketId}`);
        console.log(`Block: ${event.blockNumber}`);
        
        await this.handleOutcomeSubmitted(marketId, resultData, event);
      } catch (error) {
        console.error('Error handling OutcomeSubmitted event:', error);
      }
    });
  }

  /**
   * Process historical events that might have been missed
   */
  async processHistoricalEvents() {
    if (!this.oracleContract) {
      console.log('⚠️ Oracle contract not available, skipping historical events processing');
      return;
    }

    try {
      console.log('🔍 Processing historical OutcomeSubmitted events...');
      
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(this.lastProcessedBlock, currentBlock - 1000); // Reduced to 1000 blocks max
      
      // Process in chunks of 500 blocks to avoid RPC limits
      const chunkSize = 100;
      let totalEvents = 0;
      
      for (let startBlock = fromBlock; startBlock < currentBlock; startBlock += chunkSize) {
        const endBlock = Math.min(startBlock + chunkSize - 1, currentBlock);
        
        try {
          console.log(`📦 Processing blocks ${startBlock} to ${endBlock}...`);
          
          // Query for OutcomeSubmitted events in this chunk
          const filter = this.oracleContract.filters.OutcomeSubmitted();
          const events = await this.oracleContract.queryFilter(filter, startBlock, endBlock);
          
          console.log(`Found ${events.length} events in blocks ${startBlock}-${endBlock}`);
          totalEvents += events.length;
          
          for (const event of events) {
            const { marketId, resultData } = event.args;
            console.log(`📋 Processing historical event - Market ID: ${marketId}`);
            await this.handleOutcomeSubmitted(marketId, resultData, event);
          }
          
          // Small delay to avoid overwhelming the RPC
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (chunkError) {
          console.error(`Error processing blocks ${startBlock}-${endBlock}:`, chunkError);
          // Continue with next chunk instead of failing completely
        }
      }
      
      console.log(`✅ Processed ${totalEvents} total historical events`);
      this.lastProcessedBlock = currentBlock;
      
    } catch (error) {
      console.error('Error processing historical events:', error);
    }
  }

  /**
   * Handle OutcomeSubmitted event and settle the corresponding pool
   * Works for both football and crypto markets
   */
  async handleOutcomeSubmitted(marketId, resultData, event) {
    try {
      console.log(`🔄 Handling outcome submission for market: ${marketId}`);
      
      // Find the pool ID associated with this market
      const poolId = await this.findPoolIdByMarketId(marketId);
      
      if (!poolId) {
        console.log(`⚠️ No pool found for market ID: ${marketId}`);
        return;
      }
      
      console.log(`📍 Found pool ID: ${poolId} for market: ${marketId}`);
      
      // Check if pool is already settled
      const pool = await this.poolContract.pools(poolId);
      if (pool.settled) {
        console.log(`✅ Pool ${poolId} is already settled, skipping`);
        return;
      }
      
      console.log(`🎯 Settling pool ${poolId}...`);
      
      // Try automatic settlement first (if supported by contract)
      try {
        const gasEstimate = await this.poolContract.settlePoolAutomatically.estimateGas(poolId);
        const tx = await this.poolContract.settlePoolAutomatically(poolId, {
          gasLimit: gasEstimate * 120n / 100n // 20% buffer
        });
        
        console.log(`📤 Automatic settlement transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Pool ${poolId} automatically settled in block ${receipt.blockNumber}`);
        
      } catch (autoError) {
        console.log(`⚠️ Automatic settlement failed, trying manual settlement...`);
        
        // Fall back to manual settlement with the result data
        try {
          // Decode the result from the oracle
          const decodedResult = ethers.toUtf8String(resultData);
          const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes(decodedResult));
          
          const gasEstimate = await this.poolContract.settlePool.estimateGas(poolId, outcomeHash);
          const tx = await this.poolContract.settlePool(poolId, outcomeHash, {
            gasLimit: gasEstimate * 120n / 100n // 20% buffer
          });
          
          console.log(`📤 Manual settlement transaction submitted: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`✅ Pool ${poolId} manually settled with outcome '${decodedResult}' in block ${receipt.blockNumber}`);
          
        } catch (manualError) {
          console.error(`❌ Both automatic and manual settlement failed for pool ${poolId}:`, manualError.message);
        }
      }
      
    } catch (error) {
      console.error(`❌ Error handling outcome submission:`, error);
    }
  }

  /**
   * Find pool ID by market ID
   * This searches through pools to find the one with matching market ID
   */
  async findPoolIdByMarketId(targetMarketId) {
    try {
      // Get total pool count
      const poolCount = await this.poolContract.poolCount();
      console.log(`🔍 Searching through ${poolCount} pools for market ID: ${targetMarketId}`);
      
      // Search through pools (start from recent ones)
      for (let i = Number(poolCount) - 1; i >= 0; i--) {
        try {
          const pool = await this.poolContract.pools(i);
          
          // Compare market IDs (both as hex strings)
          if (pool.marketId.toLowerCase() === targetMarketId.toLowerCase()) {
            console.log(`✅ Found matching pool ${i} for market ID: ${targetMarketId}`);
            return i;
          }
        } catch (error) {
          // Skip pools that can't be read
          continue;
        }
      }
      
      console.log(`❌ No pool found with market ID: ${targetMarketId}`);
      return null;
      
    } catch (error) {
      console.error('Error finding pool by market ID:', error);
      return null;
    }
  }
}

module.exports = PoolSettlementService;
