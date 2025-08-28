const Web3Service = require('./services/web3-service.js');
const db = require('./db/db');

class ContractToDbSync {
  constructor() {
    this.web3 = new Web3Service();
  }

  async syncContractMatchesToDb() {
    try {
      console.log('🔄 Syncing contract matches to database...');
      
      // Ensure Web3Service is initialized
      await this.web3.initialize();
      
      const contract = await this.web3.getOddysseyContract();
      const currentCycleId = await contract.dailyCycleId();
      
      console.log(`📊 Current cycle ID: ${currentCycleId}`);
      
      // Check if current cycle is already synced with matches
      const existingMatches = await db.query(
        'SELECT COUNT(*) as count FROM oracle.daily_game_matches WHERE cycle_id = $1',
        [currentCycleId]
      );
      
      const matchCount = parseInt(existingMatches.rows[0].count);
      
      if (matchCount > 0) {
        console.log(`✅ Cycle ${currentCycleId} already has ${matchCount} matches in database, skipping sync`);
        return;
      }
      
      console.log(`⚠️ Cycle ${currentCycleId} exists but has no matches, syncing matches...`);
      
      // Get matches from contract for current cycle only
      const contractMatches = await contract.getDailyMatches(currentCycleId);
      
      console.log(`📋 Found ${contractMatches.length} matches in contract for cycle ${currentCycleId}`);
      
      if (contractMatches.length === 0) {
        console.log(`⚠️ No matches found for cycle ${currentCycleId}, skipping sync`);
        return;
      }
      
      // Create cycle in database first (if it doesn't exist)
      await this.createCycleInDb(currentCycleId, contractMatches);
      
      // Save each match to database with complete details
      for (let i = 0; i < contractMatches.length; i++) {
        const match = contractMatches[i];
        const startTime = new Date(Number(match.startTime) * 1000);
        const gameDate = startTime.toISOString().split('T')[0];
        
        // Get real team names from database by fixture ID
        let homeTeam = 'Unknown Home';
        let awayTeam = 'Unknown Away';
        let leagueName = 'Unknown League';
        
        try {
          const fixtureData = await db.query(`
            SELECT home_team, away_team, league_name 
            FROM oracle.fixtures 
            WHERE id = $1
          `, [match.id.toString()]);
          
          if (fixtureData.rows.length > 0) {
            homeTeam = fixtureData.rows[0].home_team;
            awayTeam = fixtureData.rows[0].away_team;
            leagueName = fixtureData.rows[0].league_name;
          } else {
            console.warn(`⚠️ No fixture data found for ID ${match.id}, creating placeholder fixture`);
            
            // Create placeholder fixture to satisfy foreign key constraint
            await this.createPlaceholderFixture(match.id.toString(), startTime);
          }
        } catch (error) {
          console.warn(`⚠️ Error fetching fixture data for ID ${match.id}:`, error.message);
          
          // Create placeholder fixture even if query fails
          await this.createPlaceholderFixture(match.id.toString(), startTime);
        }
        
        await this.saveMatchToDb({
          fixtureId: match.id.toString(),
          homeTeam,
          awayTeam,
          leagueName,
          matchDate: startTime,
          gameDate,
          homeOdds: Number(match.oddsHome) / 1000,
          drawOdds: Number(match.oddsDraw) / 1000,
          awayOdds: Number(match.oddsAway) / 1000,
          over25Odds: Number(match.oddsOver) / 1000,
          under25Odds: Number(match.oddsUnder) / 1000,
          cycleId: currentCycleId,
          displayOrder: i + 1
        });
        
        console.log(`✅ Saved match ${i+1}: ${homeTeam} vs ${awayTeam} (${gameDate})`);
      }
      
      console.log('🎉 Contract matches synced to database successfully!');
      
      // Verify sync
      const dbMatches = await db.query(
        'SELECT COUNT(*) as count FROM oracle.daily_game_matches WHERE cycle_id = $1',
        [currentCycleId]
      );
      
      console.log(`📊 Database now has ${dbMatches.rows[0].count} matches for cycle ${currentCycleId}`);
      
    } catch (error) {
      console.error('❌ Error syncing contract matches to database:', error);
      throw error;
    }
  }

