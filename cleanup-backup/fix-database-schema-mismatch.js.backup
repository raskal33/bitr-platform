#!/usr/bin/env node

/**
 * Fix Database Schema Mismatch
 * 
 * This script fixes the "INSERT has more expressions than target columns" error
 * by updating the SportMonks service to match the actual database schema.
 */

const fs = require('fs');
const path = require('path');

class DatabaseSchemaFixer {
  constructor() {
    this.sportmonksPath = './backend/services/sportmonks.js';
  }

  async fixSportMonksInsert() {
    console.log('🔧 Fixing SportMonks INSERT statement...');
    
    try {
      const currentContent = fs.readFileSync(this.sportmonksPath, 'utf8');
      
      // The current INSERT has 42 columns but 43 values (41 params + 2 NOW())
      // We need to remove one column to match the actual database schema
      
      // Find the INSERT statement and fix it
      const fixedContent = currentContent.replace(
        /INSERT INTO oracle\.fixtures \([\s\S]*?\) VALUES \([\s\S]*?\)/,
        `INSERT INTO oracle.fixtures (
        id, name, home_team_id, away_team_id, home_team, away_team,
        league_id, league_name, season_id, round_id, round,
        match_date, starting_at, status, venue, referee,
        league, season, stage, round_obj, state, participants, metadata,
        home_team_image_path, away_team_image_path, league_image_path, country_image_path,
        country, country_code, venue_id, venue_capacity, venue_coordinates, venue_surface, venue_image_path,
        referee_id, referee_name, referee_image_path,
        team_assignment_validated, odds_mapping_validated, processing_errors,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, NOW(), NOW()
      )`
      );
      
      fs.writeFileSync(this.sportmonksPath, fixedContent);
      console.log('✅ Fixed SportMonks INSERT statement');
      
    } catch (error) {
      console.error('❌ Error fixing SportMonks:', error.message);
    }
  }

  async createDatabaseMigration() {
    console.log('📋 Creating database migration...');
    
    const migrationSQL = `
-- Fix fixtures table schema to match INSERT statement
-- Add missing columns that are referenced in the INSERT

DO $$ 
BEGIN 
  -- Add missing columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'country') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN country VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'country_code') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN country_code VARCHAR(10);
  END IF;
  
  -- Ensure all required columns exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'venue_id') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN venue_id VARCHAR(50);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'venue_capacity') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN venue_capacity INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'venue_coordinates') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN venue_coordinates VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'venue_surface') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN venue_surface VARCHAR(50);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'venue_image_path') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN venue_image_path TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'referee_id') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN referee_id VARCHAR(50);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'referee_name') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN referee_name VARCHAR(255);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'referee_image_path') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN referee_image_path TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'home_team_image_path') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN home_team_image_path TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'away_team_image_path') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN away_team_image_path TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'league_image_path') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN league_image_path TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'country_image_path') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN country_image_path TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'team_assignment_validated') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN team_assignment_validated BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'odds_mapping_validated') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN odds_mapping_validated BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'oracle' AND table_name = 'fixtures' AND column_name = 'processing_errors') THEN
    ALTER TABLE oracle.fixtures ADD COLUMN processing_errors JSONB DEFAULT '{}';
  END IF;
  
END $$;
    `;
    
    fs.writeFileSync('./database-schema-fix.sql', migrationSQL);
    console.log('✅ Created database migration: database-schema-fix.sql');
  }

  async run() {
    console.log('🚀 Starting Database Schema Fix...');
    
    await this.createDatabaseMigration();
    await this.fixSportMonksInsert();
    
    console.log('✅ Database schema fix completed!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Run the database migration: psql -d your_db -f database-schema-fix.sql');
    console.log('2. Restart the backend service');
    console.log('3. Monitor logs for any remaining INSERT errors');
  }
}

// Run the fixer
if (require.main === module) {
  const fixer = new DatabaseSchemaFixer();
  fixer.run().catch(console.error);
}

module.exports = DatabaseSchemaFixer;
