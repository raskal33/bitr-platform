const OddysseyManager = require('./services/oddyssey-manager');
const db = require('./db/db');

async function createTestCycle() {
  try {
    console.log('🔧 Creating test cycle with future matches...');
    
    // Get matches that start at least 30 minutes in the future
    const matchesQuery = `
      SELECT 
        fixture_id,
        home_team,
        away_team,
        league_name,
        match_date,
        home_odds,
        draw_odds,
        away_odds,
        over_25_odds,
        under_25_odds
      FROM oracle.daily_game_matches 
      WHERE game_date = CURRENT_DATE 
      AND EXTRACT(EPOCH FROM match_date) - EXTRACT(EPOCH FROM NOW()) > 1800
      ORDER BY match_date
      LIMIT 10
    `;
    
    const result = await db.query(matchesQuery);
    const matches = result.rows;
    
    if (matches.length < 10) {
      throw new Error(`Not enough future matches: ${matches.length}/10`);
    }
    
    console.log(`✅ Found ${matches.length} future matches`);
    
    // Format matches for contract
    const contractMatches = matches.map(match => ({
      id: parseInt(match.fixture_id),
      startTime: Math.floor(new Date(match.match_date).getTime() / 1000),
      oddsHome: Math.round(parseFloat(match.home_odds) * 1000),
      oddsDraw: Math.round(parseFloat(match.draw_odds) * 1000),
      oddsAway: Math.round(parseFloat(match.away_odds) * 1000),
      oddsOver: Math.round(parseFloat(match.over_25_odds) * 1000),
      oddsUnder: Math.round(parseFloat(match.under_25_odds) * 1000),
      result: {
        moneyline: 0,
        overUnder: 0
      }
    }));
    
    console.log('📋 Contract matches prepared:');
    contractMatches.forEach((match, i) => {
      const startTime = new Date(match.startTime * 1000);
      console.log(`  ${i+1}. Match ${match.id} at ${startTime.toUTCString()}`);
    });
    
    // Initialize manager and submit to contract
    const oddysseyManager = new OddysseyManager();
    await oddysseyManager.initialize();
    
    // Call contract function directly
    const tx = await oddysseyManager.oddysseyContract.startDailyCycle(contractMatches);
    console.log(`🚀 Daily cycle started! Tx: ${tx.hash}`);
    
    await tx.wait();
    console.log('✅ Daily cycle confirmed');
    
    // Save cycle info to database
    await oddysseyManager.saveCycleInfo(contractMatches, tx.hash);
    
    console.log('🎯 Test cycle created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating test cycle:', error);
    throw error;
  }
}

// Run the script
createTestCycle()
  .then(() => {
    console.log('✅ Test cycle creation complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test cycle creation failed:', error);
    process.exit(1);
  });
