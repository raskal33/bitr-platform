
-- Add missing image and metadata fields to existing tables

-- Fixtures table updates
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS referee_id VARCHAR(50);
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS referee_name VARCHAR(255);
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS referee_image_path TEXT;
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS venue_capacity INTEGER;
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS venue_coordinates VARCHAR(100);
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS venue_surface VARCHAR(50);
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS venue_image_path TEXT;
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS home_team_image_path TEXT;
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS away_team_image_path TEXT;
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS league_image_path TEXT;
ALTER TABLE oracle.fixtures ADD COLUMN IF NOT EXISTS country_image_path TEXT;

-- Leagues table updates  
ALTER TABLE oracle.leagues ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE oracle.leagues ADD COLUMN IF NOT EXISTS country_image_path TEXT;

-- Fixture odds table updates
ALTER TABLE oracle.fixture_odds ADD COLUMN IF NOT EXISTS bookmaker_name VARCHAR(100);
ALTER TABLE oracle.fixture_odds ADD COLUMN IF NOT EXISTS bookmaker_logo TEXT;

-- Fixture results evaluation updates
ALTER TABLE oracle.fixture_results ADD COLUMN IF NOT EXISTS evaluation_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE oracle.fixture_results ADD COLUMN IF NOT EXISTS evaluation_timestamp TIMESTAMP WITH TIME ZONE;
ALTER TABLE oracle.fixture_results ADD COLUMN IF NOT EXISTS evaluator VARCHAR(50) DEFAULT 'auto';
ALTER TABLE oracle.fixture_results ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2) DEFAULT 100.0;

-- Coins table updates for Coinpaprika images
ALTER TABLE oracle.coins ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE oracle.coins ADD COLUMN IF NOT EXISTS whitepaper_url TEXT;
ALTER TABLE oracle.coins ADD COLUMN IF NOT EXISTS website_url TEXT;
  