const SportMonksService = require('./sportmonks');
const OddysseyResultsResolver = require('./oddyssey-results-resolver');
const db = require('../db/db');

/**
 * Unified Results Manager
 * 
 * This service consolidates all result fetching, status updates, and resolution
 * into a single coordinated system to eliminate conflicts and ensure proper operation.
 */
class UnifiedResultsManager {
  constructor() {
    this.sportmonksService = new SportMonksService();
    this.resultsResolver = new OddysseyResultsResolver();
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      statusUpdates: 0,
      resultsFetched: 0,
      resultsSaved: 0,
      cyclesResolved: 0,
      errors: 0
    };
  }

  /**
   * Main orchestration method - runs the complete results management cycle
   */
  async runCompleteCycle() {
    if (this.isRunning) {
      console.log('⚠️ Unified Results Manager already running, skipping...');
      return { status: 'skipped', reason: 'already_running' };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const cycleId = Date.now();

    try {
      console.log(`🚀 Starting Unified Results Manager cycle ${cycleId}...`);

      // Step 1: Update fixture statuses
      console.log('1️⃣ Updating fixture statuses...');
      const step1Start = Date.now();
      const statusResult = await this.updateFixtureStatuses();
      this.stats.statusUpdates += statusResult.updated;
      console.log(`   ✅ Step 1 completed in ${Date.now() - step1Start}ms (${statusResult.updated} updates)`);

      // Step 2: Fetch and save results for completed matches
      console.log('2️⃣ Fetching and saving results...');
      const step2Start = Date.now();
      const resultsResult = await this.fetchAndSaveResults();
      this.stats.resultsFetched += resultsResult.fetched;
      this.stats.resultsSaved += resultsResult.saved;
      console.log(`   ✅ Step 2 completed in ${Date.now() - step2Start}ms (${resultsResult.fetched} fetched, ${resultsResult.saved} saved)`);

      // Step 3: Calculate outcomes for matches with scores
      console.log('3️⃣ Calculating outcomes...');
      const step3Start = Date.now();
      const outcomesResult = await this.calculateOutcomes();
      this.stats.outcomesCalculated = (this.stats.outcomesCalculated || 0) + outcomesResult.calculated;
      console.log(`   ✅ Step 3 completed in ${Date.now() - step3Start}ms (${outcomesResult.calculated} outcomes calculated)`);

      // Step 4: Resolve Oddyssey cycles
      console.log('4️⃣ Resolving Oddyssey cycles...');
      const step4Start = Date.now();
      const resolutionResult = await this.resolveOddysseyCycles();
      this.stats.cyclesResolved += resolutionResult.resolved;
      console.log(`   ✅ Step 4 completed in ${Date.now() - step4Start}ms (${resolutionResult.resolved} cycles resolved)`);

      const duration = Date.now() - startTime;
      console.log(`✅ Unified Results Manager cycle ${cycleId} completed in ${duration}ms`);
      console.log(`📊 Cycle Stats: ${statusResult.updated} status updates, ${resultsResult.fetched} results fetched, ${outcomesResult.calculated} outcomes calculated, ${resolutionResult.resolved} cycles resolved`);

      return {
        status: 'success',
        cycleId,
        duration,
        stats: {
          statusUpdates: statusResult.updated,
          resultsFetched: resultsResult.fetched,
          resultsSaved: resultsResult.saved,
          outcomesCalculated: outcomesResult.calculated,
          cyclesResolved: resolutionResult.resolved
        }
      };

    } catch (error) {
      console.error('❌ Error in Unified Results Manager cycle:', error);
      this.stats.errors++;
      
      return {
        status: 'error',
        cycleId,
        error: error.message,
        duration: Date.now() - startTime
      };
    } finally {
      this.isRunning = false;
      this.lastRun = new Date();
    }
  }

  /**
   * Step 1: Update fixture statuses for live matches
   */
  async updateFixtureStatuses() {
    try {
      console.log('🔄 Updating fixture statuses...');
      
      // Get fixtures that are likely in progress or finished
      const result = await db.query(`
        SELECT f.id, f.home_team, f.away_team, f.match_date, f.status
        FROM oracle.fixtures f
        WHERE f.match_date >= NOW() - INTERVAL '4 hours'
          AND f.match_date <= NOW() + INTERVAL '2 hours'
          AND f.status NOT IN ('FT', 'AET', 'PEN', 'CANC', 'POST')
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
          const response = await this.sportmonksService.axios.get(`/fixtures/${fixture.id}`, {
            params: {
              'api_token': this.sportmonksService.apiToken,
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
      console.error('❌ Error updating fixture statuses:', error);
      return { updated: 0, error: error.message };
    }
  }

  /**
   * Step 2: Fetch and save results for completed matches
   */
  async fetchAndSaveResults() {
    try {
      console.log('📥 Fetching and saving results...');
      
      // Get completed matches without results
      const result = await db.query(`
        SELECT f.id, f.home_team, f.away_team, f.match_date
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.match_date < NOW() - INTERVAL '1 hour'  -- Match finished at least 1 hour ago
          AND f.status IN ('FT', 'AET', 'PEN')  -- Completed matches
          AND fr.fixture_id IS NULL  -- No results yet
        ORDER BY f.match_date DESC
        LIMIT 50  -- Process in batches
      `);

      if (result.rows.length === 0) {
        console.log('✅ No completed matches without results found');
        return { fetched: 0, saved: 0 };
      }
      
      console.log(`📊 Found ${result.rows.length} completed matches without results`);
      
      // Fetch results from API
      const fixtureIds = result.rows.map(match => match.id);
      const results = await this.sportmonksService.fetchFixtureResults(fixtureIds);
      
      if (results.length === 0) {
        console.log('⚠️ No results fetched from API');
        return { fetched: 0, saved: 0 };
      }
      
      // Save results to database
      const savedCount = await this.saveResults(results);
      
      console.log(`🎉 Results fetch and save completed: ${results.length} fetched, ${savedCount} saved`);
      
      return { fetched: results.length, saved: savedCount };
      
    } catch (error) {
      console.error('❌ Error in fetchAndSaveResults:', error);
      return { fetched: 0, saved: 0, error: error.message };
    }
  }

  /**
   * Step 3: Calculate outcomes for matches with scores but missing outcomes
   */
  async calculateOutcomes() {
    try {
      console.log('🧮 Calculating outcomes...');
      
      // Get fixtures that have scores but missing outcomes
      const result = await db.query(`
        SELECT 
          f.id,
          f.home_team,
          f.away_team,
          fr.home_score,
          fr.away_score,
          fr.result_1x2,
          fr.result_ou25
        FROM oracle.fixtures f
        INNER JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE fr.home_score IS NOT NULL
        AND fr.away_score IS NOT NULL
        AND (fr.result_1x2 IS NULL OR fr.result_ou25 IS NULL)
        ORDER BY f.match_date
      `);

      if (result.rows.length === 0) {
        console.log('✅ No fixtures need outcome calculations');
        return { calculated: 0 };
      }

      console.log(`📊 Calculating outcomes for ${result.rows.length} fixtures`);

      let calculatedCount = 0;
      for (const fixture of result.rows) {
        try {
          // Calculate outcomes
          const moneylineResult = this.calculateMoneylineResult(fixture.home_score, fixture.away_score);
          const overUnderResult = this.calculateOverUnderResult(fixture.home_score, fixture.away_score);

          // Update outcomes
          await db.query(`
            UPDATE oracle.fixture_results 
            SET 
              result_1x2 = $1,
              result_ou25 = $2,
              updated_at = NOW()
            WHERE fixture_id = $3
          `, [moneylineResult, overUnderResult, fixture.id]);

          console.log(`✅ Calculated outcomes for fixture ${fixture.id}: ${fixture.home_team} vs ${fixture.away_team} (${fixture.home_score}-${fixture.away_score}) → 1X2: ${moneylineResult}, O/U 2.5: ${overUnderResult}`);
          calculatedCount++;

        } catch (error) {
          console.error(`❌ Failed to calculate outcomes for fixture ${fixture.id}:`, error.message);
        }
      }

      console.log(`🎉 Calculated outcomes for ${calculatedCount}/${result.rows.length} fixtures`);
      return { calculated: calculatedCount };

    } catch (error) {
      console.error('❌ Error calculating outcomes:', error);
      return { calculated: 0, error: error.message };
    }
  }

  /**
   * Step 4: Resolve Oddyssey cycles
   */
  async resolveOddysseyCycles() {
    try {
      console.log('🎯 Resolving Oddyssey cycles...');
      
      const results = await this.resultsResolver.resolveAllPendingCycles();
      
      if (results.length === 0) {
        console.log('ℹ️ No cycles needed resolution');
        return { resolved: 0 };
      }
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log(`✅ Resolved ${successful}/${results.length} cycles`);
      
      if (failed > 0) {
        console.log(`❌ ${failed} cycles failed resolution`);
      }
      
      return { resolved: successful, failed };
      
    } catch (error) {
      console.error('❌ Error resolving Oddyssey cycles:', error);
      return { resolved: 0, error: error.message };
    }
  }

  /**
   * Save results to database
   */
  async saveResults(results) {
    console.log(`💾 Saving ${results.length} results to database...`);
    
    let savedCount = 0;
    
    for (const result of results) {
      try {
        // Save to fixture_results table
        await db.query(`
          INSERT INTO oracle.fixture_results (
            id, fixture_id, home_score, away_score, ht_home_score, ht_away_score,
            result_1x2, result_ou25, finished_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
          ON CONFLICT (fixture_id) DO UPDATE SET
            home_score = EXCLUDED.home_score,
            away_score = EXCLUDED.away_score,
            ht_home_score = EXCLUDED.ht_home_score,
            ht_away_score = EXCLUDED.ht_away_score,
            result_1x2 = EXCLUDED.result_1x2,
            result_ou25 = EXCLUDED.result_ou25,
            finished_at = EXCLUDED.finished_at,
            updated_at = NOW()
        `, [
          `result_${result.fixture_id}`,
          result.fixture_id,
          result.home_score || null,
          result.away_score || null,
          result.ht_home_score || null,
          result.ht_away_score || null,
          result.result_1x2 || null,
          result.result_ou25 || null
        ]);
        
        // Also save to result_info column in fixtures table
        await db.query(`
          UPDATE oracle.fixtures 
          SET result_info = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(result), result.fixture_id]);
        
        savedCount++;
        console.log(`✅ Saved result for fixture ${result.fixture_id}: ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team}`);

      } catch (error) {
        console.error(`❌ Failed to save result for fixture ${result.fixture_id}:`, error.message);
      }
    }

    return savedCount;
  }

  /**
   * Calculate moneyline result (1X2)
   */
  calculateMoneylineResult(homeScore, awayScore) {
    if (homeScore > awayScore) return '1';
    if (homeScore < awayScore) return '2';
    return 'X';
  }

  /**
   * Calculate over/under result (2.5 goals)
   */
  calculateOverUnderResult(homeScore, awayScore) {
    const totalGoals = homeScore + awayScore;
    return totalGoals > 2.5 ? 'Over' : 'Under';
  }

  /**
   * Get manager statistics
   */
  getStats() {
    return {
      ...this.stats,
      lastRun: this.lastRun,
      isRunning: this.isRunning
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      statusUpdates: 0,
      resultsFetched: 0,
      resultsSaved: 0,
      cyclesResolved: 0,
      errors: 0
    };
  }
}

module.exports = UnifiedResultsManager;
