const { ethers } = require('ethers');
const config = require('./config');

class AirdropIndexer {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.isRunning = false;
    this.lastIndexedBlock = 0;
    
    // Contract addresses (update with actual deployed addresses)
    this.bitrTokenAddress = config.blockchain.contractAddresses.bitrToken;
    this.stakingAddress = config.blockchain.contractAddresses.stakingContract;
    this.faucetAddress = config.blockchain.contractAddresses.bitrFaucet;
    this.poolAddress = config.blockchain.contractAddresses.bitredictPool;
    
    // BITR Token ABI (ERC20 + custom events)
    this.bitrTokenABI = [
      "event Transfer(address indexed from, address indexed to, uint256 value)",
      "event Approval(address indexed owner, address indexed spender, uint256 value)",
      "event FaucetClaim(address indexed user, uint256 amount, uint256 timestamp)",
      "function balanceOf(address account) view returns (uint256)",
      "function totalSupply() view returns (uint256)"
    ];
    
    // Staking Contract ABI
    this.stakingABI = [
      "event Staked(address indexed user, uint256 amount, uint8 tier, uint8 duration)",
      "event Claimed(address indexed user, uint256 bitrAmount)",
      "event Unstaked(address indexed user, uint256 amount)",
      "event RevenueClaimed(address indexed user, uint256 bitrAmount, uint256 sttAmount)",
      "function getUserStakes(address user) view returns (tuple(uint256 amount, uint256 startTime, uint8 tierId, uint8 durationOption, uint256 claimedRewardBITR, uint256 rewardDebtBITR, uint256 rewardDebtSTT)[])"
    ];
    
    // Pool Contract ABI (for BITR usage tracking)
    this.poolABI = [
      "event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, uint8 oracleType, bytes32 indexed marketId)",
      "event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)",
      "event PoolCreatedWithBITR(uint256 indexed poolId, address indexed creator, uint256 bitrAmount)",
      "event BetPlacedWithBITR(uint256 indexed poolId, address indexed bettor, uint256 bitrAmount, bool isForOutcome)"
    ];
    
    // Initialize contracts
    this.bitrContract = new ethers.Contract(this.bitrTokenAddress, this.bitrTokenABI, this.provider);
    this.stakingContract = new ethers.Contract(this.stakingAddress, this.stakingABI, this.provider);
    this.poolContract = new ethers.Contract(this.poolAddress, this.poolABI, this.provider);
    
