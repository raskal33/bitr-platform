const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { asyncHandler, validateDateParam } = require('../utils/validation');
const { rateLimitMiddleware } = require('../config/redis');
const { serializeBigInts } = require('../utils/bigint-serializer');

// Simple in-memory cache to reduce database load
const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds

function getCacheKey(req) {
  return `${req.method}:${req.path}:${JSON.stringify(req.query)}:${JSON.stringify(req.body)}`;
}

function cacheMiddleware(ttl = CACHE_TTL) {
  return (req, res, next) => {
    const key = getCacheKey(req);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      console.log(`🚀 Cache hit for ${key}`);
      res.set({
        'Cache-Control': `public, max-age=${Math.floor(ttl / 1000)}`,
        'X-Cache-TTL': ttl.toString(),
        'X-Cache-Status': 'HIT'
      });
      return res.json(cached.data);
    }
    
    // Override res.json to cache the response
    const originalJson = res.json;
    res.json = function(data) {
      if (res.statusCode === 200) {
        cache.set(key, { data, timestamp: Date.now() });
        // Clean old cache entries periodically
        if (cache.size > 100) {
          const now = Date.now();
          for (const [k, v] of cache.entries()) {
            if (now - v.timestamp > ttl * 2) {
              cache.delete(k);
            }
          }
        }
        // Add cache headers for frontend
        res.set({
          'Cache-Control': `public, max-age=${Math.floor(ttl / 1000)}`,
          'X-Cache-TTL': ttl.toString(),
          'X-Cache-Status': 'MISS'
        });
      }
      return originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * Standardized data transformation function
 * Ensures all API responses use consistent camelCase structure
 */
function transformMatchData(match, index = 0) {
  return {
    id: match.id || match.fixture_id,
    fixture_id: match.fixture_id || match.id,
    home_team: match.home_team || match.homeTeam || 'Unknown Team',
    away_team: match.away_team || match.awayTeam || 'Unknown Team', 
    league_name: match.league_name || match.leagueName || 'Unknown League',
    match_date: match.match_date || match.matchDate,
    home_odds: parseFloat(match.home_odds || match.homeOdds) || 2.0,
    draw_odds: parseFloat(match.draw_odds || match.drawOdds) || 3.0,
    away_odds: parseFloat(match.away_odds || match.awayOdds) || 2.5,
    over_odds: parseFloat(match.over_25_odds || match.over_odds || match.overOdds) || 2.0,
    under_odds: parseFloat(match.under_25_odds || match.under_odds || match.underOdds) || 1.8,
    market_type: match.market_type || match.marketType || "1x2_ou25",
    display_order: match.display_order || match.displayOrder || index + 1,
    status: match.status,
    startTime: match.startTime || (match.match_date ? Math.floor(new Date(match.match_date).getTime() / 1000) : Math.floor(Date.now() / 1000))
  };
}

/**
 * Standardized response wrapper
 * Ensures all API responses have consistent structure
 */
function createStandardResponse(data, meta = {}) {
  return {
    success: true,
    data: data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

// Get current Oddyssey matches (uses persistent storage only)
router.get('/matches', cacheMiddleware(30000), validateDateParam('date', false, true), asyncHandler(async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`🎯 Fetching Oddyssey matches for date: ${targetDate}`);

    // Get today's matches from oracle.daily_game_matches table
    const todayMatchesQuery = `
      SELECT 
        fixture_id as id,
        home_team,
        away_team,
        league_name,
        match_date,
        home_odds,
        draw_odds,
        away_odds,
        over_25_odds,
        under_25_odds,
        display_order
      FROM oracle.daily_game_matches
      WHERE game_date = $1
      ORDER BY display_order ASC
    `;
    
    const todayResult = await db.query(todayMatchesQuery, [targetDate]);
    const matches = todayResult.rows;

    if (matches.length > 0) {
      console.log(`✅ Found ${matches.length} matches for ${targetDate}`);

      // Transform data to match frontend expectations (consistent camelCase)
      const transformedMatches = matches.map((match, index) => transformMatchData(match, index));

      // Get yesterday's matches from previous cycle
      const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      let yesterdayMatches = [];
      
      try {
        // Get yesterday's matches from oracle.daily_game_matches table (much simpler!)
        const yesterdayMatchesQuery = `
          SELECT 
            fixture_id as id,
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
          WHERE game_date = $1
          ORDER BY display_order ASC
        `;
        
        const yesterdayFixturesResult = await db.query(yesterdayMatchesQuery, [yesterdayDate]);
            
        if (yesterdayFixturesResult.rows.length > 0) {
          yesterdayMatches = yesterdayFixturesResult.rows.map((fixture, index) => transformMatchData(fixture, index));
        }
      } catch (error) {
        console.error('❌ Error fetching yesterday matches:', error);
        yesterdayMatches = [];
      }

      // Add cache control headers to prevent hydration mismatches
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      const response = createStandardResponse({
        today: {
          date: targetDate,
          matches: transformedMatches,
          count: transformedMatches.length
        },
        yesterday: {
          date: yesterdayDate,
          matches: yesterdayMatches,
          count: yesterdayMatches.length
        }
      }, {
        totalMatches: transformedMatches.length + yesterdayMatches.length,
        expectedMatches: 10,
        source: "persistent_storage",
        operation: "get_matches"
      });

      return res.json(serializeBigInts(response));
    } else {
      console.log(`⚠️ No matches found for ${targetDate}`);
      
      const response = createStandardResponse({
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
      }, {
        totalMatches: 0,
        expectedMatches: 10,
        source: "persistent_storage",
        operation: "get_matches"
      });

      return res.json(response);
    }
  } catch (error) {
    console.error('❌ Error in /matches endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}));

// Get current cycle information
router.get('/current-cycle', cacheMiddleware(30000), async (req, res) => {
  try {
    const currentCycle = await db.query(`
      SELECT 
        cycle_id,
        cycle_start_time,
        cycle_end_time,
        matches_data,
        is_resolved,
        created_at
      FROM oracle.current_oddyssey_cycle 
      LIMIT 1
    `);

    if (currentCycle.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No current cycle found'
      });
    }

    const cycleData = currentCycle.rows[0];

    let transformedMatchesData = cycleData.matches_data;
    if (Array.isArray(cycleData.matches_data) && cycleData.matches_data.length > 0) {
      // If matches_data is array of strings (fixture IDs), fetch match details
      if (typeof cycleData.matches_data[0] === 'string') {
        const fixtureIds = cycleData.matches_data;
        const matchesQuery = `
          SELECT 
            f.id,
            f.home_team,
            f.away_team,
            f.league_name,
            f.match_date,
            f.status
          FROM oracle.fixtures f
          WHERE f.id = ANY($1)
          ORDER BY f.match_date ASC
        `;
        
        const matchesResult = await db.query(matchesQuery, [fixtureIds]);
        transformedMatchesData = matchesResult.rows.map((match, index) => transformMatchData(match, index));
      } else {
        // If matches_data is already array of objects, just transform to consistent format
        transformedMatchesData = cycleData.matches_data.map((match, index) => transformMatchData(match, index));
      }
    }

    // Use BigInt serializer to safely convert any remaining BigInt values
    const safeData = serializeBigInts({
      ...cycleData,
      matches_data: transformedMatchesData
    });

    // Add cache control headers to prevent hydration mismatches
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const response = createStandardResponse(safeData);
    res.json(response);

  } catch (error) {
    console.error('❌ Error in /current-cycle endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Add missing live-matches endpoint
router.post('/live-matches', cacheMiddleware(15000), asyncHandler(async (req, res) => {
  try {
    // This endpoint should return live match data
    // For now, return current cycle matches as live matches
    const currentDate = new Date().toISOString().split('T')[0];
    
    const liveMatchesQuery = `
      SELECT 
        fixture_id as id,
        home_team,
        away_team,
        league_name,
        match_date,
        home_odds,
        draw_odds,
        away_odds,
        over_25_odds,
        under_25_odds,
        display_order
      FROM oracle.daily_game_matches
      WHERE game_date = $1
      ORDER BY display_order ASC
    `;
    
    const result = await db.query(liveMatchesQuery, [currentDate]);
    const liveMatches = result.rows.map((match, index) => transformMatchData(match, index));

    const response = createStandardResponse(liveMatches, {
      count: liveMatches.length,
      date: currentDate,
      source: "live_matches"
    });

    res.json(serializeBigInts(response));
  } catch (error) {
    console.error('❌ Error in /live-matches endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}));

// Add leaderboard endpoint (placeholder)
router.get('/leaderboard', cacheMiddleware(60000), asyncHandler(async (req, res) => {
  try {
    // Placeholder for leaderboard data
    const response = createStandardResponse([], {
      count: 0,
      source: "leaderboard"
    });

    res.json(response);
  } catch (error) {
    console.error('❌ Error in /leaderboard endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}));

// GET /api/oddyssey/stats - Get cycle statistics
router.get('/stats', cacheMiddleware(60000), asyncHandler(async (req, res) => {
  try {
    const { cycleId } = req.query;
    
    // If no cycle ID provided, use current cycle
    let targetCycleId = cycleId;
    if (!targetCycleId) {
      const currentCycleQuery = `
        SELECT cycle_id 
        FROM oracle.oddyssey_cycles 
        WHERE is_resolved = false 
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      const currentCycleResult = await db.query(currentCycleQuery);
      targetCycleId = currentCycleResult.rows[0]?.cycle_id;
    }
    
    if (!targetCycleId) {
      return res.json({
        success: true,
        data: {
          cycleId: null,
          participants: 0,
          totalSlips: 0,
          prizePool: '0',
          avgCorrectPredictions: 0,
          maxCorrectPredictions: 0,
          isResolved: false
        },
        meta: {
          source: 'stats',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Get cycle statistics
    const statsQuery = `
      SELECT 
        oc.cycle_id,
        oc.prize_pool,
        oc.matches_count,
        oc.is_resolved,
        oc.resolved_at,
        COUNT(DISTINCT os.player_address) as participants,
        COUNT(os.slip_id) as total_slips,
        COALESCE(AVG(os.correct_count), 0) as avg_correct_predictions,
        COALESCE(MAX(os.correct_count), 0) as max_correct_predictions
      FROM oracle.oddyssey_cycles oc
      LEFT JOIN oracle.oddyssey_slips os ON oc.cycle_id = os.cycle_id
      WHERE oc.cycle_id = $1
      GROUP BY oc.cycle_id, oc.prize_pool, oc.matches_count, oc.is_resolved, oc.resolved_at
    `;
    
    const result = await db.query(statsQuery, [targetCycleId]);
    const stats = result.rows[0];
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Cycle not found',
        message: `Cycle ${targetCycleId} does not exist`
      });
    }

    // Transform the data to match frontend expectations
    const transformedStats = {
      cycleId: stats.cycle_id,
      participants: parseInt(stats.participants) || 0,
      totalSlips: parseInt(stats.total_slips) || 0,
      prizePool: stats.prize_pool || '0',
      avgCorrectPredictions: parseFloat(stats.avg_correct_predictions) || 0,
      maxCorrectPredictions: parseInt(stats.max_correct_predictions) || 0,
      isResolved: stats.is_resolved || false,
      resolvedAt: stats.resolved_at,
      matchesCount: stats.matches_count || 0
    };

    res.json({
      success: true,
      data: transformedStats,
      meta: {
        source: 'stats',
        timestamp: new Date().toISOString(),
        cycleId: targetCycleId
      }
    });

  } catch (error) {
    console.error('❌ Error in /stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}));

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
      data: userSlips.rows,
      meta: {
        count: userSlips.rows.length,
        cycleId: cycleId,
        address: address,
        timestamp: new Date().toISOString()
      }
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
    const { startDate, endDate, limit = '50' } = req.query;

    let query = `
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
    `;

    const queryParams = [address];
    let paramIndex = 2;

    // Add date filtering if provided
    if (startDate) {
      query += ` AND DATE(s.placed_at) >= $${paramIndex}`;
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND DATE(s.placed_at) <= $${paramIndex}`;
      queryParams.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY s.placed_at DESC LIMIT $${paramIndex}`;
    queryParams.push(parseInt(limit));

    const userSlips = await db.query(query, queryParams);

    // Enrich predictions with team names and proper formatting
    const enrichedSlips = await Promise.all(userSlips.rows.map(async (slip) => {
      if (!slip.predictions || !Array.isArray(slip.predictions)) {
        return slip;
      }

      const enrichedPredictions = await Promise.all(slip.predictions.map(async (pred) => {
        try {
          // Handle contract format (array) vs enriched format (object)
          let matchId, betType, selection, odds;
          
          if (Array.isArray(pred)) {
            // Contract format: [matchId, betType, selectionHash, odds]
            matchId = pred[0];
            betType = pred[1];
            selection = pred[2];
            odds = pred[3];
          } else if (pred && typeof pred === 'object') {
            // Enriched format: { matchId, selectedOdd, etc. }
            matchId = pred.matchId || pred.match_id || pred.id;
            odds = pred.selectedOdd || pred.odds;
          } else {
            console.warn('Unknown prediction format:', pred);
            return null;
          }

          // Get fixture details for team names
          const fixtureResult = await db.query(`
            SELECT id, home_team, away_team, league_name, starting_at
            FROM oracle.fixtures 
            WHERE id = $1
          `, [matchId]);

          const fixture = fixtureResult.rows[0];
          
          if (fixture) {
            // Calculate proper decimal odds (divide by 1000 since contract uses ODDS_SCALING_FACTOR = 1000)
            const decimalOdds = parseFloat(odds) / 1000;
            
            // Format match time
            const matchTime = fixture.starting_at ? 
              new Date(fixture.starting_at).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              }) : '00:00';

            // Determine prediction type based on betType or selection
            let prediction;
            if (betType === '0' || betType === 0) {
              prediction = '1'; // Home win
            } else if (betType === '1' || betType === 1) {
              prediction = 'X'; // Draw
            } else if (betType === '2' || betType === 2) {
              prediction = '2'; // Away win
            } else {
              // Try to determine from selection hash or other fields
              prediction = pred.prediction || pred.selection || '1';
            }

            return {
              matchId: matchId,
              match_id: matchId,
              prediction: prediction,
              selectedOdd: odds,
              home_team: fixture.home_team,
              away_team: fixture.away_team,
              league_name: fixture.league_name,
              match_time: matchTime,
              odds: decimalOdds,
              starting_at: fixture.starting_at
            };
          }
          
          // Fallback for missing fixture data
          return {
            matchId: matchId,
            match_id: matchId,
            prediction: '1',
            selectedOdd: odds,
            home_team: `Team ${matchId}`,
            away_team: `Team ${matchId}`,
            league_name: 'Unknown League',
            match_time: '00:00',
            odds: parseFloat(odds) / 1000
          };
        } catch (error) {
          console.error(`Error enriching prediction for match ${pred[0] || pred.matchId}:`, error);
          const matchId = pred[0] || pred.matchId || 'unknown';
          const odds = pred[3] || pred.selectedOdd || 1;
          return {
            matchId: matchId,
            match_id: matchId,
            prediction: '1',
            selectedOdd: odds,
            home_team: `Team ${matchId}`,
            away_team: `Team ${matchId}`,
            league_name: 'Unknown League',
            match_time: '00:00',
            odds: parseFloat(odds) / 1000
          };
        }
      }));

      // Calculate proper total odds (limit to reasonable values)
      const totalOdds = enrichedPredictions.reduce((acc, pred) => {
        const odds = pred.odds || 1;
        const newAcc = acc * odds;
        // Prevent extremely large numbers that cause display issues
        return newAcc > 1e6 ? 1e6 : newAcc;
      }, 1);

      return {
        ...slip,
        predictions: enrichedPredictions,
        total_odds: totalOdds,
        submitted_time: slip.created_at ? new Date(slip.created_at).toLocaleString() : 'Unknown',
        status: slip.is_evaluated ? 'Evaluated' : 'Pending'
      };
    }));

    res.json({
      success: true,
      data: enrichedSlips,
      meta: {
        count: enrichedSlips.length,
        address: address,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching user slips:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user's basic slips (legacy endpoint for compatibility)
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

    // Enrich predictions with team names and proper formatting
    const enrichedSlips = await Promise.all(slips.rows.map(async (slip) => {
      if (!slip.predictions || !Array.isArray(slip.predictions)) {
        return slip;
      }

      const enrichedPredictions = await Promise.all(slip.predictions.map(async (pred) => {
        try {
          // Handle contract format (array) vs enriched format (object)
          let matchId, betType, selection, odds;
          
          if (Array.isArray(pred)) {
            // Contract format: [matchId, betType, selectionHash, odds]
            matchId = pred[0];
            betType = pred[1];
            selection = pred[2];
            odds = pred[3];
          } else if (pred && typeof pred === 'object') {
            // Enriched format: { matchId, selectedOdd, etc. }
            matchId = pred.matchId || pred.match_id || pred.id;
            odds = pred.selectedOdd || pred.odds;
          } else {
            console.warn('Unknown prediction format:', pred);
            return null;
          }

          // Get fixture details for team names
          const fixtureResult = await db.query(`
            SELECT id, home_team, away_team, league_name, starting_at
            FROM oracle.fixtures 
            WHERE id = $1
          `, [matchId]);

          const fixture = fixtureResult.rows[0];
          
          if (fixture) {
            // Calculate proper decimal odds (divide by 1000 since contract uses ODDS_SCALING_FACTOR = 1000)
            const decimalOdds = parseFloat(odds) / 1000;
            
            // Format match time
            const matchTime = fixture.starting_at ? 
              new Date(fixture.starting_at).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              }) : '00:00';

            // Determine prediction type based on betType or selection
            let prediction;
            if (betType === '0' || betType === 0) {
              prediction = '1'; // Home win
            } else if (betType === '1' || betType === 1) {
              prediction = 'X'; // Draw
            } else if (betType === '2' || betType === 2) {
              prediction = '2'; // Away win
            } else {
              // Try to determine from selection hash or other fields
              prediction = pred.prediction || pred.selection || '1';
            }

            return {
              matchId: matchId,
              match_id: matchId,
              prediction: prediction,
              selectedOdd: odds,
              home_team: fixture.home_team,
              away_team: fixture.away_team,
              league_name: fixture.league_name,
              match_time: matchTime,
              odds: decimalOdds,
              starting_at: fixture.starting_at
            };
          }
          
          // Fallback for missing fixture data
          return {
            matchId: matchId,
            match_id: matchId,
            prediction: '1',
            selectedOdd: odds,
            home_team: `Team ${matchId}`,
            away_team: `Team ${matchId}`,
            league_name: 'Unknown League',
            match_time: '00:00',
            odds: parseFloat(odds) / 1000
          };
        } catch (error) {
          console.error(`Error enriching prediction for match ${pred[0] || pred.matchId}:`, error);
          const matchId = pred[0] || pred.matchId || 'unknown';
          const odds = pred[3] || pred.selectedOdd || 1;
          return {
            matchId: matchId,
            match_id: matchId,
            prediction: '1',
            selectedOdd: odds,
            home_team: `Team ${matchId}`,
            away_team: `Team ${matchId}`,
            league_name: 'Unknown League',
            match_time: '00:00',
            odds: parseFloat(odds) / 1000
          };
        }
      }));

      // Calculate proper total odds (limit to reasonable values)
      const totalOdds = enrichedPredictions.reduce((acc, pred) => {
        const odds = pred.odds || 1;
        const newAcc = acc * odds;
        // Prevent extremely large numbers that cause display issues
        return newAcc > 1e6 ? 1e6 : newAcc;
      }, 1);

      return {
        ...slip,
        predictions: enrichedPredictions,
        total_odds: totalOdds,
        submitted_time: slip.created_at ? new Date(slip.created_at).toLocaleString() : 'Unknown',
        status: slip.is_evaluated ? 'Evaluated' : 'Pending'
      };
    }));

    res.json({
      success: true,
      data: enrichedSlips
    });

  } catch (error) {
    console.error('Error fetching user slips:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get results by date (for date picker functionality)
router.get('/results/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    console.log(`🎯 Fetching Oddyssey results for date: ${date}`);
    
    // Find the cycle for this date
    const cycleResult = await db.query(`
      SELECT cycle_id, matches_data, is_resolved, cycle_start_time
      FROM oracle.oddyssey_cycles 
      WHERE DATE(cycle_start_time) = $1
      ORDER BY cycle_id DESC
      LIMIT 1
    `, [date]);
    
    if (cycleResult.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          date: date,
          cycleId: null,
          isResolved: false,
          matches: [],
          totalMatches: 0,
          finishedMatches: 0
        },
        message: 'No cycle found for this date'
      });
    }
    
    const cycle = cycleResult.rows[0];
    let fixtureIds = [];
    
    try {
      if (Array.isArray(cycle.matches_data)) {
        fixtureIds = cycle.matches_data.map(match => match.id ? match.id.toString() : null).filter(id => id);
      } else if (typeof cycle.matches_data === 'string') {
        const parsed = JSON.parse(cycle.matches_data);
        fixtureIds = Array.isArray(parsed) ? parsed.map(match => match.id ? match.id.toString() : null).filter(id => id) : [];
      }
    } catch (error) {
      console.error('❌ Error parsing matches_data:', error);
      fixtureIds = [];
    }
    
    if (fixtureIds.length === 0) {
      return res.json({
        success: true,
        data: {
          date: date,
          cycleId: cycle.cycle_id,
          isResolved: cycle.is_resolved,
          matches: [],
          totalMatches: 0,
          finishedMatches: 0
        },
        message: 'No matches found for this date'
      });
    }
    
    // Get match results with fixture details for the specific date
    const resultsQuery = `
      SELECT 
        f.id as fixture_id,
        f.home_team,
        f.away_team,
        f.league_name,
        f.match_date,
        f.status,
        fr.home_score as home_score,
        fr.away_score as away_score,
        COALESCE(fr.outcome_1x2, 
          CASE 
            WHEN fr.home_score IS NOT NULL AND fr.away_score IS NOT NULL THEN
              CASE 
                WHEN fr.home_score > fr.away_score THEN '1'
                WHEN fr.home_score = fr.away_score THEN 'X'
                WHEN fr.home_score < fr.away_score THEN '2'
                ELSE NULL
              END
            ELSE NULL
          END
        ) as outcome_1x2,
        COALESCE(fr.outcome_ou25,
          CASE 
            WHEN fr.home_score IS NOT NULL AND fr.away_score IS NOT NULL THEN
              CASE 
                WHEN (fr.home_score + fr.away_score) > 2.5 THEN 'over'
                WHEN (fr.home_score + fr.away_score) < 2.5 THEN 'under'
                ELSE NULL
              END
            ELSE NULL
          END
        ) as outcome_ou25,
        COALESCE(fr.finished_at, f.updated_at) as finished_at,
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
    
    const results = await db.query(resultsQuery, [fixtureIds]);
    
    const matches = results.rows.map(match => ({
      id: match.fixture_id,
      fixture_id: match.fixture_id,
      home_team: match.home_team,
      away_team: match.away_team,
      league_name: match.league_name,
      match_date: match.match_date,
      status: match.match_status,
      display_order: 1, // Default order
      result: match.home_score !== null ? {
        home_score: match.home_score,
        away_score: match.away_score,
        outcome_1x2: match.outcome_1x2,
        outcome_ou25: match.outcome_ou25,
        finished_at: match.finished_at,
        is_finished: match.match_status === 'finished'
      } : null
    }));
    
    const finishedMatches = matches.filter(match => match.status === 'finished').length;
    
    res.json({
      success: true,
      data: {
        date: date,
        cycleId: cycle.cycle_id,
        isResolved: cycle.is_resolved,
        cycleStartTime: cycle.cycle_start_time,
        matches: matches,
        totalMatches: matches.length,
        finishedMatches: finishedMatches
      },
      meta: {
        source: 'date_based_query',
        operation: 'get_results_by_date'
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching results by date:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch results by date',
      details: error.message
    });
  }
});

// Get available dates for date picker
router.get('/available-dates', async (req, res) => {
  try {
    console.log('🎯 Getting available dates for date picker...');
    
    // Get dates from the last 30 days that have cycles
    const datesResult = await db.query(`
      SELECT 
        DATE(cycle_start_time) as date,
        cycle_id,
        is_resolved,
        COUNT(*) as cycle_count
      FROM oracle.oddyssey_cycles 
      WHERE cycle_start_time >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(cycle_start_time), cycle_id, is_resolved
      ORDER BY date DESC
    `);
    
    const availableDates = datesResult.rows.map(row => ({
      date: row.date,
      cycleId: row.cycle_id,
      isResolved: row.is_resolved,
      cycleCount: parseInt(row.cycle_count)
    }));
    
    res.json({
      success: true,
      data: {
        availableDates,
        totalDates: availableDates.length,
        dateRange: {
          oldest: availableDates.length > 0 ? availableDates[availableDates.length - 1].date : null,
          newest: availableDates.length > 0 ? availableDates[0].date : null
        }
      },
      meta: {
        source: 'date_picker_query',
        operation: 'get_available_dates'
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting available dates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available dates',
      details: error.message
    });
  }
});

module.exports = router;
