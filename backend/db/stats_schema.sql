-- Enhanced Stats Tracking Schema
-- This file adds new tables and columns for comprehensive stats tracking

-- Add new columns to existing pools table
ALTER TABLE oracle.pools 
ADD COLUMN IF NOT EXISTS market_type INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS fill_percentage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS filled_above_threshold BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS total_volume NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS participant_count INTEGER DEFAULT 0;

-- Create user stats table
CREATE TABLE IF NOT EXISTS oracle.user_stats (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) UNIQUE NOT NULL,
    total_bets INTEGER DEFAULT 0,
    total_bet_amount NUMERIC DEFAULT 0,
    total_liquidity INTEGER DEFAULT 0,
    total_liquidity_amount NUMERIC DEFAULT 0,
    total_pools_created INTEGER DEFAULT 0,
    total_volume NUMERIC DEFAULT 0,
    win_count INTEGER DEFAULT 0,
    loss_count INTEGER DEFAULT 0,
    reputation_score INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create league stats table
CREATE TABLE IF NOT EXISTS oracle.league_stats (
    id SERIAL PRIMARY KEY,
    league_name VARCHAR(255) UNIQUE NOT NULL,
    total_pools INTEGER DEFAULT 0,
    total_volume NUMERIC DEFAULT 0,
    total_participants INTEGER DEFAULT 0,
    avg_pool_size NUMERIC DEFAULT 0,
    most_popular_market_type INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create category stats table
CREATE TABLE IF NOT EXISTS oracle.category_stats (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) UNIQUE NOT NULL,
    total_pools INTEGER DEFAULT 0,
    total_volume NUMERIC DEFAULT 0,
    total_participants INTEGER DEFAULT 0,
    avg_pool_size NUMERIC DEFAULT 0,
    most_popular_market_type INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create market type stats table
CREATE TABLE IF NOT EXISTS oracle.market_type_stats (
    id SERIAL PRIMARY KEY,
    market_type INTEGER UNIQUE NOT NULL,
    market_type_name VARCHAR(100) NOT NULL,
    total_pools INTEGER DEFAULT 0,
    total_volume NUMERIC DEFAULT 0,
    total_participants INTEGER DEFAULT 0,
    avg_pool_size NUMERIC DEFAULT 0,
    win_rate NUMERIC DEFAULT 0,
    last_activity TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create platform stats table
CREATE TABLE IF NOT EXISTS oracle.platform_stats (
    id SERIAL PRIMARY KEY,
    stat_date DATE UNIQUE NOT NULL,
    total_pools INTEGER DEFAULT 0,
    total_volume NUMERIC DEFAULT 0,
    total_participants INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    avg_pool_size NUMERIC DEFAULT 0,
    most_popular_league VARCHAR(255),
    most_popular_category VARCHAR(100),
    most_popular_market_type INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_stats_address ON oracle.user_stats(user_address);
CREATE INDEX IF NOT EXISTS idx_user_stats_activity ON oracle.user_stats(last_activity);
CREATE INDEX IF NOT EXISTS idx_league_stats_name ON oracle.league_stats(league_name);
CREATE INDEX IF NOT EXISTS idx_category_stats_name ON oracle.category_stats(category_name);
CREATE INDEX IF NOT EXISTS idx_market_type_stats_type ON oracle.market_type_stats(market_type);
CREATE INDEX IF NOT EXISTS idx_platform_stats_date ON oracle.platform_stats(stat_date);

-- Insert default market types
INSERT INTO oracle.market_type_stats (market_type, market_type_name) VALUES
(0, 'MONEYLINE'),
(1, 'OVER_UNDER'),
(2, 'BOTH_TEAMS_SCORE'),
(3, 'HALF_TIME'),
(4, 'DOUBLE_CHANCE'),
(5, 'CORRECT_SCORE'),
(6, 'FIRST_GOAL'),
(7, 'CUSTOM')
ON CONFLICT (market_type) DO NOTHING;

-- Create functions for updating stats
CREATE OR REPLACE FUNCTION update_league_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO oracle.league_stats (league_name, total_pools, total_volume, total_participants, last_activity)
    VALUES (NEW.league, 1, NEW.creator_stake, 1, NOW())
    ON CONFLICT (league_name) DO UPDATE SET
        total_pools = oracle.league_stats.total_pools + 1,
        total_volume = oracle.league_stats.total_volume + NEW.creator_stake,
        last_activity = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_category_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO oracle.category_stats (category_name, total_pools, total_volume, total_participants, last_activity)
    VALUES (NEW.category, 1, NEW.creator_stake, 1, NOW())
    ON CONFLICT (category_name) DO UPDATE SET
        total_pools = oracle.category_stats.total_pools + 1,
        total_volume = oracle.category_stats.total_volume + NEW.creator_stake,
        last_activity = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic stats updates
DROP TRIGGER IF EXISTS trigger_update_league_stats ON oracle.pools;
CREATE TRIGGER trigger_update_league_stats
    AFTER INSERT ON oracle.pools
    FOR EACH ROW
    EXECUTE FUNCTION update_league_stats();

DROP TRIGGER IF EXISTS trigger_update_category_stats ON oracle.pools;
CREATE TRIGGER trigger_update_category_stats
    AFTER INSERT ON oracle.pools
    FOR EACH ROW
    EXECUTE FUNCTION update_category_stats();
