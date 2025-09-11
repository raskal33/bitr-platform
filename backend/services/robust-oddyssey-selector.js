const db = require('../db/db');

/**
 * Robust Oddyssey Match Selector
 * 
 * STRICT RULES:
 * 1. ALWAYS requires both 1X2 AND Over/Under 2.5 odds - NO EXCEPTIONS
 * 2. If not enough matches today, check tomorrow, then next day
 * 3. Must find exactly 10 matches with complete odds
 * 4. Simple, robust, always working
 */
class RobustOddysseySelector {
  constructor() {
    this.REQUIRED_MATCHES = 10;
    this.MIN_MATCH_HOUR_UTC = 11; // Matches must start after 11:00 AM UTC
    this.MAX_DAYS_AHEAD = 7; // Look up to 7 days ahead
  }

  /**
   * Select 10 Oddyssey matches with STRICT requirements
   * Will look across multiple days if needed
   */
  async selectOddysseyMatches(startDate = null) {
    try {
      const baseDate = startDate ? new Date(startDate) : new Date();
      console.log(`🎯 Starting Oddyssey match selection from ${baseDate.toISOString().split('T')[0]}...`);

      let allMatches = [];
      let currentDate = new Date(baseDate);

      // Search across multiple days until we have enough matches
      for (let dayOffset = 0; dayOffset < this.MAX_DAYS_AHEAD; dayOffset++) {
        const searchDate = new Date(currentDate);
        searchDate.setDate(currentDate.getDate() + dayOffset);
        const dateStr = searchDate.toISOString().split('T')[0];

        console.log(`📅 Searching for matches on ${dateStr}...`);
        
        const dayMatches = await this.getMatchesWithCompleteOdds(dateStr);
        console.log(`✅ Found ${dayMatches.length} matches with complete odds on ${dateStr}`);

        if (dayMatches.length > 0) {
          // Add day offset info to matches
          dayMatches.forEach(match => {
            match.dayOffset = dayOffset;
            match.searchDate = dateStr;
          });
          
          allMatches.push(...dayMatches);
          console.log(`📊 Total matches collected: ${allMatches.length}`);
        }

        // Stop if we have enough matches
        if (allMatches.length >= this.REQUIRED_MATCHES) {
          console.log(`✅ Found sufficient matches (${allMatches.length}) - stopping search`);
          break;
        }
      }

      // Validate we have enough matches
      if (allMatches.length < this.REQUIRED_MATCHES) {
        throw new Error(`INSUFFICIENT MATCHES: Found only ${allMatches.length}/${this.REQUIRED_MATCHES} matches with complete odds across ${this.MAX_DAYS_AHEAD} days`);
      }

      // Select the best 10 matches
      const selectedMatches = this.selectBestMatches(allMatches);
      
      console.log(`🎉 Successfully selected ${selectedMatches.length} Oddyssey matches:`);
      selectedMatches.forEach((match, index) => {
        const dayLabel = match.dayOffset === 0 ? 'Today' : match.dayOffset === 1 ? 'Tomorrow' : `+${match.dayOffset} days`;
        console.log(`  ${index + 1}. ${match.home_team} vs ${match.away_team} (${match.league_name}) - ${dayLabel}`);
      });

      return {
        success: true,
        selectedMatches,
        totalCandidates: allMatches.length,
        daysSearched: Math.min(this.MAX_DAYS_AHEAD, allMatches.length > 0 ? Math.max(...allMatches.map(m => m.dayOffset)) + 1 : 1)
      };

    } catch (error) {
      console.error('❌ Robust Oddyssey selection failed:', error.message);
      throw error;
    }
  }

