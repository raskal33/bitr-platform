#!/usr/bin/env node

/**
 * Optimistic Oracle Database Schema Setup
 * Creates all necessary tables for the optimistic oracle system
 */

const db = require('./db');

const OPTIMISTIC_ORACLE_SCHEMA = `
-- ============================================================================
-- OPTIMISTIC ORACLE SCHEMA
-- Community-driven market resolution system
-- ============================================================================

-- Main optimistic markets table
CREATE TABLE IF NOT EXISTS oracle.optimistic_markets (
  market_id VARCHAR(255) PRIMARY KEY,
  pool_id BIGINT,
  question TEXT NOT NULL,
  category VARCHAR(100) DEFAULT 'general',
  proposed_outcome TEXT,
  proposer VARCHAR(42),
  proposal_time BIGINT DEFAULT 0,
  proposal_bond VARCHAR(100) DEFAULT '0',
  disputer VARCHAR(42),
  dispute_time BIGINT DEFAULT 0,
  dispute_bond VARCHAR(100) DEFAULT '0',
  state INTEGER DEFAULT 0, -- 0=PENDING, 1=PROPOSED, 2=DISPUTED, 3=RESOLVED, 4=EXPIRED
  final_outcome TEXT,
  resolution_time BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User reputation system for optimistic oracle
CREATE TABLE IF NOT EXISTS core.user_reputation (
  user_address VARCHAR(42) PRIMARY KEY,
  reputation_score INTEGER DEFAULT 0,
  total_proposals INTEGER DEFAULT 0,
  successful_proposals INTEGER DEFAULT 0,
  total_disputes INTEGER DEFAULT 0,
  successful_disputes INTEGER DEFAULT 0,
  total_bonds_locked VARCHAR(100) DEFAULT '0',
  total_rewards_earned VARCHAR(100) DEFAULT '0',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Market proposal history
CREATE TABLE IF NOT EXISTS oracle.market_proposals (
  proposal_id SERIAL PRIMARY KEY,
  market_id VARCHAR(255) REFERENCES oracle.optimistic_markets(market_id),
  proposer VARCHAR(42) NOT NULL,
  proposed_outcome TEXT NOT NULL,
  bond_amount VARCHAR(100) NOT NULL,
  proposal_time BIGINT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Market dispute history
CREATE TABLE IF NOT EXISTS oracle.market_disputes (
  dispute_id SERIAL PRIMARY KEY,
  market_id VARCHAR(255) REFERENCES oracle.optimistic_markets(market_id),
  proposal_id INTEGER REFERENCES oracle.market_proposals(proposal_id),
  disputer VARCHAR(42) NOT NULL,
  dispute_reason TEXT,
  bond_amount VARCHAR(100) NOT NULL,
  dispute_time BIGINT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Market resolution logs
CREATE TABLE IF NOT EXISTS oracle.market_resolutions (
  resolution_id SERIAL PRIMARY KEY,
  market_id VARCHAR(255) REFERENCES oracle.optimistic_markets(market_id),
  final_outcome TEXT NOT NULL,
  resolver VARCHAR(42), -- Who resolved it (proposer or community)
  resolution_method VARCHAR(50), -- 'timeout', 'dispute_resolved', 'community_vote'
  resolution_time BIGINT NOT NULL,
  winner VARCHAR(42), -- Who gets the reward
  reward_amount VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_optimistic_markets_state ON oracle.optimistic_markets(state);
CREATE INDEX IF NOT EXISTS idx_optimistic_markets_category ON oracle.optimistic_markets(category);
CREATE INDEX IF NOT EXISTS idx_optimistic_markets_proposer ON oracle.optimistic_markets(proposer);
CREATE INDEX IF NOT EXISTS idx_optimistic_markets_disputer ON oracle.optimistic_markets(disputer);
CREATE INDEX IF NOT EXISTS idx_optimistic_markets_proposal_time ON oracle.optimistic_markets(proposal_time);
CREATE INDEX IF NOT EXISTS idx_user_reputation_score ON core.user_reputation(reputation_score);
CREATE INDEX IF NOT EXISTS idx_market_proposals_market_id ON oracle.market_proposals(market_id);
CREATE INDEX IF NOT EXISTS idx_market_disputes_market_id ON oracle.market_disputes(market_id);
CREATE INDEX IF NOT EXISTS idx_market_resolutions_market_id ON oracle.market_resolutions(market_id);

-- Unique constraints for ON CONFLICT operations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_optimistic_market_id'
  ) THEN
    ALTER TABLE oracle.optimistic_markets 
    ADD CONSTRAINT unique_optimistic_market_id UNIQUE (market_id);
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_user_reputation_address'
  ) THEN
    ALTER TABLE core.user_reputation 
    ADD CONSTRAINT unique_user_reputation_address UNIQUE (user_address);
  END IF;
END $$;
`;

async function setupOptimisticOracleSchema() {
  try {
    console.log('🔧 Setting up Optimistic Oracle database schema...');
    
    // Execute the schema setup
    await db.query(OPTIMISTIC_ORACLE_SCHEMA);
    
    console.log('✅ Optimistic Oracle schema setup completed successfully');
    
    // Verify tables were created
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema IN ('oracle', 'core') 
      AND table_name IN ('optimistic_markets', 'user_reputation', 'market_proposals', 'market_disputes', 'market_resolutions')
      ORDER BY table_name
    `);
    
    console.log('✅ Created tables:', tables.rows.map(r => r.table_name).join(', '));
    
    return true;
  } catch (error) {
    console.error('❌ Failed to setup Optimistic Oracle schema:', error);
    throw error;
  }
}

// Export for use in other modules
module.exports = {
  setupOptimisticOracleSchema,
  OPTIMISTIC_ORACLE_SCHEMA
};

// Run setup if called directly
if (require.main === module) {
  setupOptimisticOracleSchema()
    .then(() => {
      console.log('🎉 Optimistic Oracle database setup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}
