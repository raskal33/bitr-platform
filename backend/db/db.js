const { Pool } = require('pg');
const config = require('../config');

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      // Use DATABASE_URL for production (Neon.tech) or construct from individual vars for local dev
      const databaseUrl = process.env.DATABASE_URL;
      
      let poolConfig;
      
      if (databaseUrl) {
        // Production configuration (Neon.tech)
        poolConfig = {
          connectionString: databaseUrl,
          ssl: { rejectUnauthorized: false }, // Required for Neon.tech
          max: 10, // Increased for better performance
          idleTimeoutMillis: 300000, // 5 minutes
          connectionTimeoutMillis: 30000, // 30 seconds
          acquireTimeoutMillis: 30000, // 30 seconds
          // Add connection error handling
          onConnect: (client) => {
            client.on('error', (err) => {
              console.error('Database client error:', err);
            });
          }
        };
      } else {
        // Local development configuration
        poolConfig = {
          user: process.env.DB_USER || 'postgres',
          host: process.env.DB_HOST || 'localhost',
          database: process.env.DB_NAME || 'bitr_db',
          password: process.env.DB_PASSWORD || 'password',
          port: process.env.DB_PORT || 5432,
          ssl: false,
          max: 10, // Increased for better performance
          idleTimeoutMillis: 300000, // 5 minutes
          connectionTimeoutMillis: 30000, // 30 seconds
          acquireTimeoutMillis: 30000, // 30 seconds
          // Add connection error handling
          onConnect: (client) => {
            client.on('error', (err) => {
              console.error('Database client error:', err);
            });
          }
        };
      }

      this.pool = new Pool(poolConfig);
      
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      console.log('✅ Database connected successfully');
      
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('Database disconnected');
    }
  }

  async query(text, params = []) {
    if (!this.isConnected) {
      await this.connect();
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } catch (error) {
      console.error('❌ Database query error:', error);
      console.error('Query:', text);
      console.error('Params:', params);
      throw error;
    } finally {
      client.release();
    }
  }

  async transaction(callback) {
    if (!this.isConnected) {
      await this.connect();
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // User operations
  async createUser(address) {
    const query = `
      INSERT INTO core.users (address)
      VALUES ($1)
      ON CONFLICT (address) DO UPDATE SET last_active = NOW()
      RETURNING *
    `;
    const result = await this.query(query, [address]);
    return result.rows[0];
  }

  async getUser(address) {
    const query = 'SELECT * FROM core.users WHERE address = $1';
    const result = await this.query(query, [address]);
    return result.rows[0];
  }

  // Reputation operations
  async addReputationLog(userAddress, action, delta, refType = null, refId = null) {
    const query = `
      INSERT INTO core.reputation_actions (user_address, action, points, ref_type, ref_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await this.query(query, [userAddress, action, delta, refType, refId]);
    return result.rows[0];
  }

  async getUserReputation(userAddress) {
    const query = `
      SELECT COALESCE(SUM(points), 0) as total_reputation
      FROM core.reputation_actions
      WHERE user_address = $1
    `;
    const result = await this.query(query, [userAddress]);
    return parseInt(result.rows[0]?.total_reputation || 0);
  }

  // Oracle operations
  async saveMatch(matchId, homeTeam, awayTeam, matchTime, league) {
    const query = `
      INSERT INTO oracle.matches (match_id, home_team, away_team, match_time, league)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (match_id) DO UPDATE SET
        home_team = EXCLUDED.home_team,
        away_team = EXCLUDED.away_team,
        match_time = EXCLUDED.match_time,
        league = EXCLUDED.league
      RETURNING *
    `;
    const result = await this.query(query, [matchId, homeTeam, awayTeam, matchTime, league]);
    return result.rows[0];
  }

  async saveMatchResult(matchId, results) {
    const query = `
      INSERT INTO oracle.match_results (
        match_id, home_score, away_score, ht_home_score, ht_away_score,
        outcome_1x2, outcome_ou05, outcome_ou15, outcome_ou25, outcome_ou35,
        outcome_ht_result, outcome_btts, full_score, ht_score,
        state_id, result_info, finished_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (match_id) DO UPDATE SET
        home_score = EXCLUDED.home_score,
        away_score = EXCLUDED.away_score,
        ht_home_score = EXCLUDED.ht_home_score,
        ht_away_score = EXCLUDED.ht_away_score,
        outcome_1x2 = EXCLUDED.outcome_1x2,
        outcome_ou05 = EXCLUDED.outcome_ou05,
        outcome_ou15 = EXCLUDED.outcome_ou15,
        outcome_ou25 = EXCLUDED.outcome_ou25,
        outcome_ou35 = EXCLUDED.outcome_ou35,
        outcome_ht_result = EXCLUDED.outcome_ht_result,
        outcome_btts = EXCLUDED.outcome_btts,
        full_score = EXCLUDED.full_score,
        ht_score = EXCLUDED.ht_score,
        state_id = EXCLUDED.state_id,
        result_info = EXCLUDED.result_info,
        finished_at = EXCLUDED.finished_at,
        resolved_at = NOW()
      RETURNING *
    `;
    const params = [
      matchId,
      results.home_score,
      results.away_score,
      results.ht_home_score,
      results.ht_away_score,
      results.outcome_1x2,
      results.outcome_ou05,
      results.outcome_ou15,
      results.outcome_ou25,
      results.outcome_ou35,
      results.outcome_ht_result,
      results.outcome_btts,
      results.full_score,
      results.ht_score,
      results.state_id,
      results.result_info,
      results.finished_at
    ];
    const result = await this.query(query, params);
    return result.rows[0];
  }

  // Oddyssey operations
  async createDailyGame(gameDate, entryFee) {
    const query = `
      INSERT INTO oddyssey.daily_games (game_date, entry_fee)
      VALUES ($1, $2)
      ON CONFLICT (game_date) DO UPDATE SET entry_fee = EXCLUDED.entry_fee
      RETURNING *
    `;
    const result = await this.query(query, [gameDate, entryFee]);
    return result.rows[0];
  }

  async saveSlip(slipData) {
    return await this.transaction(async (client) => {
      // Insert slip
      const slipQuery = `
        INSERT INTO oddyssey.slips (user_address, game_date, total_odds)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const slipResult = await client.query(slipQuery, [
        slipData.user_address,
        slipData.game_date,
        slipData.total_odds
      ]);
      const slip = slipResult.rows[0];

      // Insert slip entries
      for (const entry of slipData.entries) {
        const entryQuery = `
          INSERT INTO oddyssey.slip_entries (
            slip_id, match_id, bet_type, selected_outcome, selected_odd
          ) VALUES ($1, $2, $3, $4, $5)
        `;
        await client.query(entryQuery, [
          slip.slip_id,
          entry.match_id,
          entry.bet_type,
          entry.selected_outcome,
          entry.selected_odd
        ]);
      }

      return slip;
    });
  }

  // Analytics queries
  async getDailyStats(date) {
    const query = `
      SELECT 
        COUNT(s.slip_id) as total_slips,
        COUNT(DISTINCT s.user_address) as unique_players,
        SUM(g.entry_fee) as total_volume,
        AVG(s.total_odds) as avg_odds
      FROM oddyssey.daily_games g
      LEFT JOIN oddyssey.slips s ON g.game_date = s.game_date
      WHERE g.game_date = $1
      GROUP BY g.game_date
    `;
    const result = await this.query(query, [date]);
    return result.rows[0];
  }

  async getLeaderboard(limit = 10) {
    const query = `
      SELECT 
        user_address,
        COUNT(slip_id) as total_slips,
        SUM(final_score) as total_score,
        AVG(correct_count) as avg_correct,
        MAX(total_odds) as highest_odds
      FROM oddyssey.slips
      WHERE is_evaluated = TRUE AND final_score > 0
      GROUP BY user_address
      ORDER BY total_score DESC
      LIMIT $1
    `;
    const result = await this.query(query, [limit]);
    return result.rows;
  }
}

// Export singleton instance
const db = new Database();
module.exports = db; 