    console.log('AirdropIndexer initialized');
  }

  async initializeDatabase() {
    try {
      const db = require('./db/db');
      console.log('Initializing airdrop database schema...');
      
      // Read and execute the airdrop schema file
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.join(__dirname, 'db', 'airdrop_schema.sql');
      
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await db.query(schema);
        console.log('✅ Airdrop database schema initialized');
      }
    } catch (error) {
      console.error('Error initializing database:', error);
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('Airdrop indexer already running');
      return;
    }

    console.log('Starting airdrop indexer...');
    this.isRunning = true;
    
    try {
      await this.loadLastIndexedBlock();
      
      // Start the indexing loop
      await this.indexLoop();
    } catch (error) {
      console.error('Error starting airdrop indexer:', error);
      this.isRunning = false;
      
      // Restart after delay
      setTimeout(() => {
        console.log('Restarting airdrop indexer...');
        this.start();
      }, 30000); // 30 second delay
    }
  }

  async stop() {
    console.log('Stopping airdrop indexer...');
    this.isRunning = false;
  }

  async loadLastIndexedBlock() {
    try {
      const db = require('./db/db');
      const result = await db.query(`
        SELECT block_number 
        FROM airdrop.bitr_activities 
        ORDER BY block_number DESC 
        LIMIT 1
      `);
      
      if (result.rows.length > 0) {
        this.lastIndexedBlock = parseInt(result.rows[0].block_number);
      } else {
        // Start from contract deployment block or recent block
        this.lastIndexedBlock = config.contracts.deploymentBlock || await this.provider.getBlockNumber() - 1000;
      }
      
      console.log(`Starting airdrop indexing from block ${this.lastIndexedBlock}`);
          } catch (error) {
        console.error('Error loading last indexed block:', error);
        // Initialize database if tables don't exist
        await this.initializeDatabase();
        this.lastIndexedBlock = await this.provider.getBlockNumber() - 1000;
      }
  }

  async indexLoop() {
    while (this.isRunning) {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        const confirmationBlocks = config.indexer.confirmationBlocks || 3;
        const toBlock = currentBlock - confirmationBlocks;
        
        if (this.lastIndexedBlock < toBlock) {
          const batchSize = config.indexer.batchSize || 100;
          const endBlock = Math.min(this.lastIndexedBlock + batchSize, toBlock);
          
          console.log(`Indexing airdrop events: blocks ${this.lastIndexedBlock + 1} to ${endBlock}`);
          
          await this.indexBITREvents(this.lastIndexedBlock + 1, endBlock);
          await this.indexStakingEvents(this.lastIndexedBlock + 1, endBlock);
          await this.indexFaucetEvents(this.lastIndexedBlock + 1, endBlock);
          await this.indexPoolBITREvents(this.lastIndexedBlock + 1, endBlock);
          
          // Update eligibility for affected users
          await this.updateEligibilityCalculations();
          
          this.lastIndexedBlock = endBlock;
        }
        
        // Wait before next iteration
        await new Promise(resolve => setTimeout(resolve, config.indexer.pollInterval || 5000));
        
      } catch (error) {
        console.error('Error in airdrop indexing loop:', error);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s on error
      }
    }
  }

  async indexBITREvents(fromBlock, toBlock) {
    try {
      // Track all BITR transfers
      const transferEvents = await this.bitrContract.queryFilter(
        this.bitrContract.filters.Transfer(),
        fromBlock,
        toBlock
      );

      for (const event of transferEvents) {
        // CRITICAL FIX: Check transaction success before processing event
        const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
        if (receipt && receipt.status === 1) {
          await this.handleBITRTransfer(event);
        } else {
          console.warn(`⚠️ Skipping BITR Transfer event from failed transaction: ${event.transactionHash}`);
        }
      }

      console.log(`Indexed ${transferEvents.length} BITR transfer events`);
      
    } catch (error) {
      console.error('Error indexing BITR events:', error);
    }
  }

  async indexStakingEvents(fromBlock, toBlock) {
    try {
      // Staking events
      const stakedEvents = await this.stakingContract.queryFilter(
        this.stakingContract.filters.Staked(),
        fromBlock,
        toBlock
      );

      for (const event of stakedEvents) {
        // CRITICAL FIX: Check transaction success before processing event
        const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
        if (receipt && receipt.status === 1) {
          await this.handleStaking(event);
        } else {
          console.warn(`⚠️ Skipping Staked event from failed transaction: ${event.transactionHash}`);
        }
      }

      // Unstaking events
      const unstakedEvents = await this.stakingContract.queryFilter(
        this.stakingContract.filters.Unstaked(),
        fromBlock,
        toBlock
      );

      for (const event of unstakedEvents) {
        // CRITICAL FIX: Check transaction success before processing event
        const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
        if (receipt && receipt.status === 1) {
          await this.handleUnstaking(event);
        } else {
          console.warn(`⚠️ Skipping Unstaked event from failed transaction: ${event.transactionHash}`);
        }
      }

      // Reward claim events
      const claimedEvents = await this.stakingContract.queryFilter(
        this.stakingContract.filters.Claimed(),
        fromBlock,
        toBlock
      );

      for (const event of claimedEvents) {
        // CRITICAL FIX: Check transaction success before processing event
        const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
        if (receipt && receipt.status === 1) {
          await this.handleStakingRewardClaim(event);
        } else {
          console.warn(`⚠️ Skipping Claimed event from failed transaction: ${event.transactionHash}`);
        }
      }

      console.log(`Indexed ${stakedEvents.length + unstakedEvents.length + claimedEvents.length} staking events`);
      
    } catch (error) {
      console.error('Error indexing staking events:', error);
    }
  }

  async indexFaucetEvents(fromBlock, toBlock) {
    try {
      // Faucet claim events (might be Transfer events from faucet address)
      const faucetTransfers = await this.bitrContract.queryFilter(
        this.bitrContract.filters.Transfer(this.faucetAddress, null),
        fromBlock,
        toBlock
      );

      for (const event of faucetTransfers) {
        // CRITICAL FIX: Check transaction success before processing event
        const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
        if (receipt && receipt.status === 1) {
          await this.handleFaucetClaim(event);
        } else {
          console.warn(`⚠️ Skipping Faucet Transfer event from failed transaction: ${event.transactionHash}`);
        }
      }

      console.log(`Indexed ${faucetTransfers.length} faucet claim events`);
      
    } catch (error) {
      console.error('Error indexing faucet events:', error);
    }
  }

  async indexPoolBITREvents(fromBlock, toBlock) {
    try {
      // Pool creation with BITR (if such events exist)
      const poolBITREvents = await this.poolContract.queryFilter(
        this.poolContract.filters.PoolCreatedWithBITR?.() || this.poolContract.filters.PoolCreated(),
        fromBlock,
        toBlock
      );

      for (const event of poolBITREvents) {
        // CRITICAL FIX: Check transaction success before processing event
        const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
        if (receipt && receipt.status === 1) {
          await this.handlePoolBITRActivity(event, 'POOL_CREATE');
        } else {
          console.warn(`⚠️ Skipping Pool BITR event from failed transaction: ${event.transactionHash}`);
        }
      }

      // Betting with BITR (if such events exist)
      const betBITREvents = await this.poolContract.queryFilter(
        this.poolContract.filters.BetPlacedWithBITR?.() || this.poolContract.filters.BetPlaced(),
        fromBlock,
        toBlock
      );

      for (const event of betBITREvents) {
        // CRITICAL FIX: Check transaction success before processing event
        const receipt = await this.provider.getTransactionReceipt(event.transactionHash);
        if (receipt && receipt.status === 1) {
          await this.handlePoolBITRActivity(event, 'BET_PLACE');
        } else {
          console.warn(`⚠️ Skipping Bet BITR event from failed transaction: ${event.transactionHash}`);
        }
      }

      console.log(`Indexed ${poolBITREvents.length + betBITREvents.length} pool BITR events`);
      
    } catch (error) {
      console.error('Error indexing pool BITR events:', error);
    }
  }

  // Event handlers

  async handleBITRTransfer(event) {
    const { from, to, value } = event.args;
    const block = await event.getBlock();
    
    try {
      const db = require('./db/db');
      
      // Skip minting/burning events (from/to zero address)
      if (from === ethers.ZeroAddress || to === ethers.ZeroAddress) {
        return;
      }
      
      // Record transfer pattern for Sybil detection
      await db.query(`
        INSERT INTO airdrop.transfer_patterns 
        (from_address, to_address, amount, transaction_hash, block_number, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        from,
        to,
        value.toString(),
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);

      // Record outgoing transfer activity
      await db.query(`
        INSERT INTO airdrop.bitr_activities 
        (user_address, activity_type, amount, from_address, to_address, transaction_hash, block_number, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        from,
        'TRANSFER_OUT',
        value.toString(),
        from,
        to,
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);

      // Record incoming transfer activity
      await db.query(`
        INSERT INTO airdrop.bitr_activities 
        (user_address, activity_type, amount, from_address, to_address, transaction_hash, block_number, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        to,
        'TRANSFER_IN',
        value.toString(),
        from,
        to,
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);

      console.log(`BITR transfer: ${from} -> ${to}: ${ethers.formatEther(value)} BITR`);
      
    } catch (error) {
      console.error('Error handling BITR transfer:', error);
    }
  }

  async handleFaucetClaim(event) {
    const { from, to, value } = event.args;
    const block = await event.getBlock();
    
    // Only process if from faucet address
    if (from !== this.faucetAddress) {
      return;
    }
    
    try {
      const db = require('./db/db');
      
      // Check if user had STT activity before faucet claim
      const sttActivityCheck = await db.query(`
        SELECT EXISTS(
          SELECT 1 FROM prediction.bets WHERE user_address = $1 AND created_at < $2
          UNION
          SELECT 1 FROM prediction.pools WHERE creator_address = $1 AND creation_time < $2
        ) as had_activity
      `, [to, new Date(block.timestamp * 1000)]);
      
      const hadSTTActivity = sttActivityCheck.rows[0].had_activity;
      
      // Record faucet claim
      await db.query(`
        INSERT INTO airdrop.faucet_claims 
        (user_address, amount, claimed_at, block_number, transaction_hash, had_stt_activity)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_address) DO NOTHING
      `, [
        to,
        value.toString(),
        new Date(block.timestamp * 1000),
        event.blockNumber,
        event.transactionHash,
        hadSTTActivity
      ]);

      // Update statistics
      await this.updateStatistic('total_faucet_claims', 1, true);
      await this.updateStatistic('total_bitr_distributed_faucet', parseFloat(ethers.formatEther(value)), true);

      console.log(`Faucet claim: ${to} claimed ${ethers.formatEther(value)} BITR (had STT activity: ${hadSTTActivity})`);
      
    } catch (error) {
      console.error('Error handling faucet claim:', error);
    }
  }

  async handleStaking(event) {
    const { user, amount, tier, duration } = event.args;
    const block = await event.getBlock();
    
    try {
      const db = require('./db/db');
      
      // Record staking activity
      await db.query(`
        INSERT INTO airdrop.staking_activities 
        (user_address, action_type, amount, tier_id, duration_option, transaction_hash, block_number, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        user,
        'STAKE',
        amount.toString(),
        parseInt(tier),
        parseInt(duration),
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);

      // Record as BITR activity
      await db.query(`
        INSERT INTO airdrop.bitr_activities 
        (user_address, activity_type, amount, transaction_hash, block_number, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        user,
        'STAKING',
        amount.toString(),
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);

      console.log(`Staking: ${user} staked ${ethers.formatEther(amount)} BITR (tier: ${tier}, duration: ${duration})`);
      
    } catch (error) {
      console.error('Error handling staking:', error);
    }
  }

  async handleUnstaking(event) {
    const { user, amount } = event.args;
    const block = await event.getBlock();
    
    try {
      const db = require('./db/db');
      
      // Record unstaking activity
      await db.query(`
        INSERT INTO airdrop.staking_activities 
        (user_address, action_type, amount, transaction_hash, block_number, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        user,
        'UNSTAKE',
        amount.toString(),
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);

      console.log(`Unstaking: ${user} unstaked ${ethers.formatEther(amount)} BITR`);
      
    } catch (error) {
      console.error('Error handling unstaking:', error);
    }
  }

  async handleStakingRewardClaim(event) {
    const { user, bitrAmount } = event.args;
    const block = await event.getBlock();
    
    try {
      const db = require('./db/db');
      
      // Record reward claim activity
      await db.query(`
        INSERT INTO airdrop.staking_activities 
        (user_address, action_type, amount, transaction_hash, block_number, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        user,
        'CLAIM_REWARDS',
        bitrAmount.toString(),
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);

      console.log(`Staking reward claim: ${user} claimed ${ethers.formatEther(bitrAmount)} BITR`);
      
    } catch (error) {
      console.error('Error handling staking reward claim:', error);
    }
  }

  async handlePoolBITRActivity(event, activityType) {
    // This would need to be customized based on your actual pool contract events
    const block = await event.getBlock();
    let user, amount, poolId;

    if (activityType === 'POOL_CREATE') {
      user = event.args.creator;
      amount = event.args.bitrAmount || 0;
      poolId = event.args.poolId;
    } else if (activityType === 'BET_PLACE') {
      user = event.args.bettor;
      amount = event.args.bitrAmount || event.args.amount;
      poolId = event.args.poolId;
    }

    try {
      const db = require('./db/db');
      
      // Record pool BITR activity
      await db.query(`
        INSERT INTO airdrop.bitr_activities 
        (user_address, activity_type, amount, pool_id, transaction_hash, block_number, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        user,
        activityType,
        amount.toString(),
        poolId.toString(),
        event.transactionHash,
        event.blockNumber,
        new Date(block.timestamp * 1000)
      ]);

      console.log(`Pool BITR activity: ${user} ${activityType} with ${ethers.formatEther(amount)} BITR on pool ${poolId}`);
      
    } catch (error) {
      console.error('Error handling pool BITR activity:', error);
    }
  }

  // Eligibility calculation

  async updateEligibilityCalculations() {
    try {
      const db = require('./db/db');
      
      console.log('Updating airdrop eligibility calculations...');
      
      // Get all wallets that have claimed from faucet
      const faucetClaimers = await db.query(`
        SELECT user_address, claimed_at, had_stt_activity 
        FROM airdrop.faucet_claims
      `);

      for (const claimer of faucetClaimers.rows) {
        await this.calculateUserEligibility(claimer.user_address, claimer.claimed_at, claimer.had_stt_activity);
      }

      // Update summary statistics
      await this.updateSummaryStatistics();
      
      console.log(`Updated eligibility for ${faucetClaimers.rows.length} users`);
      
    } catch (error) {
      console.error('Error updating eligibility calculations:', error);
    }
  }

  async calculateUserEligibility(userAddress, faucetClaimDate, hadSTTActivity) {
    try {
      const db = require('./db/db');
      
      // Count BITR actions (pool creation and betting) after faucet claim
      const bitrActionsResult = await db.query(`
        SELECT COUNT(*) as action_count
        FROM airdrop.bitr_activities
        WHERE user_address = $1 
        AND activity_type IN ('POOL_CREATE', 'BET_PLACE')
        AND timestamp > $2
      `, [userAddress, faucetClaimDate]);
      
      const bitrActionCount = parseInt(bitrActionsResult.rows[0].action_count);

      // Check if user has staking activity
      const stakingResult = await db.query(`
        SELECT EXISTS(
          SELECT 1 FROM airdrop.staking_activities
          WHERE user_address = $1 AND action_type = 'STAKE'
        ) as has_staking
      `, [userAddress]);
      
      const hasStakingActivity = stakingResult.rows[0].has_staking;

      // Count Oddyssey slips
      const oddysseyResult = await db.query(`
        SELECT COUNT(*) as slip_count
        FROM oddyssey.slips
        WHERE user_address = $1
      `, [userAddress]);
      
      const oddysseySlipCount = parseInt(oddysseyResult.rows[0].slip_count);

      // Check for suspicious transfers
      const suspiciousTransfersResult = await db.query(`
        SELECT EXISTS(
          SELECT 1 FROM airdrop.transfer_patterns
          WHERE (from_address = $1 OR to_address = $1) AND is_suspicious = TRUE
        ) as has_suspicious
      `, [userAddress]);
      
      const hasSuspiciousTransfers = suspiciousTransfersResult.rows[0].has_suspicious;

      // Check if user only received BITR via transfers without activity
      const transferOnlyResult = await db.query(`
        SELECT 
          EXISTS(SELECT 1 FROM airdrop.bitr_activities WHERE user_address = $1 AND activity_type = 'TRANSFER_IN') as has_incoming,
          EXISTS(SELECT 1 FROM airdrop.bitr_activities WHERE user_address = $1 AND activity_type NOT IN ('TRANSFER_IN', 'TRANSFER_OUT')) as has_activity
      `, [userAddress]);
      
      const hasIncoming = transferOnlyResult.rows[0].has_incoming;
      const hasActivity = transferOnlyResult.rows[0].has_activity;
      const isTransferOnlyRecipient = hasIncoming && !hasActivity;

      // Calculate final eligibility
      const isEligible = 
        hadSTTActivity &&                    // Had MON activity before faucet
        bitrActionCount >= 30 &&             // At least 30 BITR actions
        hasStakingActivity &&                // Has staking activity
        oddysseySlipCount >= 10 &&           // At least 10 Oddyssey slips
        !hasSuspiciousTransfers &&           // No suspicious transfers
        !isTransferOnlyRecipient;            // Not a transfer-only recipient

      // Check for consolidation patterns (multiple wallets sending to one address)
      const consolidationResult = await db.query(`
        SELECT COUNT(DISTINCT from_address) as sender_count
        FROM airdrop.transfer_patterns
        WHERE to_address = $1 AND amount > 0
      `, [userAddress]);
      
      const consolidationDetected = parseInt(consolidationResult.rows[0].sender_count) >= 3; // 3+ different senders

      // Update final eligibility calculation to include consolidation detection
      const finalIsEligible = 
        hadSTTActivity &&                    // Had MON activity before faucet
        bitrActionCount >= 30 &&             // At least 30 BITR actions
        hasStakingActivity &&                // Has staking activity
        oddysseySlipCount >= 10 &&           // At least 10 Oddyssey slips
        !hasSuspiciousTransfers &&           // No suspicious transfers
        !isTransferOnlyRecipient &&          // Not a transfer-only recipient
        !consolidationDetected;              // No consolidation patterns

      // Update or insert eligibility record
      await db.query(`
        INSERT INTO airdrop.eligibility 
        (user_address, has_faucet_claim, faucet_claim_date, has_stt_activity_before_faucet, 
         bitr_action_count, has_staking_activity, oddyssey_slip_count, has_suspicious_transfers,
         is_transfer_only_recipient, consolidation_detected, is_eligible, eligibility_updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (user_address) DO UPDATE SET
          has_faucet_claim = $2,
          faucet_claim_date = $3,
          has_stt_activity_before_faucet = $4,
          bitr_action_count = $5,
          has_staking_activity = $6,
          oddyssey_slip_count = $7,
          has_suspicious_transfers = $8,
          is_transfer_only_recipient = $9,
          consolidation_detected = $10,
          is_eligible = $11,
          eligibility_updated_at = NOW(),
          updated_at = NOW()
      `, [
        userAddress,
        true,
        faucetClaimDate,
        hadSTTActivity,
        bitrActionCount,
        hasStakingActivity,
        oddysseySlipCount,
        hasSuspiciousTransfers,
        isTransferOnlyRecipient,
        consolidationDetected,
        finalIsEligible
      ]);

      if (finalIsEligible) {
        console.log(`✅ ${userAddress} is ELIGIBLE (${bitrActionCount} BITR actions, ${oddysseySlipCount} Oddyssey slips)`);
      } else {
        console.log(`❌ ${userAddress} is NOT eligible (BITR: ${bitrActionCount}/30, Staking: ${hasStakingActivity}, Oddyssey: ${oddysseySlipCount}/10, MON: ${hadSTTActivity}, Consolidation: ${consolidationDetected})`);
      }
      
    } catch (error) {
      console.error(`Error calculating eligibility for ${userAddress}:`, error);
    }
  }

  // Snapshot functionality

  async takeSnapshot(snapshotName = `snapshot_${Date.now()}`) {
    try {
      const db = require('./db/db');
      const currentBlock = await this.provider.getBlockNumber();
      
      console.log(`Taking airdrop snapshot: ${snapshotName} at block ${currentBlock}`);
      
      // Create snapshot record
      const snapshotResult = await db.query(`
        INSERT INTO airdrop.snapshots (snapshot_name, snapshot_block, snapshot_timestamp)
        VALUES ($1, $2, NOW())
        RETURNING id
      `, [snapshotName, currentBlock]);
      
      const snapshotId = snapshotResult.rows[0].id;
      
      // Get all eligible users
      const eligibleUsers = await db.query(`
        SELECT user_address FROM airdrop.eligibility WHERE is_eligible = TRUE
      `);
      
      let totalEligibleBITR = BigInt(0);
      const airdropTotal = BigInt('5000000000000000000000000'); // 5M BITR
      
      // Get BITR balances for all eligible users
      for (const user of eligibleUsers.rows) {
        try {
          const balance = await this.bitrContract.balanceOf(user.user_address);
          const balanceStr = balance.toString();
          totalEligibleBITR += balance;
          
          // Store snapshot balance
          await db.query(`
            INSERT INTO airdrop.snapshot_balances 
            (snapshot_id, user_address, bitr_balance, is_eligible)
            VALUES ($1, $2, $3, TRUE)
          `, [snapshotId, user.user_address, balanceStr]);
          
        } catch (error) {
          console.error(`Error getting balance for ${user.user_address}:`, error);
        }
      }
      
      // Calculate proportional airdrop amounts
      if (totalEligibleBITR > 0) {
        const balances = await db.query(`
          SELECT user_address, bitr_balance 
          FROM airdrop.snapshot_balances 
          WHERE snapshot_id = $1
        `, [snapshotId]);
        
        for (const balance of balances.rows) {
          const userBalance = BigInt(balance.bitr_balance);
          const airdropAmount = (userBalance * airdropTotal) / totalEligibleBITR;
          
          // Update snapshot balance with airdrop amount
          await db.query(`
            UPDATE airdrop.snapshot_balances 
            SET airdrop_amount = $1 
            WHERE snapshot_id = $2 AND user_address = $3
          `, [airdropAmount.toString(), snapshotId, balance.user_address]);
          
          // Update eligibility table with snapshot data
          await db.query(`
            UPDATE airdrop.eligibility 
            SET snapshot_bitr_balance = $1, airdrop_amount = $2, snapshot_taken_at = NOW()
            WHERE user_address = $3
          `, [balance.bitr_balance, airdropAmount.toString(), balance.user_address]);
        }
      }
      
      // Update snapshot totals
      await db.query(`
        UPDATE airdrop.snapshots 
        SET total_eligible_wallets = $1, total_eligible_bitr = $2
        WHERE id = $3
      `, [eligibleUsers.rows.length, totalEligibleBITR.toString(), snapshotId]);
      
      console.log(`✅ Snapshot complete: ${eligibleUsers.rows.length} eligible wallets, ${ethers.formatEther(totalEligibleBITR)} total BITR`);
      
      return snapshotId;
      
    } catch (error) {
      console.error('Error taking snapshot:', error);
      throw error;
    }
  }

  // Utility functions

  async updateStatistic(metricName, value, increment = false) {
    try {
      const db = require('./db/db');
      
      if (increment) {
        await db.query(`
          UPDATE airdrop.statistics 
          SET metric_value = COALESCE(metric_value, 0) + $1, updated_at = NOW()
          WHERE metric_name = $2
        `, [value, metricName]);
      } else {
        await db.query(`
          UPDATE airdrop.statistics 
          SET metric_value = $1, updated_at = NOW()
          WHERE metric_name = $2
        `, [value, metricName]);
      }
    } catch (error) {
      console.error(`Error updating statistic ${metricName}:`, error);
    }
  }

  async updateSummaryStatistics() {
    try {
      const db = require('./db/db');
      
      // Total eligible wallets
      const eligibleCount = await db.query(`
        SELECT COUNT(*) as count FROM airdrop.eligibility WHERE is_eligible = TRUE
      `);
      await this.updateStatistic('total_eligible_wallets', parseInt(eligibleCount.rows[0].count));
      
      // Average BITR actions per user
      const avgActions = await db.query(`
        SELECT AVG(bitr_action_count) as avg FROM airdrop.eligibility WHERE is_eligible = TRUE
      `);
      await this.updateStatistic('average_bitr_actions_per_user', parseFloat(avgActions.rows[0].avg || 0));
      
      // Eligible percentage
      const totalClaims = await db.query(`SELECT COUNT(*) as count FROM airdrop.faucet_claims`);
      const totalClaimsCount = parseInt(totalClaims.rows[0].count);
      const eligiblePercentage = totalClaimsCount > 0 ? (parseInt(eligibleCount.rows[0].count) / totalClaimsCount) * 100 : 0;
      await this.updateStatistic('eligible_percentage', eligiblePercentage);
      
      // Sybil wallets detected
      const sybilCount = await db.query(`
        SELECT COUNT(*) as count FROM airdrop.eligibility WHERE has_suspicious_transfers = TRUE
      `);
      await this.updateStatistic('sybil_wallets_detected', parseInt(sybilCount.rows[0].count));
      
    } catch (error) {
      console.error('Error updating summary statistics:', error);
    }
  }

  // API endpoints for checking eligibility

  async getUserEligibility(userAddress) {
    try {
      const db = require('./db/db');
      
      const result = await db.query(`
        SELECT * FROM airdrop.eligibility WHERE user_address = $1
      `, [userAddress]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error getting user eligibility for ${userAddress}:`, error);
      return null;
    }
  }

  async getAirdropStatistics() {
    try {
      const db = require('./db/db');
      
      const result = await db.query(`
        SELECT * FROM airdrop.summary_stats
      `);
      
      return result.rows[0] || {};
    } catch (error) {
      console.error('Error getting airdrop statistics:', error);
      return {};
    }
  }
}

module.exports = AirdropIndexer;

// Run if this file is executed directly
if (require.main === module) {
  console.log('🚀 Starting Airdrop Indexer...');
  
  const indexer = new AirdropIndexer();
  
  // Start the indexer
  indexer.start().catch(error => {
    console.error('Failed to start airdrop indexer:', error);
    process.exit(1);
  });
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await indexer.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await indexer.stop();
    process.exit(0);
  });
  
  // Keep process alive
  setInterval(() => {
    console.log(`📊 Airdrop Indexer Status: ${indexer.isRunning ? 'Running' : 'Stopped'} - Last Block: ${indexer.lastIndexedBlock}`);
  }, 60000); // Log status every minute
} 