const { Pool } = require('pg');
const config = require('./backend/config.js');

class DatabaseSchemaUpdater {
  constructor() {
    this.pool = new Pool(config.database);
  }

  async addMissingColumns() {
    console.log('🔧 Adding missing columns to oracle.oddyssey_slips...');
    
    const client = await this.pool.connect();
    
    try {
      // Check current table structure
      const currentStructure = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'oracle' 
        AND table_name = 'oddyssey_slips'
        ORDER BY ordinal_position
      `);
      
      console.log('📋 Current table structure:');
      currentStructure.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });

      // Define the columns we need to add
      const columnsToAdd = [
        { name: 'transaction_hash', type: 'TEXT', default: null },
        { name: 'creator_address', type: 'TEXT', default: null },
        { name: 'category', type: 'TEXT', default: "'oddyssey'" },
        { name: 'uses_bitr', type: 'BOOLEAN', default: 'false' },
        { name: 'creator_stake', type: 'NUMERIC(18, 6)', default: '0' },
        { name: 'odds', type: 'NUMERIC(10, 6)', default: '1' },
        { name: 'pool_id', type: 'BIGINT', default: null },
        { name: 'notification_type', type: 'TEXT', default: "'slip_placed'" },
        { name: 'message', type: 'TEXT', default: "'Your Oddyssey slip has been placed successfully'" },
        { name: 'is_read', type: 'BOOLEAN', default: 'false' }
      ];

      // Add each column if it doesn't exist
      for (const column of columnsToAdd) {
        const exists = await client.query(`
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'oracle' 
          AND table_name = 'oddyssey_slips' 
          AND column_name = $1
        `, [column.name]);

        if (exists.rows.length === 0) {
          const defaultValue = column.default ? `DEFAULT ${column.default}` : '';
          const sql = `ALTER TABLE oracle.oddyssey_slips ADD COLUMN ${column.name} ${column.type} ${defaultValue}`;
          
          console.log(`➕ Adding column: ${column.name}`);
          await client.query(sql);
        } else {
          console.log(`✅ Column ${column.name} already exists`);
        }
      }

      // Update existing records to populate new columns
      console.log('🔄 Updating existing records...');
      await client.query(`
        UPDATE oracle.oddyssey_slips 
        SET 
            creator_address = player_address,
            transaction_hash = tx_hash,
            odds = 1.0,
            creator_stake = 0.5,
            category = 'oddyssey',
            uses_bitr = false,
            pool_id = slip_id,
            notification_type = 'slip_placed',
            message = 'Your Oddyssey slip has been placed successfully',
            is_read = false
        WHERE creator_address IS NULL
      `);

      // Create indexes for better performance
      console.log('📊 Creating indexes...');
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_creator_address ON oracle.oddyssey_slips(creator_address)',
        'CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_transaction_hash ON oracle.oddyssey_slips(transaction_hash)',
        'CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_category ON oracle.oddyssey_slips(category)',
        'CREATE INDEX IF NOT EXISTS idx_oddyssey_slips_created_at ON oracle.oddyssey_slips(placed_at)'
      ];

      for (const indexSql of indexes) {
        await client.query(indexSql);
      }

      // Create comprehensive view
      console.log('👁️ Creating comprehensive view...');
      await client.query(`
        CREATE OR REPLACE VIEW oracle.comprehensive_slips AS
        SELECT 
            s.slip_id,
            s.cycle_id,
            s.player_address,
            s.creator_address,
            s.pool_id,
            s.transaction_hash,
            s.category,
            s.uses_bitr,
            s.creator_stake,
            s.odds,
            s.notification_type,
            s.message,
            s.is_read,
            s.placed_at as created_at,
            s.predictions,
            s.final_score,
            s.correct_count,
            s.is_evaluated,
            s.leaderboard_rank,
            s.prize_claimed,
            s.tx_hash,
            c.is_resolved as cycle_resolved,
            c.prize_pool,
            c.resolved_at,
            c.cycle_start_time,
            c.cycle_end_time
        FROM oracle.oddyssey_slips s
        LEFT JOIN oracle.oddyssey_cycles c ON s.cycle_id = c.cycle_id
      `);

      // Show final structure
      const finalStructure = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'oracle' 
        AND table_name = 'oddyssey_slips'
        ORDER BY ordinal_position
      `);
      
      console.log('\n📋 Final table structure:');
      finalStructure.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });

      // Show sample data
      const sampleData = await client.query(`
        SELECT 
            slip_id,
            cycle_id,
            player_address,
            creator_address,
            transaction_hash,
            category,
            creator_stake,
            odds,
            placed_at,
            is_evaluated,
            final_score
        FROM oracle.oddyssey_slips 
        LIMIT 3
      `);
      
      console.log('\n📊 Sample data:');
      sampleData.rows.forEach(row => {
        console.log(`  - Slip ${row.slip_id}: ${row.player_address}, Cycle ${row.cycle_id}, Score: ${row.final_score || 'N/A'}`);
      });

      console.log('\n✅ Database schema update completed successfully!');

    } catch (error) {
      console.error('❌ Error updating database schema:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

// Run the update
async function main() {
  const updater = new DatabaseSchemaUpdater();
  
  try {
    await updater.addMissingColumns();
  } catch (error) {
    console.error('❌ Failed to update database schema:', error);
    process.exit(1);
  } finally {
    await updater.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = DatabaseSchemaUpdater;
