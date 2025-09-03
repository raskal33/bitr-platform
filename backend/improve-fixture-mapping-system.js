const { ethers } = require('ethers');
const db = require('./db/db');

/**
 * Comprehensive Fixture Mapping System Improvements
 * 
 * This script addresses the root causes of fixture mapping issues:
 * 1. Missing fixture mappings for existing pools
 * 2. Inconsistent data flow between indexer and API
 * 3. Lack of validation and error handling
 * 4. Missing automatic fixture lookup
 */

async function improveFixtureMappingSystem() {
  console.log('🔧 Improving fixture mapping system...\n');
  
  try {
    // 1. Validate current state
    console.log('1. Validating current fixture mapping state...');
    
    const validationResult = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        COUNT(fm.market_id_hash) as pools_with_mapping,
        COUNT(*) - COUNT(fm.market_id_hash) as pools_without_mapping,
        COUNT(CASE WHEN p.fixture_id IS NOT NULL THEN 1 END) as pools_with_fixture_id,
        COUNT(CASE WHEN p.fixture_id IS NULL THEN 1 END) as pools_without_fixture_id
      FROM oracle.pools p
      LEFT JOIN oracle.fixture_mappings fm ON p.market_id = fm.market_id_hash
      WHERE p.category = 'football' AND p.status IN ('active', 'closed')
    `);
    
    const stats = validationResult.rows[0];
    console.log(`   Total football pools: ${stats.total_pools}`);
    console.log(`   Pools with mapping: ${stats.pools_with_mapping}`);
    console.log(`   Pools without mapping: ${stats.pools_without_mapping}`);
    console.log(`   Pools with fixture_id: ${stats.pools_with_fixture_id}`);
    console.log(`   Pools without fixture_id: ${stats.pools_without_fixture_id}`);
    
    // 2. Create missing fixture mappings for pools that have fixture_id but no mapping
    console.log('\n2. Creating missing fixture mappings...');
    
    const poolsNeedingMapping = await db.query(`
      SELECT p.pool_id, p.market_id, p.fixture_id, p.category, p.odds, p.status
      FROM oracle.pools p
      LEFT JOIN oracle.fixture_mappings fm ON p.market_id = fm.market_id_hash
      WHERE p.category = 'football' 
        AND p.fixture_id IS NOT NULL
        AND fm.market_id_hash IS NULL
        AND p.status IN ('active', 'closed')
    `);
    
    console.log(`   Found ${poolsNeedingMapping.rows.length} pools needing fixture mappings`);
    
    for (const pool of poolsNeedingMapping.rows) {
      console.log(`   Processing pool ${pool.pool_id} (fixture ${pool.fixture_id})...`);
      
      // Get fixture data
      const fixtureResult = await db.query(`
        SELECT home_team, away_team, league_name, name, match_date
        FROM oracle.fixtures 
        WHERE id = $1
      `, [pool.fixture_id]);
      
      if (fixtureResult.rows.length > 0) {
        const fixture = fixtureResult.rows[0];
        
        // Create fixture mapping
        const insertMapping = `
          INSERT INTO oracle.fixture_mappings (
            market_id_hash, fixture_id, home_team, away_team, league_name
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (market_id_hash) DO UPDATE SET
            fixture_id = EXCLUDED.fixture_id,
            home_team = EXCLUDED.home_team,
            away_team = EXCLUDED.away_team,
            league_name = EXCLUDED.league_name
        `;
        
        await db.query(insertMapping, [
          pool.market_id,
          pool.fixture_id,
          fixture.home_team,
          fixture.away_team,
          fixture.league_name
        ]);
        
        console.log(`     ✅ Created mapping: ${fixture.home_team} vs ${fixture.away_team}`);
      } else {
        console.log(`     ❌ Fixture ${pool.fixture_id} not found in database`);
      }
    }
    
    // 3. Add fixture_id to pools that have mappings but no fixture_id
    console.log('\n3. Adding fixture_id to pools with mappings...');
    
    const poolsNeedingFixtureId = await db.query(`
      SELECT p.pool_id, p.market_id, p.fixture_id, fm.fixture_id as mapping_fixture_id
      FROM oracle.pools p
      INNER JOIN oracle.fixture_mappings fm ON p.market_id = fm.market_id_hash
      WHERE p.category = 'football' 
        AND p.fixture_id IS NULL
        AND fm.fixture_id IS NOT NULL
        AND p.status IN ('active', 'closed')
    `);
    
    console.log(`   Found ${poolsNeedingFixtureId.rows.length} pools needing fixture_id`);
    
    for (const pool of poolsNeedingFixtureId.rows) {
      console.log(`   Updating pool ${pool.pool_id} with fixture_id ${pool.mapping_fixture_id}...`);
      
      const updatePool = `
        UPDATE oracle.pools 
        SET fixture_id = $1 
        WHERE pool_id = $2
      `;
      
      await db.query(updatePool, [pool.mapping_fixture_id, pool.pool_id]);
      console.log(`     ✅ Updated pool with fixture_id`);
    }
    
    // 4. Create database triggers for automatic fixture mapping
    console.log('\n4. Creating database triggers for automatic fixture mapping...');
    
    // Create a function to automatically create fixture mappings
    const createTriggerFunction = `
      CREATE OR REPLACE FUNCTION auto_create_fixture_mapping()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only process football pools with fixture_id
        IF NEW.category = 'football' AND NEW.fixture_id IS NOT NULL THEN
          -- Try to create fixture mapping if it doesn't exist
          INSERT INTO oracle.fixture_mappings (
            market_id_hash, fixture_id, home_team, away_team, league_name
          )
          SELECT 
            NEW.market_id,
            NEW.fixture_id,
            f.home_team,
            f.away_team,
            f.league_name
          FROM oracle.fixtures f
          WHERE f.id = NEW.fixture_id
          ON CONFLICT (market_id_hash) DO NOTHING;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;
    
    try {
      await db.query(createTriggerFunction);
      console.log('   ✅ Created trigger function');
    } catch (error) {
      console.log(`   ⚠️ Could not create trigger function: ${error.message}`);
    }
    
    // Create trigger on pools table
    const createTrigger = `
      DROP TRIGGER IF EXISTS auto_fixture_mapping_trigger ON oracle.pools;
      CREATE TRIGGER auto_fixture_mapping_trigger
        AFTER INSERT OR UPDATE ON oracle.pools
        FOR EACH ROW
        EXECUTE FUNCTION auto_create_fixture_mapping();
    `;
    
    try {
      await db.query(createTrigger);
      console.log('   ✅ Created trigger on pools table');
    } catch (error) {
      console.log(`   ⚠️ Could not create trigger: ${error.message}`);
    }
    
    // 5. Create indexes for better performance
    console.log('\n5. Creating performance indexes...');
    
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_pools_market_id ON oracle.pools(market_id);
      CREATE INDEX IF NOT EXISTS idx_pools_category_status ON oracle.pools(category, status);
      CREATE INDEX IF NOT EXISTS idx_fixture_mappings_home_away ON oracle.fixture_mappings(home_team, away_team);
    `;
    
    try {
      await db.query(createIndexes);
      console.log('   ✅ Created performance indexes');
    } catch (error) {
      console.log(`   ⚠️ Could not create indexes: ${error.message}`);
    }
    
    // 6. Final validation
    console.log('\n6. Final validation...');
    
    const finalValidation = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        COUNT(fm.market_id_hash) as pools_with_mapping,
        COUNT(*) - COUNT(fm.market_id_hash) as pools_without_mapping,
        COUNT(CASE WHEN p.fixture_id IS NOT NULL THEN 1 END) as pools_with_fixture_id,
        COUNT(CASE WHEN p.fixture_id IS NULL THEN 1 END) as pools_without_fixture_id
      FROM oracle.pools p
      LEFT JOIN oracle.fixture_mappings fm ON p.market_id = fm.market_id_hash
      WHERE p.category = 'football' AND p.status IN ('active', 'closed')
    `);
    
    const finalStats = finalValidation.rows[0];
    console.log(`   Final state:`);
    console.log(`     Total football pools: ${finalStats.total_pools}`);
    console.log(`     Pools with mapping: ${finalStats.pools_with_mapping}`);
    console.log(`     Pools without mapping: ${finalStats.pools_without_mapping}`);
    console.log(`     Pools with fixture_id: ${finalStats.pools_with_fixture_id}`);
    console.log(`     Pools without fixture_id: ${finalStats.pools_without_fixture_id}`);
    
    // 7. Show all fixture mappings
    console.log('\n7. Current fixture mappings:');
    
    const allMappings = await db.query(`
      SELECT 
        fm.market_id_hash,
        fm.fixture_id,
        fm.home_team,
        fm.away_team,
        fm.league_name,
        p.pool_id,
        p.status,
        p.created_at
      FROM oracle.fixture_mappings fm
      LEFT JOIN oracle.pools p ON fm.market_id_hash = p.market_id
      ORDER BY p.created_at DESC
    `);
    
    for (const mapping of allMappings.rows) {
      console.log(`   Pool ${mapping.pool_id}: ${mapping.home_team} vs ${mapping.away_team} (${mapping.league_name}) - ${mapping.status}`);
    }
    
    console.log('\n✅ Fixture mapping system improvements completed!');
    
  } catch (error) {
    console.error('❌ Error improving fixture mapping system:', error.message);
    throw error;
  }
}

// Run the improvements
improveFixtureMappingSystem();
