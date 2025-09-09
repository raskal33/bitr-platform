#!/usr/bin/env node

/**
 * Indexer Database Schema Verification and Alignment
 * 
 * Ensures all required tables exist and are properly structured
 * for the enhanced indexer with premium RPC optimizations
 */

const db = require('../db/db');

async function verifyAndCreateIndexerTables() {
  console.log('🔍 Verifying indexer database schema...');
  
  try {
    // 1. Verify oracle.indexed_blocks table
    await db.query(`
      CREATE TABLE IF NOT EXISTS oracle.indexed_blocks (
        block_number BIGINT PRIMARY KEY,
        indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        events_count INTEGER DEFAULT 0,
        processing_time_ms INTEGER DEFAULT 0
      )
    `);
    console.log('✅ oracle.indexed_blocks table verified');

    // 2. Verify oracle.blockchain_events table
    await db.query(`
      CREATE TABLE IF NOT EXISTS oracle.blockchain_events (
        id SERIAL PRIMARY KEY,
        block_number BIGINT NOT NULL,
        transaction_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        contract_address TEXT NOT NULL,
        event_data JSONB,
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✅ oracle.blockchain_events table verified');

    // 3. Verify oracle.oddyssey_slips table
    await db.query(`
      CREATE TABLE IF NOT EXISTS oracle.oddyssey_slips (
        slip_id BIGINT PRIMARY KEY,
        cycle_id BIGINT NOT NULL,
        player_address TEXT NOT NULL,
        placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        predictions JSONB NOT NULL,
        score NUMERIC(10, 4) DEFAULT 0,
        is_evaluated BOOLEAN DEFAULT FALSE,
        evaluated_at TIMESTAMP WITH TIME ZONE,
        rank INTEGER,
        prize_amount NUMERIC(78, 18) DEFAULT 0,
        is_claimed BOOLEAN DEFAULT FALSE,
        claimed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✅ oracle.oddyssey_slips table verified');

    // 4. Verify oracle.oddyssey_cycles table
    await db.query(`
      CREATE TABLE IF NOT EXISTS oracle.oddyssey_cycles (
        cycle_id BIGINT PRIMARY KEY,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        entry_fee NUMERIC(78, 18) NOT NULL,
        prize_pool NUMERIC(78, 18) DEFAULT 0,
        total_slips INTEGER DEFAULT 0,
        is_resolved BOOLEAN DEFAULT FALSE,
        resolved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✅ oracle.oddyssey_cycles table verified');

    // 5. Create performance indexes
    console.log('🔧 Creating performance indexes...');
    
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_indexed_blocks_number ON oracle.indexed_blocks(block_number);
      CREATE INDEX IF NOT EXISTS idx_indexed_blocks_timestamp ON oracle.indexed_blocks(indexed_at DESC);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_blockchain_events_block_number ON oracle.blockchain_events(block_number);
      CREATE INDEX IF NOT EXISTS idx_blockchain_events_event_type ON oracle.blockchain_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_blockchain_events_contract_address ON oracle.blockchain_events(contract_address);
      CREATE INDEX IF NOT EXISTS idx_blockchain_events_transaction_hash ON oracle.blockchain_events(transaction_hash);
      CREATE INDEX IF NOT EXISTS idx_blockchain_events_processed_at ON oracle.blockchain_events(processed_at DESC);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_cycle_id ON oracle.oddyssey_slips(cycle_id);
      CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_player ON oracle.oddyssey_slips(player_address);
      CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_evaluated ON oracle.oddyssey_slips(is_evaluated);
      CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_claimed ON oracle.oddyssey_slips(is_claimed);
      CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_placed_at ON oracle.oddyssey_slips(placed_at DESC);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_start_time ON oracle.oddyssey_cycles(start_time);
      CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_end_time ON oracle.oddyssey_cycles(end_time);
      CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_resolved ON oracle.oddyssey_cycles(is_resolved);
    `);

    // 6. Add unique constraints to prevent duplicates
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_blockchain_events_unique 
      ON oracle.blockchain_events(block_number, transaction_hash, log_index, event_type);
    `);

    console.log('✅ Performance indexes created');

    // 7. Verify indexer state table
    await db.query(`
      CREATE TABLE IF NOT EXISTS oracle.indexer_state (
        id SERIAL PRIMARY KEY,
        last_indexed_block BIGINT NOT NULL DEFAULT 0,
        last_processed_block BIGINT NOT NULL DEFAULT 0,
        is_processing BOOLEAN DEFAULT FALSE,
        total_blocks BIGINT DEFAULT 0,
        total_events BIGINT DEFAULT 0,
        start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        performance_stats JSONB DEFAULT '{}'::jsonb
      )
    `);
    console.log('✅ oracle.indexer_state table verified');

    // 8. Initialize indexer state if empty
    const stateCheck = await db.query('SELECT COUNT(*) as count FROM oracle.indexer_state');
    if (parseInt(stateCheck.rows[0].count) === 0) {
      await db.query(`
        INSERT INTO oracle.indexer_state (last_indexed_block, last_processed_block, total_blocks, total_events)
        VALUES (0, 0, 0, 0)
      `);
      console.log('✅ Indexer state initialized');
    }

    // 9. Verify table permissions and constraints
    console.log('🔧 Verifying table constraints...');
    
    // Check for any missing foreign key constraints
    await db.query(`
      DO $$ 
      BEGIN
        -- Add foreign key constraint if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_oddyssey_slips_cycle'
        ) THEN
          ALTER TABLE oracle.oddyssey_slips 
          ADD CONSTRAINT fk_oddyssey_slips_cycle 
          FOREIGN KEY (cycle_id) REFERENCES oracle.oddyssey_cycles(cycle_id);
        END IF;
      END $$;
    `).catch(err => {
      console.log('⚠️ Foreign key constraint already exists or cycles table not ready:', err.message);
    });

    console.log('✅ Database schema verification completed successfully!');
    
    // 10. Generate schema report
    const report = await generateSchemaReport();
    console.log('\n📊 Schema Report:');
    console.log(report);

  } catch (error) {
    console.error('❌ Error verifying database schema:', error);
    throw error;
  }
}

async function generateSchemaReport() {
  try {
    // Get table sizes and row counts
    const tables = [
      'oracle.indexed_blocks',
      'oracle.blockchain_events', 
      'oracle.oddyssey_slips',
      'oracle.oddyssey_cycles',
      'oracle.indexer_state'
    ];

    let report = '';
    
    for (const table of tables) {
      try {
        const countResult = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        const sizeResult = await db.query(`
          SELECT pg_size_pretty(pg_total_relation_size('${table}')) as size
        `);
        
        const count = countResult.rows[0]?.count || 0;
        const size = sizeResult.rows[0]?.size || '0 bytes';
        
        report += `   📋 ${table}: ${count} rows, ${size}\n`;
      } catch (err) {
        report += `   ❌ ${table}: Error - ${err.message}\n`;
      }
    }

    // Get last indexed block info
    try {
      const lastBlockResult = await db.query(`
        SELECT MAX(block_number) as last_block, COUNT(*) as total_blocks 
        FROM oracle.indexed_blocks
      `);
      const lastBlock = lastBlockResult.rows[0]?.last_block || 0;
      const totalBlocks = lastBlockResult.rows[0]?.total_blocks || 0;
      
      report += `\n   🔗 Indexing Status:\n`;
      report += `      Last Indexed Block: ${lastBlock}\n`;
      report += `      Total Indexed Blocks: ${totalBlocks}\n`;
    } catch (err) {
      report += `\n   ❌ Indexing Status: Error - ${err.message}\n`;
    }

    return report;
  } catch (error) {
    return `   ❌ Error generating report: ${error.message}`;
  }
}

// Run verification if called directly
if (require.main === module) {
  verifyAndCreateIndexerTables()
    .then(() => {
      console.log('\n🎉 Database schema verification completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Database schema verification failed:', error);
      process.exit(1);
    });
}

module.exports = { verifyAndCreateIndexerTables, generateSchemaReport };
