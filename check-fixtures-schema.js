/**
 * Check Fixtures Schema
 * 
 * This script checks the actual fixtures table schema.
 */

const db = require('./backend/db/db');

async function checkFixturesSchema() {
  console.log('🔍 Checking Fixtures Schema...');
  
  try {
    // Get table schema
    const schema = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'oracle' AND table_name = 'fixtures'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Fixtures Table Schema:');
    for (const column of schema.rows) {
      console.log(`   • ${column.column_name}: ${column.data_type} (${column.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    }
    
    // Check for result-related columns
    const resultColumns = schema.rows.filter(col => 
      col.column_name.toLowerCase().includes('result') || 
      col.column_name.toLowerCase().includes('score') ||
      col.column_name.toLowerCase().includes('final')
    );
    
    console.log('');
    console.log('🎯 Result-related columns:');
    if (resultColumns.length > 0) {
      for (const column of resultColumns) {
        console.log(`   • ${column.column_name}: ${column.data_type}`);
      }
    } else {
      console.log('   ❌ No result-related columns found');
    }
    
    // Check sample data
    const sampleData = await db.query(`
      SELECT * FROM oracle.fixtures 
      WHERE status = 'FT' 
      ORDER BY match_date DESC 
      LIMIT 3
    `);
    
    console.log('');
    console.log('📊 Sample FT Fixtures:');
    for (const fixture of sampleData.rows) {
      console.log(`   • ${fixture.home_team} vs ${fixture.away_team} (${fixture.match_date})`);
      console.log(`     Status: ${fixture.status}`);
      console.log(`     All columns:`, Object.keys(fixture).join(', '));
      break; // Just show first one
    }
    
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  }
}

// Run the check
if (require.main === module) {
  checkFixturesSchema().catch(console.error);
}

module.exports = checkFixturesSchema;