  /**
   * Sync matches for a specific cycle ID
   */
  async syncSpecificCycle(cycleId) {
    try {
      console.log(`🔄 Syncing matches for specific cycle ${cycleId}...`);
      
      // Ensure Web3Service is initialized
      await this.web3.initialize();
      
      const contract = await this.web3.getOddysseyContract();
      
      // Get matches from contract for specified cycle
      const contractMatches = await contract.getDailyMatches(cycleId);
      
      console.log(`📋 Found ${contractMatches.length} matches in contract for cycle ${cycleId}`);
      
      if (contractMatches.length === 0) {
        console.log(`⚠️ No matches found for cycle ${cycleId}`);
        return;
      }
      
      // Create cycle in database first (if it doesn't exist)
      await this.createCycleInDb(cycleId, contractMatches);
      
      // Save each match to database with complete details
      for (let i = 0; i < contractMatches.length; i++) {
        const match = contractMatches[i];
        const startTime = new Date(Number(match.startTime) * 1000);
        const gameDate = startTime.toISOString().split('T')[0];
        
        // Get real team names from database by fixture ID
        let homeTeam = 'Unknown Home';
        let awayTeam = 'Unknown Away';
        let leagueName = 'Unknown League';
        
        try {
          const fixtureData = await db.query(`
            SELECT home_team, away_team, league_name 
            FROM oracle.fixtures 
            WHERE id = $1
          `, [match.id.toString()]);
          
          if (fixtureData.rows.length > 0) {
            homeTeam = fixtureData.rows[0].home_team;
            awayTeam = fixtureData.rows[0].away_team;
            leagueName = fixtureData.rows[0].league_name;
          } else {
            console.warn(`⚠️ No fixture data found for ID ${match.id}, creating placeholder fixture`);
            await this.createPlaceholderFixture(match.id.toString(), startTime);
          }
        } catch (error) {
          console.warn(`⚠️ Error fetching fixture data for ID ${match.id}:`, error.message);
          await this.createPlaceholderFixture(match.id.toString(), startTime);
        }
        
        await this.saveMatchToDb({
          fixtureId: match.id.toString(),
          homeTeam,
          awayTeam,
          leagueName,
          matchDate: startTime,
          gameDate,
          homeOdds: Number(match.oddsHome) / 1000,
          drawOdds: Number(match.oddsDraw) / 1000,
          awayOdds: Number(match.oddsAway) / 1000,
          over25Odds: Number(match.oddsOver) / 1000,
          under25Odds: Number(match.oddsUnder) / 1000,
          cycleId: cycleId,
          displayOrder: i + 1
        });
        
        console.log(`✅ Saved match ${i+1}: ${homeTeam} vs ${awayTeam} (${gameDate})`);
      }
      
      console.log(`🎉 Cycle ${cycleId} matches synced to database successfully!`);
      
      // Verify sync
      const dbMatches = await db.query(
        'SELECT COUNT(*) as count FROM oracle.daily_game_matches WHERE cycle_id = $1',
        [cycleId]
      );
      
      console.log(`📊 Database now has ${dbMatches.rows[0].count} matches for cycle ${cycleId}`);
      
    } catch (error) {
      console.error(`❌ Error syncing cycle ${cycleId} matches to database:`, error);
      throw error;
    }
  }

  async createCycleInDb(cycleId, matches) {
    const earliestTime = Math.min(...matches.map(m => Number(m.startTime)));
    const cycleStartTime = new Date(earliestTime * 1000);
    const cycleEndTime = new Date((earliestTime - 300) * 1000);
    
    await db.query(`
      INSERT INTO oracle.oddyssey_cycles (
        cycle_id, created_at, updated_at, matches_count, 
        matches_data, cycle_start_time, cycle_end_time, is_resolved
      ) VALUES ($1, NOW(), NOW(), $2, $3, $4, $5, false)
      ON CONFLICT (cycle_id) DO UPDATE SET
        matches_count = $2, matches_data = $3, 
        cycle_start_time = $4, cycle_end_time = $5, updated_at = NOW()
    `, [
      cycleId,
      matches.length,
      JSON.stringify(matches.map(m => ({
        id: m.id.toString(),
        startTime: Number(m.startTime),
        oddsHome: Number(m.oddsHome),
        oddsDraw: Number(m.oddsDraw),
        oddsAway: Number(m.oddsAway),
        oddsOver: Number(m.oddsOver),
        oddsUnder: Number(m.oddsUnder)
      }))),
      cycleStartTime,
      cycleEndTime
    ]);
    
    console.log(`📝 Created cycle ${cycleId} in database`);
  }

  async saveMatchToDb(matchData) {
    await db.query(`
      INSERT INTO oracle.daily_game_matches (
        fixture_id, home_team, away_team, league_name, match_date, game_date,
        home_odds, draw_odds, away_odds, over_25_odds, under_25_odds,
        cycle_id, display_order, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      ON CONFLICT (fixture_id, cycle_id) DO UPDATE SET
        home_team = $2, away_team = $3, league_name = $4, match_date = $5, game_date = $6,
        home_odds = $7, draw_odds = $8, away_odds = $9, over_25_odds = $10, under_25_odds = $11,
        display_order = $13, updated_at = NOW()
    `, [
      matchData.fixtureId,
      matchData.homeTeam,
      matchData.awayTeam,
      matchData.leagueName,
      matchData.matchDate,
      matchData.gameDate,
      matchData.homeOdds,
      matchData.drawOdds,
      matchData.awayOdds,
      matchData.over25Odds,
      matchData.under25Odds,
      matchData.cycleId,
      matchData.displayOrder
    ]);
  }

  /**
   * Create a placeholder fixture to satisfy foreign key constraints
   * This ensures contract matches can be synced even if the fixture wasn't fetched
   */
  async createPlaceholderFixture(fixtureId, matchDate) {
    try {
      await db.query(`
        INSERT INTO oracle.fixtures (
          id, home_team, away_team, league_name, match_date, status, 
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        fixtureId,
        'Contract Team Home',
        'Contract Team Away', 
        'Contract League',
        matchDate,
        'Fixture' // Default status
      ]);
      
      console.log(`✅ Created placeholder fixture ${fixtureId} for contract sync`);
    } catch (error) {
      console.error(`❌ Failed to create placeholder fixture ${fixtureId}:`, error.message);
      throw error; // Re-throw to prevent invalid data
    }
  }
}

// Run the sync
async function main() {
  const syncer = new ContractToDbSync();
  await syncer.syncContractMatchesToDb();
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ContractToDbSync;