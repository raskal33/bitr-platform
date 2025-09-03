const { ethers } = require('ethers');
const config = require('../config');
const db = require('../db/db');

/**
 * Reputation Sync Service
 * Syncs reputation scores from backend database to on-chain ReputationSystem contract
 */
class ReputationSyncService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Check for valid private key
    const privateKey = process.env.REPUTATION_UPDATER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY;
    if (!privateKey || privateKey === '' || privateKey === 'undefined') {
      console.warn('⚠️ No valid private key found for ReputationSyncService. Service will be disabled.');
      this.wallet = null;
      this.isDisabled = true;
    } else {
      try {
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        this.isDisabled = false;
      } catch (error) {
        console.warn('⚠️ Invalid private key for ReputationSyncService. Service will be disabled.', error.message);
        this.wallet = null;
        this.isDisabled = true;
      }
    }
    
    this.reputationContract = null;
    this.isRunning = false;
    this.syncInterval = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    if (this.isDisabled) {
      console.log('🔇 ReputationSyncService is disabled due to missing/invalid private key');
      return false;
    }
    
    try {
      // Load ReputationSystem contract ABI
      const path = require('path');
      
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json',
        '../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json',
        '../../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json',
        path.join(__dirname, '../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/ReputationSystem.sol/ReputationSystem.json')
      ];
      
      let reputationABI = null;
      for (const abiPath of possiblePaths) {
        try {
          reputationABI = require(abiPath).abi;
          console.log(`✅ ReputationSystem ABI loaded from: ${abiPath}`);
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!reputationABI) {
        throw new Error('Could not load ReputationSystem ABI from any path');
      }
      const reputationAddress = config.blockchain.contractAddresses?.reputationSystem;
      
      if (!reputationAddress) {
        console.warn('⚠️ ReputationSystem contract address not configured');
        return;
      }

      this.reputationContract = new ethers.Contract(reputationAddress, reputationABI, this.wallet);
      console.log('✅ ReputationSyncService initialized');
    } catch (error) {
      console.error('❌ Failed to initialize ReputationSyncService:', error);
      throw error;
    }
  }

  async start() {
    if (this.isDisabled) {
      console.log('🔇 ReputationSyncService is disabled due to missing/invalid private key');
      return;
    }
    
    if (this.isRunning) {
      console.log('ReputationSyncService is already running');
      return;
    }

    if (!this.reputationContract) {
      const initialized = await this.initialize();
      if (!initialized) {
        return;
      }
    }

    this.isRunning = true;
    console.log('🔄 Starting ReputationSyncService...');

    // Initial sync
    await this.syncReputationScores();

    // Set up periodic sync
    this.syncTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.syncReputationScores();
      }
    }, this.syncInterval);
  }

  async stop() {
    this.isRunning = false;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    console.log('⏹️ ReputationSyncService stopped');
  }

  /**
   * Sync reputation scores from database to smart contract
   */
  async syncReputationScores() {
    try {
      console.log('🔄 Syncing reputation scores to blockchain...');

      // Get users with reputation changes since last sync
      const users = await db.query(`
        SELECT address, reputation, last_active
        FROM core.users 
        WHERE reputation > 0 
        AND (last_synced_at IS NULL OR last_active > last_synced_at)
        ORDER BY last_active DESC
        LIMIT 50
      `);

      if (users.rows.length === 0) {
        console.log('✅ No reputation updates needed');
        return;
      }

      console.log(`📊 Found ${users.rows.length} users with reputation updates`);

      // Batch update reputation scores
      const addresses = users.rows.map(user => user.address);
      const reputations = users.rows.map(user => user.reputation);

      // Check if we're authorized to update
      const isAuthorized = await this.reputationContract.authorizedUpdaters(this.wallet.address);
      if (!isAuthorized) {
        console.warn('⚠️ Wallet not authorized to update reputation. Please authorize:', this.wallet.address);
        return;
      }

      // Estimate gas for batch update
      const gasEstimate = await this.reputationContract.batchUpdateReputation.estimateGas(addresses, reputations);
      console.log(`⛽ Estimated gas: ${gasEstimate.toString()}`);

      // Execute batch update
      const tx = await this.reputationContract.batchUpdateReputation(addresses, reputations, {
        gasLimit: gasEstimate + BigInt(50000) // Add buffer
      });

      console.log(`🚀 Reputation sync transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`✅ Reputation sync confirmed in block ${receipt.blockNumber}`);

      // Update last_synced_at for these users
      await db.query(`
        UPDATE core.users 
        SET last_synced_at = NOW() 
        WHERE address = ANY($1)
      `, [addresses]);

      console.log(`✅ Synced ${addresses.length} reputation scores to blockchain`);

    } catch (error) {
      console.error('❌ Error syncing reputation scores:', error);
      
      // If it's a gas estimation error, the contract might not be deployed
      if (error.message && error.message.includes('execution reverted')) {
        console.warn('⚠️ Contract execution reverted - check if ReputationSystem is deployed and configured');
      }
    }
  }

  /**
   * Sync a single user's reputation immediately
   */
  async syncUserReputation(userAddress) {
    try {
      if (!this.reputationContract) {
        console.warn('⚠️ ReputationSystem not initialized');
        return;
      }

      // Get user's current reputation from database
      const result = await db.query(
        'SELECT reputation FROM core.users WHERE address = $1',
        [userAddress]
      );

      if (result.rows.length === 0) {
        console.log(`ℹ️ User ${userAddress} not found in database`);
        return;
      }

      const reputation = result.rows[0].reputation;

      // Update on-chain
      const tx = await this.reputationContract.updateReputation(userAddress, reputation);
      console.log(`🚀 Individual reputation sync for ${userAddress}: ${tx.hash}`);

      await tx.wait();
      console.log(`✅ Synced reputation for ${userAddress}: ${reputation}`);

      // Update sync timestamp
      await db.query(
        'UPDATE core.users SET last_synced_at = NOW() WHERE address = $1',
        [userAddress]
      );

    } catch (error) {
      console.error(`❌ Error syncing reputation for ${userAddress}:`, error);
    }
  }

  /**
   * Get reputation sync status
   */
  async getSyncStatus() {
    try {
      const pendingSync = await db.query(`
        SELECT COUNT(*) as count
        FROM core.users 
        WHERE reputation > 0 
        AND (last_synced_at IS NULL OR last_active > last_synced_at)
      `);

      const totalUsers = await db.query(`
        SELECT COUNT(*) as count
        FROM core.users 
        WHERE reputation > 0
      `);

      return {
        isRunning: this.isRunning,
        pendingSyncCount: parseInt(pendingSync.rows[0].count),
        totalUsersWithReputation: parseInt(totalUsers.rows[0].count),
        contractAddress: this.reputationContract?.address || 'Not configured',
        walletAddress: this.wallet.address,
        isAuthorized: this.reputationContract ? await this.reputationContract.authorizedUpdaters(this.wallet.address) : false
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return { error: error.message };
    }
  }
}

module.exports = ReputationSyncService;
