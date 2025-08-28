const axios = require('axios');
const db = require('../db/db');

class SportMonksService {
  constructor() {
    this.apiToken = process.env.SPORTMONKS_API_TOKEN;
    this.baseUrl = 'https://api.sportmonks.com/v3/football';
    
    if (!this.apiToken) {
      throw new Error('SPORTMONKS_API_TOKEN not configured');
    }
    
    console.log('✅ SportMonks API token configured');
    
    this.axios = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Accept': 'application/json',
      },
    });

    // Preferred bookmakers in order of preference
    this.preferredBookmakers = [2, 28, 39, 35]; // bet365, bwin, pinnacle, 1xbet
    
    // Youth/Women league filters
    this.excludeKeywords = [
      'u17', 'u18', 'u19', 'u21', 'u23', 'youth', 'junior', 'reserve', 'b team',
      'women', 'female', 'ladies', 'womens', "women's"
    ];
  }

  /**
   * Main function to fetch and save 7 days of fixtures
   */
  async fetchAndSave7DayFixtures() {
    console.log('🚀 Starting 7-day fixture fetch...');
    
    let totalFixtures = 0;
    let totalOdds = 0;
    let oddysseyFixtures = 0;
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const currentDate = new Date();
      currentDate.setDate(currentDate.getDate() + dayOffset);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      console.log(`📅 Fetching fixtures for ${dateStr} (Day ${dayOffset + 1}/7)...`);
      
      try {
        const dayResults = await this.fetchAndSaveDayFixtures(dateStr);
        totalFixtures += dayResults.fixtures;
        totalOdds += dayResults.odds;
        oddysseyFixtures += dayResults.oddysseyReady;
        
        console.log(`✅ Day ${dateStr}: ${dayResults.fixtures} fixtures, ${dayResults.odds} odds`);
        
        // Small delay between days
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error fetching day ${dateStr}:`, error.message);
      }
    }
    
    console.log(`🎉 7-day fetch completed!`);
    console.log(`📊 Final Summary: ${totalFixtures} fixtures with odds saved, ${oddysseyFixtures} Oddyssey-ready matches`);
    
    return { 
      totalFixtures, 
      totalOdds, 
      oddysseyFixtures 
    };
  }

  /**
   * Fetch and save fixtures for a single day
   */
  async fetchAndSaveDayFixtures(dateStr) {
    let dayFixtures = 0;
    let dayOdds = 0;
    let oddysseyReady = 0;
    
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      try {
        console.log(`📄 ${dateStr} - Fetching page ${page}...`);
        
        const response = await this.axios.get(`/fixtures/date/${dateStr}`, {
          params: {
            'api_token': this.apiToken,
            'include': 'league;participants;odds.bookmaker',
            'per_page': 50,
            'page': page
          }
        });

        if (!response.data.data || response.data.data.length === 0) {
          hasMore = false;
          break;
        }

        const fixtures = response.data.data;
        const pagination = response.data.pagination;
        
        console.log(`📊 ${dateStr} page ${page}: ${fixtures.length} fixtures`);
        
        // Process and save fixtures
        for (const fixture of fixtures) {
          const result = await this.processAndSaveFixture(fixture);
          if (result.saved) {
            dayFixtures++;
            dayOdds += result.oddsCount;
            if (result.oddysseyReady) oddysseyReady++;
          }
        }
        
        // Check if more pages exist
        hasMore = pagination?.has_more || false;
        page++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 250));
        
      } catch (error) {
        console.error(`❌ Error fetching ${dateStr} page ${page}:`, error.message);
        hasMore = false;
      }
    }
    
    return { fixtures: dayFixtures, odds: dayOdds, oddysseyReady };
  }

  /**
   * Process and save a single fixture
   */
  async processAndSaveFixture(fixture) {
    try {
      // Skip if no participants
      if (!fixture.participants || fixture.participants.length < 2) {
        return { saved: false, oddsCount: 0, oddysseyReady: false };
      }

      // Extract teams
      const homeTeam = fixture.participants.find(p => p.meta?.location === 'home');
      const awayTeam = fixture.participants.find(p => p.meta?.location === 'away');
      
      if (!homeTeam || !awayTeam) {
        return { saved: false, oddsCount: 0, oddysseyReady: false };
      }

      // Filter out youth and women leagues
      if (this.shouldExcludeFixture(fixture, homeTeam, awayTeam)) {
        return { saved: false, oddsCount: 0, oddysseyReady: false };
      }

      // Process odds
      const oddsData = this.processOdds(fixture.odds || []);
      
      // Skip if no valid odds (unless it has minimal required odds)
      if (!this.hasMinimalOdds(oddsData)) {
        return { saved: false, oddsCount: 0, oddysseyReady: false };
      }

      // Save fixture
      await this.saveFixture(fixture, homeTeam, awayTeam);
      
      // Save odds
      const oddsCount = await this.saveOdds(fixture.id, oddsData);
      
      // Check if Oddyssey ready (has 1X2 and O/U 2.5)
      const oddysseyReady = this.isOddysseyReady(oddsData);
      
      return { saved: true, oddsCount, oddysseyReady };
      
    } catch (error) {
      console.error(`❌ Error processing fixture ${fixture.id}:`, error.message);
      return { saved: false, oddsCount: 0, oddysseyReady: false };
    }
  }

  /**
   * Check if fixture should be excluded (youth/women)
   */
  shouldExcludeFixture(fixture, homeTeam, awayTeam) {
    const leagueName = fixture.league?.name || '';
    const homeTeamName = homeTeam.name || '';
    const awayTeamName = awayTeam.name || '';
    
    const textToCheck = `${leagueName} ${homeTeamName} ${awayTeamName}`.toLowerCase();
    
    return this.excludeKeywords.some(keyword => 
      textToCheck.includes(keyword.toLowerCase())
    );
  }

  /**
   * Process odds from API response
   */
  processOdds(odds) {
    if (!odds || odds.length === 0) return {};
    
    // Group odds by bookmaker, prioritizing preferred ones
    const oddsByBookmaker = {};
    
    for (const odd of odds) {
      const bookmakerId = parseInt(odd.bookmaker_id);
      if (!oddsByBookmaker[bookmakerId]) {
        oddsByBookmaker[bookmakerId] = [];
      }
      oddsByBookmaker[bookmakerId].push(odd);
    }
    
    console.log(`📊 Processing ${odds.length} odds from ${Object.keys(oddsByBookmaker).length} bookmakers`);
    
    // Select best bookmaker
    let selectedBookmakerId = null;
    for (const preferredId of this.preferredBookmakers) {
      if (oddsByBookmaker[preferredId]) {
        selectedBookmakerId = preferredId;
        break;
      }
    }
    
    // If no preferred bookmaker, use first available
    if (!selectedBookmakerId) {
      selectedBookmakerId = Object.keys(oddsByBookmaker)[0];
    }
    
    if (!selectedBookmakerId) return {};
    
    const selectedOdds = oddsByBookmaker[selectedBookmakerId];
    const bookmakerInfo = selectedOdds[0]?.bookmaker;
    
    // Extract specific markets
    const processedOdds = {
      bookmaker_id: selectedBookmakerId,
      bookmaker_name: bookmakerInfo?.name || `Bookmaker ${selectedBookmakerId}`,
      
      // Full Time 1X2 (Market ID: 1)
      ft_home: this.extractOddValue(selectedOdds, 1, ['1', 'home']),
      ft_draw: this.extractOddValue(selectedOdds, 1, ['x', 'draw']),
      ft_away: this.extractOddValue(selectedOdds, 1, ['2', 'away']),
      
      // Over/Under Goals
      over_15: this.extractOverUnder(selectedOdds, '1.5', 'over'),
      under_15: this.extractOverUnder(selectedOdds, '1.5', 'under'),
      over_25: this.extractOverUnder(selectedOdds, '2.5', 'over'),
      under_25: this.extractOverUnder(selectedOdds, '2.5', 'under'),
      over_35: this.extractOverUnder(selectedOdds, '3.5', 'over'),
      under_35: this.extractOverUnder(selectedOdds, '3.5', 'under'),
      
      // Both Teams to Score (Market ID: 14)
      btts_yes: this.extractOddValue(selectedOdds, 14, ['yes']),
      btts_no: this.extractOddValue(selectedOdds, 14, ['no']),
      
      // Half Time 1X2 (Market ID: 31)
      ht_home: this.extractOddValue(selectedOdds, 31, ['1', 'home']),
      ht_draw: this.extractOddValue(selectedOdds, 31, ['x', 'draw']),
      ht_away: this.extractOddValue(selectedOdds, 31, ['2', 'away']),
      
      // Half Time Over/Under
      ht_over_05: this.extractOverUnder(selectedOdds, '0.5', 'over', true),
      ht_under_05: this.extractOverUnder(selectedOdds, '0.5', 'under', true),
      ht_over_15: this.extractOverUnder(selectedOdds, '1.5', 'over', true),
      ht_under_15: this.extractOverUnder(selectedOdds, '1.5', 'under', true)
    };
    
    return processedOdds;
  }

  /**
   * Extract specific odd value with validation
   */
  extractOddValue(odds, marketId, labels) {
    const odd = odds.find(o => {
      const matchesMarket = parseInt(o.market_id) === marketId;
      const matchesLabel = labels.some(label => 
        o.label?.toLowerCase().includes(label.toLowerCase())
      );
      
      // Validate odds value
      const value = parseFloat(o.value);
      const isValidValue = value && value > 1.0 && value < 100.0;
      
      return matchesMarket && matchesLabel && isValidValue;
    });
    
    return odd ? parseFloat(odd.value) : null;
  }

  /**
   * Extract Over/Under odds with proper market validation
   */
  extractOverUnder(odds, total, direction, isHalfTime = false) {
    const odd = odds.find(o => {
      // Market ID 80 is for Over/Under markets
      const isOverUnderMarket = parseInt(o.market_id) === 80;
      
      // Check if half time market (market_id 32 is half time over/under)
      const isHTMarket = parseInt(o.market_id) === 32;
      const correctTimeframe = isHalfTime ? isHTMarket : isOverUnderMarket;
      
      // Match the specific total (1.5, 2.5, 3.5)
      const matchesTotal = o.total?.toString() === total || 
                          o.name?.toString() === total ||
                          parseFloat(o.total) === parseFloat(total) ||
                          parseFloat(o.name) === parseFloat(total);
      
      // Check direction (Over/Under)
      const matchesDirection = o.label?.toLowerCase().includes(direction.toLowerCase());
      
      // Validate odds value - more restrictive for Over/Under markets
      const value = parseFloat(o.value);
      const isValidValue = value && value > 1.0 && value < 10.0; // Over/Under odds should be 1.0-10.0
      
      return correctTimeframe && matchesTotal && matchesDirection && isValidValue;
    });
    
    return odd ? parseFloat(odd.value) : null;
  }

  /**
   * Check if fixture has minimal required odds
   */
  hasMinimalOdds(oddsData) {
    // Must have either Full Time 1X2 or (1X2 + O/U 2.5)
    const hasFT1X2 = oddsData.ft_home && oddsData.ft_draw && oddsData.ft_away;
    const hasOU25 = oddsData.over_25 && oddsData.under_25;
    
    return hasFT1X2 || (hasFT1X2 && hasOU25);
  }

  /**
   * Check if ready for Oddyssey (needs 1X2 + O/U 2.5)
   */
  isOddysseyReady(oddsData) {
    const hasFT1X2 = oddsData.ft_home && oddsData.ft_draw && oddsData.ft_away;
    const hasOU25 = oddsData.over_25 && oddsData.under_25;
    
    return hasFT1X2 && hasOU25;
  }

  /**
   * Save league to database with complete data
   */
  async saveLeague(league) {
    try {
      if (!league.id || !league.name) {
        console.log(`⚠️ Skipping league ${league.id} - missing required fields`);
        return false;
      }

      const countryName = league.country?.name || null;
      const countryCode = league.country?.code || league.country?.fifa_name || null;
      const imagePath = league.image_path || null;
      const countryImagePath = league.country?.image_path || null;

      const query = `
        INSERT INTO oracle.leagues (
          league_id, name, country, country_code, image_path, country_image_path,
          season_id, is_popular, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (league_id) DO UPDATE SET
          name = EXCLUDED.name,
          country = EXCLUDED.country,
          country_code = EXCLUDED.country_code,
          image_path = EXCLUDED.image_path,
          country_image_path = EXCLUDED.country_image_path,
          season_id = EXCLUDED.season_id,
          is_popular = EXCLUDED.is_popular,
          updated_at = NOW()
      `;

      await db.query(query, [
        league.id.toString(),
        league.name,
        countryName,
        countryCode,
        imagePath,
        countryImagePath,
        league.season_id?.toString() || null,
        this.isPopularLeague(league)
      ]);

      console.log(`✅ Saved league ${league.id}: ${league.name} (${countryName})`);
      return true;
    } catch (error) {
      console.error(`❌ Error saving league ${league.id}:`, error.message);
      return false;
    }
  }

  /**
   * Determine if a league is popular based on name and country
   */
  isPopularLeague(league) {
    const popularKeywords = [
      'premier league', 'la liga', 'bundesliga', 'serie a', 'ligue 1',
      'champions league', 'europa league', 'conference league',
      'fa cup', 'copa del rey', 'dfb pokal', 'coppa italia', 'coupe de france'
    ];
    
    const leagueName = league.name?.toLowerCase() || '';
    const countryName = league.country?.name?.toLowerCase() || '';
    
    return popularKeywords.some(keyword => 
      leagueName.includes(keyword) || countryName.includes(keyword)
    );
  }

  /**
   * Save fixture to database
   */
  async saveFixture(fixture, homeTeam, awayTeam) {
    // First, save league information if available
    if (fixture.league && fixture.league.id) {
      try {
        await this.saveLeague(fixture.league);
      } catch (error) {
        console.warn(`⚠️ Failed to save league ${fixture.league.id}:`, error.message);
      }
    }

    const query = `
      INSERT INTO oracle.fixtures (
        id, name, home_team_id, away_team_id, home_team, away_team,
        league_id, league_name, season_id, round_id, round,
        match_date, starting_at, status, venue, referee,
        league, season, stage, round_obj, state, participants, metadata,
        referee_id, referee_name, referee_image_path,
        venue_capacity, venue_coordinates, venue_surface, venue_image_path,
        home_team_image_path, away_team_image_path, league_image_path, country_image_path,
        venue_id, state_id, result_info, leg,
        team_assignment_validated, odds_mapping_validated, processing_errors,
        country, country_code,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        home_team = EXCLUDED.home_team,
        away_team = EXCLUDED.away_team,
        match_date = EXCLUDED.match_date,
        starting_at = EXCLUDED.starting_at,
        status = EXCLUDED.status,
        home_team_image_path = EXCLUDED.home_team_image_path,
        away_team_image_path = EXCLUDED.away_team_image_path,
        league_image_path = EXCLUDED.league_image_path,
        country_image_path = EXCLUDED.country_image_path,
        country = EXCLUDED.country,
        country_code = EXCLUDED.country_code,
        venue_capacity = EXCLUDED.venue_capacity,
        venue_coordinates = EXCLUDED.venue_coordinates,
        venue_surface = EXCLUDED.venue_surface,
        venue_image_path = EXCLUDED.venue_image_path,
        referee_name = EXCLUDED.referee_name,
        referee_image_path = EXCLUDED.referee_image_path,
        updated_at = NOW()
    `;
    
    // Extract country information from league data
    const leagueCountry = fixture.league?.country?.name || null;
    const leagueCountryCode = fixture.league?.country?.code || fixture.league?.country?.fifa_name || null;
    
    // Extract venue information
    const venue = fixture.venue || {};
    const venueCapacity = venue.capacity || null;
    const venueCoordinates = venue.coordinates || null;
    const venueSurface = venue.surface || null;
    const venueImagePath = venue.image_path || null;
    
    // Extract referee information - handle different possible structures
    let refereeName = null;
    let refereeId = null;
    let refereeImagePath = null;
    
    if (fixture.referees && Array.isArray(fixture.referees) && fixture.referees.length > 0) {
      const referee = fixture.referees[0];
      refereeId = referee.id?.toString() || null;
      refereeName = referee.name || referee.common_name || referee.display_name || null;
      refereeImagePath = referee.image_path || null;
    }
    
    // Extract image paths from participants and league
    const homeTeamImagePath = homeTeam.image_path || null;
    const awayTeamImagePath = awayTeam.image_path || null;
    const leagueImagePath = fixture.league?.image_path || null;
    
    // Get country image path from league country data
    const countryImagePath = fixture.league?.country?.image_path || null;
    
    const values = [
      fixture.id.toString(), // $1 - id
      `${homeTeam.name} vs ${awayTeam.name}`, // $2 - name
      homeTeam.id?.toString() || null, // $3 - home_team_id
      awayTeam.id?.toString() || null, // $4 - away_team_id
      homeTeam.name, // $5 - home_team
      awayTeam.name, // $6 - away_team
      fixture.league?.id?.toString() || null, // $7 - league_id
      fixture.league?.name || 'Unknown League', // $8 - league_name
      fixture.season?.id?.toString() || null, // $9 - season_id
      fixture.round?.id?.toString() || null, // $10 - round_id
      fixture.round?.name || null, // $11 - round
      fixture.starting_at || new Date().toISOString(), // $12 - match_date
      fixture.starting_at || new Date().toISOString(), // $13 - starting_at
      fixture.state?.state || 'NS', // $14 - status
      JSON.stringify(fixture.venue || {}), // $15 - venue
      refereeName, // $16 - referee
      JSON.stringify(fixture.league || {}), // $17 - league
      JSON.stringify(fixture.season || {}), // $18 - season
      JSON.stringify(fixture.stage || {}), // $19 - stage
      JSON.stringify(fixture.round || {}), // $20 - round_obj
      JSON.stringify(fixture.state || {}), // $21 - state
      JSON.stringify(fixture.participants || []), // $22 - participants
      JSON.stringify({
        processed_at: new Date().toISOString(),
        venue_info: fixture.venue || {},
        referee_info: fixture.referees || [],
        team_images: {
          home_team_image: homeTeamImagePath,
          away_team_image: awayTeamImagePath
        },
        league_image: leagueImagePath,
        country_image: countryImagePath,
        additional_data: fixture.metadata || {}
      }), // $23 - metadata
      refereeId, // $24 - referee_id
      refereeName, // $25 - referee_name
      refereeImagePath, // $26 - referee_image_path
      venueCapacity, // $27 - venue_capacity
      venueCoordinates, // $28 - venue_coordinates
      venueSurface, // $29 - venue_surface
      venueImagePath, // $30 - venue_image_path
      homeTeamImagePath, // $31 - home_team_image_path
      awayTeamImagePath, // $32 - away_team_image_path
      leagueImagePath, // $33 - league_image_path
      countryImagePath, // $34 - country_image_path
      venue.id?.toString() || null, // $35 - venue_id
      fixture.state?.id?.toString() || null, // $36 - state_id
      JSON.stringify(fixture.result_info || {}), // $37 - result_info
      fixture.leg ? parseInt(fixture.leg.toString().split('/')[0]) || null : null, // $38 - leg
      true, // $39 - team_assignment_validated
      true, // $40 - odds_mapping_validated
      JSON.stringify({ processed_at: new Date().toISOString() }), // $41 - processing_errors
      leagueCountry, // $42 - country
      leagueCountryCode // $43 - country_code
    ];
    

    
    await db.query(query, values);
  }

  /**
   * Save odds to database
   */
  async saveOdds(fixtureId, oddsData) {
    if (!oddsData.bookmaker_id) return 0;
    
    let count = 0;
    const markets = this.createOddsRecords(fixtureId, oddsData);
    
    for (const market of markets) {
      try {
        const query = `
          INSERT INTO oracle.fixture_odds (
            id, fixture_id, market_id, bookmaker_id, label, value,
            market_description, sort_order, bookmaker_name, total, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            value = EXCLUDED.value,
            total = EXCLUDED.total,
            bookmaker_name = EXCLUDED.bookmaker_name,
            updated_at = NOW()
        `;
        
        await db.query(query, market);
        count++;
      } catch (error) {
        console.warn(`⚠️ Failed to save odds record:`, error.message);
      }
    }
    
    return count;
  }

  /**
   * Create individual odds records
   */
  createOddsRecords(fixtureId, oddsData) {
    const records = [];
    let sortOrder = 1;
    
    // Helper function to add record
    const addRecord = (marketId, label, value, description, total = null) => {
      if (value !== null && value !== undefined) {
        const id = `${fixtureId}_${oddsData.bookmaker_id}_${marketId}_${label.toLowerCase().replace(/\s+/g, '_')}`;
        records.push([
          id,
          fixtureId.toString(),
          marketId.toString(),
          oddsData.bookmaker_id.toString(),
          label,
          value,
          description,
          sortOrder++,
          oddsData.bookmaker_name,
          total
        ]);
      }
    };
    
    // Full Time 1X2
    addRecord(1, 'Home', oddsData.ft_home, 'Full Time Result');
    addRecord(1, 'Draw', oddsData.ft_draw, 'Full Time Result');
    addRecord(1, 'Away', oddsData.ft_away, 'Full Time Result');
    
    // Over/Under Goals - all use market_id 80, differentiated by total field
    if (oddsData.over_15 !== null) {
      addRecord(80, 'Over', oddsData.over_15, 'Goals Over/Under 1.5', '1.5');
      addRecord(80, 'Under', oddsData.under_15, 'Goals Over/Under 1.5', '1.5');
    }
    if (oddsData.over_25 !== null) {
      addRecord(80, 'Over', oddsData.over_25, 'Goals Over/Under 2.5', '2.5');
      addRecord(80, 'Under', oddsData.under_25, 'Goals Over/Under 2.5', '2.5');
    }
    if (oddsData.over_35 !== null) {
      addRecord(80, 'Over', oddsData.over_35, 'Goals Over/Under 3.5', '3.5');
      addRecord(80, 'Under', oddsData.under_35, 'Goals Over/Under 3.5', '3.5');
    }
    
    // Both Teams to Score - market_id 14
    addRecord(14, 'Yes', oddsData.btts_yes, 'Both Teams to Score');
    addRecord(14, 'No', oddsData.btts_no, 'Both Teams to Score');
    
    // Half Time 1X2 - market_id 31
    addRecord(31, 'Home', oddsData.ht_home, 'Half Time Result');
    addRecord(31, 'Draw', oddsData.ht_draw, 'Half Time Result');
    addRecord(31, 'Away', oddsData.ht_away, 'Half Time Result');
    
    // First Half Goals - market_id 28 (same for 0.5 and 1.5, differentiated by total)
    if (oddsData.ht_over_05 !== null) {
      addRecord(28, 'Over', oddsData.ht_over_05, 'First Half Goals Over/Under 0.5', '0.5');
      addRecord(28, 'Under', oddsData.ht_under_05, 'First Half Goals Over/Under 0.5', '0.5');
    }
    if (oddsData.ht_over_15 !== null) {
      addRecord(28, 'Over', oddsData.ht_over_15, 'First Half Goals Over/Under 1.5', '1.5');
      addRecord(28, 'Under', oddsData.ht_under_15, 'First Half Goals Over/Under 1.5', '1.5');
    }
    
    return records;
  }

  /**
   * Fetch fixture results for completed matches with enhanced score parsing
   */
  async fetchFixtureResults(fixtureIds) {
    console.log(`🔍 Fetching results for ${fixtureIds.length} fixtures...`);
    
    const results = [];
    
    for (const fixtureId of fixtureIds) {
      try {
        const response = await this.axios.get(`/fixtures/${fixtureId}`, {
          params: {
            'api_token': this.apiToken,
            'include': 'scores;participants;state;league'
          }
        });
        
        const fixture = response.data.data;
        if (!fixture) continue;
        
        // Only process completed matches (including penalty shootouts)
        if (!['FT', 'AET', 'PEN', 'FT_PEN'].includes(fixture.state?.state)) {
          continue;
        }
        
        // Get 90-minute score (excluding extra time/penalties)
        let fullTimeScore = fixture.scores?.find(s => 
          s.description === 'FT' || s.description === 'FULLTIME'
        );
        
        // If no FT score but match is finished, use CURRENT score
        if (!fullTimeScore && (fixture.state?.state === 'FT' || fixture.state?.state === 'FT_PEN')) {
          fullTimeScore = fixture.scores?.find(s => s.description === 'CURRENT');
        }
        
        // Get half-time score for additional context
        let halfTimeScore = fixture.scores?.find(s => 
          s.description === 'HT' || s.description === 'HALFTIME'
        );
        
        if (!fullTimeScore) {
          console.log(`⚠️ No 90-minute score found for fixture ${fixtureId}`);
          console.log(`   Available scores: ${fixture.scores?.map(s => s.description).join(', ') || 'none'}`);
          console.log(`   Match state: ${fixture.state?.state || 'unknown'}`);
          continue;
        }
        
        const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
        const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');
        
        // Parse scores from SportMonks API format
        const parseScore = (scores, description) => {
          if (!scores || !Array.isArray(scores)) {
            console.log(`⚠️ No scores array for ${description}`);
            return { home: 0, away: 0 };
          }
          
          // Find scores with the specified description (e.g., "CURRENT" for full-time)
          const relevantScores = scores.filter(s => s.description === description);
          
          if (relevantScores.length === 0) {
            console.log(`⚠️ No ${description} scores found. Available: ${scores.map(s => s.description).join(', ')}`);
            return { home: 0, away: 0 };
          }
          
          let homeScore = null;
          let awayScore = null;
          
          for (const score of relevantScores) {
            if (score.score && score.score.participant && score.score.goals !== undefined) {
              const goals = parseInt(score.score.goals);
              if (score.score.participant === 'home') {
                homeScore = isNaN(goals) ? 0 : goals;
              } else if (score.score.participant === 'away') {
                awayScore = isNaN(goals) ? 0 : goals;
              }
            }
          }
          
          // Ensure both scores are found
          if (homeScore === null || awayScore === null) {
            console.log(`⚠️ Incomplete ${description} scores: home=${homeScore}, away=${awayScore}`);
            return { home: homeScore || 0, away: awayScore || 0 };
          }
          
          return { home: homeScore, away: awayScore };
        };
        
        // For penalty shootout matches (FT_PEN), calculate 90-minute score from halves
        let ftScore;
        if (fixture.state?.state === 'FT_PEN') {
          console.log(`🏆 Penalty match detected: ${fixture.id}`);
          
          // Calculate 90-minute score from 1ST_HALF + 2ND_HALF_ONLY (excludes extra time)
          const firstHalf = parseScore(fixture.scores, '1ST_HALF');
          const secondHalfOnly = parseScore(fixture.scores, '2ND_HALF_ONLY');
          
          ftScore = {
            home: firstHalf.home + secondHalfOnly.home,
            away: firstHalf.away + secondHalfOnly.away
          };
          
          console.log(`⚽ 90-minute score: ${ftScore.home}-${ftScore.away} (1st: ${firstHalf.home}-${firstHalf.away}, 2nd only: ${secondHalfOnly.home}-${secondHalfOnly.away})`);
        } else {
          // For regular matches, use CURRENT score
          ftScore = parseScore(fixture.scores, 'CURRENT');
        }
        
        const htScore = parseScore(fixture.scores, '1ST_HALF');
        
        // Calculate outcomes for Oddyssey (1X2 and O/U 2.5)
        const calculateMoneylineResult = (homeScore, awayScore) => {
          if (homeScore > awayScore) return '1';
          if (homeScore < awayScore) return '2';
          return 'X';
        };
        
        const calculateOverUnderResult = (homeScore, awayScore) => {
          const totalGoals = homeScore + awayScore;
          return totalGoals > 2.5 ? 'Over' : 'Under';
        };

        const result = {
          fixture_id: fixture.id,
          home_team: homeTeam?.name,
          away_team: awayTeam?.name,
          home_score: ftScore.home,
          away_score: ftScore.away,
          ht_home_score: htScore.home || null,
          ht_away_score: htScore.away || null,
          status: fixture.state?.state,
          match_date: fixture.starting_at,
          score_type: fullTimeScore.description,
          // Calculate outcomes immediately
          result_1x2: calculateMoneylineResult(ftScore.home, ftScore.away),
          result_ou25: calculateOverUnderResult(ftScore.home, ftScore.away)
        };
        
        results.push(result);
        console.log(`✅ Found result for fixture ${fixtureId}: ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team} (${result.score_type})`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 250));
        
      } catch (error) {
        console.error(`❌ Error fetching result for ${fixtureId}:`, error.message);
      }
    }
    
    console.log(`✅ Fetched ${results.length} results`);
    return results;
  }

  /**
   * Save fixture results to database with calculated outcomes
   */
  async saveFixtureResults(results) {
    console.log(`💾 Saving ${results.length} fixture results to database...`);
    
    let savedCount = 0;
    
    for (const result of results) {
      try {
        // Calculate outcomes based on scores
        const outcomes = this.calculateOutcomes(result);
        
        const query = `
          INSERT INTO oracle.fixture_results (
            id, fixture_id, home_score, away_score, ht_home_score, ht_away_score,
            result_1x2, result_ou05, result_ou15, result_ou25, result_ou35, result_ou45,
            result_btts, result_ht, result_ht_ou05, result_ht_ou15, result_ht_goals,
            outcome_1x2, outcome_ou05, outcome_ou15, outcome_ou25, outcome_ou35, outcome_ou45,
            outcome_ht_result, outcome_btts, full_score, ht_score,
            finished_at, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW(), NOW()
          )
          ON CONFLICT (fixture_id) DO UPDATE SET
            home_score = EXCLUDED.home_score,
            away_score = EXCLUDED.away_score,
            ht_home_score = EXCLUDED.ht_home_score,
            ht_away_score = EXCLUDED.ht_away_score,
            result_1x2 = EXCLUDED.result_1x2,
            result_ou05 = EXCLUDED.result_ou05,
            result_ou15 = EXCLUDED.result_ou15,
            result_ou25 = EXCLUDED.result_ou25,
            result_ou35 = EXCLUDED.result_ou35,
            result_ou45 = EXCLUDED.result_ou45,
            result_btts = EXCLUDED.result_btts,
            result_ht = EXCLUDED.result_ht,
            result_ht_ou05 = EXCLUDED.result_ht_ou05,
            result_ht_ou15 = EXCLUDED.result_ht_ou15,
            result_ht_goals = EXCLUDED.result_ht_goals,
            outcome_1x2 = EXCLUDED.outcome_1x2,
            outcome_ou05 = EXCLUDED.outcome_ou05,
            outcome_ou15 = EXCLUDED.outcome_ou15,
            outcome_ou25 = EXCLUDED.outcome_ou25,
            outcome_ou35 = EXCLUDED.outcome_ou35,
            outcome_ou45 = EXCLUDED.outcome_ou45,
            outcome_ht_result = EXCLUDED.outcome_ht_result,
            outcome_btts = EXCLUDED.outcome_btts,
            full_score = EXCLUDED.full_score,
            ht_score = EXCLUDED.ht_score,
            finished_at = EXCLUDED.finished_at,
            updated_at = NOW()
        `;
        
        const values = [
          `result_${result.fixture_id}`, // id
          result.fixture_id, // fixture_id
          result.home_score, // home_score
          result.away_score, // away_score
          result.ht_home_score, // ht_home_score
          result.ht_away_score, // ht_away_score
          outcomes.result_1x2, // result_1x2
          outcomes.result_ou05, // result_ou05
          outcomes.result_ou15, // result_ou15
          outcomes.result_ou25, // result_ou25
          outcomes.result_ou35, // result_ou35
          outcomes.result_ou45, // result_ou45
          outcomes.result_btts, // result_btts
          outcomes.result_ht, // result_ht
          outcomes.result_ht_ou05, // result_ht_ou05
          outcomes.result_ht_ou15, // result_ht_ou15
          outcomes.result_ht_goals, // result_ht_goals
          outcomes.outcome_1x2, // outcome_1x2
          outcomes.outcome_ou05, // outcome_ou05
          outcomes.outcome_ou15, // outcome_ou15
          outcomes.outcome_ou25, // outcome_ou25
          outcomes.outcome_ou35, // outcome_ou35
          outcomes.outcome_ou45, // outcome_ou45
          outcomes.outcome_ht_result, // outcome_ht_result
          outcomes.outcome_btts, // outcome_btts
          outcomes.full_score, // full_score
          outcomes.ht_score, // ht_score
          result.match_date // finished_at
        ];
        
        await db.query(query, values);
        
        // Update fixture status to reflect completion
        await db.query(`
          UPDATE oracle.fixtures 
          SET status = $1, updated_at = NOW() 
          WHERE id = $2
        `, [result.status, result.fixture_id]);
        
        savedCount++;
        
        console.log(`✅ Saved result for fixture ${result.fixture_id}: ${result.home_score}-${result.away_score}`);
        
      } catch (error) {
        console.error(`❌ Error saving result for fixture ${result.fixture_id}:`, error.message);
      }
    }
    
    console.log(`💾 Successfully saved ${savedCount}/${results.length} results to database`);
    return savedCount;
  }

  /**
   * Calculate all outcomes based on match scores
   */
  calculateOutcomes(result) {
    const homeScore = result.home_score || 0;
    const awayScore = result.away_score || 0;
    const htHomeScore = result.ht_home_score || 0;
    const htAwayScore = result.ht_away_score || 0;
    
    const totalGoals = homeScore + awayScore;
    const htTotalGoals = htHomeScore + htAwayScore;
    
    // Full Time 1X2
    let result_1x2, outcome_1x2;
    if (homeScore > awayScore) {
      result_1x2 = '1';
      outcome_1x2 = 'Home';
    } else if (homeScore === awayScore) {
      result_1x2 = 'X';
      outcome_1x2 = 'Draw';
    } else {
      result_1x2 = '2';
      outcome_1x2 = 'Away';
    }
    
    // Over/Under calculations
    const calculateOU = (total, threshold) => {
      if (total > threshold) return 'Over';
      if (total < threshold) return 'Under';
      return 'Push'; // Exactly equal
    };
    
    const result_ou05 = calculateOU(totalGoals, 0.5);
    const result_ou15 = calculateOU(totalGoals, 1.5);
    const result_ou25 = calculateOU(totalGoals, 2.5);
    const result_ou35 = calculateOU(totalGoals, 3.5);
    const result_ou45 = calculateOU(totalGoals, 4.5);
    
    const outcome_ou05 = result_ou05;
    const outcome_ou15 = result_ou15;
    const outcome_ou25 = result_ou25;
    const outcome_ou35 = result_ou35;
    const outcome_ou45 = result_ou45;
    
    // Both Teams to Score
    const result_btts = (homeScore > 0 && awayScore > 0) ? 'Yes' : 'No';
    const outcome_btts = result_btts;
    
    // Half Time calculations
    let result_ht, outcome_ht_result;
    if (htHomeScore > htAwayScore) {
      result_ht = '1';
      outcome_ht_result = 'Home';
    } else if (htHomeScore === htAwayScore) {
      result_ht = 'X';
      outcome_ht_result = 'Draw';
    } else {
      result_ht = '2';
      outcome_ht_result = 'Away';
    }
    
    const result_ht_ou05 = calculateOU(htTotalGoals, 0.5);
    const result_ht_ou15 = calculateOU(htTotalGoals, 1.5);
    const result_ht_goals = htTotalGoals;
    
    // String representations
    const full_score = `${homeScore}-${awayScore}`;
    const ht_score = result.ht_home_score !== null ? `${htHomeScore}-${htAwayScore}` : null;
    
    return {
      result_1x2,
      result_ou05,
      result_ou15,
      result_ou25,
      result_ou35,
      result_ou45,
      result_btts,
      result_ht,
      result_ht_ou05,
      result_ht_ou15,
      result_ht_goals,
      outcome_1x2,
      outcome_ou05,
      outcome_ou15,
      outcome_ou25,
      outcome_ou35,
      outcome_ou45,
      outcome_ht_result,
      outcome_btts,
      full_score,
      ht_score
    };
  }

  /**
   * Fetch and save results for completed matches
   */
  async fetchAndSaveResults() {
    console.log('🚀 Starting automated results fetch and save...');
    
    try {
      // Get completed matches that don't have results yet
      const completedMatches = await this.getCompletedMatchesWithoutResults();
      
      if (completedMatches.length === 0) {
        console.log('✅ No completed matches without results found');
        return { fetched: 0, saved: 0 };
      }
      
      console.log(`📊 Found ${completedMatches.length} completed matches without results`);
      
      // Fetch results from API
      const fixtureIds = completedMatches.map(match => match.id);
      const results = await this.fetchFixtureResults(fixtureIds);
      
      if (results.length === 0) {
        console.log('⚠️ No results fetched from API');
        return { fetched: 0, saved: 0 };
      }
      
      // Save results to database
      const savedCount = await this.saveFixtureResults(results);
      
      console.log(`🎉 Results fetch and save completed: ${results.length} fetched, ${savedCount} saved`);
      
      return { fetched: results.length, saved: savedCount };
      
    } catch (error) {
      console.error('❌ Error in fetchAndSaveResults:', error);
      throw error;
    }
  }

  /**
   * Get completed matches that don't have results in database
   */
  async getCompletedMatchesWithoutResults() {
    const query = `
      SELECT f.id, f.home_team, f.away_team, f.match_date, f.status
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
      WHERE f.match_date < NOW() - INTERVAL '1 hour'  -- Match finished at least 1 hour ago
        AND f.status IN ('FT', 'AET', 'PEN')  -- Completed matches
        AND fr.fixture_id IS NULL  -- No results yet
      ORDER BY f.match_date DESC
      LIMIT 50  -- Process in batches
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  /**
   * Get Oddyssey fixtures from database (today only)
   */
  async fetchOddysseyFixtures() {
    console.log('🎯 Getting Oddyssey fixtures from database...');
    
    const today = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT DISTINCT f.*
      FROM oracle.fixtures f
      INNER JOIN oracle.fixture_odds fo1 ON f.id = fo1.fixture_id 
        AND fo1.market_id = '1' AND fo1.label = 'Home'
      INNER JOIN oracle.fixture_odds fo2 ON f.id = fo2.fixture_id 
        AND fo2.market_id = '80' AND fo2.label = 'Over' 
        AND fo2.market_description LIKE '%2.5%'
      WHERE DATE(f.match_date) = $1
        AND f.status IN ('NS', 'Fixture')
      ORDER BY f.match_date ASC
    `;
    
    const result = await db.query(query, [today]);
    
    console.log(`✅ Found ${result.rows.length} Oddyssey-ready fixtures for today`);
    return result.rows;
  }

  /**
   * Backward compatibility method for existing cron jobs
   */
  async fetchAndSaveFixtures() {
    console.log('⚠️ Using legacy method name - redirecting to fetchAndSave7DayFixtures()');
    return await this.fetchAndSave7DayFixtures();
  }

  /**
   * Update fixture status for live matches
   * This should run independently of results fetching to update match status
   */
  async updateFixtureStatus() {
    console.log('🔄 Updating fixture status for live matches...');
    
    try {
      // Get fixtures that are likely in progress or finished
      const result = await db.query(`
        SELECT f.id, f.home_team, f.away_team, f.match_date, f.status
        FROM oracle.fixtures f
        WHERE f.match_date >= NOW() - INTERVAL '4 hours'
          AND f.match_date <= NOW() + INTERVAL '2 hours'
          AND f.status = 'NS'
        ORDER BY f.match_date DESC
        LIMIT 50
      `);

      if (result.rows.length === 0) {
        console.log('ℹ️ No fixtures need status updates');
        return { updated: 0 };
      }

      console.log(`📊 Updating status for ${result.rows.length} fixtures...`);
      
      let updatedCount = 0;
      
      for (const fixture of result.rows) {
        try {
          // Fetch individual fixture status from SportMonks
          const response = await this.axios.get(`/fixtures/${fixture.id}`, {
            params: {
              'api_token': this.apiToken,
              'include': 'state'
            }
          });

          if (response.data.data) {
            const fixtureData = response.data.data;
            const newStatus = fixtureData.state?.state || 'NS';
            
            // Only update if status has changed
            if (newStatus !== fixture.status) {
              await db.query(`
                UPDATE oracle.fixtures 
                SET status = $1, updated_at = NOW() 
                WHERE id = $2
              `, [newStatus, fixture.id]);
              
              console.log(`✅ Updated fixture ${fixture.id} status: ${fixture.status} → ${newStatus}`);
              updatedCount++;
            }
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.warn(`⚠️ Failed to update status for fixture ${fixture.id}:`, error.message);
        }
      }
      
      console.log(`🎉 Updated status for ${updatedCount}/${result.rows.length} fixtures`);
      return { updated: updatedCount };
      
    } catch (error) {
      console.error('❌ Error updating fixture status:', error);
      return { updated: 0, error: error.message };
    }
  }
}

module.exports = SportMonksService;
