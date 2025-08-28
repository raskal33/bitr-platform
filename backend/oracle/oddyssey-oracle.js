const { ethers } = require('ethers');
const db = require('../db/db');
const OddysseyManager = require('../services/oddyssey-manager');
const Web3Service = require('../services/web3-service');
const config = require('../config');

class OddysseyOracle {
  constructor() {
    this.web3Service = new Web3Service();
    this.oddysseyManager = new OddysseyManager();
    this.oddysseyContract = null;
    this.guidedOracle = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('🔧 Initializing Oddyssey Oracle...');
      
      // Check if Oracle private key is configured
      if (!process.env.ORACLE_SIGNER_PRIVATE_KEY) {
        throw new Error('Oracle private key not configured');
      }
      
      // Initialize services
      await this.oddysseyManager.initialize();
      this.oddysseyContract = await this.web3Service.getOddysseyContract();
      this.guidedOracle = await this.web3Service.getGuidedOracleContract();
      
      // Check if backend is oracle
      const oracle = await this.oddysseyContract.oracle();
      const backendAddress = this.web3Service.getWalletAddress();
      
      if (oracle !== backendAddress) {
        console.warn('⚠️ Backend is not set as oracle in contract');
        console.warn(`Contract oracle: ${oracle}`);
        console.warn(`Backend address: ${backendAddress}`);
      } else {
        console.log('✅ Backend is set as oracle');
      }
      
      this.isInitialized = true;
      console.log('✅ Oddyssey Oracle initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize Oddyssey Oracle:', error);
      throw error;
    }
  }

  /**
   * Start a new Oddyssey cycle using backend match selection
   */
  async startNewCycle() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('🎯 Starting new Oddyssey cycle...');
      
      // Use backend match selection logic
      const matches = await this.oddysseyManager.getDailyMatches();
      
      if (matches.length < 10) {
        console.error(`❌ Not enough matches (${matches.length}/10) to start cycle`);
        return false;
      }

      console.log(`📊 Selected ${matches.length} matches for new cycle`);
      
      // Format matches for contract
      const formattedMatches = this.formatMatchesForContract(matches);
      
      // Start cycle on contract
      const tx = await this.oddysseyContract.startDailyCycle(formattedMatches);
      console.log(`🚀 Cycle start transaction: ${tx.hash}`);
      
      await tx.wait();
      console.log('✅ Cycle started successfully');
      
      // Save to database
      await this.saveCycleToDatabase(matches);
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to start new cycle:', error);
      return false;
    }
  }

  /**
   * Resolve current Oddyssey cycle
   */
  async resolveCurrentCycle() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      console.log('🏁 Resolving current Oddyssey cycle...');
      
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      console.log(`📊 Resolving cycle ${currentCycleId}`);
      
      // Get cycle data from database
      const cycleData = await this.getCycleData(currentCycleId);
      if (!cycleData) {
        console.error(`❌ No cycle data found for cycle ${currentCycleId}`);
        return false;
      }
      
      // Get match results
      const matches = JSON.parse(cycleData.matches_data);
      const results = await this.getMatchResults(matches);
      
      if (results.length < 10) {
        console.error(`❌ Not enough results (${results.length}/10) to resolve cycle`);
        return false;
      }
      
      // Resolve cycle on contract
      const tx = await this.oddysseyContract.resolveDailyCycle(results);
      console.log(`🚀 Cycle resolution transaction: ${tx.hash}`);
      
      await tx.wait();
      console.log('✅ Cycle resolved successfully');
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to resolve cycle:', error);
      return false;
    }
  }

  /**
   * Format matches for contract
   */
  formatMatchesForContract(matches) {
    return matches.map(match => ({
      id: match.id,
      startTime: Math.floor(new Date(match.startTime * 1000).getTime() / 1000),
      oddsHome: Math.floor(match.odds.home * 1000),
      oddsDraw: Math.floor(match.odds.draw * 1000),
      oddsAway: Math.floor(match.odds.away * 1000),
      oddsOver: Math.floor(match.odds.over25 * 1000),
      oddsUnder: Math.floor(match.odds.under25 * 1000),
      result: { moneyline: 0, overUnder: 0 } // NotSet
    }));
  }

  /**
   * Save cycle to database
   */
  async saveCycleToDatabase(matches) {
    try {
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      
      // Check if cycle already exists to preserve match consistency
      const existingCycle = await db.query(
        'SELECT cycle_id FROM oracle.oddyssey_cycles WHERE cycle_id = $1',
        [Number(currentCycleId)]
      );
      
      if (existingCycle.rows.length > 0) {
        console.log(`⚠️ Cycle ${currentCycleId} already exists. Preserving original matches to maintain consistency.`);
        return; // Don't overwrite existing cycles
      }
      
      const query = `
        INSERT INTO oracle.oddyssey_cycles (
          cycle_id, created_at, matches_count, matches_data, cycle_start_time, cycle_end_time
        ) VALUES ($1, NOW(), $2, $3, NOW(), NOW() + INTERVAL '24 hours')
      `;

      await db.query(query, [
        Number(currentCycleId),
        matches.length,
        JSON.stringify(matches)
      ]);

      console.log(`💾 Saved cycle ${currentCycleId} to database`);
      
    } catch (error) {
      console.error('❌ Failed to save cycle to database:', error);
    }
  }

  /**
   * Get cycle data from database
   */
  async getCycleData(cycleId) {
    try {
      const query = `
        SELECT * FROM oracle.oddyssey_cycles WHERE cycle_id = $1
      `;
      
      const result = await db.query(query, [cycleId]);
      return result.rows[0];
      
    } catch (error) {
      console.error('❌ Failed to get cycle data:', error);
      return null;
    }
  }

  /**
   * Get match results from database
   */
  async getMatchResults(matches) {
    try {
      const matchIds = matches.map(m => m.id);
      
      const query = `
        SELECT 
          f.id as match_id,
          fr.outcome_1x2,
          fr.outcome_ou25
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.id = ANY($1)
        ORDER BY f.id
      `;
      
      const result = await db.query(query, [matchIds]);
      const results = result.rows;
      
      if (results.length < 10) {
        console.warn(`⚠️ Only ${results.length}/10 matches have results`);
      }
      
      return results.map(row => ({
        moneyline: this.mapMoneylineResult(row.outcome_1x2),
        overUnder: this.mapOverUnderResult(row.outcome_ou25)
      }));
      
    } catch (error) {
      console.error('❌ Failed to get match results:', error);
      return [];
    }
  }

  /**
   * Map moneyline result
   */
  mapMoneylineResult(outcome) {
    switch (outcome) {
      case '1': return 1; // HomeWin
      case 'X': return 2; // Draw
      case '2': return 3; // AwayWin
      default: return 0;  // NotSet
    }
  }

  /**
   * Map over/under result
   */
  mapOverUnderResult(outcome) {
    switch (outcome) {
      case 'Over': return 1; // Over
      case 'Under': return 2; // Under
      default: return 0;      // NotSet
    }
  }

  /**
   * Get oracle status
   */
  async getStatus() {
    try {
      const currentCycleId = await this.oddysseyContract.dailyCycleId();
      const oracle = await this.oddysseyContract.oracle();
      const backendAddress = this.web3Service.getWalletAddress();
      
      return {
        isInitialized: this.isInitialized,
        currentCycleId: Number(currentCycleId),
        contractOracle: oracle,
        backendAddress: backendAddress,
        isOracle: oracle && backendAddress ? oracle.toLowerCase() === backendAddress.toLowerCase() : false
      };
      
    } catch (error) {
      console.error('❌ Failed to get oracle status:', error);
      return { error: error.message };
    }
  }
}

module.exports = OddysseyOracle; 