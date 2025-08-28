#!/usr/bin/env node

/**
 * Manual Index Slips
 * 
 * This script manually indexes our placed slips into the database
 * since the indexer isn't currently running.
 */

const { ethers } = require('ethers');
const config = require('./config');
const db = require('./db/db');

async function manualIndexSlips() {
  console.log('📝 Manually Indexing Slips...');
  
  try {
    // Known slip events from our tests
    const knownSlips = [
      {
        slipId: 0,
        cycleId: 1,
        player: '0x483fc7FD690dCf2a01318282559C389F385d4428',
        txHash: '0x35f176dd514f2b4cd4c45115f420a26494b6740481ff3eaaee5d19029984a822',
        blockNumber: 152941944,
        placedAt: new Date('2025-08-18T14:18:53.000Z') // From our contract check
      },
      {
        slipId: 1,
        cycleId: 1,
        player: '0x483fc7FD690dCf2a01318282559C389F385d4428',
        txHash: '0x35f176dd514f2b4cd4c45115f420a26494b6740481ff3eaaee5d19029984a822',
        blockNumber: 152941944,
        placedAt: new Date('2025-08-18T15:01:25.000Z') // From our contract check
      }
    ];
    
    console.log(`📋 Found ${knownSlips.length} slips to index`);
    
    for (const slip of knownSlips) {
      console.log(`\n📝 Indexing slip ${slip.slipId}...`);
      
      try {
        // Check if slip already exists
        const existingSlip = await db.query(
          'SELECT slip_id FROM oracle.oddyssey_slips WHERE slip_id = $1',
          [slip.slipId]
        );
        
        if (existingSlip.rows.length > 0) {
          console.log(`   ⚠️ Slip ${slip.slipId} already exists in database`);
          continue;
        }
        
        // Insert the slip with all required columns
        await db.query(`
          INSERT INTO oracle.oddyssey_slips (
            slip_id, 
            cycle_id, 
            player_address, 
            placed_at, 
            predictions,
            final_score,
            correct_count,
            is_evaluated,
            tx_hash,
            creator_address,
            transaction_hash,
            category,
            uses_bitr,
            creator_stake,
            odds,
            pool_id,
            notification_type,
            message,
            is_read
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $3, $9, 'oddyssey', FALSE, 0.5, 1.0, $1, 'slip_placed', 'Your Oddyssey slip has been placed successfully', FALSE)
        `, [
          slip.slipId,
          slip.cycleId,
          slip.player,
          slip.placedAt,
          JSON.stringify([]), // Empty predictions for now
          0, // final_score
          0, // correct_count
          false, // is_evaluated
          slip.txHash
        ]);
        
        console.log(`   ✅ Successfully indexed slip ${slip.slipId}`);
        
      } catch (error) {
        console.log(`   ❌ Failed to index slip ${slip.slipId}: ${error.message}`);
      }
    }
    
    // Verify the slips are now in the database
    console.log('\n🔍 Verifying indexed slips...');
    const slipsResult = await db.query('SELECT * FROM oracle.oddyssey_slips ORDER BY slip_id');
    console.log(`✅ Database now has ${slipsResult.rows.length} slips:`);
    
    slipsResult.rows.forEach(slip => {
      console.log(`   - Slip ${slip.slip_id}: Player ${slip.player_address}, Cycle ${slip.cycle_id}, Placed at ${slip.placed_at}`);
    });
    
    console.log('\n🎯 Manual slip indexing completed!');
    
  } catch (error) {
    console.error('❌ Manual indexing failed:', error.message);
  }
}

manualIndexSlips();
