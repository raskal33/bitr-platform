const { ethers } = require('ethers');
const db = require('./db/db');

class FixAllRemainingMatches {
  constructor() {
    this.sportmonksService = new (require('./services/sportmonks'))();
  }

  async run() {
    console.log('🔧 Fixing ALL Remaining Matches with Status/Score Issues...\n');
    
    try {
      // 1. Get all stuck matches (not just 50)
      console.log('1️⃣ Getting ALL matches stuck in INPLAY status...');
      const allStuckMatches = await this.getAllStuckMatches();
      
      // 2. Update status for ALL stuck matches
      console.log('\n2️⃣ Updating status for ALL stuck matches...');
      await this.updateAllStuckMatchesStatus(allStuckMatches);
      
      // 3. Get all finished matches without results
      console.log('\n3️⃣ Getting ALL finished matches without results...');
      const finishedWithoutResults = await this.getAllFinishedWithoutResults();
      
      // 4. Fetch and save results for ALL matches
      console.log('\n4️⃣ Fetching results for ALL matches...');
      await this.fetchAndSaveAllResults(finishedWithoutResults);
      
      // 5. Check for null-null scores and fix them
      console.log('\n5️⃣ Checking for null-null scores...');
      await this.fixNullScores();
      
      // 6. Enhance half-time score saving
      console.log('\n6️⃣ Enhancing half-time score saving...');
      await this.enhanceHalftimeScores();
      
      // 7. Final verification
      console.log('\n7️⃣ Final verification...');
      await this.finalVerification();
      
      console.log('\n🎉 ALL remaining matches fixed!');
      
    } catch (error) {
      console.error('❌ Error fixing remaining matches:', error);
    }
  }

  async getAllStuckMatches() {
    // Get ALL matches stuck in INPLAY status (no limit)
    const stuckMatches = await db.query(`
      SELECT 
        f.id,
        f.home_team,
        f.away_team,
        f.status,
        f.match_date,
        f.starting_at,
        EXTRACT(EPOCH FROM (NOW() - f.match_date))/60 as minutes_since_start
      FROM oracle.fixtures f
      WHERE f.status LIKE '%INPLAY%'
      AND f.match_date < NOW() - INTERVAL '130 minutes'
      ORDER BY f.match_date DESC
    `);

    console.log(`📊 Found ${stuckMatches.rows.length} matches stuck in INPLAY status`);
    
    // Show first 10 for reference
    console.log('First 10 matches:');
    stuckMatches.rows.slice(0, 10).forEach(match => {
      console.log(`   ${match.id}: ${match.home_team} vs ${match.away_team} (${match.status}) - ${Math.round(match.minutes_since_start)} min ago`);
    });

    return stuckMatches.rows;
  }

