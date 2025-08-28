require('dotenv').config();
const { ethers } = require('ethers');
const path = require('path');
const OddysseyMatchSelector = require('./oddyssey-match-selector');
const SportMonksService = require('./sportmonks');
const SchemaSyncBridge = require('./schema-sync-bridge');
const db = require('../db/db');

class OddysseyOracleBot {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.BOT_PRIVATE_KEY, this.provider);
    
    // Load full Oddyssey contract ABI
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
        '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
        '../../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
        path.join(__dirname, '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          this.oddysseyABI = require(abiPath).abi;
          console.log(`✅ Oddyssey ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ Failed to load Oddyssey ABI from artifacts, using fallback');
      // Fallback ABI (only the functions we need)
      this.oddysseyABI = [
        "function startDailyCycle((uint64,uint64,uint32,uint32,uint32,uint32,uint32,(uint8,uint8))[10] memory _matches) external",
        "function resolveDailyCycle(uint256 _cycleId, (uint8,uint8)[10] memory _results) external",
        "function dailyCycleId() external view returns (uint256)",
        "function dailyCycleEndTimes(uint256) external view returns (uint256)",
        "function isCycleResolved(uint256) external view returns (bool)",
        "function getCycleStatus(uint256 _cycleId) external view returns (bool exists, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount, bool hasWinner)",
        "event CycleStarted(uint256 indexed cycleId, uint256 endTime)",
        "event CycleResolved(uint256 indexed cycleId, uint256 prizePool)"
      ];
    }

    this.oddysseyContract = new ethers.Contract(
      process.env.ODDYSSEY_ADDRESS,
      this.oddysseyABI,
      this.wallet
    );

    this.matchSelector = new OddysseyMatchSelector();
    this.sportmonksService = new SportMonksService();
    this.syncBridge = new SchemaSyncBridge();
    
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      console.log('✅ Oddyssey Oracle Bot is already running');
      return;
    }

    this.isRunning = true;
    console.log('🤖 Starting Oddyssey Oracle Bot...');

    try {
      // Verify contract connection
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      console.log(`📊 Current Oddyssey cycle: ${currentCycleId}`);

      // Check if we need to start a new cycle today
      await this.checkAndStartNewCycle();

      // Check for cycles that need resolution
      await this.checkAndResolveCycles();

      console.log('✅ Oddyssey Oracle Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to start Oddyssey Oracle Bot:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    this.isRunning = false;
    console.log('⏹️ Oddyssey Oracle Bot stopped');
  }

  /**
   * Check if we need to start a new daily cycle
   */
  async checkAndStartNewCycle() {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      console.log(`🔍 [${now.toISOString()}] Checking for new cycle creation for date: ${today}`);
      
      // FIXED: Check contract's current cycle ID first
      const contractCycleId = await this.oddysseyContract.dailyCycleId();
      console.log(`📊 Contract current cycle ID: ${contractCycleId}`);
      
      // CRITICAL: Use atomic transaction to prevent race conditions
      await db.query('BEGIN');
      
      try {
        // Check if we already started a cycle for today in database
        const result = await db.query(`
          SELECT cycle_id, created_at 
          FROM oracle.oddyssey_cycles 
          WHERE DATE(created_at) = $1 
          ORDER BY cycle_id DESC 
          LIMIT 1
        `, [today]);

        if (result.rows.length > 0) {
          const dbCycleId = result.rows[0].cycle_id;
          console.log(`ℹ️ [${now.toISOString()}] Database cycle for today: ${dbCycleId}`);
          
          // Check if database and contract are in sync
          if (dbCycleId.toString() === contractCycleId.toString()) {
            console.log(`✅ Database and contract are in sync (cycle ${dbCycleId})`);
            await db.query('ROLLBACK');
            return;
          } else {
            console.log(`⚠️ Database (${dbCycleId}) and contract (${contractCycleId}) are out of sync`);
            
            // Log sync issue for monitoring
            await db.query(`
              INSERT INTO oracle.cycle_health_reports (
                cycle_id, issue_type, description, severity, created_at
              ) VALUES ($1, $2, $3, $4, NOW())
            `, [
              contractCycleId,
              'sync_mismatch',
              `Database cycle ${dbCycleId} != contract cycle ${contractCycleId}`,
              'warning'
            ]);
            
            await db.query('ROLLBACK');
            return; // Don't create new cycle if there's a sync issue
          }
        }
        
        await db.query('COMMIT');
        
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }

      // Check if it's the right time to start (cron runs at 00:04 UTC)
      const hour = now.getUTCHours();
      const minute = now.getUTCMinutes();
      
      // FIXED: Clear time window logic for cycle creation
      // Cron job runs at 00:04 UTC, so we expect hour = 0
      // Add 5-minute buffer for potential delays
      if (hour !== 0 || minute < 0 || minute > 9) {
        console.log(`ℹ️ [${now.toISOString()}] Outside cycle creation window (${hour}:${minute} UTC), expected 00:00-00:09 UTC`);
        return;
      }

      console.log(`🚀 [${now.toISOString()}] Starting new Oddyssey cycle for today...`);
      
      try {
        await this.startNewDailyCycle();
        console.log(`✅ [${now.toISOString()}] Successfully started new cycle`);
        
      } catch (cycleError) {
        console.error(`❌ [${now.toISOString()}] Failed to start new cycle:`, cycleError);
        
        // Log cycle creation failure for monitoring
        try {
          await db.query(`
            INSERT INTO oracle.cycle_health_reports (
              cycle_id, issue_type, description, severity, created_at
            ) VALUES ($1, $2, $3, $4, NOW())
          `, [
            0,
            'creation_failure',
            `Cycle creation failed: ${cycleError.message}`,
            'critical'
          ]);
        } catch (logError) {
          console.error('Failed to log cycle creation error:', logError);
        }
        
        throw cycleError;
      }

    } catch (error) {
      console.error('❌ Error in checkAndStartNewCycle:', error);
      throw error;
    }
  }

  /**
   * Start a new daily cycle with selected matches
   */
  async startNewDailyCycle() {
    try {
      // Get today's date for matches (same day strategy)
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      console.log(`📅 Selecting matches for ${todayStr}...`);

      // Select 10 optimal matches
      const matchSelection = await this.matchSelector.selectDailyMatches(today);
      const { selectedMatches, oddysseyMatches, summary } = matchSelection;

      // Validate selection
      try {
        this.matchSelector.validateMatchSelection(selectedMatches);
        console.log('✅ Match validation passed');
      } catch (validationError) {
        throw new Error(`Match validation failed: ${validationError.message}`);
      }

      console.log('🎯 Selected matches summary:');
      selectedMatches.forEach((match, i) => {
        console.log(`   ${i+1}. ${match.homeTeam} vs ${match.awayTeam} (${match.difficulty}) [${match.league}]`);
      });

      // Send to contract
      console.log('📤 Sending matches to Oddyssey contract...');
      
      // Estimate gas first
      const gasEstimate = await this.oddysseyContract.startDailyCycle.estimateGas(oddysseyMatches);
      console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);
      
      const tx = await this.oddysseyContract.startDailyCycle(oddysseyMatches, {
        gasLimit: gasEstimate + 500000n // Add 500k buffer
      });

      console.log(`⏳ Transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log('✅ New cycle started successfully!');
        
        // Store cycle data in our database
        await this.storeCycleData(receipt, selectedMatches, summary);
        
        // Get the current cycle ID and sync to oddyssey schema
        const currentCycleId = await this.oddysseyContract.dailyCycleId();
        await this.syncBridge.syncCycleFromOracle(currentCycleId.toString());
        
        // Listen for CycleStarted event
        const event = receipt.logs.find(log => {
          try {
            const parsed = this.oddysseyContract.interface.parseLog(log);
            return parsed.name === 'CycleStarted';
          } catch {
            return false;
          }
        });

        if (event) {
          const parsedEvent = this.oddysseyContract.interface.parseLog(event);
          console.log(`🎉 Cycle ${parsedEvent.args.cycleId} started, betting ends at ${new Date(Number(parsedEvent.args.endTime) * 1000)}`);
        }

      } else {
        throw new Error('Transaction failed');
      }

    } catch (error) {
      console.error('❌ Failed to start new cycle:', error);
      throw error;
    }
  }

  /**
   * Check for cycles that need resolution
   */
  async checkAndResolveCycles() {
    try {
      // Get unresolved cycles that are past their end time
      const result = await db.query(`
        SELECT cycle_id, matches_data, cycle_end_time
        FROM oracle.oddyssey_cycles 
        WHERE is_resolved = false 
          AND cycle_end_time < NOW()
        ORDER BY cycle_id ASC
      `);

      for (const cycle of result.rows) {
        console.log(`🔍 Checking cycle ${cycle.cycle_id} for resolution...`);
        
        try {
          await this.resolveCycleIfReady(cycle);
        } catch (error) {
          console.error(`❌ Failed to resolve cycle ${cycle.cycle_id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Error checking cycles for resolution:', error);
    }
  }

  /**
   * Resolve a cycle if all matches are completed
   */
  async resolveCycleIfReady(cycle) {
    try {
      // Handle both old and new data formats
      let matchIds;
      if (cycle.match_ids) {
        // Old format: JSON string
        matchIds = JSON.parse(cycle.match_ids);
      } else if (cycle.matches_data) {
        // New format: JSONB object - extract IDs from match objects
        if (Array.isArray(cycle.matches_data)) {
          matchIds = cycle.matches_data.map(match => match.id);
        } else {
          matchIds = cycle.matches_data;
        }
      } else {
        throw new Error(`No match data found for cycle ${cycle.cycle_id}`);
      }
      
      // Ensure matchIds is an array
      if (!Array.isArray(matchIds)) {
        throw new Error(`Invalid match data format for cycle ${cycle.cycle_id}`);
      }
      
      // Check if all matches have results
      const results = await this.getMatchResults(matchIds);
      
      if (results.length !== 10) {
        console.log(`⏳ Cycle ${cycle.cycle_id}: Only ${results.length}/10 matches resolved, waiting...`);
        return;
      }

      console.log(`✅ All matches resolved for cycle ${cycle.cycle_id}, submitting results...`);

      // Format results for contract
      const formattedResults = this.formatResultsForContract(results);

      // Estimate gas first
      const gasEstimate = await this.oddysseyContract.resolveDailyCycle.estimateGas(cycle.cycle_id, formattedResults);
      console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);
      
      // Submit to contract with proper gas limit
      const tx = await this.oddysseyContract.resolveDailyCycle(cycle.cycle_id, formattedResults, {
        gasLimit: gasEstimate + 200000n // Add 200k buffer
      });

      console.log(`⏳ Resolution transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        console.log(`🎉 Cycle ${cycle.cycle_id} resolved successfully!`);
        
        // Update database
        await db.query(`
          UPDATE oracle.oddyssey_cycles 
          SET is_resolved = true, resolution_tx_hash = $1, resolved_at = NOW()
          WHERE cycle_id = $2
        `, [tx.hash, cycle.cycle_id]);

        // Sync resolution to oddyssey schema
        await this.syncBridge.syncCycleResolution(cycle.cycle_id);

      } else {
        throw new Error('Resolution transaction failed');
      }

    } catch (error) {
      console.error(`❌ Failed to resolve cycle ${cycle.cycle_id}:`, error);
      throw error;
    }
  }

  /**
   * Get match results from database
   */
  async getMatchResults(matchIds) {
    const results = [];
    
    for (const matchId of matchIds) {
      const result = await db.query(`
        SELECT 
          f.id as fixture_id,
          COALESCE(fr.outcome_1x2, fr.result_1x2) as result_1x2,
          COALESCE(fr.outcome_ou25, fr.result_ou25) as result_ou25
        FROM oracle.fixtures f
        INNER JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = $1
      `, [matchId]);

      if (result.rows.length > 0) {
        const match = result.rows[0];
        results.push({
          matchId: match.fixture_id,
          moneyline: this.convertMoneylineResult(match.result_1x2),
          overUnder: this.convertOverUnderResult(match.result_ou25)
        });
      }
    }

    return results;
  }

  /**
   * Convert database result to contract enum
   */
  convertMoneylineResult(result1x2) {
    switch (result1x2) {
      case '1': return 1; // HomeWin
      case 'X': return 2; // Draw  
      case '2': return 3; // AwayWin
      default: return 0;  // NotSet
    }
  }

  convertOverUnderResult(resultOU25) {
    switch (resultOU25) {
      case 'Over': return 1;  // Over
      case 'Under': return 2; // Under
      default: return 0;      // NotSet
    }
  }

  /**
   * Format results for contract submission with strict validation
   */
  formatResultsForContract(results) {
    if (!results || results.length !== 10) {
      throw new Error('Must provide exactly 10 results for contract submission');
    }

    return results.map((result, index) => {
      if (result.moneyline === undefined || result.overUnder === undefined) {
        throw new Error(`Result ${index} missing moneyline or overUnder values`);
      }

      // Return struct format with named fields (ethers.js will handle the encoding)
      return {
        moneyline: result.moneyline,
        overUnder: result.overUnder
      };
    });
  }

  /**
   * Store cycle data in database for tracking
   */
  async storeCycleData(receipt, selectedMatches, summary) {
    try {
      const cycleId = await this.oddysseyContract.dailyCycleId();
      const matchIds = selectedMatches.map(m => m.fixtureId);
      const endTime = Math.min(...selectedMatches.map(m => m.matchDate.getTime())) - 60000; // 1 min before earliest match

      await db.query(`
        INSERT INTO oracle.oddyssey_cycles (
          cycle_id, matches_data, tx_hash, cycle_end_time
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (cycle_id) DO UPDATE SET
          matches_data = EXCLUDED.matches_data,
          tx_hash = EXCLUDED.tx_hash,
          cycle_end_time = EXCLUDED.cycle_end_time
      `, [
        cycleId.toString(),
        JSON.stringify(matchIds),
        receipt.hash,
        new Date(endTime)
      ]);

      console.log(`💾 Stored cycle ${cycleId} data in database`);

    } catch (error) {
      console.warn('⚠️ Failed to store cycle data:', error);
    }
  }

  /**
   * Get status of current operations
   */
  async getStatus() {
    try {
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      const endTime = await this.oddysseyContract.dailyCycleEndTimes(currentCycleId);
      const isResolved = await this.oddysseyContract.isCycleResolved(currentCycleId);

      return {
        isRunning: this.isRunning,
        currentCycleId: currentCycleId.toString(),
        cycleEndTime: new Date(Number(endTime) * 1000),
        isCurrentCycleResolved: isResolved,
        walletAddress: this.wallet.address,
        contractAddress: this.oddysseyContract.target
      };

    } catch (error) {
      return {
        isRunning: this.isRunning,
        error: error.message
      };
    }
  }

  /**
   * Manual cycle start (for testing/admin)
   */
  async manualStartCycle(targetDate = null) {
    console.log('🔧 Manual cycle start triggered...');
    await this.startNewDailyCycle(targetDate);
  }

  /**
   * Manual cycle resolution (for testing/admin)
   */
  async manualResolveCycle(cycleId) {
    console.log(`🔧 Manual resolution triggered for cycle ${cycleId}...`);
    
    const result = await db.query(`
      SELECT cycle_id, matches_data, cycle_end_time
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = $1
    `, [cycleId]);

    if (result.rows.length === 0) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    await this.resolveCycleIfReady(result.rows[0]);
  }
}

module.exports = OddysseyOracleBot; 