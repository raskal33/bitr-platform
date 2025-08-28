
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
    