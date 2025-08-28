#!/usr/bin/env node

/**
 * Create Guided Market Entries Script
 * 
 * This script creates guided market entries in oracle.football_prediction_markets
 * for existing pools that should be resolved by the oracle bot.
 * 
 * Usage: node scripts/create-guided-market-entries.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const db = require('../db/db');

async function createGuidedMarketEntries() {
  try {
    console.log('🔄 Creating guided market entries for existing pools...\n');
    
    // Connect to database
    await db.connect();
    console.log('✅ Database connected successfully');
    
    // Get all pools from the database that should be guided markets
    const poolsResult = await db.query(`
      SELECT * FROM prediction.pools 
      WHERE oracle_type = 'GUIDED' OR oracle_type = 'OPEN'
      ORDER BY pool_id
    `);
    const pools = poolsResult.rows;
    
    console.log(`📊 Found ${pools.length} pools in database`);
    
    if (pools.length === 0) {
      console.log('No pools found to process');
      return;
    }
    
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Process each pool and create guided market entries if needed
    for (const pool of pools) {
      try {
        console.log(`\n--- Processing Pool ${pool.pool_id} ---`);
        
        // Decode the market ID from hex to get fixture ID or market identifier
        let marketIdDecoded = '';
        let fixtureId = null;
        
        try {
          if (pool.market_id && pool.market_id.startsWith('0x')) {
            // Try to decode as string first
            const hexString = pool.market_id.slice(2);
            const bytes = Buffer.from(hexString, 'hex');
            marketIdDecoded = bytes.toString('utf8').replace(/\0/g, '');
            
            // If it's a numeric string, treat as fixture ID
            if (/^\d+$/.test(marketIdDecoded)) {
              fixtureId = marketIdDecoded;
              console.log(`Fixture ID: ${fixtureId}`);
            } else {
              console.log(`Market ID: ${marketIdDecoded}`);
            }
          }
        } catch (error) {
          console.log(`Warning: Could not decode market_id for pool ${pool.pool_id}:`, error.message);
          marketIdDecoded = pool.market_id || `POOL_${pool.pool_id}`;
        }
        
        console.log(`Predicted Outcome: ${pool.predicted_outcome}`);
        console.log(`Oracle Type: ${pool.oracle_type}`);
        
        // Determine if this should be a guided market
        const isGuidedMarket = pool.oracle_type === 'GUIDED' || 
                              marketIdDecoded.includes('COPPA') || 
                              marketIdDecoded.includes('DFB') || 
                              marketIdDecoded.includes('UDINESE') ||
                              marketIdDecoded.includes('CARRARESE') ||
                              marketIdDecoded.includes('SCHWEINFURT') ||
                              marketIdDecoded.includes('DUSSELDORF') ||
                              /^\d+$/.test(marketIdDecoded); // Numeric fixture IDs
        
        if (!isGuidedMarket) {
          console.log(`⏭️  Skipping pool ${pool.pool_id} - not a guided market`);
          skippedCount++;
          continue;
        }
        
        console.log(`✅ Pool ${pool.pool_id} is a guided market`);
        
        // Check if guided market entry already exists
        const existingMarket = await db.query(
          'SELECT id FROM oracle.football_prediction_markets WHERE market_id = $1 OR pool_id = $2',
          [marketIdDecoded, pool.pool_id]
        );
        
        if (existingMarket.rows.length > 0) {
          console.log(`⏭️  Guided market entry already exists for pool ${pool.pool_id}`);
          skippedCount++;
          continue;
        }
        
        // Extract fixture information
        let homeTeam = '';
        let awayTeam = '';
        let outcomeType = '1X2'; // Default outcome type
        
        // Map known market patterns to fixture info
        if (marketIdDecoded.includes('COPPA_UDINESE_CARRARESE')) {
          fixtureId = fixtureId || '19521656';
          homeTeam = 'Udinese';
          awayTeam = 'Carrarese';
        } else if (marketIdDecoded.includes('DFB_SCHWEINFURT_DUSSELDO')) {
          fixtureId = fixtureId || '19521657';
          homeTeam = 'Schweinfurt';
          awayTeam = 'Fortuna Düsseldorf';
        }
        
        // Create the guided market entry
        const insertQuery = `
          INSERT INTO oracle.football_prediction_markets (
            id, market_id, pool_id, fixture_id, market_type, 
            predicted_outcome, outcome_type, 
            end_time, resolved, status,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, false, 'active', NOW(), NOW()
          )
        `;
        
        const marketId = `guided_${pool.pool_id}_${Date.now()}`;
        
        await db.query(insertQuery, [
          marketId,                    // id
          marketIdDecoded,            // market_id  
          pool.pool_id,               // pool_id
          fixtureId,                  // fixture_id
          'guided',                   // market_type
          pool.predicted_outcome,     // predicted_outcome
          outcomeType,                // outcome_type
          pool.event_end_time         // end_time
        ]);
        
        console.log(`✅ Created guided market entry for pool ${pool.pool_id}`);
        
        // Update the pool's oracle_type to GUIDED if it wasn't already
        if (pool.oracle_type !== 'GUIDED') {
          await db.query(
            'UPDATE prediction.pools SET oracle_type = $1 WHERE pool_id = $2',
            ['GUIDED', pool.pool_id]
          );
          console.log(`✅ Updated pool ${pool.pool_id} oracle_type to GUIDED`);
        }
        
        processedCount++;
        
      } catch (error) {
        console.error(`❌ Error processing pool ${pool.pool_id}:`, error.message);
        errorCount++;
      }
    }
    
    // Verify the results
    const guidedMarketsResult = await db.query('SELECT COUNT(*) as count FROM oracle.football_prediction_markets');
    const guidedPoolsResult = await db.query("SELECT COUNT(*) as count FROM prediction.pools WHERE oracle_type = 'GUIDED'");
    
    console.log('\n🎉 Guided Market Entries Creation Complete!');
    console.log('================================================');
    console.log(`✅ Total guided market entries: ${guidedMarketsResult.rows[0].count}`);
    console.log(`✅ Total guided pools: ${guidedPoolsResult.rows[0].count}`);
    console.log(`📊 Processed: ${processedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('❌ Error creating guided market entries:', error);
    throw error;
  } finally {
    await db.disconnect();
    console.log('Database disconnected');
  }
}

// Run the script if called directly
if (require.main === module) {
  createGuidedMarketEntries()
    .then(() => {
      console.log('\n🏁 Script completed successfully.');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = createGuidedMarketEntries;
