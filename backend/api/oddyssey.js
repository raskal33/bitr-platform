const express = require('express');
const router = express.Router();
const db = require('../db/db');
const OddysseyMatchSelector = require('../services/oddyssey-match-selector');
const PersistentDailyGameManager = require('../services/persistent-daily-game-manager');
const SportMonksService = require('../services/sportmonks');
const { rateLimitMiddleware } = require('../config/redis');
const {
  validateDateParam,
  asyncHandler,
  createErrorResponse,
  createSuccessResponse
} = require('../utils/validation');

// Initialize the services
const oddysseyMatchSelector = new OddysseyMatchSelector();
const persistentDailyGameManager = new PersistentDailyGameManager();
const sportMonksService = new SportMonksService();

// Get current Oddyssey matches (uses persistent storage only)
router.get('/matches', validateDateParam('date', false, true), asyncHandler(async (req, res) => {
  try {
    const { date } = req.query;

    // Get current date
    const today = new Date().toISOString().split('T')[0];
    const targetDate = date || today;

    console.log(`🎯 Fetching Oddyssey matches for ${targetDate} (using persistent storage)`);

    // Get the current active cycle directly
    const cycleQuery = `
      SELECT cycle_id, matches_data, cycle_start_time
      FROM oracle.oddyssey_cycles 
      WHERE is_resolved = false
      ORDER BY cycle_id DESC
      LIMIT 1
    `;
    const cycleResult = await db.query(cycleQuery);
  
    if (cycleResult.rows.length === 0) {
      console.log(`⚠️ No active cycle found`);
      return res.json({
        success: true,
        data: {
          today: {
            date: targetDate,
            matches: [],
            count: 0
          },
          yesterday: {
            date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            matches: [],
            count: 0
          }
        },
        meta: {
          total_matches: 0,
          expected_matches: 10,
          cycle_id: null,
          source: 'direct_cycle_query',
          operation: 'get_matches'
        },
        message: 'No active cycle found'
      });
    }

    const cycle = cycleResult.rows[0];
    console.log(`📊 Using cycle ${cycle.cycle_id} for ${targetDate}`);

    // Parse matches_data from JSONB - it contains objects with id property
    let fixtureIds = [];
    try {
      if (Array.isArray(cycle.matches_data)) {
        // Extract fixture IDs from objects that have an 'id' property
        fixtureIds = cycle.matches_data
          .filter(match => match && match.id)
          .map(match => match.id.toString());
      } else if (typeof cycle.matches_data === 'string') {
        // Try to parse as JSON if it's a string
        const parsed = JSON.parse(cycle.matches_data);
        if (Array.isArray(parsed)) {
          fixtureIds = parsed
            .filter(match => match && match.id)
            .map(match => match.id.toString());
        }
      } else {
        fixtureIds = [];
      }
      console.log(`📊 Parsed ${fixtureIds.length} fixture IDs from cycle data: ${fixtureIds.join(', ')}`);
    } catch (error) {
      console.error('❌ Error parsing matches_data:', error);
      fixtureIds = [];
    }

    if (fixtureIds.length === 0) {
      console.log(`⚠️ No fixture IDs found in cycle ${cycle.cycle_id}`);
      return res.json({
        success: true,
        data: {
          today: {
            date: targetDate,
            matches: [],
            count: 0
          },
          yesterday: {
            date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            matches: [],
            count: 0
          }
        },
        meta: {
          total_matches: 0,
          expected_matches: 10,
          cycle_id: cycle.cycle_id,
          source: 'direct_cycle_query',
          operation: 'get_matches'
        },
        message: 'No fixture IDs found in cycle'
      });
    }

    console.log(`🔍 Looking for fixtures with IDs: ${fixtureIds.join(', ')}`);
    
    // Get fixture details for all matches
    const fixtureQuery = `
      SELECT id, home_team, away_team, league_name, match_date
      FROM oracle.fixtures 
      WHERE id = ANY($1)
    `;
    const fixtureResult = await db.query(fixtureQuery, [fixtureIds]);
    const fixtures = fixtureResult.rows.reduce((acc, fixture) => {
      acc[fixture.id] = fixture;
      return acc;
    }, {});

    // Get odds for all fixtures - ONLY FULL TIME ODDS (market_id = 1 for 1X2, market_id = 80 for Over/Under)
    const oddsQuery = `
      SELECT fixture_id, label, value
      FROM oracle.fixture_odds 
      WHERE fixture_id = ANY($1)
      AND (
        (market_id = '1' AND label IN ('Home', 'Draw', 'Away')) OR
        (market_id = '80' AND label IN ('Over', 'Under') AND total = '2.500000')
      )
    `;
    const oddsResult = await db.query(oddsQuery, [fixtureIds]);
    const odds = oddsResult.rows.reduce((acc, odd) => {
      if (!acc[odd.fixture_id]) {
        acc[odd.fixture_id] = {};
      }
      acc[odd.fixture_id][odd.label.toLowerCase()] = parseFloat(odd.value);
      return acc;
    }, {});

    // Transform fixture IDs to matches with odds
    const matches = fixtureIds.map((fixtureId, index) => {
      const fixture = fixtures[fixtureId] || {};
      const fixtureOdds = odds[fixtureId] || {};
      
      return {
        id: fixtureId,
        fixture_id: fixtureId,
        home_team: fixture.home_team || 'Unknown Team',
        away_team: fixture.away_team || 'Unknown Team',
        league_name: fixture.league_name || 'Unknown League',
        match_date: fixture.match_date || new Date().toISOString(),
        home_odds: fixtureOdds.home || 2.0,
        draw_odds: fixtureOdds.draw || 3.0,
        away_odds: fixtureOdds.away || 2.5,
        over_25_odds: fixtureOdds.over || 2.0,
        under_25_odds: fixtureOdds.under || 1.8,
        display_order: index + 1,
        cycle_id: cycle.cycle_id
      };
    });

    if (matches.length > 0) {
      console.log(`✅ Found ${matches.length} matches for ${targetDate}`);

      // Transform data to match frontend expectations
      const transformedMatches = matches.map((match, index) => ({
        id: match.id,
        fixture_id: match.fixture_id,
        home_team: match.home_team,
        away_team: match.away_team,
        league_name: match.league_name,
        match_date: match.match_date,
        home_odds: match.home_odds,
        draw_odds: match.draw_odds,
        away_odds: match.away_odds,
        over_odds: match.over_25_odds,
        under_odds: match.under_25_odds,
        market_type: "1x2_ou25",
        display_order: match.display_order
      }));

      return res.json({
        success: true,
        data: {
          today: {
            date: targetDate,
            matches: transformedMatches,
            count: transformedMatches.length
          },
          yesterday: {
            date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            matches: [],
            count: 0
          }
        },
        meta: {
          total_matches: transformedMatches.length,
          expected_matches: 10,
          cycle_id: cycle.cycle_id,
          source: 'direct_cycle_query',
          operation: 'get_matches'
        },
        message: `Found ${transformedMatches.length} matches for ${targetDate}`
      });
    } else {
      console.log(`⚠️ No matches found for ${targetDate}`);
      return res.json({
        success: true,
        data: {
          today: {
            date: targetDate,
            matches: [],
            count: 0
          },
          yesterday: {
            date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            matches: [],
            count: 0
          }
        },
        meta: {
          total_matches: 0,
          expected_matches: 10,
          cycle_id: cycle.cycle_id,
          source: 'direct_cycle_query',
          operation: 'get_matches'
        },
        message: 'No matches found'
      });
    }
  } catch (error) {
    console.error('❌ Error in /matches endpoint:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        details: {
          timestamp: new Date().toISOString(),
          path: '/matches',
          method: 'GET'
        }
      }
    });
  }
}));