  /**
   * Get matches with COMPLETE odds (1X2 + Over/Under 2.5) for a specific date
   * NO FALLBACKS - STRICT REQUIREMENTS ONLY
   */
  async getMatchesWithCompleteOdds(dateStr) {
    const query = `
      WITH complete_odds_matches AS (
        SELECT 
          f.id as fixture_id,
          f.home_team,
          f.away_team,
          f.league_name,
          f.match_date,
          f.starting_at,
          -- 1X2 Odds (Market ID = 1)
          MAX(CASE WHEN o.market_id = '1' AND o.label = 'Home' THEN o.value END) as home_odds,
          MAX(CASE WHEN o.market_id = '1' AND o.label = 'Draw' THEN o.value END) as draw_odds,
          MAX(CASE WHEN o.market_id = '1' AND o.label = 'Away' THEN o.value END) as away_odds,
          -- Over/Under 2.5 Odds (Market ID = 80, Total = 2.5)
          MAX(CASE WHEN o.market_id = '80' AND o.label = 'Over' AND o.total = '2.500000' THEN o.value END) as over_25_odds,
          MAX(CASE WHEN o.market_id = '80' AND o.label = 'Under' AND o.total = '2.500000' THEN o.value END) as under_25_odds
        FROM oracle.fixtures f
        INNER JOIN oracle.fixture_odds o ON f.id::VARCHAR = o.fixture_id
        WHERE DATE(f.starting_at) = $1
          AND f.status IN ('NS', 'Fixture')  -- Not started fixtures only
          AND o.market_id IN ('1', '80')     -- 1X2 and Over/Under markets only
          AND o.value > 0                    -- Valid odds only
          AND EXTRACT(HOUR FROM f.starting_at AT TIME ZONE 'UTC') >= $2  -- After min hour
        GROUP BY f.id, f.home_team, f.away_team, f.league_name, f.match_date, f.starting_at
      )
      SELECT *
      FROM complete_odds_matches
      WHERE 
        -- STRICT REQUIREMENT: ALL odds must be present and valid
        home_odds IS NOT NULL AND home_odds > 1.0
        AND draw_odds IS NOT NULL AND draw_odds > 1.0  
        AND away_odds IS NOT NULL AND away_odds > 1.0
        AND over_25_odds IS NOT NULL AND over_25_odds > 1.0
        AND under_25_odds IS NOT NULL AND under_25_odds > 1.0
        -- Exclude women's matches
        AND league_name NOT ILIKE '%women%'
        AND league_name NOT ILIKE '%female%'
        AND league_name NOT ILIKE '%ladies%'
        AND home_team NOT ILIKE '%women%'
        AND away_team NOT ILIKE '%women%'
        AND home_team NOT ILIKE '%female%'
        AND away_team NOT ILIKE '%female%'
        AND home_team NOT ILIKE '%ladies%'
        AND away_team NOT ILIKE '%ladies%'
      ORDER BY 
        -- Prioritize matches starting sooner
        starting_at ASC,
        -- Prefer balanced odds (closer to even)
        ABS(home_odds - 2.0) + ABS(draw_odds - 3.0) + ABS(away_odds - 2.0) ASC
    `;

    const result = await db.query(query, [dateStr, this.MIN_MATCH_HOUR_UTC]);
    return result.rows;
  }

  /**
   * Select the best 10 matches from candidates
   * Prioritizes variety in leagues and balanced timing
   */
  selectBestMatches(candidates) {
    if (candidates.length <= this.REQUIRED_MATCHES) {
      return candidates;
    }

    // Group by league to ensure variety
    const leagueGroups = {};
    candidates.forEach(match => {
      const league = match.league_name;
      if (!leagueGroups[league]) {
        leagueGroups[league] = [];
      }
      leagueGroups[league].push(match);
    });

    const selected = [];
    const leagues = Object.keys(leagueGroups);
    
    // First pass: Take one match from each league
    leagues.forEach(league => {
      if (selected.length < this.REQUIRED_MATCHES && leagueGroups[league].length > 0) {
        selected.push(leagueGroups[league].shift());
      }
    });

    // Second pass: Fill remaining slots with best available matches
    const remaining = candidates.filter(match => !selected.includes(match));
    remaining.sort((a, b) => {
      // Prefer today's matches, then tomorrow, etc.
      if (a.dayOffset !== b.dayOffset) {
        return a.dayOffset - b.dayOffset;
      }
      // Then prefer earlier start times
      return new Date(a.starting_at) - new Date(b.starting_at);
    });

    while (selected.length < this.REQUIRED_MATCHES && remaining.length > 0) {
      selected.push(remaining.shift());
    }

    return selected.slice(0, this.REQUIRED_MATCHES);
  }

  /**
   * Save selected matches to the database
   */
  async saveOddysseyMatches(selections, cycleId = null, targetDate = null) {
    try {
      console.log('💾 Saving Oddyssey match selections...');
      
      const { selectedMatches } = selections;
      const date = targetDate || new Date().toISOString().split('T')[0];

      // Clear existing matches for the cycle date (if any)
      await db.query('DELETE FROM oracle.fixtures WHERE DATE(starting_at) >= $1', [date]);

      // Insert all selected matches (may span multiple days)
      for (const match of selectedMatches) {
        await db.query(`
          INSERT INTO oracle.fixtures (
            id, home_team, away_team, starting_at, league_name, status,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'scheduled', NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            starting_at = EXCLUDED.starting_at,
            league_name = EXCLUDED.league_name,
            updated_at = NOW()
        `, [
          match.fixture_id,
          match.home_team,
          match.away_team,
          match.starting_at,
          match.league_name
        ]);
      }

      console.log(`✅ Oddyssey match selections saved successfully for ${date}`);
      return { success: true, matchCount: selectedMatches.length };

    } catch (error) {
      console.error('❌ Error saving Oddyssey matches:', error);
      throw error;
    }
  }
}

module.exports = RobustOddysseySelector;
