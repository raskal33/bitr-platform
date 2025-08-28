/**
 * Check Fixture Results Table
 * 
 * This script checks if the fixture_results table exists.
 */

const db = require('./backend/db/db');

async function checkFixtureResultsTable() {
  console.log('🔍 Checking Fixture Results Table...');
  
  try {
    // Check if fixture_results table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'oracle' 
        AND table_name = 'fixture_results'
      );
    `);
    
    if (tableExists.rows[0].exists) {
      console.log('✅ fixture_results table exists');
      
      // Check table schema
      const schema = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'oracle' AND table_name = 'fixture_results'
        ORDER BY ordinal_position
      `);
      
      console.log('📋 Fixture Results Table Schema:');
      for (const column of schema.rows) {
        console.log(`   • ${column.column_name}: ${column.data_type} (${column.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      }
      
      // Check if table has data
      const count = await db.query('SELECT COUNT(*) as count FROM oracle.fixture_results');
      console.log(`📊 Records in fixture_results: ${count.rows[0].count}`);
      
    } else {
      console.log('❌ fixture_results table does not exist');
    }
    
    // Check all tables in oracle schema
    const allTables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'oracle'
      ORDER BY table_name
    `);
    
    console.log('\n📋 All tables in oracle schema:');
    for (const table of allTables.rows) {
      console.log(`   • ${table.table_name}`);
    }
    
  } catch (error) {
    console.error('❌ Error checking fixture_results table:', error.message);
  }
}

// Run the check
if (require.main === module) {
  checkFixtureResultsTable().catch(console.error);
}

module.exports = checkFixtureResultsTable;
