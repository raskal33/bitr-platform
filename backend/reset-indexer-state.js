#!/usr/bin/env node

/**
 * Reset Indexer State Script
 * 
 * This script resets the indexer state to start from block 164,312,555
 * instead of continuing from the current (very old) state.
 */

const config = require('./config');

async function resetIndexerState() {
  const db = require('./db/db');
  
  try {
    console.log('🔄 Resetting indexer state...');
    
    const startBlock = 164312555;
    
    // Clear existing indexer state
    await db.query('DELETE FROM oracle.indexer_state');
    console.log('✅ Cleared existing indexer state');
    
    // Insert new state starting from the specified block
    await db.query(`
      INSERT INTO oracle.indexer_state (
        last_indexed_block, 
        last_processed_block, 
        is_processing, 
        total_blocks, 
        total_events, 
        start_time, 
        updated_at
      ) VALUES ($1, $2, FALSE, 0, 0, NOW(), NOW())
    `, [startBlock, startBlock]);
    
    console.log(`✅ Set indexer to start from block: ${startBlock}`);
    
    // Optionally clear indexed blocks table to start fresh
    const clearIndexedBlocks = process.argv.includes('--clear-blocks');
    if (clearIndexedBlocks) {
      await db.query('DELETE FROM oracle.indexed_blocks WHERE block_number < $1', [startBlock]);
      console.log(`✅ Cleared indexed blocks before block ${startBlock}`);
    }
    
    console.log('🎉 Indexer state reset complete!');
    console.log(`📊 Indexer will now start from block ${startBlock} instead of block 0`);
    console.log(`⚡ This will save years of indexing time!`);
    
  } catch (error) {
    console.error('❌ Error resetting indexer state:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the reset
resetIndexerState();
