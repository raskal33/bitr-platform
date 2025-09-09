-- Create missing tables for comprehensive event indexing

-- Add contract_name column to blockchain_events if it doesn't exist
ALTER TABLE oracle.blockchain_events 
ADD COLUMN IF NOT EXISTS contract_name VARCHAR(50);

-- Create index on contract_name for better performance
CREATE INDEX IF NOT EXISTS idx_blockchain_events_contract_name 
ON oracle.blockchain_events(contract_name);

-- Create table for faucet claims tracking
CREATE TABLE IF NOT EXISTS airdrop.faucet_claims (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    amount DECIMAL(78, 0) NOT NULL,
    claimed_at TIMESTAMP NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(transaction_hash, user_address)
);

-- Create table for staking events
CREATE TABLE IF NOT EXISTS analytics.staking_events (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    event_type VARCHAR(20) NOT NULL, -- 'staked', 'claimed', 'unstaked', 'revenue_claimed'
    amount DECIMAL(78, 0),
    tier SMALLINT,
    duration SMALLINT,
    bitr_amount DECIMAL(78, 0),
    mon_amount DECIMAL(78, 0),
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on staking events
CREATE INDEX IF NOT EXISTS idx_staking_events_user_address 
ON analytics.staking_events(user_address);
CREATE INDEX IF NOT EXISTS idx_staking_events_event_type 
ON analytics.staking_events(event_type);

-- Create table for reputation events
CREATE TABLE IF NOT EXISTS core.reputation_log (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    old_reputation INTEGER,
    new_reputation INTEGER NOT NULL,
    change_reason VARCHAR(100),
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on reputation log
CREATE INDEX IF NOT EXISTS idx_reputation_log_user_address 
ON core.reputation_log(user_address);

-- Create table for optimistic oracle markets
CREATE TABLE IF NOT EXISTS oracle.optimistic_oracle_markets (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(66) NOT NULL UNIQUE,
    pool_id BIGINT,
    question TEXT NOT NULL,
    category VARCHAR(50),
    event_end_time TIMESTAMP,
    proposer_address VARCHAR(42),
    proposed_outcome VARCHAR(66),
    proposal_time TIMESTAMP,
    proposal_bond DECIMAL(78, 0),
    disputer_address VARCHAR(42),
    dispute_time TIMESTAMP,
    dispute_bond DECIMAL(78, 0),
    final_outcome VARCHAR(66),
    market_state VARCHAR(20), -- 'pending', 'proposed', 'disputed', 'resolved', 'expired'
    bonds_claimed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create table for oracle votes
CREATE TABLE IF NOT EXISTS oracle.optimistic_oracle_votes (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(66) NOT NULL,
    voter_address VARCHAR(42) NOT NULL,
    outcome VARCHAR(66) NOT NULL,
    voting_power DECIMAL(78, 0) NOT NULL,
    vote_timestamp TIMESTAMP NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(market_id, voter_address)
);

-- Create table for social reactions (likes, etc.)
CREATE TABLE IF NOT EXISTS core.social_reactions (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL,
    pool_id BIGINT,
    comment_id BIGINT,
    reaction_type VARCHAR(20) NOT NULL, -- 'like', 'dislike', 'love', etc.
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_address, pool_id, comment_id, reaction_type)
);

-- Create table for pool creation notifications
CREATE TABLE IF NOT EXISTS core.pool_creation_notifications (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL,
    creator_address VARCHAR(42) NOT NULL,
    title TEXT,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create table for user preferences (Oddyssey)
CREATE TABLE IF NOT EXISTS oracle.oddyssey_user_preferences (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL UNIQUE,
    auto_evaluate BOOLEAN DEFAULT FALSE,
    auto_claim BOOLEAN DEFAULT FALSE,
    notifications BOOLEAN DEFAULT TRUE,
    preferred_leagues JSONB DEFAULT '[]',
    risk_tolerance VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create table for comprehensive pool analytics
CREATE TABLE IF NOT EXISTS analytics.pools (
    id SERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL UNIQUE,
    creator_address VARCHAR(42) NOT NULL,
    category VARCHAR(50),
    league VARCHAR(100),
    market_type VARCHAR(30),
    oracle_type VARCHAR(20),
    total_volume DECIMAL(78, 0) DEFAULT 0,
    bet_count INTEGER DEFAULT 0,
    unique_bettors INTEGER DEFAULT 0,
    liquidity_providers INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pools_creator_address ON analytics.pools(creator_address);
CREATE INDEX IF NOT EXISTS idx_pools_category ON analytics.pools(category);
CREATE INDEX IF NOT EXISTS idx_pools_status ON analytics.pools(status);
CREATE INDEX IF NOT EXISTS idx_pools_is_featured ON analytics.pools(is_featured);

-- Create table for enhanced user analytics
CREATE TABLE IF NOT EXISTS analytics.user_analytics (
    id SERIAL PRIMARY KEY,
    user_address VARCHAR(42) NOT NULL UNIQUE,
    total_pools_created INTEGER DEFAULT 0,
    total_bets_placed INTEGER DEFAULT 0,
    total_volume_bet DECIMAL(78, 0) DEFAULT 0,
    total_volume_created DECIMAL(78, 0) DEFAULT 0,
    win_rate DECIMAL(5, 2) DEFAULT 0,
    profit_loss DECIMAL(78, 0) DEFAULT 0,
    reputation_score INTEGER DEFAULT 40,
    last_activity TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create table for daily platform statistics
CREATE TABLE IF NOT EXISTS analytics.daily_stats (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    total_pools INTEGER DEFAULT 0,
    active_pools INTEGER DEFAULT 0,
    total_volume DECIMAL(78, 0) DEFAULT 0,
    total_bets INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    oddyssey_slips INTEGER DEFAULT 0,
    faucet_claims INTEGER DEFAULT 0,
    staking_events INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create table for category statistics
CREATE TABLE IF NOT EXISTS analytics.category_stats (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    pool_count INTEGER DEFAULT 0,
    total_volume DECIMAL(78, 0) DEFAULT 0,
    unique_bettors INTEGER DEFAULT 0,
    avg_pool_size DECIMAL(78, 0) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(category, date)
);

-- Add missing columns to existing tables if they don't exist
ALTER TABLE oracle.pools 
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

ALTER TABLE oracle.pools 
ADD COLUMN IF NOT EXISTS boost_tier SMALLINT DEFAULT 0;

ALTER TABLE oracle.pools 
ADD COLUMN IF NOT EXISTS boost_expiry TIMESTAMP;

-- Create function to update analytics tables
CREATE OR REPLACE FUNCTION update_pool_analytics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or insert pool analytics
    INSERT INTO analytics.pools (
        pool_id, creator_address, category, league, market_type, 
        oracle_type, status, created_at
    ) VALUES (
        NEW.pool_id, NEW.creator_address, NEW.category, NEW.league, 
        NEW.market_type, NEW.oracle_type, NEW.status, NEW.created_at
    ) ON CONFLICT (pool_id) DO UPDATE SET
        status = NEW.status,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for pool analytics updates
DROP TRIGGER IF EXISTS trigger_update_pool_analytics ON oracle.pools;
CREATE TRIGGER trigger_update_pool_analytics
    AFTER INSERT OR UPDATE ON oracle.pools
    FOR EACH ROW
    EXECUTE FUNCTION update_pool_analytics();

-- Create function to update user analytics
CREATE OR REPLACE FUNCTION update_user_analytics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user analytics on bet placement
    INSERT INTO analytics.user_analytics (
        user_address, total_bets_placed, total_volume_bet, last_activity
    ) VALUES (
        NEW.bettor_address, 1, NEW.amount, NEW.created_at
    ) ON CONFLICT (user_address) DO UPDATE SET
        total_bets_placed = analytics.user_analytics.total_bets_placed + 1,
        total_volume_bet = analytics.user_analytics.total_volume_bet + NEW.amount,
        last_activity = NEW.created_at,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user analytics updates
DROP TRIGGER IF EXISTS trigger_update_user_analytics ON oracle.pool_bets;
CREATE TRIGGER trigger_update_user_analytics
    AFTER INSERT ON oracle.pool_bets
    FOR EACH ROW
    EXECUTE FUNCTION update_user_analytics();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analytics TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA airdrop TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA airdrop TO postgres;