// Debug endpoint to check cycles
router.get('/debug-cycles', asyncHandler(async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get all cycles
    const allCyclesQuery = `
      SELECT cycle_id, cycle_start_time, is_resolved, matches_count, 
             DATE(cycle_start_time) as cycle_date,
             DATE(cycle_start_time AT TIME ZONE 'UTC') as cycle_date_utc
      FROM oracle.oddyssey_cycles 
      ORDER BY cycle_id DESC
      LIMIT 10
    `;
    const allCycles = await db.query(allCyclesQuery);
    
    // Get cycles for today
    const todayCyclesQuery = `
      SELECT cycle_id, cycle_start_time, is_resolved, matches_count
      FROM oracle.oddyssey_cycles 
      WHERE DATE(cycle_start_time AT TIME ZONE 'UTC') = DATE($1)
      ORDER BY cycle_id DESC
    `;
    const todayCycles = await db.query(todayCyclesQuery, [today]);
    
    res.json({
      success: true,
      data: {
        today: today,
        all_cycles: allCycles.rows,
        today_cycles: todayCycles.rows
      }
    });
  } catch (error) {
    console.error('Error in debug-cycles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}));

// Select and persist daily matches (admin endpoint)
router.post('/select-and-persist-matches', validateDateParam('date', false, false), asyncHandler(async (req, res) => {
  const { date } = req.body;

  const targetDate = date || new Date().toISOString().split('T')[0];

  console.log(`🎯 Selecting and persisting daily matches for ${targetDate}...`);

  // Use Persistent Daily Game Manager to select and persist matches
  const result = await persistentDailyGameManager.selectAndPersistDailyMatches(targetDate);

  res.json(createSuccessResponse(
    {
      date: result.date,
      matchCount: result.matchCount,
      cycleId: result.cycleId,
      overwriteProtected: result.overwriteProtected
    },
    {
      operation: 'select_and_persist_matches'
    },
    result.message
  ));
}));

// Validate match count for a date (admin endpoint)
router.get('/validate-matches/:date?', validateDateParam('date', false, true), asyncHandler(async (req, res) => {
  const { date } = req.params;

  const targetDate = date || new Date().toISOString().split('T')[0];

  console.log(`🔍 Validating match count for ${targetDate}...`);

  // Use Persistent Daily Game Manager to validate matches
  const result = await persistentDailyGameManager.validateMatchCount(targetDate);

  res.json(createSuccessResponse(
    result,
    {
      operation: 'validate_matches'
    }
  ));
}));

// Populate Oddyssey daily game matches (admin endpoint) - DEPRECATED
router.post('/populate-matches', async (req, res) => {
  try {
    console.log('⚠️ DEPRECATED: Use /select-and-persist-matches instead');

    // Redirect to new endpoint
    const targetDate = new Date().toISOString().split('T')[0];
    const result = await persistentDailyGameManager.selectAndPersistDailyMatches(targetDate);

    res.json({
      success: result.success,
      message: `DEPRECATED ENDPOINT - ${result.message}`,
      data: {
        today: result.matchCount
      }
    });

  } catch (error) {
    console.error('Error in deprecated populate matches:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to populate Oddyssey matches (deprecated endpoint)'
    });
  }
});

// Test endpoint to check database tables (admin endpoint)
router.get('/test-db', asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Testing database tables...');

    // Check if oddyssey schema exists
    const schemaCheck = await db.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'oddyssey'
    `);

    // Check if daily_game_matches table exists
    const tableCheck = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'oddyssey' 
      AND table_name = 'daily_game_matches'
    `);

    // Check fixtures count
    const fixturesCount = await db.query('SELECT COUNT(*) FROM oracle.fixtures');

    // Check if we have fixtures for today only
    const today = new Date().toISOString().split('T')[0];

    const todayFixtures = await db.query(`
      SELECT COUNT(*) FROM oracle.fixtures 
      WHERE DATE(match_date) = $1
      AND league_name NOT ILIKE '%women%'
      AND league_name NOT ILIKE '%female%'
      AND league_name NOT ILIKE '%ladies%'
      AND home_team NOT ILIKE '%women%'
      AND away_team NOT ILIKE '%women%'
      AND home_team NOT ILIKE '%female%'
      AND away_team NOT ILIKE '%female%'
      AND home_team NOT ILIKE '%ladies%'
      AND away_team NOT ILIKE '%ladies%'
    `, [today]);

    res.json(createSuccessResponse(
      {
        oddyssey_schema_exists: schemaCheck.rows.length > 0,
        daily_game_matches_exists: tableCheck.rows.length > 0,
        total_fixtures: parseInt(fixturesCount.rows[0].count),
        today_fixtures: parseInt(todayFixtures.rows[0].count),
        today_date: today
      },
      {
        operation: 'database_test'
      }
    ));
  } catch (error) {
    console.error('Error in test-db endpoint:', error);
    res.status(500).json(createErrorResponse(
      'Database test failed',
      {
        operation: 'database_test',
        error: error.message
      }
    ));
  }
}));

