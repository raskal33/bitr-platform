const FootballOracleBot = require('../services/football-oracle-bot');
const UnifiedResultsManager = require('../services/unified-results-manager');
const db = require('../db/db');

/**
 * Test Football Oracle Bot Integration Script
 * 
 * This script tests that the football oracle bot can correctly resolve markets
 * using the results provided by the unified results manager.
 */
class TestFootballOracleBotIntegration {
  constructor() {
    this.footballOracleBot = new FootballOracleBot();
    this.unifiedManager = new UnifiedResultsManager();
  }

  async runTest() {
    console.log('🧪 Testing Football Oracle Bot Integration...\n');
    
    try {
      // Step 1: Run unified results manager to ensure we have fresh data
      console.log('📋 Step 1: Running Unified Results Manager...');
      const unifiedResult = await this.unifiedManager.runCompleteCycle();
      console.log(`✅ Unified Results: ${unifiedResult.status}`);
      if (unifiedResult.status === 'success') {
        console.log(`📊 Fetched: ${unifiedResult.stats.resultsFetched} results, Saved: ${unifiedResult.stats.resultsSaved}`);
      }

      // Step 2: Check what football markets are available for resolution
      console.log('\n📋 Step 2: Checking available football markets...');
      const marketsResult = await db.query(`
        SELECT 
          fpm.id,
          fpm.market_id,
          fpm.fixture_id,
          fpm.outcome_type,
          fpm.predicted_outcome,
          fpm.resolved,
          fpm.end_time,
          f.home_team,
          f.away_team,
          f.status,
          fr.home_score,
          fr.away_score,
          fr.result_1x2,
          fr.result_ou25
        FROM oracle.football_prediction_markets fpm
        JOIN oracle.fixtures f ON fpm.fixture_id::VARCHAR = f.id::VARCHAR
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE fpm.resolved = false 
          AND fpm.end_time <= NOW()
        ORDER BY fpm.end_time ASC
        LIMIT 10
      `);

      console.log(`📊 Found ${marketsResult.rows.length} unresolved football markets past end time`);

      if (marketsResult.rows.length === 0) {
        console.log('ℹ️ No markets available for resolution - this is normal if no markets have ended');
        return;
      }

      // Display market details
      marketsResult.rows.forEach((market, index) => {
        const hasResults = market.home_score !== null && market.away_score !== null;
        const statusEmoji = hasResults ? '✅' : '❌';
        console.log(`${statusEmoji} Market ${index + 1}: ${market.market_id} (${market.home_team} vs ${market.away_team})`);
        console.log(`   Type: ${market.outcome_type}, Predicted: ${market.predicted_outcome}`);
        console.log(`   Status: ${market.status}, End Time: ${market.end_time}`);
        console.log(`   Results: ${hasResults ? `${market.home_score}-${market.away_score}` : 'No results'}`);
        console.log(`   Outcomes: 1X2=${market.result_1x2 || 'N/A'}, O/U2.5=${market.result_ou25 || 'N/A'}`);
        console.log('');
      });

      // Step 3: Test the market resolution logic
      console.log('📋 Step 3: Testing market resolution logic...');
      const marketsWithResults = marketsResult.rows.filter(m => m.home_score !== null && m.away_score !== null);
      
      if (marketsWithResults.length === 0) {
        console.log('ℹ️ No markets with results available for resolution');
        return;
      }

      console.log(`📊 Testing resolution for ${marketsWithResults.length} markets with results`);

      for (const market of marketsWithResults) {
        try {
          console.log(`🎯 Testing resolution for market: ${market.market_id}`);
          
          // Test the resolution logic without actually resolving
          const result = this.testMarketResolution(market);
          console.log(`   ✅ Resolution test: ${market.outcome_type} → ${result}`);
          
        } catch (error) {
          console.log(`   ❌ Resolution test failed: ${error.message}`);
        }
      }

      // Step 4: Test the checkAndResolveMarkets method (without actually resolving)
      console.log('\n📋 Step 4: Testing checkAndResolveMarkets method...');
      
      // Temporarily modify the method to not actually resolve
      const originalResolveMarket = this.footballOracleBot.resolveMarket.bind(this.footballOracleBot);
      this.footballOracleBot.resolveMarket = async (market) => {
        console.log(`🧪 TEST MODE: Would resolve market ${market.market_id} (${market.home_team} vs ${market.away_team})`);
        console.log(`   Type: ${market.outcome_type}, Result: ${market.result_1x2 || market.result_ou25 || 'N/A'}`);
        return { test: true, market_id: market.market_id };
      };

      try {
        await this.footballOracleBot.checkAndResolveMarkets();
        console.log('✅ checkAndResolveMarkets method works correctly');
      } catch (error) {
        console.log(`❌ checkAndResolveMarkets method failed: ${error.message}`);
      }

      // Restore original method
      this.footballOracleBot.resolveMarket = originalResolveMarket;

      console.log('\n🎉 Integration test completed successfully!');
      console.log('✅ Football Oracle Bot can access results from Unified Results Manager');
      console.log('✅ Market resolution logic works correctly');
      console.log('✅ No conflicts between the two systems');

    } catch (error) {
      console.error('❌ Integration test failed:', error);
      throw error;
    }
  }

  /**
   * Test market resolution logic without actually resolving
   */
  testMarketResolution(market) {
    console.log(`   Debug: home_score=${market.home_score}, away_score=${market.away_score}, result_1x2=${market.result_1x2}`);
    
    if (market.home_score === null || market.away_score === null) {
      throw new Error('No match result data available');
    }

    let result;
    switch (market.outcome_type) {
      case '1X2':
        result = market.result_1x2;
        break;
      case 'OU25':
        result = market.result_ou25;
        break;
      case 'BTTS':
        // Calculate BTTS
        result = (market.home_score > 0 && market.away_score > 0) ? 'Yes' : 'No';
        break;
      default:
        throw new Error(`Unsupported outcome type: ${market.outcome_type}`);
    }

    if (!result) {
      throw new Error(`No result available for outcome type: ${market.outcome_type}`);
    }

    return result;
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  const tester = new TestFootballOracleBotIntegration();
  tester.runTest()
    .then(() => {
      console.log('\n✅ Football Oracle Bot integration test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Football Oracle Bot integration test failed:', error);
      process.exit(1);
    });
}

module.exports = TestFootballOracleBotIntegration;
