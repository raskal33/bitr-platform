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
    this.timeoutId = null;
    this.maxExecutionTime = 25 * 60 * 1000; // 25 minutes max execution time
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

    // Set timeout to prevent hanging
    this.timeoutId = setTimeout(() => {
      console.log('⏰ Unified Results Manager (Consolidated) timeout after 25 minutes, killing process');
      this.isRunning = false;
      process.exit(1);
    }, this.maxExecutionTime);

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
      
      // Clear timeout
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
    }
  }

  /**
   * Step 1: Update fixture statuses for live matches (enhanced)
   */
  async updateFixtureStatuses() {
    try {
      console.log('🔄 Updating fixture statuses...');
      
      let totalUpdated = 0;
      
      // Step 1a: Update statuses for recent matches
      const recentResult = await this.updateRecentFixtureStatuses();
      totalUpdated += recentResult.updated;
      
      // Step 1b: Force update stuck matches
      const stuckResult = await this.forceUpdateStuckFixtureStatuses();
      totalUpdated += stuckResult.updated;
      
      console.log(`🎉 Total status updates: ${totalUpdated}`);
      return { updated: totalUpdated };
      
    } catch (error) {
      console.error('❌ Error updating fixture statuses:', error);
      return { updated: 0, error: error.message };
    }
  }

  /**
   * Update statuses for recent matches
   */
  async updateRecentFixtureStatuses() {
    try {
      console.log('📋 Step 1a: Updating recent fixture statuses...');
      
      // Get fixtures that are likely in progress or finished
      const result = await db.query(`
        SELECT f.id, f.home_team, f.away_team, f.match_date, f.status
        FROM oracle.fixtures f
        WHERE f.match_date >= NOW() - INTERVAL '4 hours'
          AND f.match_date <= NOW() + INTERVAL '2 hours'
          AND f.status NOT IN ('FT', 'AET', 'PEN', 'FT_PEN', 'CANC', 'POST')
        ORDER BY f.match_date DESC
        LIMIT 30
      `);

      if (result.rows.length === 0) {
        console.log('ℹ️ No recent fixtures need status updates');
        return { updated: 0 };
      }

      console.log(`📊 Updating status for ${result.rows.length} recent fixtures...`);
      
      let updatedCount = 0;
      
      for (const fixture of result.rows) {
        try {
          // Add timeout for individual API calls
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API timeout')), 10000)
          );
          
          const apiPromise = this.sportmonksService.axios.get(`/fixtures/${fixture.id}`, {
            params: {
              'api_token': this.sportmonksService.apiToken,
              'include': 'state'
            }
          });

          const response = await Promise.race([apiPromise, timeoutPromise]);

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
      
      console.log(`✅ Recent fixtures: ${updatedCount}/${result.rows.length} updated`);
      return { updated: updatedCount };
      
    } catch (error) {
      console.error('❌ Error updating recent fixture statuses:', error);
      return { updated: 0, error: error.message };
    }
  }

  /**
   * Force update stuck fixture statuses
   */
  async forceUpdateStuckFixtureStatuses() {
    try {
      console.log('🔧 Step 1b: Force updating stuck fixture statuses...');
      
      // Get fixtures that are stuck in intermediate states for too long
      const result = await db.query(`
        SELECT f.id, f.home_team, f.away_team, f.match_date, f.status,
               EXTRACT(EPOCH FROM (NOW() - f.match_date))/60 as minutes_since_start
        FROM oracle.fixtures f
        WHERE f.match_date < NOW() - INTERVAL '120 minutes'  -- Started more than 120 minutes ago
          AND f.match_date > NOW() - INTERVAL '24 hours'    -- But not too old
          AND f.status IN ('1H', 'HT', '2H', 'ET', 'PEN')  -- Stuck in intermediate states
          AND f.updated_at < NOW() - INTERVAL '30 minutes'  -- Not updated recently
        ORDER BY f.match_date DESC
        LIMIT 20
      `);

      if (result.rows.length === 0) {
        console.log('ℹ️ No stuck fixtures need force status update');
        return { updated: 0 };
      }

      console.log(`📊 Force updating status for ${result.rows.length} stuck fixtures...`);
      
      let updatedCount = 0;
      
      for (const fixture of result.rows) {
        try {
          console.log(`   🔧 Force updating: ${fixture.home_team} vs ${fixture.away_team} (${Math.round(fixture.minutes_since_start)}min ago, status: ${fixture.status})`);
          
          // Add timeout for individual API calls
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API timeout')), 15000)
          );
          
          const apiPromise = this.sportmonksService.axios.get(`/fixtures/${fixture.id}`, {
            params: {
              'api_token': this.sportmonksService.apiToken,
              'include': 'state'
            }
          });

          const response = await Promise.race([apiPromise, timeoutPromise]);

          if (response.data.data) {
            const fixtureData = response.data.data;
            const newStatus = fixtureData.state?.state || 'NS';
            
            // Update regardless of whether status changed (force update)
            await db.query(`
              UPDATE oracle.fixtures 
              SET status = $1, updated_at = NOW() 
              WHERE id = $2
            `, [newStatus, fixture.id]);
            
            console.log(`✅ Force updated fixture ${fixture.id} status: ${fixture.status} → ${newStatus}`);
            updatedCount++;
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          console.warn(`⚠️ Failed to force update status for fixture ${fixture.id}:`, error.message);
        }
      }
      
      console.log(`✅ Stuck fixtures: ${updatedCount}/${result.rows.length} force updated`);
      return { updated: updatedCount };
      
    } catch (error) {
      console.error('❌ Error force updating stuck fixture statuses:', error);
      return { updated: 0, error: error.message };
    }
  }

  /**
   * Step 2: Fetch and save results for completed matches (with robust handling)
   */
  async fetchAndSaveResults() {
    try {
      console.log('📥 Fetching and saving results...');
      
      let totalFetched = 0;
      let totalSaved = 0;
      
      // Step 2a: Handle completed matches without results
      const completedResult = await this.handleCompletedMatches();
      totalFetched += completedResult.fetched;
      totalSaved += completedResult.saved;
      
      // Step 2b: Handle stuck matches (force fetch after 130 minutes)
      const stuckResult = await this.handleStuckMatches();
      totalFetched += stuckResult.fetched;
      totalSaved += stuckResult.saved;
      
      // Step 2c: Handle matches in intermediate states that should be finished
      const intermediateResult = await this.handleIntermediateStateMatches();
      totalFetched += intermediateResult.fetched;
      totalSaved += intermediateResult.saved;
      
      console.log(`🎉 Results fetch and save completed: ${totalFetched} fetched, ${totalSaved} saved`);
      
      return { fetched: totalFetched, saved: totalSaved };
      
    } catch (error) {
      console.error('❌ Error in fetchAndSaveResults:', error);
      return { fetched: 0, saved: 0, error: error.message };
    }
  }

  /**
   * Handle completed matches without results
   */
  async handleCompletedMatches() {
    try {
      console.log('📋 Step 2a: Handling completed matches...');
      
      // Get completed matches without results
      const result = await db.query(`
        SELECT f.id, f.home_team, f.away_team, f.match_date, f.status
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.match_date < NOW() - INTERVAL '1 hour'  -- Match finished at least 1 hour ago
          AND f.status IN ('FT', 'AET', 'PEN', 'FT_PEN')  -- Completed matches
          AND fr.fixture_id IS NULL  -- No results yet
        ORDER BY f.match_date DESC
        LIMIT 30  -- Process in batches
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
        console.log('⚠️ No results fetched from API for completed matches');
        return { fetched: 0, saved: 0 };
      }
      
      // Save results to database
      const savedCount = await this.saveResults(results);
      
      console.log(`✅ Completed matches: ${results.length} fetched, ${savedCount} saved`);
      return { fetched: results.length, saved: savedCount };
      
    } catch (error) {
      console.error('❌ Error handling completed matches:', error);
      return { fetched: 0, saved: 0, error: error.message };
    }
  }

  /**
   * Handle stuck matches (force fetch after 130 minutes)
   */
  async handleStuckMatches() {
    try {
      console.log('🔧 Step 2b: Handling stuck matches...');
      
      // Get matches that started more than 130 minutes ago but still don't have results
      const result = await db.query(`
        SELECT f.id, f.home_team, f.away_team, f.match_date, f.status,
               EXTRACT(EPOCH FROM (NOW() - f.match_date))/60 as minutes_since_start
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.match_date < NOW() - INTERVAL '130 minutes'  -- Started more than 130 minutes ago
          AND f.match_date > NOW() - INTERVAL '24 hours'     -- But not too old
          AND fr.fixture_id IS NULL  -- No results yet
          AND f.status NOT IN ('CANC', 'POST')  -- Not cancelled or postponed
        ORDER BY f.match_date DESC
        LIMIT 20  -- Process in batches
      `);

      if (result.rows.length === 0) {
        console.log('✅ No stuck matches found');
        return { fetched: 0, saved: 0 };
      }
      
      console.log(`📊 Found ${result.rows.length} stuck matches (running for >130 minutes)`);
      
      // Log stuck matches for debugging
      result.rows.forEach(match => {
        console.log(`   ⚠️ Stuck: ${match.home_team} vs ${match.away_team} (${Math.round(match.minutes_since_start)}min ago, status: ${match.status})`);
      });
      
      // Force fetch results for stuck matches
      const fixtureIds = result.rows.map(match => match.id);
      const results = await this.sportmonksService.fetchFixtureResults(fixtureIds);
      
      if (results.length === 0) {
        console.log('⚠️ No results fetched from API for stuck matches');
        return { fetched: 0, saved: 0 };
      }
      
      // Save results to database
      const savedCount = await this.saveResults(results);
      
      console.log(`✅ Stuck matches: ${results.length} fetched, ${savedCount} saved`);
      return { fetched: results.length, saved: savedCount };
      
    } catch (error) {
      console.error('❌ Error handling stuck matches:', error);
      return { fetched: 0, saved: 0, error: error.message };
    }
  }

  /**
   * Handle matches in intermediate states that should be finished
   */
  async handleIntermediateStateMatches() {
    try {
      console.log('🔄 Step 2c: Handling intermediate state matches...');
      
      // Get matches that are in intermediate states but should be finished
      const result = await db.query(`
        SELECT f.id, f.home_team, f.away_team, f.match_date, f.status,
               EXTRACT(EPOCH FROM (NOW() - f.match_date))/60 as minutes_since_start
        FROM oracle.fixtures f
        LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE f.match_date < NOW() - INTERVAL '90 minutes'  -- Started more than 90 minutes ago
          AND f.match_date > NOW() - INTERVAL '24 hours'    -- But not too old
          AND f.status IN ('1H', 'HT', '2H', 'ET', 'PEN')  -- Intermediate states
          AND fr.fixture_id IS NULL  -- No results yet
        ORDER BY f.match_date DESC
        LIMIT 15  -- Process in batches
      `);

      if (result.rows.length === 0) {
        console.log('✅ No intermediate state matches found');
        return { fetched: 0, saved: 0 };
      }
      
      console.log(`📊 Found ${result.rows.length} matches stuck in intermediate states`);
      
      // Log intermediate matches for debugging
      result.rows.forEach(match => {
        console.log(`   ⚠️ Intermediate: ${match.home_team} vs ${match.away_team} (${Math.round(match.minutes_since_start)}min ago, status: ${match.status})`);
      });
      
      // Fetch results for intermediate matches
      const fixtureIds = result.rows.map(match => match.id);
      const results = await this.sportmonksService.fetchFixtureResults(fixtureIds);
      
      if (results.length === 0) {
        console.log('⚠️ No results fetched from API for intermediate matches');
        return { fetched: 0, saved: 0 };
      }
      
      // Save results to database
      const savedCount = await this.saveResults(results);
      
      console.log(`✅ Intermediate matches: ${results.length} fetched, ${savedCount} saved`);
      return { fetched: results.length, saved: savedCount };
      
    } catch (error) {
      console.error('❌ Error handling intermediate state matches:', error);
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
        LIMIT 100  -- Limit to prevent long-running operations
      `);

      if (result.rows.length === 0) {
        console.log('✅ No fixtures need outcome calculations');
        return { calculated: 0 };
      }

      console.log(`📊 Calculating outcomes for ${result.rows.length} fixtures`);

      let calculatedCount = 0;
      for (const fixture of result.rows) {
        try {
          // Validate fixture data
          if (!fixture || fixture.home_score === null || fixture.away_score === null) {
            console.warn(`⚠️ Skipping fixture ${fixture?.id || 'unknown'}: invalid score data`);
            continue;
          }

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
          console.error(`❌ Failed to calculate outcomes for fixture ${fixture?.id || 'unknown'}:`, error.message);
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
        // Validate result object
        if (!result || !result.fixture_id) {
          console.warn('⚠️ Skipping invalid result object:', result);
          continue;
        }
        
        // Step 1: Ensure fixture exists in matches table
        await this.ensureFixtureInMatchesTable(result);
        
        // Step 2: Save to fixture_results table
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
          result.home_score !== null && result.home_score !== undefined ? result.home_score : null,
          result.away_score !== null && result.away_score !== undefined ? result.away_score : null,
          result.ht_home_score !== null && result.ht_home_score !== undefined ? result.ht_home_score : null,
          result.ht_away_score !== null && result.ht_away_score !== undefined ? result.ht_away_score : null,
          result.result_1x2 || null,
          result.result_ou25 || null
        ]);
        
        // Step 3: Save to result_info column in fixtures table
        await db.query(`
          UPDATE oracle.fixtures 
          SET result_info = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(result), result.fixture_id]);
        
        // Step 4: Save to match_results table (for Oddyssey resolution)
        await this.saveToMatchResults(result);
        
        savedCount++;
        console.log(`✅ Saved result for fixture ${result.fixture_id}: ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team}`);

      } catch (error) {
        console.error(`❌ Failed to save result for fixture ${result.fixture_id}:`, error.message);
      }
    }

    return savedCount;
  }

  /**
   * Ensure fixture exists in matches table
   */
  async ensureFixtureInMatchesTable(result) {
    try {
      await db.query(`
        INSERT INTO oracle.matches (
          match_id, home_team, away_team, match_time, league, status
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (match_id) DO NOTHING
      `, [
        result.fixture_id,
        result.home_team,
        result.away_team,
        result.match_date || new Date(),
        result.league_name || null,
        result.status || 'FT'
      ]);
    } catch (error) {
      console.warn(`⚠️ Could not ensure fixture ${result.fixture_id} in matches table:`, error.message);
    }
  }

  /**
   * Save result to match_results table
   */
  async saveToMatchResults(result) {
    try {
      // Validate result object first
      if (!result || !result.fixture_id) {
        console.error('❌ saveToMatchResults called with invalid result object');
        return;
      }
      
      // Calculate outcomes based on scores
      const outcomes = this.calculateOutcomes(result);
      
      if (!outcomes) {
        console.warn(`⚠️ Could not calculate outcomes for fixture ${result.fixture_id}, skipping match_results save`);
        return;
      }
      
      await db.query(`
        INSERT INTO oracle.match_results (
          id, match_id, home_score, away_score, ht_home_score, ht_away_score,
          outcome_1x2, outcome_ou05, outcome_ou15, outcome_ou25, outcome_ou35,
          outcome_ht_result, outcome_btts, full_score, ht_score,
          state_id, result_info, finished_at, resolved_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
        ON CONFLICT (match_id) DO UPDATE SET
          home_score = EXCLUDED.home_score,
          away_score = EXCLUDED.away_score,
          ht_home_score = EXCLUDED.ht_home_score,
          ht_away_score = EXCLUDED.ht_away_score,
          outcome_1x2 = EXCLUDED.outcome_1x2,
          outcome_ou05 = EXCLUDED.outcome_ou05,
          outcome_ou15 = EXCLUDED.outcome_ou15,
          outcome_ou25 = EXCLUDED.outcome_ou25,
          outcome_ou35 = EXCLUDED.outcome_ou35,
          outcome_ht_result = EXCLUDED.outcome_ht_result,
          outcome_btts = EXCLUDED.outcome_btts,
          full_score = EXCLUDED.full_score,
          ht_score = EXCLUDED.ht_score,
          state_id = EXCLUDED.state_id,
          result_info = EXCLUDED.result_info,
          finished_at = EXCLUDED.finished_at,
          resolved_at = NOW()
      `, [
        `match_result_${result.fixture_id}`,
        result.fixture_id,
        result.home_score !== null && result.home_score !== undefined ? result.home_score : null,
        result.away_score !== null && result.away_score !== undefined ? result.away_score : null,
        result.ht_home_score !== null && result.ht_home_score !== undefined ? result.ht_home_score : null,
        result.ht_away_score !== null && result.ht_away_score !== undefined ? result.ht_away_score : null,
        outcomes.outcome_1x2,
        outcomes.outcome_ou05,
        outcomes.outcome_ou15,
        outcomes.outcome_ou25,
        outcomes.outcome_ou35,
        outcomes.outcome_ht_result,
        outcomes.outcome_btts,
        outcomes.full_score,
        outcomes.ht_score,
        result.status || 'FT',
        JSON.stringify(result),
        result.match_date || new Date()
      ]);
    } catch (error) {
      console.warn(`⚠️ Could not save to match_results for fixture ${result.fixture_id}:`, error.message);
    }
  }

  /**
   * Calculate all outcomes for a result
   */
  calculateOutcomes(result) {
    // Validate result object
    if (!result) {
      console.error('❌ calculateOutcomes called with undefined result');
      return null;
    }
    
    if (result.home_score === undefined || result.away_score === undefined) {
      console.error(`❌ calculateOutcomes called with invalid result for fixture ${result.fixture_id || 'unknown'}: missing scores`);
      return null;
    }
    
    const homeScore = result.home_score;
    const awayScore = result.away_score;
    const htHomeScore = result.ht_home_score;
    const htAwayScore = result.ht_away_score;
    
    // Calculate 1X2 outcome
    let outcome_1x2;
    if (homeScore > awayScore) outcome_1x2 = '1';
    else if (homeScore < awayScore) outcome_1x2 = '2';
    else outcome_1x2 = 'X';
    
    // Calculate Over/Under outcomes
    const totalGoals = homeScore + awayScore;
    const htTotalGoals = (htHomeScore || 0) + (htAwayScore || 0);
    
    const outcome_ou05 = totalGoals > 0.5 ? 'Over' : 'Under';
    const outcome_ou15 = totalGoals > 1.5 ? 'Over' : 'Under';
    const outcome_ou25 = totalGoals > 2.5 ? 'Over' : 'Under';
    const outcome_ou35 = totalGoals > 3.5 ? 'Over' : 'Under';
    
    // Calculate half-time result
    let outcome_ht_result;
    if (htHomeScore > htAwayScore) outcome_ht_result = '1';
    else if (htHomeScore < htAwayScore) outcome_ht_result = '2';
    else outcome_ht_result = 'X';
    
    // Calculate BTTS (Both Teams To Score)
    const outcome_btts = (homeScore > 0 && awayScore > 0) ? 'Yes' : 'No';
    
    return {
      outcome_1x2,
      outcome_ou05,
      outcome_ou15,
      outcome_ou25,
      outcome_ou35,
      outcome_ht_result,
      outcome_btts,
      full_score: `${homeScore}-${awayScore}`,
      ht_score: htHomeScore && htAwayScore ? `${htHomeScore}-${htAwayScore}` : null
    };
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

  /**
   * Cleanup method to clear timeouts
   */
  cleanup() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.isRunning = false;
  }
}

module.exports = UnifiedResultsManager;