// Debug endpoint to check contract status
router.get('/contract-status', asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Checking Oddyssey contract status...');
    
    const Web3Service = require('../services/web3-service');
    const web3Service = new Web3Service();
    const contract = await web3Service.getOddysseyContract();
    
    // Get current cycle ID
    const currentCycleId = await contract.dailyCycleId();
    console.log(`📊 Current cycle ID: ${currentCycleId}`);
    
    // Get cycle status - returns tuple: (exists, endTime, prizePool, isResolved, slipCount)
    const cycleStatus = await contract.getCycleStatus(currentCycleId);
    console.log(`📊 Cycle status:`, cycleStatus);
    
    // Destructure the tuple
    const [exists, endTime, prizePool, isResolved, slipCount] = cycleStatus;
    
    // Try to get matches from contract
    let contractMatches = [];
    try {
      contractMatches = await contract.getDailyMatches(currentCycleId);
      console.log(`📊 Contract matches: ${contractMatches.length}`);
    } catch (error) {
      console.error('❌ Error getting matches from contract:', error.message);
    }
    
    // Get matches from database
    const dbResult = await persistentDailyGameManager.getDailyMatches();
    console.log(`📊 Database matches: ${dbResult.matches.length}`);
    
    return res.json({
      success: true,
      data: {
        contract: {
          cycleId: currentCycleId.toString(),
          cycleStatus: {
            exists: exists,
            endTime: endTime ? endTime.toString() : '0',
            prizePool: prizePool ? prizePool.toString() : '0',
            isResolved: isResolved,
            slipCount: slipCount ? slipCount.toString() : '0'
          },
          matchesCount: contractMatches.length,
          matches: contractMatches.map(match => ({
            id: match.id.toString(),
            startTime: match.startTime.toString(),
            oddsHome: match.oddsHome.toString(),
            oddsDraw: match.oddsDraw.toString(),
            oddsAway: match.oddsAway.toString(),
            oddsOver: match.oddsOver.toString(),
            oddsUnder: match.oddsUnder.toString(),
            result: {
              moneyline: match.result.moneyline.toString(),
              overUnder: match.result.overUnder.toString()
            }
          }))
        },
        database: {
          matchesCount: dbResult.matches.length,
          matches: dbResult.matches.slice(0, 3) // Show first 3 for debugging
        },
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking contract status:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Contract validation endpoint for frontend
router.get('/contract-validation', asyncHandler(async (req, res) => {
  try {
    console.log('🎯 Frontend requesting contract validation...');
    
    // Get matches directly from the contract
    const Web3Service = require('../services/web3-service');
    const web3Service = new Web3Service();
    const contract = await web3Service.getOddysseyContract();
    
    // Get current cycle ID
    const currentCycleId = await contract.dailyCycleId();
    console.log(`📊 Contract cycle ID: ${currentCycleId}`);
    
    // Get matches directly from contract
    let contractMatches = [];
    try {
      contractMatches = await contract.getDailyMatches(currentCycleId);
      console.log(`📊 Retrieved ${contractMatches.length} matches from contract`);
    } catch (error) {
      console.error('❌ Error getting matches from contract:', error.message);
      return res.json({
        success: false,
        validation: {
          hasMatches: false,
          matchCount: 0,
          expectedCount: 10,
          isValid: false,
          contractMatches: [],
          error: 'No active matches found in contract. Please wait for the next cycle.'
        }
      });
    }
    
    const isValid = contractMatches.length === 10;
    
    // Transform contract matches to include match IDs for frontend validation
    const transformedMatches = contractMatches.map((match, index) => ({
      id: parseInt(match.id.toString()),
      startTime: parseInt(match.startTime.toString()),
      oddsHome: parseInt(match.oddsHome.toString()),
      oddsDraw: parseInt(match.oddsDraw.toString()),
      oddsAway: parseInt(match.oddsAway.toString()),
      oddsOver: parseInt(match.oddsOver.toString()),
      oddsUnder: parseInt(match.oddsUnder.toString()),
      displayOrder: index + 1
    }));
    
    return res.json({
      success: true,
      validation: {
        hasMatches: contractMatches.length > 0,
        matchCount: contractMatches.length,
        expectedCount: 10,
        isValid: isValid,
        contractMatches: transformedMatches,
        cycleId: currentCycleId.toString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error in contract-validation endpoint:', error);
    return res.json({
      success: false,
      validation: {
        hasMatches: false,
        matchCount: 0,
        expectedCount: 10,
        isValid: false,
        contractMatches: [],
        error: 'Contract validation failed: ' + error.message
      }
    });
  }
}));

// Frontend-compatible endpoint that mimics contract getDailyMatches
router.get('/contract-matches', asyncHandler(async (req, res) => {
  try {
    console.log('🎯 Frontend requesting contract-compatible matches...');
    
    // Get matches directly from the contract, not the database
    const Web3Service = require('../services/web3-service');
    const web3Service = new Web3Service();
    const contract = await web3Service.getOddysseyContract();
    
    // Get current cycle ID
    const currentCycleId = await contract.dailyCycleId();
    console.log(`📊 Getting matches from contract cycle: ${currentCycleId}`);
    
    // Get matches directly from contract
    let contractMatches = [];
    try {
      contractMatches = await contract.getDailyMatches(currentCycleId);
      console.log(`📊 Retrieved ${contractMatches.length} matches from contract`);
    } catch (error) {
      console.error('❌ Error getting matches from contract:', error.message);
      return res.json({
        success: false,
        error: 'No active matches found in contract. Please wait for the next cycle.',
        data: []
      });
    }
    
    if (contractMatches.length === 0) {
      console.log('⚠️ No matches found in contract');
      return res.json({
        success: false,
        error: 'No active matches found in contract. Please wait for the next cycle.',
        data: []
      });
    }
    
    console.log(`✅ Returning ${contractMatches.length} matches from contract for frontend`);
    
    // Get match details from database to add team names and league info
    const matchIds = contractMatches.map(m => m.id.toString());
    let matchDetails = {};
    
    try {
      const detailsResult = await db.query(`
        SELECT id as fixture_id, home_team, away_team, league_name 
        FROM oracle.fixtures 
        WHERE id = ANY($1)
      `, [matchIds]);
      
      detailsResult.rows.forEach(row => {
        matchDetails[row.fixture_id] = {
          homeTeam: row.home_team,
          awayTeam: row.away_team,
          leagueName: row.league_name
        };
      });
    } catch (dbError) {
      console.warn('⚠️ Could not fetch match details from database:', dbError.message);
    }
    
    // Transform contract matches to frontend format
    const transformedMatches = contractMatches.map((match, index) => ({
      id: parseInt(match.id.toString()),
      startTime: parseInt(match.startTime.toString()),
      oddsHome: parseInt(match.oddsHome.toString()),
      oddsDraw: parseInt(match.oddsDraw.toString()),
      oddsAway: parseInt(match.oddsAway.toString()),
      oddsOver: parseInt(match.oddsOver.toString()),
      oddsUnder: parseInt(match.oddsUnder.toString()),
      result: {
        moneyline: parseInt(match.result.moneyline.toString()),
        overUnder: parseInt(match.result.overUnder.toString())
      },
      // Additional frontend-friendly fields from database
      homeTeam: matchDetails[match.id.toString()]?.homeTeam || `Team ${match.id}`,
      awayTeam: matchDetails[match.id.toString()]?.awayTeam || `Team ${match.id}`,
      leagueName: matchDetails[match.id.toString()]?.leagueName || 'Unknown League',
      displayOrder: index + 1
    }));
    
    return res.json({
      success: true,
      data: transformedMatches,
      cycleId: currentCycleId.toString(),
      totalMatches: transformedMatches.length,
      source: 'contract' // Indicate this comes from contract, not database
    });
    
  } catch (error) {
    console.error('❌ Error in contract-matches endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch contract matches',
      data: []
    });
  }
}));

// Contract service validation endpoint (no redundant API calls)
router.get('/contract-validation', asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Contract service validation request...');
    
    // Get matches from database directly (no API call)
    const result = await persistentDailyGameManager.getDailyMatches();
    
    if (!result.success || result.matches.length === 0) {
      return res.json({
        success: false,
        error: 'No matches available for validation',
        validation: {
          hasMatches: false,
          matchCount: 0,
          expectedCount: 10,
          isValid: false
        }
      });
    }
    
    // Validate match count
    const isValid = result.matches.length === 10;
    
    console.log(`✅ Contract validation: ${result.matches.length}/10 matches found`);
    
    // Transform matches to contract format for frontend ordering
    const contractMatches = result.matches.map((match, index) => ({
      id: parseInt(match.fixture_id),
      startTime: Math.floor(new Date(match.match_date).getTime() / 1000),
      oddsHome: Math.floor(parseFloat(match.home_odds) * 1000),
      oddsDraw: Math.floor(parseFloat(match.draw_odds) * 1000),
      oddsAway: Math.floor(parseFloat(match.away_odds) * 1000),
      oddsOver: Math.floor(parseFloat(match.over_25_odds) * 1000),
      oddsUnder: Math.floor(parseFloat(match.under_25_odds) * 1000),
      result: {
        moneyline: 0, // NotSet
        overUnder: 0  // NotSet
      },
      // Additional frontend-friendly fields
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      leagueName: match.league_name,
      displayOrder: index + 1
    }));
    
    return res.json({
      success: true,
      validation: {
        hasMatches: true,
        matchCount: result.matches.length,
        expectedCount: 10,
        isValid: isValid,
        cycleId: result.cycleId,
        contractMatches: contractMatches // Include contract matches for frontend ordering
      },
      data: {
        cycleId: result.cycleId,
        totalMatches: result.matches.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error in contract validation endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to validate contract matches',
      validation: {
        hasMatches: false,
        matchCount: 0,
        expectedCount: 10,
        isValid: false
      }
    });
  }
}));

// Sync database matches to contract format (admin endpoint)
router.post('/sync-to-contract', asyncHandler(async (req, res) => {
  try {
    console.log('🔄 Syncing database matches to contract format...');
    
    // Get current matches from database
    const result = await persistentDailyGameManager.getDailyMatches();
    
    if (!result.success || result.matches.length === 0) {
      return res.json({
        success: false,
        error: 'No matches found in database to sync'
      });
    }
    
    // Transform to contract format
    const contractMatches = result.matches.map((match, index) => ({
      id: parseInt(match.fixture_id),
      startTime: Math.floor(new Date(match.match_date).getTime() / 1000),
      oddsHome: Math.floor(parseFloat(match.home_odds) * 1000),
      oddsDraw: Math.floor(parseFloat(match.draw_odds) * 1000),
      oddsAway: Math.floor(parseFloat(match.away_odds) * 1000),
      oddsOver: Math.floor(parseFloat(match.over_25_odds) * 1000),
      oddsUnder: Math.floor(parseFloat(match.under_25_odds) * 1000),
      result: {
        moneyline: 0, // NotSet
        overUnder: 0  // NotSet
      }
    }));
    
    console.log(`✅ Synced ${contractMatches.length} matches to contract format`);
    
    return res.json({
      success: true,
      data: {
        matches: contractMatches,
        totalMatches: contractMatches.length,
        cycleId: result.cycleId,
        message: 'Database matches synced to contract format successfully'
      }
    });
    
  } catch (error) {
    console.error('❌ Error syncing to contract format:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Debug endpoint to test the matches query
router.get('/debug-matches', async (req, res) => {
  try {
    console.log('🔍 Debugging matches query...');

    const today = new Date().toISOString().split('T')[0];

    // Test the exact query that's failing
    const result = await db.query(`
      SELECT 
        f.id as id,
        f.id as fixture_id,
        f.home_team, f.away_team, f.match_date, f.league_name,
        fo.value as odds_data
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_odds fo ON f.id::VARCHAR = fo.fixture_id
      WHERE DATE(f.match_date) = $1
      AND f.league_name NOT ILIKE '%women%'
      AND f.league_name NOT ILIKE '%female%'
      AND f.league_name NOT ILIKE '%ladies%'
      AND f.home_team NOT ILIKE '%women%'
      AND f.away_team NOT ILIKE '%women%'
      AND f.home_team NOT ILIKE '%female%'
      AND f.away_team NOT ILIKE '%female%'
      AND f.home_team NOT ILIKE '%ladies%'
      AND f.away_team NOT ILIKE '%ladies%'
      ORDER BY f.match_date ASC
      LIMIT 10
    `, [today]);

    res.json({
      success: true,
      data: {
        today_date: today,
        query_result: result.rows,
        row_count: result.rows.length
      }
    });

  } catch (error) {
    console.error('Error in debug matches:', error);
    res.status(500).json({
      success: false,
      message: 'Debug matches failed',
      error: error.message
    });
  }
});

// Health check endpoint for monitoring
router.get('/health', asyncHandler(async (req, res) => {
  try {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'oddyssey-api',
      version: '1.0.0',
      checks: {}
    };

    // Check database connectivity
    try {
      await db.query('SELECT 1');
      healthCheck.checks.database = {
        status: 'healthy',
        message: 'Database connection successful'
      };
    } catch (dbError) {
      healthCheck.status = 'unhealthy';
      healthCheck.checks.database = {
        status: 'unhealthy',
        message: 'Database connection failed',
        error: dbError.message
      };
    }

    // Check if oddyssey schema exists
    try {
      const schemaCheck = await db.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name = 'oddyssey'
      `);

      healthCheck.checks.oddyssey_schema = {
        status: schemaCheck.rows.length > 0 ? 'healthy' : 'unhealthy',
        message: schemaCheck.rows.length > 0 ? 'Oddyssey schema exists' : 'Oddyssey schema missing'
      };

      if (schemaCheck.rows.length === 0) {
        healthCheck.status = 'unhealthy';
      }
    } catch (schemaError) {
      healthCheck.status = 'unhealthy';
      healthCheck.checks.oddyssey_schema = {
        status: 'unhealthy',
        message: 'Failed to check oddyssey schema',
        error: schemaError.message
      };
    }

    // Check if daily_game_matches table exists
    try {
      const tableCheck = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'oddyssey' 
        AND table_name = 'daily_game_matches'
      `);

      healthCheck.checks.daily_game_matches_table = {
        status: tableCheck.rows.length > 0 ? 'healthy' : 'unhealthy',
        message: tableCheck.rows.length > 0 ? 'daily_game_matches table exists' : 'daily_game_matches table missing'
      };

      if (tableCheck.rows.length === 0) {
        healthCheck.status = 'unhealthy';
      }
    } catch (tableError) {
      healthCheck.status = 'unhealthy';
      healthCheck.checks.daily_game_matches_table = {
        status: 'unhealthy',
        message: 'Failed to check daily_game_matches table',
        error: tableError.message
      };
    }

    // Check today's matches availability
    try {
      const today = new Date().toISOString().split('T')[0];
      const matchesCheck = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.daily_game_matches 
        WHERE game_date = $1
      `, [today]);

      const matchCount = parseInt(matchesCheck.rows[0].count);
      healthCheck.checks.todays_matches = {
        status: matchCount === 10 ? 'healthy' : 'warning',
        message: `Found ${matchCount} matches for today (expected: 10)`,
        count: matchCount,
        date: today
      };

      if (matchCount === 0) {
        healthCheck.status = healthCheck.status === 'healthy' ? 'warning' : healthCheck.status;
      }
    } catch (matchesError) {
      healthCheck.checks.todays_matches = {
        status: 'unhealthy',
        message: 'Failed to check today\'s matches',
        error: matchesError.message
      };
    }

    // Check persistent daily game manager service
    try {
      const serviceCheck = await persistentDailyGameManager.validateMatchCount();
      healthCheck.checks.persistent_service = {
        status: serviceCheck.isValid ? 'healthy' : 'warning',
        message: serviceCheck.message,
        details: {
          date: serviceCheck.date,
          count: serviceCheck.count,
          expected: serviceCheck.expected
        }
      };
    } catch (serviceError) {
      healthCheck.checks.persistent_service = {
        status: 'unhealthy',
        message: 'Persistent Daily Game Manager service check failed',
        error: serviceError.message
      };
    }

    // Set overall status based on critical checks
    const criticalChecks = ['database', 'oddyssey_schema', 'daily_game_matches_table'];
    const hasCriticalFailure = criticalChecks.some(check =>
      healthCheck.checks[check]?.status === 'unhealthy'
    );

    if (hasCriticalFailure && healthCheck.status === 'healthy') {
      healthCheck.status = 'unhealthy';
    }

    // Return appropriate HTTP status
    const httpStatus = healthCheck.status === 'healthy' ? 200 :
      healthCheck.status === 'warning' ? 200 : 503;

    res.status(httpStatus).json(healthCheck);
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'oddyssey-api',
      version: '1.0.0',
      error: error.message,
      checks: {}
    });
  }
}));

// Get Oddyssey matches for a specific date
router.get('/matches/:date', validateDateParam('date', true, true), asyncHandler(async (req, res) => {
  const { date } = req.params;

  console.log(`🎯 Fetching Oddyssey matches for specific date: ${date}`);

  // Use Persistent Daily Game Manager for consistent data access
  const result = await persistentDailyGameManager.getDailyMatches(date);

  if (result.success && result.matches.length > 0) {
    // Transform data to match frontend expectations
    const transformedMatches = result.matches.map(match => ({
      id: match.fixture_id,
      fixture_id: match.fixture_id,
      home_team: match.home_team,
      away_team: match.away_team,
      match_date: match.match_date,
      league_name: match.league_name,
      display_order: match.display_order,
      odds: {
        home: parseFloat(match.home_odds) || 0,
        draw: parseFloat(match.draw_odds) || 0,
        away: parseFloat(match.away_odds) || 0,
        over_25: parseFloat(match.over_25_odds) || 0,
        under_25: parseFloat(match.under_25_odds) || 0
      },
      cycle_id: match.cycle_id
    }));

    res.json(createSuccessResponse(
      {
        date: date,
        matches: transformedMatches,
        count: transformedMatches.length
      },
      {
        total_matches: transformedMatches.length,
        expected_matches: 10,
        cycle_id: result.cycleId,
        source: 'persistent_storage',
        operation: 'get_matches_by_date'
      }
    ));
  } else {
    res.json(createSuccessResponse(
      {
        date: date,
        matches: [],
        count: 0
      },
      {
        total_matches: 0,
        expected_matches: 10,
        cycle_id: null,
        source: 'persistent_storage',
        operation: 'get_matches_by_date'
      },
      result.message || 'No matches found for this date'
    ));
  }
}));

// Trigger Oddyssey match selection (admin endpoint) - 1-day strategy
router.post('/select-matches', async (req, res) => {
  try {
    console.log('🎯 Triggering Oddyssey match selection (1-day strategy)...');

    // Select matches for today only using 1-day strategy
    const selections = await oddysseyMatchSelector.selectDailyMatches();

    // Save selections to database
    await oddysseyMatchSelector.saveOddysseyMatches(selections);

    res.json({
      success: true,
      message: 'Oddyssey matches selected successfully (1-day strategy)',
      data: {
        today: {
          date: selections.today.date,
          count: selections.today.matches.length
        }
      }
    });

  } catch (error) {
    console.error('Error selecting Oddyssey matches:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Trigger Oddyssey match selection (admin endpoint) - Original difficulty-based strategy
router.post('/select-matches-difficulty', async (req, res) => {
  try {
    console.log('🎯 Triggering Oddyssey match selection (difficulty-based strategy)...');

    // Select matches using original difficulty-based strategy
    const result = await oddysseyMatchSelector.selectDailyMatches();

    res.json({
      success: true,
      message: 'Oddyssey matches selected successfully (difficulty-based strategy)',
      data: {
        selectedMatches: result.selectedMatches.length,
        summary: result.summary
      }
    });

  } catch (error) {
    console.error('Error selecting Oddyssey matches:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get Oddyssey statistics (global or user-specific)
router.get('/stats', async (req, res) => {
  try {
    const { type, address } = req.query;

    if (type === 'user' && !address) {
      return res.status(400).json({
        success: false,
        message: 'User address required for user stats'
      });
    }

    if (type === 'user') {
      // Get user's overall statistics
      const userStats = await getUserStats(address);
      return res.json({
        success: true,
        data: userStats
      });
    } else {
      // Get global statistics
      const globalStats = await getGlobalStats();
      return res.json({
        success: true,
        data: globalStats
      });
    }

  } catch (error) {
    console.error('Error fetching Oddyssey stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get current cycle information
router.get('/current-cycle', async (req, res) => {
  try {
    const currentCycle = await db.query(`
      SELECT * FROM oracle.current_oddyssey_cycle
    `);

    if (currentCycle.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No active cycle found'
      });
    }

    res.json({
      success: true,
      data: currentCycle.rows[0]
    });

  } catch (error) {
    console.error('Error fetching current cycle:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Place a new slip (submit predictions) with strict contract validation
router.post('/place-slip', rateLimitMiddleware((req) => `place-slip:${req.body.playerAddress}`, 3, 60), async (req, res) => {
  try {
    const { playerAddress, predictions, cycleId } = req.body;

    // Validate exact count requirement
    if (!playerAddress || !predictions || !Array.isArray(predictions) || predictions.length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: playerAddress and exactly 10 predictions required'
      });
    }

    // Validate predictions format - handle both frontend and backend formats
    for (let prediction of predictions) {
      // Frontend format: { matchId, prediction, odds }
      // Backend format: { matchId, betType, selection }
      
      if (!prediction.matchId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid prediction format: matchId is required'
        });
      }
      
      let betType, selection;
      
      // Handle frontend format
      if (prediction.prediction) {
        selection = prediction.prediction;
        // Determine bet type based on selection
        if (['1', 'X', '2'].includes(selection)) {
          betType = 'MONEYLINE';
        } else if (['Over', 'Under'].includes(selection)) {
          betType = 'OVER_UNDER';
        } else {
          return res.status(400).json({
            success: false,
            message: `Invalid prediction selection: ${selection}. Must be 1, X, 2, Over, or Under`
          });
        }
      }
      // Handle backend format
      else if (prediction.betType && prediction.selection) {
        betType = prediction.betType;
        selection = prediction.selection;
      }
      else {
        return res.status(400).json({
          success: false,
          message: 'Invalid prediction format: must have either (prediction) or (betType, selection)'
        });
      }
      
      // Validate bet type
      if (!['MONEYLINE', 'OVER_UNDER'].includes(betType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid betType: must be MONEYLINE or OVER_UNDER'
        });
      }
      
      // Validate selection based on bet type
      if (betType === 'MONEYLINE') {
        if (!['1', 'X', '2'].includes(selection)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid moneyline selection: must be 1, X, or 2'
          });
        }
      } else {
        if (!['Over', 'Under'].includes(selection)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid over/under selection: must be Over or Under'
          });
        }
      }
      
      // Convert to backend format for contract processing
      prediction.betType = betType;
      prediction.selection = selection;
    }

    // Get the current cycle ID if not provided
    const actualCycleId = cycleId || 1;

    // Get contract matches for validation
    const Web3Service = require('../services/web3-service');
    const web3Service = new Web3Service();
    
    // Initialize the Web3Service
    await web3Service.initialize();
    
    let contractMatches;
    try {
      contractMatches = await web3Service.getCycleMatches(actualCycleId);
      if (!contractMatches || contractMatches.length !== 10) {
        return res.status(400).json({
          success: false,
          message: `Cycle ${actualCycleId} does not have exactly 10 matches`
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `Failed to get contract matches: ${error.message}`
      });
    }

    // Format predictions according to contract strict rules
    let formattedPredictions;
    try {
      formattedPredictions = web3Service.formatPredictionsForContract(predictions, contractMatches);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `Prediction formatting error: ${error.message}`
      });
    }

    // Place slip on contract
    let tx;
    try {
      tx = await web3Service.placeSlip(formattedPredictions);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `Contract slip placement failed: ${error.message}`
      });
    }

    // Check if the cycle exists in database
    const cycleCheck = await db.query(`
      SELECT cycle_id FROM oracle.oddyssey_cycles WHERE cycle_id = $1
    `, [actualCycleId]);

    if (cycleCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Cycle ${actualCycleId} does not exist in database`
      });
    }

    // Create sequence if it doesn't exist and get next slip ID
    await db.query(`
      CREATE SEQUENCE IF NOT EXISTS oracle.oddyssey_slips_slip_id_seq
      START WITH 1
      INCREMENT BY 1
      NO MINVALUE
      NO MAXVALUE
      CACHE 1
    `);

    // Insert slip into database with all required columns
    const slipResult = await db.query(`
      INSERT INTO oracle.oddyssey_slips (
        slip_id, player_address, cycle_id, predictions, is_evaluated, placed_at, tx_hash,
        creator_address, transaction_hash, category, uses_bitr, creator_stake, odds, pool_id,
        notification_type, message, is_read
      ) VALUES (
        nextval('oracle.oddyssey_slips_slip_id_seq'), $1, $2, $3, FALSE, NOW(), $4,
        $1, $4, 'oddyssey', FALSE, 0.5, 1.0, nextval('oracle.oddyssey_slips_slip_id_seq'),
        'slip_placed', 'Your Oddyssey slip has been placed successfully', FALSE
      )
      RETURNING slip_id
    `, [playerAddress, actualCycleId, JSON.stringify(predictions), tx.hash]);

    const slipId = slipResult.rows[0].slip_id;

    console.log(`✅ Slip ${slipId} created with ${predictions.length} predictions and contract tx: ${tx.hash}`);

    res.json({
      success: true,
      message: 'Slip placed successfully',
      data: {
        slipId: slipId,
        txHash: tx.hash,
        predictionsCount: predictions.length
      }
    });

  } catch (error) {
    console.error('Error placing slip:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Evaluate a slip with contract integration
router.post('/evaluate-slip', async (req, res) => {
  try {
    const { slipId } = req.body;

    if (!slipId) {
      return res.status(400).json({
        success: false,
        message: 'Slip ID is required'
      });
    }

    // Get slip from database
    const slipResult = await db.query(`
      SELECT * FROM oracle.oddyssey_slips WHERE slip_id = $1
    `, [slipId]);

    if (slipResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Slip not found'
      });
    }

    const slip = slipResult.rows[0];

    if (slip.is_evaluated) {
      return res.status(400).json({
        success: false,
        message: 'Slip has already been evaluated'
      });
    }

    // Check if cycle is resolved on contract
    const Web3Service = require('../services/web3-service');
    const web3Service = new Web3Service();
    
    let cycleStatus;
    try {
      cycleStatus = await web3Service.getCycleStatus(slip.cycle_id);
      if (!cycleStatus.exists || Number(cycleStatus.state) !== 3) { // 3 = Resolved
        return res.status(400).json({
          success: false,
          message: 'Cycle is not resolved yet'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `Failed to check cycle status: ${error.message}`
      });
    }

    // Evaluate slip on contract
    let tx;
    try {
      tx = await web3Service.evaluateSlip(slipId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `Contract evaluation failed: ${error.message}`
      });
    }

    // Update database with evaluation results
    await db.query(`
      UPDATE oracle.oddyssey_slips 
      SET is_evaluated = TRUE, 
          tx_hash = $1
      WHERE slip_id = $2
    `, [tx.hash, slipId]);

    console.log(`✅ Slip ${slipId} evaluated on contract with tx: ${tx.hash}`);

    res.json({
      success: true,
      message: 'Slip evaluated successfully',
      data: {
        slipId: slipId,
        txHash: tx.hash
      }
    });

  } catch (error) {
    console.error('Error evaluating slip:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user's slips
router.get('/slips/:playerAddress', async (req, res) => {
  try {
    const { playerAddress } = req.params;
    const { limit = 10 } = req.query;

    const slips = await db.query(`
      SELECT 
        s.slip_id,
        s.cycle_id,
        s.player_address,
        s.creator_address,
        s.pool_id,
        s.transaction_hash,
        s.category,
        s.uses_bitr,
        s.creator_stake,
        s.odds,
        s.notification_type,
        s.message,
        s.is_read,
        s.placed_at as created_at,
        s.predictions,
        s.final_score,
        s.correct_count,
        s.is_evaluated,
        s.leaderboard_rank,
        s.prize_claimed,
        s.tx_hash,
        c.is_resolved as cycle_resolved,
        c.prize_pool,
        c.resolved_at,
        c.cycle_start_time,
        c.cycle_end_time
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      WHERE s.player_address = $1
      ORDER BY s.placed_at DESC
      LIMIT $2
    `, [playerAddress, limit]);

    res.json({
      success: true,
      data: slips.rows
    });

  } catch (error) {
    console.error('Error fetching user slips:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get leaderboard for a specific cycle
router.get('/leaderboard/:cycleId', async (req, res) => {
  try {
    const { cycleId } = req.params;

    const leaderboard = await db.query(`
      SELECT 
        s.player_address,
        s.final_score,
        s.correct_count,
        s.leaderboard_rank,
        s.prize_claimed,
        ROW_NUMBER() OVER (ORDER BY s.final_score DESC, s.correct_count DESC) as rank
      FROM oracle.oddyssey_slips s
      WHERE s.cycle_id = $1 AND s.is_evaluated = TRUE
      ORDER BY s.final_score DESC, s.correct_count DESC
      LIMIT 10
    `, [cycleId]);

    res.json({
      success: true,
      data: leaderboard.rows
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user's slips for a specific cycle
router.get('/user-slips/:cycleId/:address', async (req, res) => {
  try {
    const { cycleId, address } = req.params;

    const userSlips = await db.query(`
      SELECT 
        s.slip_id,
        s.cycle_id,
        s.player_address,
        s.creator_address,
        s.pool_id,
        s.transaction_hash,
        s.category,
        s.uses_bitr,
        s.creator_stake,
        s.odds,
        s.notification_type,
        s.message,
        s.is_read,
        s.placed_at as created_at,
        s.predictions,
        s.final_score,
        s.correct_count,
        s.is_evaluated,
        s.leaderboard_rank,
        s.prize_claimed,
        s.tx_hash,
        c.is_resolved as cycle_resolved,
        c.prize_pool,
        c.resolved_at,
        c.cycle_start_time,
        c.cycle_end_time
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      WHERE s.cycle_id = $1 AND s.player_address = $2
      ORDER BY s.placed_at DESC
    `, [cycleId, address]);

    res.json({
      success: true,
      data: userSlips.rows
    });

  } catch (error) {
    console.error('Error fetching user slips:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all user's slips (not cycle-based)
router.get('/user-slips/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const userSlips = await db.query(`
      SELECT 
        s.slip_id,
        s.cycle_id,
        s.player_address,
        s.creator_address,
        s.pool_id,
        s.transaction_hash,
        s.category,
        s.uses_bitr,
        s.creator_stake,
        s.odds,
        s.notification_type,
        s.message,
        s.is_read,
        s.placed_at as created_at,
        s.predictions,
        s.final_score,
        s.correct_count,
        s.is_evaluated,
        s.leaderboard_rank,
        s.prize_claimed,
        s.tx_hash,
        c.is_resolved as cycle_resolved,
        c.prize_pool,
        c.resolved_at,
        c.cycle_start_time,
        c.cycle_end_time
      FROM oracle.oddyssey_slips s
      LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      WHERE s.player_address = $1
      ORDER BY s.placed_at DESC
    `, [address]);

    res.json({
      success: true,
      data: userSlips.rows,
      meta: {
        count: userSlips.rows.length,
        address: address,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching all user slips:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user preferences
router.get('/preferences/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const result = await db.query(`
      SELECT * FROM oracle.oddyssey_user_preferences 
      WHERE user_address = $1
    `, [address]);

    if (result.rows.length === 0) {
      // Return default preferences
      return res.json({
        success: true,
        data: {
          user_address: address,
          auto_evaluate: false,
          auto_claim: false,
          notifications: true
        }
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update user preferences
router.put('/preferences/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const { auto_evaluate, auto_claim, notifications } = req.body;

    const result = await db.query(`
      INSERT INTO oracle.oddyssey_user_preferences (
        user_address, auto_evaluate, auto_claim, notifications, updated_at
      ) VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_address) DO UPDATE SET
        auto_evaluate = EXCLUDED.auto_evaluate,
        auto_claim = EXCLUDED.auto_claim,
        notifications = EXCLUDED.notifications,
        updated_at = NOW()
    `, [address, auto_evaluate, auto_claim, notifications]);

    res.json({
      success: true,
      message: 'Preferences updated successfully'
    });

  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});



// Helper function to get user statistics
async function getUserStats(address) {
  try {
    // Get user's overall statistics
    const userStats = await db.query(`
      SELECT 
        COUNT(*) as total_slips,
        COUNT(CASE WHEN correct_count >= 5 THEN 1 END) as total_wins,
        COALESCE(MAX(final_score), 0) as best_score,
        COALESCE(AVG(final_score), 0) as average_score,
        COALESCE(SUM(CASE WHEN correct_count >= 5 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 0) as win_rate
      FROM oracle.oddyssey_slips
      WHERE player_address = $1 AND is_evaluated = TRUE
    `, [address]);

    // Get user's current streak
    const streakQuery = await db.query(`
      WITH user_cycles AS (
        SELECT 
          cycle_id,
          correct_count,
          ROW_NUMBER() OVER (ORDER BY cycle_id DESC) as rn
        FROM oracle.oddyssey_slips
        WHERE player_address = $1 AND is_evaluated = TRUE
        ORDER BY cycle_id DESC
      ),
      streak_calc AS (
        SELECT 
          cycle_id,
          correct_count,
          rn,
          CASE 
            WHEN correct_count >= 5 THEN 1
            ELSE 0
          END as is_win,
          SUM(CASE 
            WHEN correct_count >= 5 THEN 1
            ELSE 0
          END) OVER (ORDER BY rn) as running_wins
        FROM user_cycles
      )
      SELECT 
        COUNT(*) as current_streak
      FROM streak_calc
      WHERE is_win = 1 AND running_wins = (
        SELECT MAX(running_wins) FROM streak_calc WHERE is_win = 1
      )
    `, [address]);

    // Get user's best streak
    const bestStreakQuery = await db.query(`
      WITH user_results AS (
        SELECT 
          cycle_id,
          CASE WHEN correct_count >= 5 THEN 1 ELSE 0 END as is_win
        FROM oracle.oddyssey_slips
        WHERE player_address = $1 AND is_evaluated = TRUE
        ORDER BY cycle_id
      ),
      streak_groups AS (
        SELECT 
          cycle_id,
          is_win,
          SUM(CASE WHEN is_win = 0 THEN 1 ELSE 0 END) OVER (ORDER BY cycle_id) as streak_group
        FROM user_results
      )
      SELECT 
        COALESCE(MAX(streak_length), 0) as best_streak
      FROM (
        SELECT 
          streak_group,
          COUNT(*) as streak_length
        FROM streak_groups
        WHERE is_win = 1
        GROUP BY streak_group
      ) streaks
    `, [address]);

    const stats = userStats.rows[0];
    const currentStreak = streakQuery.rows[0]?.current_streak || 0;
    const bestStreak = bestStreakQuery.rows[0]?.best_streak || 0;

    return {
      totalSlips: parseInt(stats.total_slips || 0),
      totalWins: parseInt(stats.total_wins || 0),
      bestScore: parseFloat(stats.best_score || 0),
      averageScore: parseFloat(stats.average_score || 0),
      winRate: parseFloat(stats.win_rate || 0),
      currentStreak: parseInt(currentStreak),
      bestStreak: parseInt(bestStreak)
    };

  } catch (error) {
    console.error('Error getting user stats:', error);
    return {
      totalSlips: 0,
      totalWins: 0,
      bestScore: 0,
      averageScore: 0,
      winRate: 0,
      currentStreak: 0,
      bestStreak: 0
    };
  }
}

// Helper function to get global statistics
async function getGlobalStats() {
  try {
    // Get global statistics from oddyssey_slips table
    const globalStats = await db.query(`
      SELECT 
        COUNT(*) as total_slips,
        COUNT(DISTINCT player_address) as active_users,
        COALESCE(AVG(final_score), 0) as average_score,
        COALESCE(MAX(final_score), 0) as highest_score,
        COUNT(CASE WHEN correct_count >= 5 THEN 1 END) as total_wins
      FROM oracle.oddyssey_slips
      WHERE is_evaluated = TRUE
    `);

    // Get statistics from oddyssey indexer data
    const indexerStats = await db.query(`
      SELECT 
        COUNT(DISTINCT user_address) as total_players_indexed,
        COUNT(*) as total_slips_indexed,
        COALESCE(AVG(best_score), 0) as avg_best_score,
        COALESCE(AVG(win_rate::float / 100), 0) as avg_win_rate
      FROM oracle.oddyssey_user_stats
    `);

    // Get cycle statistics
    const cycleStats = await db.query(`
      SELECT 
        COUNT(*) as total_cycles,
        COUNT(CASE WHEN is_resolved = TRUE THEN 1 END) as completed_cycles,
        COUNT(CASE WHEN is_resolved = FALSE THEN 1 END) as active_cycles,
        5.2 as avg_prize_pool
      FROM oracle.oddyssey_cycles
    `);

    // Get current cycle's leaderboard
    const currentCycle = await db.query(`
      SELECT MAX(cycle_id) as current_cycle_id FROM oracle.oddyssey_cycles
    `);

    let leaderboard = [];
    if (currentCycle.rows[0]?.current_cycle_id) {
      const leaderboardQuery = await db.query(`
        SELECT 
          s.player_address,
          s.final_score,
          s.correct_count,
          s.leaderboard_rank,
          s.prize_claimed,
          ROW_NUMBER() OVER (ORDER BY s.final_score DESC, s.correct_count DESC) as rank
        FROM oracle.oddyssey_slips s
        WHERE s.cycle_id = $1 AND s.is_evaluated = TRUE
        ORDER BY s.final_score DESC, s.correct_count DESC
        LIMIT 5
      `, [currentCycle.rows[0].current_cycle_id]);

      leaderboard = leaderboardQuery.rows.map(row => ({
        rank: row.rank,
        player: row.player_address,
        score: parseFloat(row.final_score || 0),
        correctCount: parseInt(row.correct_count || 0),
        prize: calculatePrize(row.rank, 5000) // Mock prize pool
      }));
    }

    const stats = globalStats.rows[0];
    const indexer = indexerStats.rows[0];
    const cycles = cycleStats.rows[0];

    return {
      totalPlayers: Math.max(
        parseInt(stats.active_users || 0),
        parseInt(indexer.total_players_indexed || 0)
      ),
      totalSlips: Math.max(
        parseInt(stats.total_slips || 0),
        parseInt(indexer.total_slips_indexed || 0)
      ),
      totalCycles: parseInt(cycles.total_cycles || 0),
      activeCycles: parseInt(cycles.active_cycles || 0),
      completedCycles: parseInt(cycles.completed_cycles || 0),
      avgPrizePool: parseFloat(cycles.avg_prize_pool || 5.2),
      winRate: (parseFloat(indexer.avg_win_rate || 0) * 100) || 23.4,
      avgCorrect: parseFloat(indexer.avg_best_score || 0) / 100 || 8.7,
      averageScore: parseFloat(stats.average_score || 0),
      highestScore: parseFloat(stats.highest_score || 0),
      totalWins: parseInt(stats.total_wins || 0),
      leaderboard: leaderboard
    };

  } catch (error) {
    console.error('Error getting global stats:', error);
    return {
      totalVolume: 0,
      totalSlips: 0,
      activeUsers: 0,
      averageScore: 0,
      highestScore: 0,
      totalPrizePool: 0,
      leaderboard: []
    };
  }
}

// Helper function to calculate prize based on rank
function calculatePrize(rank, totalPrizePool) {
  const percentages = [4000, 3000, 2000, 500, 500]; // 40%, 30%, 20%, 5%, 5%
  if (rank <= 5 && rank > 0) {
    return (totalPrizePool * percentages[rank - 1]) / 10000;
  }
  return 0;
}

// Get match results for a specific cycle
router.get('/cycle/:cycleId/results', asyncHandler(async (req, res) => {
  try {
    const { cycleId } = req.params;
    
    console.log(`🎯 Fetching match results for cycle ${cycleId}`);
    
    // Get cycle data
    const cycleResult = await db.query(`
      SELECT cycle_id, matches_data, is_resolved, cycle_start_time
      FROM oracle.oddyssey_cycles 
      WHERE cycle_id = $1
    `, [cycleId]);
    
    if (cycleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Cycle not found'
      });
    }
    
    const cycle = cycleResult.rows[0];
    let fixtureIds = [];
    
    try {
      if (Array.isArray(cycle.matches_data)) {
        fixtureIds = cycle.matches_data.filter(id => id && typeof id === 'string');
      } else if (typeof cycle.matches_data === 'string') {
        const parsed = JSON.parse(cycle.matches_data);
        fixtureIds = Array.isArray(parsed) ? parsed.filter(id => id && typeof id === 'string') : [];
      }
    } catch (error) {
      console.error('❌ Error parsing matches_data:', error);
      fixtureIds = [];
    }
    
    if (fixtureIds.length === 0) {
      return res.json({
        success: true,
        data: {
          cycleId: cycleId,
          isResolved: cycle.is_resolved,
          matches: [],
          message: 'No matches found for this cycle'
        }
      });
    }
    
    // Get match results with fixture details
    const resultsQuery = `
      SELECT 
        f.id as fixture_id,
        f.home_team,
        f.away_team,
        f.league_name,
        f.match_date,
        f.status,
        fr.home_score,
        fr.away_score,
        fr.outcome_1x2,
        fr.outcome_ou25,
        fr.finished_at,
        CASE 
          WHEN f.status IN ('FT', 'AET', 'PEN') THEN 'finished'
          WHEN f.status IN ('1H', '2H', 'HT') THEN 'live'
          WHEN f.status IN ('NS', 'Fixture') AND f.match_date > NOW() THEN 'upcoming'
          WHEN f.status IN ('NS', 'Fixture') AND f.match_date <= NOW() THEN 'delayed'
          ELSE 'unknown'
        END as match_status
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
      WHERE f.id = ANY($1)
      ORDER BY f.match_date ASC
    `;
    
    const resultsResult = await db.query(resultsQuery, [fixtureIds]);
    
    const matches = resultsResult.rows.map((row, index) => ({
      id: row.fixture_id,
      fixture_id: row.fixture_id,
      home_team: row.home_team,
      away_team: row.away_team,
      league_name: row.league_name,
      match_date: row.match_date,
      status: row.match_status,
      display_order: index + 1,
      result: {
        home_score: row.home_score,
        away_score: row.away_score,
        outcome_1x2: row.outcome_1x2,
        outcome_ou25: row.outcome_ou25,
        finished_at: row.finished_at,
        is_finished: row.match_status === 'finished'
      }
    }));
    
    return res.json({
      success: true,
      data: {
        cycleId: cycleId,
        isResolved: cycle.is_resolved,
        cycleStartTime: cycle.cycle_start_time,
        matches: matches,
        totalMatches: matches.length,
        finishedMatches: matches.filter(m => m.result.is_finished).length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching cycle results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cycle results'
    });
  }
}));

// Get results by date (for date picker functionality)
router.get('/results/:date', validateDateParam('date', true, true), asyncHandler(async (req, res) => {
  try {
    const { date } = req.params;
    
    console.log(`🎯 Fetching Oddyssey results for date: ${date}`);
    
    // Use the service method to get results by date
    const result = await oddysseyMatchSelector.getResultsByDate(date);
    
    if (result.success) {
      return res.json(createSuccessResponse(
        result.data,
        {
          source: 'date_based_query',
          operation: 'get_results_by_date'
        },
        result.message
      ));
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }
    
  } catch (error) {
    console.error('❌ Error fetching results by date:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch results by date'
    });
  }
}));

// Get available dates for date picker
router.get('/available-dates', asyncHandler(async (req, res) => {
  try {
    console.log('🎯 Getting available dates for date picker...');
    
    // Use the service method to get available dates
    const result = await oddysseyMatchSelector.getAvailableDates();
    
    if (result.success) {
      return res.json(createSuccessResponse(
        result.data,
        {
          source: 'date_picker_query',
          operation: 'get_available_dates'
        }
      ));
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }
    
  } catch (error) {
    console.error('❌ Error fetching available dates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available dates'
    });
  }
}));

// Add global error handler for this router
const { globalErrorHandler } = require('../utils/validation');
router.use(globalErrorHandler);

module.exports = router;