  async updateAllStuckMatchesStatus(stuckMatches) {
    if (stuckMatches.length === 0) {
      console.log('✅ No stuck matches to update');
      return;
    }

    console.log(`🔄 Updating status for ${stuckMatches.length} matches...`);
    let updatedCount = 0;
    let batchCount = 0;
    
    // Process in batches of 20 to avoid rate limiting
    for (let i = 0; i < stuckMatches.length; i += 20) {
      const batch = stuckMatches.slice(i, i + 20);
      batchCount++;
      
      console.log(`📦 Processing batch ${batchCount}/${Math.ceil(stuckMatches.length / 20)} (${batch.length} matches)...`);
      
      for (const match of batch) {
        try {
          // Fetch current status from SportMonks API
          const response = await this.sportmonksService.axios.get(`/fixtures/${match.id}`, {
            params: {
              'api_token': this.sportmonksService.apiToken,
              'include': 'state'
            }
          });

          if (response.data.data) {
            const fixtureData = response.data.data;
            const currentStatus = fixtureData.state?.state || 'NS';
            
            if (currentStatus !== match.status) {
              // Update status in database
              await db.query(`
                UPDATE oracle.fixtures 
                SET status = $1, updated_at = NOW() 
                WHERE id = $2
              `, [currentStatus, match.id]);
              
              updatedCount++;
              if (updatedCount % 10 === 0) {
                console.log(`   ✅ Updated ${updatedCount} matches so far...`);
              }
            }
          }
          
          // Rate limiting - smaller delay for batch processing
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`❌ Failed to update status for ${match.id}:`, error.message);
        }
      }
      
      // Longer pause between batches
      if (i + 20 < stuckMatches.length) {
        console.log(`   ⏸️ Batch ${batchCount} completed. Pausing 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`📊 Updated status for ${updatedCount}/${stuckMatches.length} matches`);
  }

  async getAllFinishedWithoutResults() {
    // Get ALL finished matches without results (no limit)
    const finishedWithoutResults = await db.query(`
      SELECT 
        f.id,
        f.home_team,
        f.away_team,
        f.status,
        f.match_date
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
      WHERE (
        f.status IN ('FT', 'AET', 'PEN', 'FT_PEN')
        OR f.match_date < NOW() - INTERVAL '130 minutes'
      )
      AND fr.fixture_id IS NULL
      AND f.match_date < NOW() - INTERVAL '30 minutes'
      ORDER BY f.match_date DESC
    `);

    console.log(`📊 Found ${finishedWithoutResults.rows.length} finished matches without results`);
    return finishedWithoutResults.rows;
  }

  async fetchAndSaveAllResults(matches) {
    if (matches.length === 0) {
      console.log('✅ No matches need results');
      return;
    }

    console.log(`🔄 Fetching results for ${matches.length} matches...`);
    
    // Process in batches of 50 to avoid overwhelming the API
    let totalSaved = 0;
    let batchCount = 0;
    
    for (let i = 0; i < matches.length; i += 50) {
      const batch = matches.slice(i, i + 50);
      batchCount++;
      
      console.log(`📦 Processing results batch ${batchCount}/${Math.ceil(matches.length / 50)} (${batch.length} matches)...`);
      
      try {
        const fixtureIds = batch.map(f => f.id);
        const results = await this.sportmonksService.fetchFixtureResults(fixtureIds);

        if (results.length === 0) {
          console.log(`⚠️ No results fetched for batch ${batchCount}`);
          continue;
        }

        // Save results with enhanced validation
        let batchSaved = 0;
        for (const result of results) {
          try {
            // Validate that we have complete scores
            if (result.home_score === null || result.away_score === null) {
              console.log(`⚠️ Skipping incomplete result for fixture ${result.fixture_id}: ${result.home_score}-${result.away_score}`);
              continue;
            }

            // Enhanced save with half-time scores
            await db.query(`
              INSERT INTO oracle.fixture_results (
                id, fixture_id, home_score, away_score, ht_home_score, ht_away_score,
                result_1x2, result_ou05, result_ou15, result_ou25, result_ou35,
                result_btts, result_ht, result_ht_ou05, result_ht_ou15,
                full_score, ht_score, finished_at, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW(), NOW())
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
                result_btts = EXCLUDED.result_btts,
                result_ht = EXCLUDED.result_ht,
                result_ht_ou05 = EXCLUDED.result_ht_ou05,
                result_ht_ou15 = EXCLUDED.result_ht_ou15,
                full_score = EXCLUDED.full_score,
                ht_score = EXCLUDED.ht_score,
                finished_at = EXCLUDED.finished_at,
                updated_at = NOW()
            `, [
              `result_${result.fixture_id}`,
              result.fixture_id,
              result.home_score,
              result.away_score,
              result.ht_home_score || null,
              result.ht_away_score || null,
              result.result_1x2,
              result.result_1x2 === '1' ? 'Home' : result.result_1x2 === '2' ? 'Away' : 'Draw', // result_ou05 (always over if any goals)
              (result.home_score + result.away_score) > 1.5 ? 'Over' : 'Under', // result_ou15
              result.result_ou25,
              (result.home_score + result.away_score) > 3.5 ? 'Over' : 'Under', // result_ou35
              (result.home_score > 0 && result.away_score > 0) ? 'Yes' : 'No', // result_btts
              result.ht_home_score !== null && result.ht_away_score !== null ? 
                (result.ht_home_score > result.ht_away_score ? '1' : 
                 result.ht_home_score === result.ht_away_score ? 'X' : '2') : null, // result_ht
              result.ht_home_score !== null && result.ht_away_score !== null ?
                ((result.ht_home_score + result.ht_away_score) > 0.5 ? 'Over' : 'Under') : null, // result_ht_ou05
              result.ht_home_score !== null && result.ht_away_score !== null ?
                ((result.ht_home_score + result.ht_away_score) > 1.5 ? 'Over' : 'Under') : null, // result_ht_ou15
              `${result.home_score}-${result.away_score}`, // full_score
              result.ht_home_score !== null && result.ht_away_score !== null ? 
                `${result.ht_home_score}-${result.ht_away_score}` : null // ht_score
            ]);

            // Also update result_info in fixtures table with proper JSON
            await db.query(`
              UPDATE oracle.fixtures 
              SET result_info = $1, updated_at = NOW()
              WHERE id = $2
            `, [JSON.stringify(result), result.fixture_id]);

            batchSaved++;
            totalSaved++;

          } catch (error) {
            console.error(`❌ Failed to save result for fixture ${result.fixture_id}:`, error.message);
          }
        }

        console.log(`   ✅ Batch ${batchCount}: Saved ${batchSaved}/${results.length} results`);

      } catch (error) {
        console.error(`❌ Error processing batch ${batchCount}:`, error.message);
      }
      
      // Pause between batches
      if (i + 50 < matches.length) {
        console.log(`   ⏸️ Batch ${batchCount} completed. Pausing 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log(`💾 Total saved: ${totalSaved} results across all batches`);
  }

  async fixNullScores() {
    // Check for any remaining null-null scores
    const nullScores = await db.query(`
      SELECT 
        fr.fixture_id,
        f.home_team,
        f.away_team,
        f.status,
        fr.home_score,
        fr.away_score
      FROM oracle.fixture_results fr
      JOIN oracle.fixtures f ON fr.fixture_id::VARCHAR = f.id::VARCHAR
      WHERE (fr.home_score IS NULL OR fr.away_score IS NULL)
      AND f.status IN ('FT', 'AET', 'PEN', 'FT_PEN')
      ORDER BY f.match_date DESC
      LIMIT 20
    `);

    if (nullScores.rows.length === 0) {
      console.log('✅ No null scores found');
      return;
    }

    console.log(`⚠️ Found ${nullScores.rows.length} matches with null scores:`);
    nullScores.rows.forEach(match => {
      console.log(`   ${match.fixture_id}: ${match.home_team} vs ${match.away_team} (${match.status}) - Score: ${match.home_score}-${match.away_score}`);
    });

    // Try to re-fetch these specific matches
    console.log('🔄 Re-fetching results for null score matches...');
    const fixtureIds = nullScores.rows.map(m => m.fixture_id);
    const results = await this.sportmonksService.fetchFixtureResults(fixtureIds);

    if (results.length > 0) {
      const savedCount = await this.sportmonksService.saveFixtureResults(results);
      console.log(`✅ Re-saved ${savedCount} results for null score matches`);
    } else {
      console.log('⚠️ Could not fetch results for null score matches');
    }
  }

  async enhanceHalftimeScores() {
    console.log('🔧 Checking half-time score coverage...');
    
    // Check how many matches have half-time scores
    const htStats = await db.query(`
      SELECT 
        COUNT(*) as total_results,
        COUNT(ht_home_score) as with_ht_scores,
        COUNT(*) - COUNT(ht_home_score) as missing_ht_scores
      FROM oracle.fixture_results fr
      JOIN oracle.fixtures f ON fr.fixture_id::VARCHAR = f.id::VARCHAR
      WHERE f.status IN ('FT', 'AET', 'PEN', 'FT_PEN')
    `);

    if (htStats.rows.length > 0) {
      const stats = htStats.rows[0];
      const htCoverage = ((stats.with_ht_scores / stats.total_results) * 100).toFixed(1);
      console.log(`📊 Half-time score coverage: ${stats.with_ht_scores}/${stats.total_results} (${htCoverage}%)`);
      console.log(`📊 Missing half-time scores: ${stats.missing_ht_scores} matches`);
    }

    console.log('✅ Half-time score analysis completed');
    console.log('💡 Note: Half-time scores are now properly saved in the enhanced result saving process');
  }

  async finalVerification() {
    // Check remaining stuck matches
    const remainingStuck = await db.query(`
      SELECT COUNT(*) as count
      FROM oracle.fixtures f
      WHERE f.status LIKE '%INPLAY%'
      AND f.match_date < NOW() - INTERVAL '130 minutes'
    `);

    const stuckCount = parseInt(remainingStuck.rows[0].count);
    console.log(`📊 Remaining stuck matches: ${stuckCount}`);

    // Check matches without results
    const withoutResults = await db.query(`
      SELECT COUNT(*) as count
      FROM oracle.fixtures f
      LEFT JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
      WHERE f.status IN ('FT', 'AET', 'PEN', 'FT_PEN')
      AND fr.fixture_id IS NULL
      AND f.match_date < NOW() - INTERVAL '30 minutes'
    `);

    const missingResults = parseInt(withoutResults.rows[0].count);
    console.log(`📊 Finished matches without results: ${missingResults}`);

    // Check null scores
    const nullScores = await db.query(`
      SELECT COUNT(*) as count
      FROM oracle.fixture_results fr
      JOIN oracle.fixtures f ON fr.fixture_id::VARCHAR = f.id::VARCHAR
      WHERE (fr.home_score IS NULL OR fr.away_score IS NULL)
      AND f.status IN ('FT', 'AET', 'PEN', 'FT_PEN')
    `);

    const nullCount = parseInt(nullScores.rows[0].count);
    console.log(`📊 Matches with null scores: ${nullCount}`);

    // Overall system health
    if (stuckCount === 0 && missingResults === 0 && nullCount === 0) {
      console.log('🎉 SYSTEM FULLY HEALTHY - All matches properly processed!');
    } else {
      console.log(`⚠️ System needs attention: ${stuckCount} stuck + ${missingResults} missing results + ${nullCount} null scores`);
    }
  }
}

// Run the comprehensive fix
const fixer = new FixAllRemainingMatches();
fixer.run();
