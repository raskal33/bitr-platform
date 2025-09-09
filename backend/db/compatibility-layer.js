
/**
 * Database Compatibility Layer for Indexers
 * Handles column differences and BigInt serialization
 */
class DatabaseCompatibilityLayer {
  constructor(db) {
    this.db = db;
  }

  /**
   * Safe event storage with automatic column detection
   */
  async storeEvent(event, eventType, contractName = null) {
    try {
      // Check if contract_name column exists
      const hasContractName = await this.hasColumn('oracle', 'blockchain_events', 'contract_name');
      
      let query, params;
      
      if (hasContractName && contractName) {
        query = `
          INSERT INTO oracle.blockchain_events (
            block_number, transaction_hash, log_index, event_type, 
            contract_address, event_data, processed_at, contract_name
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
          ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
        `;
        params = [
          event.blockNumber,
          event.transactionHash,
          event.logIndex,
          eventType,
          event.address,
          this.safeBigIntStringify(event.args),
          contractName
        ];
      } else {
        query = `
          INSERT INTO oracle.blockchain_events (
            block_number, transaction_hash, log_index, event_type, 
            contract_address, event_data, processed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
        `;
        params = [
          event.blockNumber,
          event.transactionHash,
          event.logIndex,
          eventType,
          event.address,
          this.safeBigIntStringify(event.args)
        ];
      }
      
      await this.db.query(query, params);
      
    } catch (error) {
      console.error('❌ Error storing event:', error);
      throw error;
    }
  }

  /**
   * Safe slip storage with automatic column detection
   */
  async storeSlip(slipData) {
    try {
      // Check if updated_at column exists
      const hasUpdatedAt = await this.hasColumn('oracle', 'oddyssey_slips', 'updated_at');
      
      let query, params;
      
      if (hasUpdatedAt) {
        query = `
          INSERT INTO oracle.oddyssey_slips (
            slip_id, cycle_id, player_address, placed_at, predictions,
            final_score, correct_count, is_evaluated, transaction_hash,
            creator_address, category, uses_bitr, creator_stake, odds,
            pool_id, notification_type, message, is_read, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
          ON CONFLICT (slip_id, cycle_id) DO UPDATE SET
            predictions = $5,
            placed_at = $4,
            final_score = $6,
            correct_count = $7,
            is_evaluated = $8,
            updated_at = NOW()
        `;
      } else {
        query = `
          INSERT INTO oracle.oddyssey_slips (
            slip_id, cycle_id, player_address, placed_at, predictions,
            final_score, correct_count, is_evaluated, transaction_hash,
            creator_address, category, uses_bitr, creator_stake, odds,
            pool_id, notification_type, message, is_read
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (slip_id, cycle_id) DO UPDATE SET
            predictions = $5,
            placed_at = $4,
            final_score = $6,
            correct_count = $7,
            is_evaluated = $8
        `;
      }
      
      params = [
        slipData.slipId,
        slipData.cycleId,
        slipData.playerAddress,
        slipData.placedAt,
        this.safeBigIntStringify(slipData.predictions),
        slipData.finalScore,
        slipData.correctCount,
        slipData.isEvaluated,
        slipData.transactionHash,
        slipData.creatorAddress || slipData.playerAddress,
        slipData.category || 'oddyssey',
        slipData.usesBitr || false,
        slipData.creatorStake || 0.5,
        slipData.odds || 1.0,
        slipData.poolId || slipData.slipId,
        slipData.notificationType || 'slip_placed',
        slipData.message || 'Slip placed successfully',
        slipData.isRead || false
      ];
      
      await this.db.query(query, params);
      
    } catch (error) {
      console.error('❌ Error storing slip:', error);
      throw error;
    }
  }

  /**
   * Safe BigInt JSON stringification
   */
  safeBigIntStringify(obj) {
    return JSON.stringify(obj, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    );
  }

  /**
   * Check if a column exists in a table
   */
  async hasColumn(schema, table, column) {
    try {
      const result = await this.db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
      `, [schema, table, column]);
      
      return result.rows.length > 0;
    } catch (error) {
      console.error(`Error checking column ${schema}.${table}.${column}:`, error);
      return false;
    }
  }

  /**
   * Verify data integrity
   */
  async verifySlipData(slipId, cycleId) {
    try {
      const result = await this.db.query(`
        SELECT slip_id, player_address, cycle_id, predictions, 
               final_score, correct_count, is_evaluated
        FROM oracle.oddyssey_slips 
        WHERE slip_id = $1 AND cycle_id = $2
      `, [slipId, cycleId]);
      
      if (result.rows.length === 0) {
        return { exists: false, error: 'Slip not found' };
      }
      
      const slip = result.rows[0];
      let predictions = [];
      
      try {
        predictions = typeof slip.predictions === 'string' 
          ? JSON.parse(slip.predictions) 
          : slip.predictions || [];
      } catch (parseError) {
        return { 
          exists: true, 
          error: `Invalid predictions JSON: ${parseError.message}`,
          slip 
        };
      }
      
      return {
        exists: true,
        valid: true,
        slip: {
          ...slip,
          predictions,
          predictionsCount: predictions.length
        }
      };
      
    } catch (error) {
      return { 
        exists: false, 
        error: `Verification failed: ${error.message}` 
      };
    }
  }
}

module.exports = DatabaseCompatibilityLayer;
