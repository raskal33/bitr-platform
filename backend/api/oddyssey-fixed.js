const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { asyncHandler } = require('../middleware/asyncHandler');
const { validateDateParam } = require('../middleware/validateDateParam');
const { rateLimitMiddleware } = require('../middleware/rateLimitMiddleware');
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
    fixtureId: match.fixture_id || match.id,
    homeTeam: match.home_team || match.homeTeam || 'Unknown Team',
    awayTeam: match.away_team || match.awayTeam || 'Unknown Team', 
    leagueName: match.league_name || match.leagueName || 'Unknown League',
    matchDate: match.match_date || match.matchDate,
    homeOdds: match.home_odds || match.homeOdds || 2.0,
    drawOdds: match.draw_odds || match.drawOdds || 3.0,
    awayOdds: match.away_odds || match.awayOdds || 2.5,
    overOdds: match.over_25_odds || match.over_odds || match.overOdds || 2.0,
    underOdds: match.under_25_odds || match.under_odds || match.underOdds || 1.8,
    marketType: match.market_type || match.marketType || "1x2_ou25",
    displayOrder: match.display_order || match.displayOrder || index + 1,
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

module.exports = router;
