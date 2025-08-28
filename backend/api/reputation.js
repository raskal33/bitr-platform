const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Get user reputation and access level
router.get('/user/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }
    
    // Get user reputation
    const result = await db.query(
      'SELECT reputation, joined_at, last_active FROM core.users WHERE address = $1',
      [address.toLowerCase()]
    );
    
    let reputation = 40; // Default reputation
    let joinedAt = null;
    let lastActive = null;
    
    if (result.rows.length > 0) {
      reputation = result.rows[0].reputation;
      joinedAt = result.rows[0].joined_at;
      lastActive = result.rows[0].last_active;
    }
    
    // Determine access level based on reputation
    let accessLevel = 'limited';
    let accessLevelName = 'Limited';
    let capabilities = ['Can only place bets'];
    
    if (reputation >= 300) {
      accessLevel = 'expert';
      accessLevelName = 'Expert';
      capabilities = [
        'Can place bets',
        'Can create guided markets',
        'Can propose outcomes in open markets',
        'Can create & resolve open markets',
        'Can sell predictions',
        'Can share articles'
      ];
    } else if (reputation >= 100) {
      accessLevel = 'regular';
      accessLevelName = 'Regular';
      capabilities = [
        'Can place bets',
        'Can create guided markets',
        'Can propose outcomes in open markets',
        'Can create open markets'
      ];
    } else if (reputation >= 40) {
      accessLevel = 'active';
      accessLevelName = 'Active';
      capabilities = [
        'Can place bets',
        'Can create guided markets'
      ];
    }
    
    res.json({
      address: address.toLowerCase(),
      reputation,
      accessLevel,
      accessLevelName,
      capabilities,
      joinedAt,
      lastActive
    });
    
  } catch (error) {
    console.error('Error fetching user reputation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user reputation history
router.get('/user/:address/history', async (req, res) => {
  try {
    const { address } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }
    
    const result = await db.query(`
      SELECT 
        action_type,
        reputation_delta,
        associated_value,
        pool_id,
        timestamp,
        block_number,
        transaction_hash
      FROM core.reputation_actions 
      WHERE user_address = $1 
      ORDER BY timestamp DESC 
      LIMIT $2 OFFSET $3
    `, [address.toLowerCase(), parseInt(limit), parseInt(offset)]);
    
    // Map action types to readable names
    const actionNames = {
      0: 'Pool Created',
      1: 'Pool Filled Above 60%',
      2: 'Pool Marked as Spam',
      3: 'Won High-Value Bet',
      4: 'Proposed Correct Outcome',
      5: 'Proposed Incorrect Outcome',
      6: 'Successful Challenge',
      7: 'Failed Challenge'
    };
    
    const history = result.rows.map(row => ({
      action: actionNames[row.action_type] || `Unknown Action (${row.action_type})`,
      actionType: row.action_type,
      reputationDelta: row.reputation_delta,
      associatedValue: row.associated_value,
      poolId: row.pool_id,
      timestamp: row.timestamp,
      blockNumber: row.block_number,
      transactionHash: row.transaction_hash
    }));
    
    res.json({
      address: address.toLowerCase(),
      history,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: result.rows.length === parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching reputation history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 