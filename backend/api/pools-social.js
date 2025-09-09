const express = require('express');
const router = express.Router();

// GET /api/pools/trending - Get trending pools
router.get('/trending', async (req, res) => {
  try {
    const db = req.app.get('db');
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await db.query(`
      SELECT 
        p.*,
        COALESCE(pb.total_volume, 0) as volume,
        COALESCE(pb.bet_count, 0) as bet_count,
        COALESCE(pb.unique_bettors, 0) as unique_bettors,
        (COALESCE(pb.total_volume, 0) * 0.7 + COALESCE(pb.unique_bettors, 0) * 0.3) as trending_score
      FROM oracle.pools p
      LEFT JOIN (
        SELECT 
          pool_id,
          SUM(amount) as total_volume,
          COUNT(*) as bet_count,
          COUNT(DISTINCT bettor_address) as unique_bettors
        FROM oracle.pool_bets 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY pool_id
      ) pb ON p.pool_id = pb.pool_id
      WHERE p.status IN ('active', 'betting')
      ORDER BY trending_score DESC, p.created_at DESC
      LIMIT $1
    `, [limit]);
    
    res.json({
      success: true,
      pools: result.rows
    });
  } catch (error) {
    console.error('Error fetching trending pools:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending pools'
    });
  }
});

// GET /api/pools/featured - Get featured pools
router.get('/featured', async (req, res) => {
  try {
    const db = req.app.get('db');
    const limit = parseInt(req.query.limit) || 12;
    const includeSocial = req.query.include_social === 'true';
    
    let socialFields = '';
    let socialJoin = '';
    
    if (includeSocial) {
      socialFields = `, 
        COALESCE(pc.comment_count, 0) as comment_count,
        COALESCE(sr.reaction_count, 0) as reaction_count`;
      socialJoin = `
        LEFT JOIN (
          SELECT pool_id, COUNT(*) as comment_count
          FROM core.pool_comments
          GROUP BY pool_id
        ) pc ON p.pool_id = pc.pool_id
        LEFT JOIN (
          SELECT pool_id, COUNT(*) as reaction_count
          FROM core.social_reactions
          GROUP BY pool_id
        ) sr ON p.pool_id = sr.pool_id`;
    }
    
    const result = await db.query(`
      SELECT 
        p.*,
        COALESCE(pb.total_volume, 0) as volume,
        COALESCE(pb.bet_count, 0) as bet_count,
        COALESCE(pb.unique_bettors, 0) as unique_bettors
        ${socialFields}
      FROM oracle.pools p
      LEFT JOIN (
        SELECT 
          pool_id,
          SUM(amount) as total_volume,
          COUNT(*) as bet_count,
          COUNT(DISTINCT bettor_address) as unique_bettors
        FROM oracle.pool_bets 
        GROUP BY pool_id
      ) pb ON p.pool_id = pb.pool_id
      ${socialJoin}
      WHERE p.status IN ('active', 'betting', 'settled')
        AND p.is_featured = true
      ORDER BY p.created_at DESC
      LIMIT $1
    `, [limit]);
    
    res.json({
      success: true,
      pools: result.rows
    });
  } catch (error) {
    console.error('Error fetching featured pools:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch featured pools'
    });
  }
});

// GET /api/pools/:id/comments - Get pool comments
router.get('/:poolId/comments', async (req, res) => {
  try {
    const db = req.app.get('db');
    const { poolId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await db.query(`
      SELECT 
        pc.*,
        u.address as user_address,
        COALESCE(sr.like_count, 0) as like_count,
        COALESCE(sr.user_liked, false) as user_liked
      FROM core.pool_comments pc
      LEFT JOIN core.users u ON pc.user_id = u.id
      LEFT JOIN (
        SELECT 
          comment_id,
          COUNT(*) FILTER (WHERE reaction_type = 'like') as like_count,
          bool_or(user_address = $3) as user_liked
        FROM core.social_reactions
        WHERE reaction_type = 'like'
        GROUP BY comment_id
      ) sr ON pc.id = sr.comment_id
      WHERE pc.pool_id = $1
      ORDER BY pc.created_at DESC
      LIMIT $2 OFFSET $4
    `, [poolId, limit, req.query.user_address || '', offset]);
    
    res.json({
      success: true,
      comments: result.rows
    });
  } catch (error) {
    console.error('Error fetching pool comments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pool comments'
    });
  }
});

// POST /api/pools/:id/comments/:commentId/like - Like a comment
router.post('/:poolId/comments/:commentId/like', async (req, res) => {
  try {
    const db = req.app.get('db');
    const { poolId, commentId } = req.params;
    const { user_address } = req.body;
    
    if (!user_address) {
      return res.status(400).json({
        success: false,
        error: 'User address is required'
      });
    }
    
    // Check if already liked
    const existing = await db.query(`
      SELECT id FROM core.social_reactions
      WHERE comment_id = $1 AND user_address = $2 AND reaction_type = 'like'
    `, [commentId, user_address]);
    
    if (existing.rows.length > 0) {
      // Unlike
      await db.query(`
        DELETE FROM core.social_reactions
        WHERE comment_id = $1 AND user_address = $2 AND reaction_type = 'like'
      `, [commentId, user_address]);
      
      res.json({
        success: true,
        action: 'unliked'
      });
    } else {
      // Like
      await db.query(`
        INSERT INTO core.social_reactions (comment_id, user_address, reaction_type, pool_id)
        VALUES ($1, $2, 'like', $3)
      `, [commentId, user_address, poolId]);
      
      res.json({
        success: true,
        action: 'liked'
      });
    }
  } catch (error) {
    console.error('Error toggling comment like:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle comment like'
    });
  }
});

// POST /api/pools/notify-creation - Notify about pool creation
router.post('/notify-creation', async (req, res) => {
  try {
    const db = req.app.get('db');
    const { poolId, creator, title, category } = req.body;
    
    // Store notification
    await db.query(`
      INSERT INTO core.pool_creation_notifications (
        pool_id, creator_address, title, category, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [poolId, creator, title, category]);
    
    res.json({
      success: true,
      message: 'Pool creation notification stored'
    });
  } catch (error) {
    console.error('Error storing pool creation notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store notification'
    });
  }
});

module.exports = router;
