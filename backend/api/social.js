const express = require('express');
const router = express.Router();
const db = require('../db/db');
const badgeManager = require('../utils/badgeManager');
const { cache, cacheKeys, cacheMiddleware, rateLimitMiddleware } = require('../config/redis');

// =================================================================
//  POOL COMMENTS & DISCUSSIONS
// =================================================================

// Get comments for a specific pool
router.get('/pools/:poolId/comments', 
  cacheMiddleware((req) => cacheKeys.poolComments(req.params.poolId), 120), // Cache for 2 minutes
  async (req, res) => {
  try {
    const { poolId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(`
      SELECT 
        pc.*,
        u.reputation,
        ub.title as user_badge,
        ub.rarity as badge_rarity
      FROM core.pool_comments pc
      LEFT JOIN core.users u ON pc.user_address = u.address
      LEFT JOIN core.user_badges ub ON pc.user_address = ub.user_address 
        AND ub.is_active = true 
        AND ub.badge_category = 'reputation'
      WHERE pc.pool_id = $1 AND pc.is_deleted = false
      ORDER BY pc.is_pinned DESC, pc.likes_count DESC, pc.created_at DESC
      LIMIT $2 OFFSET $3
    `, [poolId, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: result.rows.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching pool comments:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch comments' });
  }
});

// Post a comment on a pool
router.post('/pools/:poolId/comments', 
  rateLimitMiddleware((req) => cacheKeys.rateLimitComment(req.body.userAddress), 5, 60), // 5 comments per minute
  async (req, res) => {
  try {
    const { poolId } = req.params;
    const { userAddress, content, sentiment = 'neutral', parentCommentId = null } = req.body;
    
    if (!userAddress || !content) {
      return res.status(400).json({ error: 'User address and content are required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      INSERT INTO core.pool_comments 
      (pool_id, user_address, content, sentiment, parent_comment_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [poolId, userAddress.toLowerCase(), content, sentiment, parentCommentId]);

    // Update user social stats
    await db.query(`
      INSERT INTO analytics.user_social_stats (user_address, total_comments)
      VALUES ($1, 1)
      ON CONFLICT (user_address) DO UPDATE SET 
        total_comments = analytics.user_social_stats.total_comments + 1,
        calculated_at = NOW()
    `, [userAddress.toLowerCase()]);

    // Check for badge eligibility
    badgeManager.checkAndAwardBadges(userAddress.toLowerCase());

    // Invalidate cache for this pool's comments
    await cache.del(cacheKeys.poolComments(poolId));
    await cache.del(cacheKeys.communityStats());

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error posting comment:', error);
    res.status(500).json({ success: false, error: 'Failed to post comment' });
  }
});

// =================================================================
//  COMMUNITY DISCUSSIONS
// =================================================================

// Get community discussions
router.get('/discussions', 
  cacheMiddleware((req) => cacheKeys.discussions(req.query.category, req.query.sort), 180), // Cache for 3 minutes
  async (req, res) => {
  try {
    const { category = 'all', limit = 20, offset = 0, sort = 'recent' } = req.query;
    
    let categoryFilter = '';
    let orderBy = 'cd.last_activity DESC';
    
    if (category !== 'all') {
      categoryFilter = 'AND cd.category = $4';
    }
    
    if (sort === 'popular') {
      orderBy = 'cd.total_likes DESC, cd.reply_count DESC';
    } else if (sort === 'oldest') {
      orderBy = 'cd.created_at ASC';
    }

    const params = [parseInt(limit), parseInt(offset)];
    if (category !== 'all') {
      params.push(category);
    }

    const result = await db.query(`
      SELECT 
        cd.*,
        u.reputation,
        ub.title as user_badge,
        ub.rarity as badge_rarity
      FROM core.community_discussions cd
      LEFT JOIN core.users u ON cd.user_address = u.address
      LEFT JOIN core.user_badges ub ON cd.user_address = ub.user_address 
        AND ub.is_active = true
      WHERE cd.is_deleted = false ${categoryFilter}
      ORDER BY ${orderBy}
      LIMIT $1 OFFSET $2
    `, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: result.rows.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching discussions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch discussions' });
  }
});

// Create a new discussion
router.post('/discussions', 
  rateLimitMiddleware((req) => cacheKeys.rateLimitDiscussion(req.body.userAddress), 3, 300), // 3 discussions per 5 minutes
  async (req, res) => {
  try {
    const { userAddress, title, content, category = 'general', tags = [] } = req.body;
    
    if (!userAddress || !title || !content) {
      return res.status(400).json({ error: 'User address, title, and content are required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      INSERT INTO core.community_discussions 
      (user_address, title, content, category, tags)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userAddress.toLowerCase(), title, content, category, tags]);

    // Invalidate relevant caches
    await cache.del(cacheKeys.discussions('all', 'recent'));
    await cache.del(cacheKeys.discussions(category, 'recent'));
    await cache.del(cacheKeys.communityStats());

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating discussion:', error);
    res.status(500).json({ success: false, error: 'Failed to create discussion' });
  }
});

// Get discussion replies
router.get('/discussions/:discussionId/replies', async (req, res) => {
  try {
    const { discussionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(`
      SELECT 
        dr.*,
        u.reputation,
        ub.title as user_badge,
        ub.rarity as badge_rarity
      FROM core.discussion_replies dr
      LEFT JOIN core.users u ON dr.user_address = u.address
      LEFT JOIN core.user_badges ub ON dr.user_address = ub.user_address 
        AND ub.is_active = true
      WHERE dr.discussion_id = $1 AND dr.is_deleted = false
      ORDER BY dr.likes_count DESC, dr.created_at ASC
      LIMIT $2 OFFSET $3
    `, [discussionId, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching discussion replies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch replies' });
  }
});

// =================================================================
//  SOCIAL REACTIONS (LIKES, VOTES)
// =================================================================

// Add or update a reaction
router.post('/reactions', async (req, res) => {
  try {
    const { userAddress, targetType, targetId, reactionType } = req.body;
    
    if (!userAddress || !targetType || !targetId || !reactionType) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    // Upsert reaction
    const result = await db.query(`
      INSERT INTO core.social_reactions 
      (user_address, target_type, target_id, reaction_type)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_address, target_type, target_id) 
      DO UPDATE SET 
        reaction_type = $4,
        created_at = NOW()
      RETURNING *
    `, [userAddress.toLowerCase(), targetType, targetId, reactionType]);

    // Update likes count on target
    if (targetType === 'comment') {
      await db.query(`
        UPDATE core.pool_comments 
        SET likes_count = (
          SELECT COUNT(*) FROM core.social_reactions 
          WHERE target_type = 'comment' AND target_id = $1 AND reaction_type = 'like'
        )
        WHERE id = $1
      `, [targetId]);
    } else if (targetType === 'discussion') {
      await db.query(`
        UPDATE core.community_discussions 
        SET total_likes = (
          SELECT COUNT(*) FROM core.social_reactions 
          WHERE target_type = 'discussion' AND target_id = $1 AND reaction_type = 'like'
        )
        WHERE id = $1
      `, [targetId]);
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ success: false, error: 'Failed to add reaction' });
  }
});

// Get reactions for a target
router.get('/reactions/:targetType/:targetId', async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    
    const result = await db.query(`
      SELECT 
        reaction_type,
        COUNT(*) as count
      FROM core.social_reactions 
      WHERE target_type = $1 AND target_id = $2
      GROUP BY reaction_type
    `, [targetType, targetId]);

    const reactions = {};
    result.rows.forEach(row => {
      reactions[row.reaction_type] = parseInt(row.count);
    });

    res.json({
      success: true,
      data: reactions
    });

  } catch (error) {
    console.error('Error fetching reactions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reactions' });
  }
});

// =================================================================
//  USER BADGES
// =================================================================

// Get user badges
router.get('/users/:address/badges', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      SELECT * FROM core.user_badges 
      WHERE user_address = $1 AND is_active = true
      ORDER BY 
        CASE rarity 
          WHEN 'legendary' THEN 1 
          WHEN 'epic' THEN 2 
          WHEN 'rare' THEN 3 
          WHEN 'uncommon' THEN 4 
          WHEN 'common' THEN 5 
        END,
        earned_at DESC
    `, [address.toLowerCase()]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching user badges:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch badges' });
  }
});

// Manually check badges for a user (admin endpoint)
router.post('/users/:address/check-badges', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    badgeManager.checkAndAwardBadges(address.toLowerCase());

    res.json({
      success: true,
      message: 'Badge check completed'
    });

  } catch (error) {
    console.error('Error checking badges:', error);
    res.status(500).json({ success: false, error: 'Failed to check badges' });
  }
});

// Get badge leaderboard
router.get('/badges/leaderboard', async (req, res) => {
  try {
    const result = await badgeManager.getBadgeLeaderboard();
    
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching badge leaderboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
});

// =================================================================
//  POST-MATCH REFLECTIONS
// =================================================================

// Get reflections for a pool
router.get('/pools/:poolId/reflections', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { limit = 20, offset = 0, publicOnly = 'true' } = req.query;
    
    let visibilityFilter = '';
    if (publicOnly === 'true') {
      visibilityFilter = 'AND pr.is_public = true';
    }

    const result = await db.query(`
      SELECT 
        pr.*,
        u.reputation,
        ub.title as user_badge,
        ub.rarity as badge_rarity
      FROM core.pool_reflections pr
      LEFT JOIN core.users u ON pr.user_address = u.address
      LEFT JOIN core.user_badges ub ON pr.user_address = ub.user_address 
        AND ub.is_active = true
      WHERE pr.pool_id = $1 ${visibilityFilter}
      ORDER BY pr.helpfulness_score DESC, pr.created_at DESC
      LIMIT $2 OFFSET $3
    `, [poolId, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching reflections:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reflections' });
  }
});

// Submit a post-match reflection
router.post('/pools/:poolId/reflections', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { 
      userAddress, 
      confidence, 
      wouldBetAgain, 
      lessonsLearned, 
      requestsAiAnalysis = false, 
      isPublic = false 
    } = req.body;
    
    if (!userAddress || confidence === undefined || wouldBetAgain === undefined) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    if (!userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      INSERT INTO core.pool_reflections 
      (pool_id, user_address, confidence, would_bet_again, lessons_learned, requests_ai_analysis, is_public)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (pool_id, user_address) 
      DO UPDATE SET 
        confidence = $3,
        would_bet_again = $4,
        lessons_learned = $5,
        requests_ai_analysis = $6,
        is_public = $7,
        created_at = NOW()
      RETURNING *
    `, [poolId, userAddress.toLowerCase(), confidence, wouldBetAgain, lessonsLearned, requestsAiAnalysis, isPublic]);

    // Update user social stats
    await db.query(`
      INSERT INTO analytics.user_social_stats (user_address, total_reflections)
      VALUES ($1, 1)
      ON CONFLICT (user_address) DO UPDATE SET 
        total_reflections = analytics.user_social_stats.total_reflections + 1,
        calculated_at = NOW()
    `, [userAddress.toLowerCase()]);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error submitting reflection:', error);
    res.status(500).json({ success: false, error: 'Failed to submit reflection' });
  }
});

// =================================================================
//  CHALLENGE SCORES & POOL METRICS
// =================================================================

// Get challenge score for a pool
router.get('/pools/:poolId/challenge-score', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    const result = await db.query(`
      SELECT * FROM analytics.pool_challenge_scores 
      WHERE pool_id = $1
    `, [poolId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge score not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching challenge score:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch challenge score' });
  }
});

// Calculate challenge score for a pool
router.post('/pools/:poolId/calculate-challenge-score', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    // Get pool data
    const poolResult = await db.query(`
      SELECT * FROM analytics.pools WHERE pool_id = $1
    `, [poolId]);

    if (poolResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolResult.rows[0];

    // Calculate creator win rate
    const creatorStats = await db.query(`
      SELECT 
        COUNT(*) as total_pools,
        COUNT(CASE WHEN creator_side_won = true THEN 1 END) as won_pools
      FROM analytics.pools 
      WHERE creator_address = $1 AND is_settled = true
    `, [pool.creator_address]);

    const creatorWinRate = creatorStats.rows[0].total_pools > 0 ? 
      creatorStats.rows[0].won_pools / creatorStats.rows[0].total_pools : 0;

    // Calculate quality score (0-100)
    let qualityScore = 0;
    qualityScore += Math.min(parseFloat(pool.creator_stake || 0) / 100, 20); // Up to 20 points for stake
    qualityScore += Math.min(pool.participant_count || 0, 30); // Up to 30 points for participants
    qualityScore += Math.min((pool.fill_percentage || 0) / 2, 50); // Up to 50 points for fill %

    // Calculate challenge score (0-100)
    let challengeScore = 0;
    challengeScore += creatorWinRate * 40; // 40 points for creator win rate
    challengeScore += Math.min((pool.odds || 0) / 10, 30); // Up to 30 points for odds difficulty
    challengeScore += Math.min(parseFloat(pool.creator_stake || 0) / 50, 30); // Up to 30 points for stake

    // Store the scores
    await db.query(`
      INSERT INTO analytics.pool_challenge_scores 
      (pool_id, creator_address, quality_score, challenge_score, creator_win_rate, calculated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (pool_id) DO UPDATE SET 
        quality_score = $3,
        challenge_score = $4,
        creator_win_rate = $5,
        calculated_at = NOW()
    `, [poolId, pool.creator_address, Math.round(qualityScore), Math.round(challengeScore), creatorWinRate]);

    res.json({
      success: true,
      data: {
        poolId,
        qualityScore: Math.round(qualityScore),
        challengeScore: Math.round(challengeScore),
        creatorWinRate: Math.round(creatorWinRate * 100)
      }
    });

  } catch (error) {
    console.error('Error calculating challenge score:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate challenge score' });
  }
});

// =================================================================
//  BITR REWARDS
// =================================================================

// Get BITR rewards for high-challenge pools (80+ challenge score)
router.get('/pools/:poolId/bitr-rewards', async (req, res) => {
  try {
    const { poolId } = req.params;
    
    const result = await db.query(`
      SELECT * FROM analytics.bitr_rewards 
      WHERE pool_id = $1
      ORDER BY earned_at DESC
    `, [poolId]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching BITR rewards:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch BITR rewards' });
  }
});

// Award BITR for participating in high-challenge pools
router.post('/pools/:poolId/award-bitr', async (req, res) => {
  try {
    const { poolId } = req.params;
    const { userAddress, rewardType, amount } = req.body;
    
    if (!userAddress || !rewardType || !amount) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if pool has high challenge score (80+)
    const challengeResult = await db.query(`
      SELECT challenge_score FROM analytics.pool_challenge_scores 
      WHERE pool_id = $1
    `, [poolId]);

    if (challengeResult.rows.length === 0 || challengeResult.rows[0].challenge_score < 80) {
      return res.status(400).json({ error: 'Pool does not qualify for BITR rewards' });
    }

    const result = await db.query(`
      INSERT INTO analytics.bitr_rewards 
      (pool_id, user_address, reward_type, amount)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [poolId, userAddress.toLowerCase(), rewardType, amount]);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error awarding BITR:', error);
    res.status(500).json({ success: false, error: 'Failed to award BITR' });
  }
});

// =================================================================
//  SOCIAL STATS & ANALYTICS
// =================================================================

// Get community stats for the hub
router.get('/community-stats', 
  cacheMiddleware(cacheKeys.communityStats, 300), // Cache for 5 minutes
  async (req, res) => {
  try {
    const [discussionsResult, membersResult, commentsResult, likesResult] = await Promise.all([
      // Active discussions (created in last 30 days)
      db.query(`
        SELECT COUNT(*) as count
        FROM core.community_discussions 
        WHERE created_at >= NOW() - INTERVAL '30 days' AND is_deleted = false
      `),
      
      // Unique community members (users who posted/commented)
      db.query(`
        SELECT COUNT(DISTINCT user_address) as count
        FROM (
          SELECT user_address FROM core.community_discussions WHERE is_deleted = false
          UNION
          SELECT user_address FROM core.pool_comments WHERE is_deleted = false
        ) combined
      `),
      
      // Total comments across all pools and discussions
      db.query(`
        SELECT 
          (SELECT COUNT(*) FROM core.pool_comments WHERE is_deleted = false) +
          (SELECT COUNT(*) FROM core.discussion_replies WHERE is_deleted = false) as count
      `),
      
      // Total likes across all content
      db.query(`
        SELECT COUNT(*) as count
        FROM core.social_reactions 
        WHERE reaction_type = 'like'
      `)
    ]);

    const stats = {
      activeDiscussions: parseInt(discussionsResult.rows[0]?.count || 0),
      communityMembers: parseInt(membersResult.rows[0]?.count || 0),
      totalComments: parseInt(commentsResult.rows[0]?.count || 0),
      totalLikes: parseInt(likesResult.rows[0]?.count || 0),
      weeklyActivity: Math.floor(Math.random() * 100) + 50 // Placeholder for now
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching community stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch community stats' });
  }
});

// Get user social stats
router.get('/users/:address/social-stats', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    const result = await db.query(`
      SELECT * FROM analytics.user_social_stats 
      WHERE user_address = $1
    `, [address.toLowerCase()]);

    res.json({
      success: true,
      data: result.rows[0] || {
        user_address: address.toLowerCase(),
        total_comments: 0,
        total_discussions: 0,
        total_likes_given: 0,
        total_likes_received: 0,
        total_reflections: 0,
        community_influence_score: 0,
        weekly_engagement_score: 0
      }
    });

  } catch (error) {
    console.error('Error fetching social stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch social stats' });
  }
});

// Get user social statistics
router.get('/users/:address/social-stats', async (req, res) => {
  try {
    const { address } = req.params;
    
    // Mock social stats - in production, query from database
    const socialStats = {
      total_comments: 25,
      total_likes_given: 150,
      total_likes_received: 89,
      total_reflections: 12,
      community_influence_score: 75,
      weekly_engagement_score: 45,
      favorite_discussion_category: 'crypto',
      last_social_activity: new Date(Date.now() - 3600000).toISOString()
    };

    res.json(socialStats);
  } catch (error) {
    console.error('Error fetching user social stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch social stats' });
  }
});

module.exports = router;
 