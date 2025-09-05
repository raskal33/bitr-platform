#!/usr/bin/env node

/**
 * Enhanced Stats Migration Script
 * 
 * This script runs the database migration to add new tables and columns
 * for comprehensive stats tracking.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

async function runMigration() {
  try {
    console.log('🚀 Starting Enhanced Stats Migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../db/stats_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Connect to database
    const db = require('../db/db');
    
    console.log('📊 Running database migration...');
    
    // Split the SQL into individual statements and execute them
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          await db.query(statement);
        } catch (error) {
          // Some statements might fail if they already exist (like indexes)
          if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
            console.log(`⚠️ Statement ${i + 1} skipped (already exists): ${error.message}`);
          } else {
            throw error;
          }
        }
      }
    }
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the migration
    console.log('🔍 Verifying migration...');
    
    const tables = [
      'oracle.user_stats',
      'oracle.league_stats', 
      'oracle.category_stats',
      'oracle.market_type_stats',
      'oracle.platform_stats'
    ];
    
    for (const table of tables) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`✅ ${table}: ${result.rows[0].count} records`);
      } catch (error) {
        console.log(`❌ ${table}: ${error.message}`);
      }
    }
    
    // Check if new columns were added to pools table
    try {
      const result = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'oracle' 
        AND table_name = 'pools' 
        AND column_name IN ('market_type', 'fill_percentage', 'filled_above_threshold', 'total_volume', 'participant_count')
      `);
      console.log(`✅ Pools table enhanced with ${result.rows.length} new columns`);
    } catch (error) {
      console.log(`❌ Error checking pools table: ${error.message}`);
    }
    
    console.log('🎉 Enhanced Stats Migration completed successfully!');
    console.log('');
    console.log('📋 What was added:');
    console.log('  • user_stats table - User activity and performance tracking');
    console.log('  • league_stats table - League-specific statistics');
    console.log('  • category_stats table - Category performance metrics');
    console.log('  • market_type_stats table - Market type analytics');
    console.log('  • platform_stats table - Daily platform overview');
    console.log('  • Enhanced pools table with new columns');
    console.log('  • Automatic triggers for stats updates');
    console.log('');
    console.log('🚀 The indexer will now track these new events:');
    console.log('  • PoolFilledAboveThreshold');
    console.log('  • UserBetPlaced');
    console.log('  • UserLiquidityAdded');
    console.log('  • PoolVolumeUpdated');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the migration
runMigration();
