-- Migration: Add consolidation_detected field to airdrop.eligibility table
-- Date: 2024-01-15
-- Description: Add missing consolidation_detected field for enhanced Sybil detection

-- Add consolidation_detected column if it doesn't exist
DO $$ 
BEGIN
    -- Check if consolidation_detected column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'airdrop' 
        AND table_name = 'eligibility' 
        AND column_name = 'consolidation_detected'
    ) THEN
        -- Add the column
        ALTER TABLE airdrop.eligibility 
        ADD COLUMN consolidation_detected BOOLEAN DEFAULT FALSE;
        
        -- Update existing records to check for consolidation
        UPDATE airdrop.eligibility 
        SET consolidation_detected = (
            SELECT COUNT(DISTINCT from_address) >= 3
            FROM airdrop.transfer_patterns tp
            WHERE tp.to_address = airdrop.eligibility.user_address
            AND tp.amount > 0
        )
        WHERE consolidation_detected IS NULL;
        
        -- Recalculate eligibility for all users
        UPDATE airdrop.eligibility 
        SET is_eligible = (
            has_faucet_claim = TRUE AND
            has_stt_activity_before_faucet = TRUE AND
            bitr_action_count >= 30 AND
            has_staking_activity = TRUE AND
            oddyssey_slip_count >= 10 AND
            has_suspicious_transfers = FALSE AND
            is_transfer_only_recipient = FALSE AND
            consolidation_detected = FALSE
        );
        
        RAISE NOTICE 'Added consolidation_detected column and updated eligibility calculations';
    ELSE
        RAISE NOTICE 'consolidation_detected column already exists';
    END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_eligibility_consolidation ON airdrop.eligibility(consolidation_detected);

-- Update comments
COMMENT ON COLUMN airdrop.eligibility.consolidation_detected IS 'True if user received BITR from 3+ different addresses (potential consolidation attack)';
