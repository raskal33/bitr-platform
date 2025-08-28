const { ethers } = require('ethers');
const SportMonksService = require('./sportmonks');
const db = require('../db/db');
const config = require('../config');

class FootballOracleBot {
  constructor() {
    this.sportmonksService = new SportMonksService();
    this.isRunning = false;
    this.updateInterval = 5 * 60 * 1000; // 5 minutes
    this.resolutionInterval = 2 * 60 * 1000; // 2 minutes
    this.priceUpdateInterval = null;
    this.resolutionCheckInterval = null;
    
    // Initialize web3 connection for oracle submission
    this.provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL || process.env.RPC_URL);
    this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY || process.env.ORACLE_SIGNER_PRIVATE_KEY, this.provider);
    
    // Contract addresses and ABIs
    this.guidedOracleAddress = process.env.GUIDED_ORACLE_ADDRESS;
    this.guidedOracleABI = [
      "function submitOutcome(bytes32 marketId, bytes calldata resultData) external",
      "function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)",
      "function oracleBot() external view returns (address)"
    ];
    this.guidedOracleContract = new ethers.Contract(
      this.guidedOracleAddress,
      this.guidedOracleABI,
      this.wallet
    );
  }

  /**
   * Start the football oracle bot
   */
  async start() {
    if (this.isRunning) {
      console.log('Football Oracle Bot is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Football Oracle Bot...');

    try {
      // Verify oracle bot wallet
      const botAddress = await this.wallet.getAddress();
      console.log(`Oracle bot wallet: ${botAddress}`);

      // Check if this wallet is authorized in the contract
      const authorizedBot = await this.guidedOracleContract.oracleBot();
      if (botAddress.toLowerCase() !== authorizedBot.toLowerCase()) {
        console.warn(`⚠️ Warning: Wallet ${botAddress} is not the authorized oracle bot (${authorizedBot})`);
      }

      // Start periodic operations
      await this.startPeriodicOperations();
      
      console.log('✅ Football Oracle Bot started successfully');
    } catch (error) {
      console.error('❌ Failed to start Football Oracle Bot:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the football oracle bot
   */
  async stop() {
    this.isRunning = false;
    
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
    
    if (this.resolutionCheckInterval) {
      clearInterval(this.resolutionCheckInterval);
      this.resolutionCheckInterval = null;
    }
    
    console.log('🛑 Football Oracle Bot stopped');
  }

  /**
   * Start periodic fixture updates and market resolution checks
   */
  async startPeriodicOperations() {
    // DISABLED: Results fetching moved to Unified Results Manager
    // This prevents conflicts with the new unified system
    console.log('⚠️ Football Oracle Bot results fetching DISABLED - using Unified Results Manager instead');
    
    // Only keep market resolution checking (not results fetching)
    this.resolutionCheckInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.checkAndResolveMarkets();
      } catch (error) {
        console.error('Error in resolution cycle:', error);
      }
    }, this.resolutionInterval);

    // Run initial market resolution check
    setTimeout(async () => {
      await this.checkAndResolveMarkets();
    }, 5000);
  }

  /**
   * Update fixture results from SportMonks API
   */
  async updateFixtureResults() {
    console.log('📊 Updating fixture results...');
    
    try {
      // Get fixtures that are likely finished but don't have results yet
      const result = await db.query(`
        SELECT f.id as fixture_id, f.home_team, f.away_team, f.match_date
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results r ON f.id::VARCHAR = r.fixture_id::VARCHAR
        WHERE f.match_date >= NOW() - INTERVAL '3 hours'
        AND f.match_date <= NOW()
        AND r.fixture_id IS NULL
        AND f.status NOT IN ('NS', 'CANC', 'POST')
        ORDER BY f.match_date DESC
        LIMIT 20
      `);

      if (result.rows.length === 0) {
        console.log('No fixtures need result updates');
        return;
      }

      console.log(`Updating results for ${result.rows.length} fixtures...`);

      const fixtureIds = result.rows.map(row => row.fixture_id);
      const results = await this.sportmonksService.fetchFixtureResults(fixtureIds);
      
      if (results.length > 0) {
        const savedResults = await this.sportmonksService.saveResults(results);
        console.log(`✅ Updated ${savedResults} fixture results`);
      } else {
        console.log('No new results available');
      }

    } catch (error) {
      console.error('❌ Failed to update fixture results:', error);
    }
  }

  /**
   * Check for football markets that need resolution
   */
  async checkAndResolveMarkets() {
    console.log('🔍 Checking for football markets needing resolution...');
    
    try {
      // Get markets past their end time that haven't been resolved - COMPLETE OUTCOME DATA
      const result = await db.query(`
        SELECT 
          fpm.id,
          fpm.market_id,
          fpm.fixture_id,
          fpm.outcome_type,
          fpm.predicted_outcome,
          fpm.end_time,
          f.home_team,
          f.away_team,
          fr.home_score,
          fr.away_score,
          fr.ht_home_score,
          fr.ht_away_score,
          -- ALL outcome types now available for resolution
          fr.outcome_1x2,
          fr.outcome_ou05,
          fr.outcome_ou15,
          fr.outcome_ou25,
          fr.outcome_ou35,
          fr.outcome_ht_result,
          fr.outcome_btts,
          fr.full_score,
          fr.ht_score,
          -- Legacy fields for backward compatibility
          fr.result_1x2,
          fr.result_ou25,
          fr.result_btts
        FROM oracle.football_prediction_markets fpm
        JOIN oracle.fixtures f ON fpm.fixture_id::VARCHAR = f.id::VARCHAR
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE fpm.resolved = false 
          AND fpm.end_time <= NOW()
          AND fr.fixture_id IS NOT NULL
        ORDER BY fpm.end_time ASC
        LIMIT 20
      `);

      if (result.rows.length === 0) {
        console.log('No football markets need resolution');
        return;
      }

      console.log(`📋 Found ${result.rows.length} football markets needing resolution`);

      for (const market of result.rows) {
        try {
          await this.resolveMarket(market);
        } catch (error) {
          console.error(`Failed to resolve market ${market.market_id}:`, error);
          
          // Log the failure
          await db.query(`
            INSERT INTO oracle.football_resolution_logs (
              market_id, fixture_id, outcome_type, predicted_outcome,
              actual_result, success, error_message
            ) VALUES ($1, $2, $3, $4, $5, false, $6)
          `, [
            market.market_id,
            market.fixture_id,
            market.outcome_type,
            market.predicted_outcome,
            null,
            error.message
          ]);
        }
      }

    } catch (error) {
      console.error('❌ Failed to check football markets for resolution:', error);
    }
  }

  /**
   * Resolve a specific football market
   */
  async resolveMarket(market) {
    const startTime = Date.now();
    console.log(`🎯 Resolving football market: ${market.market_id} (${market.home_team} vs ${market.away_team})`);

    if (market.home_score === null || market.home_score === undefined || 
        market.away_score === null || market.away_score === undefined) {
      throw new Error('No match result data available');
    }

    // Determine outcome based on outcome type - COMPLETE RESOLUTION SYSTEM
    let result;
    switch (market.outcome_type) {
      // Main match outcome
      case '1X2':
        result = market.outcome_1x2 || market.result_1x2;
        break;
        
      // Over/Under markets - ALL variations now supported
      case 'OU05':
        result = market.outcome_ou05;
        break;
      case 'OU15':
        result = market.outcome_ou15;
        break;
      case 'OU25':
        result = market.outcome_ou25 || market.result_ou25;
        break;
      case 'OU35':
        result = market.outcome_ou35;
        break;
        
      // Both Teams To Score
      case 'BTTS':
        result = market.outcome_btts || market.result_btts;
        break;
        
      // Half-time markets
      case 'HT_1X2':
        result = market.outcome_ht_result;
        break;
      case 'HT_OU05':
        // Calculate half-time OU0.5 from half-time scores
        if (market.ht_home_score !== null && market.ht_away_score !== null) {
          const htTotalGoals = market.ht_home_score + market.ht_away_score;
          result = htTotalGoals > 0.5 ? 'O' : 'U';
        }
        break;
      case 'HT_OU15':
        // Calculate half-time OU1.5 from half-time scores
        if (market.ht_home_score !== null && market.ht_away_score !== null) {
          const htTotalGoals = market.ht_home_score + market.ht_away_score;
          result = htTotalGoals > 1.5 ? 'O' : 'U';
        }
        break;
        
      // Legacy/fallback calculations for missing data
      case 'OU35_FALLBACK':
        // Fallback calculation if outcome_ou35 is missing
        // IMPORTANT: Uses 90-minute scores only (home_score/away_score exclude extra time/penalties)
        const totalGoals = market.home_score + market.away_score;
        result = totalGoals > 3.5 ? 'O' : 'U';
        break;
        
      default:
        throw new Error(`Unsupported outcome type: ${market.outcome_type}. Supported: 1X2, OU05, OU15, OU25, OU35, BTTS, HT_1X2, HT_OU05, HT_OU15`);
    }

    if (!result) {
      throw new Error(`No result available for outcome type: ${market.outcome_type}`);
    }

    console.log(`💡 ${market.outcome_type} market outcome: ${result} (Full: ${market.home_score}-${market.away_score}${market.ht_home_score !== null ? `, HT: ${market.ht_home_score}-${market.ht_away_score}` : ''})`);

    try {
      // Update database first
      await db.query(`
        UPDATE oracle.football_prediction_markets 
        SET resolved = true, 
            result = $1, 
            resolved_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
      `, [result, market.id]);

      // Submit to guided oracle contract
      const marketIdBytes32 = ethers.id(market.market_id);
      const resultData = ethers.toUtf8Bytes(result);

      console.log(`📡 Submitting to guided oracle: ${marketIdBytes32} -> ${result}`);

      // Check if outcome already exists
      const [isSet] = await this.guidedOracleContract.getOutcome(marketIdBytes32);
      
      if (isSet) {
        console.log(`⚠️ Outcome already set for market ${market.market_id}`);
      } else {
        // Estimate gas and submit
        const gasEstimate = await this.guidedOracleContract.submitOutcome.estimateGas(
          marketIdBytes32,
          resultData
        );

        const tx = await this.guidedOracleContract.submitOutcome(
          marketIdBytes32,
          resultData,
          {
            gasLimit: gasEstimate * 110n / 100n, // Add 10% buffer
            gasPrice: ethers.parseUnits('20', 'gwei')
          }
        );

        console.log(`📤 Transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      }

      const endTime = Date.now();

      // Log successful resolution
      await db.query(`
        INSERT INTO oracle.football_resolution_logs (
          market_id, fixture_id, outcome_type, predicted_outcome,
          actual_result, success, processing_time_ms
        ) VALUES ($1, $2, $3, $4, $5, true, $6)
      `, [
        market.market_id,
        market.fixture_id,
        market.outcome_type,
        market.predicted_outcome,
        result,
        endTime - startTime
      ]);

      console.log(`✅ Successfully resolved football market ${market.market_id} with result: ${result}`);

    } catch (error) {
      // Rollback database changes on contract failure
      await db.query(`
        UPDATE oracle.football_prediction_markets 
        SET resolved = false, 
            result = NULL, 
            resolved_at = NULL,
            updated_at = NOW()
        WHERE id = $1
      `, [market.id]);

      throw error;
    }
  }

  /**
   * Create a new football prediction market
   */
  async createPredictionMarket(fixtureId, outcomeType, predictedOutcome, endTime) {
    try {
      const marketId = this.generateMarketId(fixtureId, outcomeType, predictedOutcome);

      // Get fixture details
      const fixtureResult = await db.query(`
        SELECT id, home_team, away_team, match_date
        FROM oracle.fixtures
        WHERE id = $1
      `, [fixtureId]);

      if (fixtureResult.rows.length === 0) {
        throw new Error('Fixture not found');
      }

      const fixture = fixtureResult.rows[0];

      // Insert market
      const result = await db.query(`
        INSERT INTO oracle.football_prediction_markets (
          market_id, fixture_id, outcome_type, predicted_outcome, end_time
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        marketId,
        fixtureId,
        outcomeType,
        predictedOutcome,
        endTime
      ]);

      console.log(`✅ Created football prediction market: ${marketId}`);
      return {
        success: true,
        marketId,
        id: result.rows[0].id,
        fixture: fixture
      };

    } catch (error) {
      console.error('Failed to create football prediction market:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate market ID for football prediction
   * Format: keccak256(abi.encodePacked(fixtureId))
   * This matches the new BitredictPool contract expectations
   */
  generateMarketId(fixtureId, outcomeType, predictedOutcome) {
    // For the new contract, we use just the fixture ID and hash it
    // This matches the SportMonks fixture ID format expected by the contract
    return ethers.id(fixtureId.toString());
  }

  /**
   * Get oracle bot status
   */
  async getStatus() {
    try {
      const walletAddress = await this.wallet.getAddress();
      const balance = await this.provider.getBalance(walletAddress);
      
      // Get recent activity
      const recentResolutions = await db.query(`
        SELECT COUNT(*) as count
        FROM oracle.football_resolution_logs
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const pendingMarkets = await db.query(`
        SELECT COUNT(*) as count
        FROM oracle.football_prediction_markets
        WHERE resolved = false AND end_time <= NOW()
      `);

      return {
        isRunning: this.isRunning,
        walletAddress,
        walletBalance: ethers.formatEther(balance),
        recentResolutions24h: parseInt(recentResolutions.rows[0].count),
        pendingResolutions: parseInt(pendingMarkets.rows[0].count),
        lastUpdate: new Date().toISOString(),
        updateInterval: this.updateInterval,
        resolutionInterval: this.resolutionInterval
      };

    } catch (error) {
      console.error('Failed to get oracle status:', error);
      return {
        isRunning: this.isRunning,
        error: error.message
      };
    }
  }
}

module.exports = FootballOracleBot; 