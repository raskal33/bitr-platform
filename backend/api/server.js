const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const { execSync } = require('child_process');
const config = require('../config');
const reputationRoutes = require('./reputation');
const matchesRoutes = require('./matches');
const AirdropEligibilityCalculator = require('../airdrop/eligibility_calculator');
const db = require('../db/monitored-db'); // Use monitored database wrapper
const analyticsRouter = require('./analytics');
const socialRouter = require('./social');
const adminRouter = require('./admin');

// Import health monitoring components
const healthMonitor = require('../services/health-monitor');
const LoggingMiddleware = require('../middleware/logging-middleware');
const healthRoutes = require('./health');

// Import the sync service
const ContractToDbSync = require('../sync-contract-matches-to-db.js');
const SchemaSyncBridge = require('../services/schema-sync-bridge');
const OddysseyDatabaseSetup = require('../db/oddyssey-setup.js');

// Import startup initializer
const StartupInitializer = require('../services/startup-initializer');

class BitredictAPI {
  constructor() {
    this.app = express();
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.startupInitializer = new StartupInitializer();
    this.setupMiddleware();
    this.setupRoutes();
  }

  async initializeServices() {
    try {
      // Initialize database schema first
      await this.initializeDatabase();
      
      // Initialize analytics tables
      await this.initializeAnalytics();
      
      // Then initialize airdrop services
      await this.initializeAirdropServices();
      
      // Initialize deployment startup sequence (fixtures + Oddyssey matches)
      await this.startupInitializer.checkAndInitialize();
      
      console.log('✅ All services initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize services:', error);
    }
  }

  async initializeDatabase() {
    try {
      console.log('🗄️ Initializing database schema...');
      
      // Only run basic database setup, not full initialization
      // Full initialization should be done by workers VM
      const db = require('../db/db');
      await db.connect();
      
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      // Don't throw - allow the app to continue
    }
  }

  async initializeAnalytics() {
    try {
      console.log('📊 Initializing analytics tables...');
      
      const { setupAnalyticsTables } = require('../db/analytics-setup');
      await setupAnalyticsTables();
      
      console.log('✅ Analytics tables initialized');
    } catch (error) {
      console.error('❌ Analytics initialization failed:', error);
      // Don't throw - allow the app to continue
    }
  }

  async initializeAirdropServices() {
    try {
      // Initialize airdrop eligibility calculator with required dependencies
      this.eligibilityCalculator = new AirdropEligibilityCalculator(db, null, this.provider);
      
      // Make calculator available to routes
      this.app.set('eligibilityCalculator', this.eligibilityCalculator);
      this.app.set('db', db);
      
      console.log('✅ Airdrop services initialized');
    } catch (error) {
      console.error('❌ Failed to initialize airdrop services:', error);
    }
  }

  setupMiddleware() {
    // Trust proxy for Fly.io - but be more specific
    this.app.set('trust proxy', 1);
    
    // Enhanced CORS with logging
    this.app.use(cors({
      ...config.api.cors,
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = config.api.cors.origin;
        console.log(`🌐 CORS check: Origin "${origin}" against allowed: [${allowedOrigins.join(', ')}]`);
        
        if (allowedOrigins.includes(origin)) {
          console.log(`✅ CORS: Origin "${origin}" allowed`);
          return callback(null, true);
        } else {
          console.log(`❌ CORS: Origin "${origin}" blocked`);
          return callback(new Error('Not allowed by CORS'), false);
        }
      }
    }));

    // Additional explicit OPTIONS handler for preflight requests
    this.app.options('*', (req, res) => {
      const origin = req.headers.origin;
      const allowedOrigins = config.api.cors.origin;
      
      console.log(`🔄 Preflight OPTIONS request from origin: ${origin}`);
      
      if (!origin || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
        res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,X-API-Key,Accept,Origin,Access-Control-Request-Method,Access-Control-Request-Headers');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Max-Age', '86400');
        console.log(`✅ Preflight response sent for origin: ${origin}`);
        return res.status(200).end();
      } else {
        console.log(`❌ Preflight blocked for origin: ${origin}`);
        return res.status(403).end();
      }
    });

    // Rate limiting with proper configuration
    const limiter = rateLimit({
      ...config.api.rateLimit,
      trustProxy: false // Disable trust proxy for rate limiting
    });
    this.app.use(limiter);

    // JSON parsing
    this.app.use(express.json());

    // Comprehensive request/response logging middleware
    this.app.use(LoggingMiddleware.requestResponseLogger);
    
    // Memory monitoring middleware with enhanced logging
    this.app.use((req, res, next) => {
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
        healthMonitor.logWarning('High memory usage detected', {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
          external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
          path: req.path,
          method: req.method
        });
      }
      next();
    });

    // Error handling middleware
    this.app.use((error, req, res, next) => {
      healthMonitor.logError('Unhandled middleware error', error, {
        path: req.path,
        method: req.method,
        requestId: req.requestId
      });
      next(error);
    });
  }

  setupRoutes() {
    // Admin routes (protected with admin key)
    this.app.use('/api/admin', adminRouter);
    
    // Comprehensive health monitoring routes
    this.app.use('/api/health', healthRoutes);
    
    // Legacy health check (keep for backward compatibility)
    this.app.get('/health', async (req, res) => {
      try {
        const health = await healthMonitor.getComprehensiveHealthStatus();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        healthMonitor.logError('Legacy health endpoint failed', error);
        res.status(500).json({ status: 'error', message: error.message });
      }
    });

    // Startup initialization status endpoint
    this.app.get('/startup-status', (req, res) => {
      res.json({
        ...this.startupInitializer.getStatus(),
        service: 'bitredict-api'
      });
    });

    // Pool routes - handled by modular pools.js router
    this.app.get('/api/pools', this.getPools.bind(this));
    this.app.get('/api/pools/:id/user-bet', this.getUserBetStatus.bind(this));

    // User routes
    this.app.get('/api/users/:address', this.getUserProfile.bind(this));
    this.app.get('/api/users/:address/bets', this.getUserBets.bind(this));
    this.app.get('/api/users/:address/pools', this.getUserPools.bind(this));

    // Market routes
    this.app.get('/api/markets', this.getMarkets.bind(this));
    this.app.get('/api/markets/:marketId', this.getMarket.bind(this));

    // Analytics routes
    this.app.get('/api/analytics/overview', this.getAnalyticsOverview.bind(this));
    this.app.get('/api/analytics/categories', this.getCategoryStats.bind(this));
    this.app.get('/api/analytics/volume', this.getVolumeStats.bind(this));

    // Oracle routes
    this.app.get('/api/oracles/status', this.getOracleStatus.bind(this));
    this.app.get('/api/oracles/markets', this.getOracleMarkets.bind(this));

    // Admin routes
    this.app.post('/api/admin/populate-fixtures', this.populateFixtures.bind(this));
    this.app.post('/api/admin/populate-guided-markets', this.populateGuidedMarkets.bind(this));
    this.app.post('/api/admin/setup-database', this.setupDatabase.bind(this));
    this.app.post('/api/admin/setup-missing-schemas', this.setupMissingSchemas.bind(this));
    this.app.post('/api/admin/trigger-oddyssey-cycle', this.triggerOddysseyCycle.bind(this));
    this.app.post('/api/admin/select-oddyssey-matches', this.selectOddysseyMatches.bind(this));
    this.app.post('/api/admin/fetch-7day-fixtures', this.fetch7DayFixtures.bind(this));
    this.app.post('/api/admin/fetch-oddyssey-results', this.fetchOddysseyResults.bind(this));
    this.app.post('/api/admin/resolve-oddyssey-cycles', this.resolveOddysseyCycles.bind(this));
    this.app.post('/api/admin/fetch-general-results', this.fetchGeneralResults.bind(this));
    this.app.post('/api/admin/fetch-and-select-oddyssey', this.fetchAndSelectOddyssey.bind(this));
    this.app.post('/api/admin/fetch-and-select-oddyssey-tomorrow', this.fetchAndSelectOddysseyTomorrow.bind(this));
    this.app.post('/api/admin/sync-schemas', this.syncSchemas.bind(this));
    this.app.get('/api/admin/sync-status', this.getSyncStatus.bind(this));
    this.app.get('/api/admin/check-tables', this.checkTables.bind(this));
    this.app.post('/api/admin/trigger-crypto-price-update', this.triggerCryptoPriceUpdate.bind(this));
    this.app.get('/api/admin/test', (req, res) => {
      res.json({ success: true, message: 'Admin endpoint working' });
    });
    this.app.post('/api/admin/test-oddyssey-resolution', this.testOddysseyResolution.bind(this));
    this.app.post('/api/admin/update-fixture-status', this.updateFixtureStatus.bind(this));

    // Reputation routes
    this.app.use('/api/reputation', reputationRoutes);
    
    // Analytics routes
    this.app.use('/api/analytics', analyticsRouter);

    // Matches routes
    this.app.use('/api/matches', matchesRoutes);
    
    // Fixtures routes (SportMonks integration)
    this.app.use('/api/fixtures', require('./fixtures'));
    
    // Crypto routes (Coinpaprika integration)
    this.app.use('/api/crypto', require('./crypto'));
    
    // Pools routes (new optimized endpoints)
    this.app.use('/api/pools', require('./pools'));
    this.app.use('/api/pools', require('./pools-social')); // Social pool features

    // Airdrop routes (NEW)
    this.app.use('/api/airdrop', require('./airdrop'));
    
    // Faucet routes (NEW)
    this.app.use('/api/faucet', require('./faucet'));

    // Terms routes (NEW)
    this.app.use('/api/terms', require('./terms'));

    // Staking routes (NEW)
    this.app.use('/api/staking', require('./staking'));

    // Social routes
    this.app.use('/api/social', socialRouter);

    // Oddyssey routes
    this.app.use('/api/oddyssey', require('./oddyssey'));

    // Guided markets routes
    this.app.use('/api/guided-markets', require('./guided-markets'));

    // User routes
    this.app.use('/api/users', require('./users'));

    // Monitoring dashboard routes (comprehensive health monitoring)
    this.app.use('/api/monitoring', require('./monitoring-dashboard'));
    
    // Cycle monitoring routes
    this.app.use('/api/cycle-monitoring', require('./cycle-monitoring'));

    // Error handling
    this.app.use(this.errorHandler.bind(this));
  }

  // Pool endpoints
  async getPools(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status = 'all',
        category = 'all',
        creator = null,
        sort = 'createdAt',
        order = 'desc'
      } = req.query;

      // In a real implementation, this would query your database
      // For now, we'll simulate the response structure
      const pools = await this.queryPools({
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        category,
        creator,
        sort,
        order
      });

      res.json({
        success: true,
        data: pools,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: pools.total || 0
        }
      });
    } catch (error) {
      console.error('Error fetching pools:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch pools' });
    }
  }





  // User endpoints
  async getUserProfile(req, res) {
    try {
      const { address } = req.params;
      
      const profile = await this.getUserProfileData(address);

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch user profile' });
    }
  }

  async getUserBets(req, res) {
    try {
      const { address } = req.params;
      const { page = 1, limit = 20, status = 'all' } = req.query;

      const bets = await this.queryUserBets(address, {
        page: parseInt(page),
        limit: parseInt(limit),
        status
      });

      res.json({
        success: true,
        data: bets
      });
    } catch (error) {
      console.error('Error fetching user bets:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch user bets' });
    }
  }

  async getUserPools(req, res) {
    try {
      const { address } = req.params;
      const { page = 1, limit = 20, status = 'all' } = req.query;

      const pools = await this.queryUserPools(address, {
        page: parseInt(page),
        limit: parseInt(limit),
        status
      });

      res.json({
        success: true,
        data: pools
      });
    } catch (error) {
      console.error('Error fetching user pools:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch user pools' });
    }
  }

  // Market endpoints
  async getMarkets(req, res) {
    try {
      // In a real implementation, this would query your database
      // For now, return mock data structure
      const markets = await this.queryMarkets();
      res.json({
        success: true,
        data: markets
      });
    } catch (error) {
      console.error('Error fetching markets:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch markets' });
    }
  }

  async getMarket(req, res) {
    try {
      const { marketId } = req.params;
      
      // Query blockchain for current market state
      const marketData = await this.getMarketFromBlockchain(marketId);
      
      if (!marketData) {
        return res.status(404).json({ success: false, error: 'Market not found' });
      }

      res.json({
        success: true,
        data: marketData
      });
    } catch (error) {
      console.error('Error fetching market:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch market' });
    }
  }

  // Analytics endpoints
  async getAnalyticsOverview(req, res) {
    try {
      const overview = await this.calculateOverviewStats();

      res.json({
        success: true,
        data: overview
      });
    } catch (error) {
      console.error('Error fetching analytics overview:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    }
  }

  async getCategoryStats(req, res) {
    try {
      const stats = await this.calculateCategoryStats();
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching category stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch category stats' });
    }
  }

  async getVolumeStats(req, res) {
    try {
      const { timeframe = '7d' } = req.query;
      const stats = await this.calculateVolumeStats(timeframe);
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching volume stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch volume stats' });
    }
  }

  // Oracle endpoints
  async getOracleStatus(req, res) {
    try {
      const status = await this.getOracleSystemStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error fetching oracle status:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch oracle status' });
    }
  }

  // Admin endpoints
  async setupDatabase(req, res) {
    try {
      const fs = require('fs');
      const path = require('path');
      const { Pool } = require('pg');
      
      // Database connection
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      console.log('🚀 Setting up database schema...');
      
      const client = await pool.connect();
      console.log('✅ Database connected');

      // Run fixtures schema
      const schemaPath = path.join(__dirname, '../db/fixtures_schema.sql');
      const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
      
      await client.query(schemaSQL);
      console.log('✅ Fixtures schema created');

      client.release();
      await pool.end();

      res.json({
        success: true,
        message: 'Database schema setup completed successfully'
      });
    } catch (error) {
      console.error('Error setting up database:', error);
      res.status(500).json({ success: false, error: 'Failed to setup database: ' + error.message });
    }
  }

    async populateFixtures(req, res) {
    try {
      // ⚠️ CRITICAL: This endpoint should ONLY be used by cron jobs or admin
      // Frontend should NEVER call this endpoint to avoid memory crashes
      console.log('⚠️ WARNING: populateFixtures called - should only be used by cron jobs!');
      
      // Check if this is from admin or cron (not frontend)
      const userAgent = req.get('User-Agent') || '';
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      const isCronRequest = userAgent.includes('node') || userAgent.includes('curl');
      
      if (!isAdminRequest && !isCronRequest) {
        console.log('🚫 Rejecting populateFixtures request from frontend to prevent memory crash');
        return res.status(403).json({
          success: false,
          error: 'This endpoint is for admin/cron use only. Frontend should fetch from /api/oddyssey/matches'
        });
      }
      
      console.log('🚀 Starting REAL fixtures population from SportMonks API...');
      
      // Import required services
      const SportMonksService = require('../services/sportmonks');
      const sportmonksService = new SportMonksService();
      
      // Clear existing fixtures (optional, based on req.query.clear)
      if (req.query.clear === 'true') {
        console.log('🧹 Clearing existing fixtures for fresh population...');
        await db.query('DELETE FROM oracle.fixture_odds');
        await db.query('DELETE FROM oracle.fixtures');
        console.log('✅ Cleared old fixtures and odds');
      }
      
      // Fetch 7-day fixtures for guided markets
      console.log('🔄 Fetching 7-day fixtures from SportMonks API for Guided Markets...');
      const guidedResult = await sportmonksService.fetchAndSaveFixtures();
      console.log(`✅ Fetched fixtures for 7 days for Guided Markets`);
      
      // The 7-day fetch already includes 1-day fixtures, so we don't need a separate call
      // The counting logic below will separate Oddyssey (1-day) from Guided Markets (7-day)
      console.log('🔄 7-day fixtures include both Oddyssey (1-day) and Guided Markets (7-day) fixtures');
      
      // ⚠️ REMOVED: No more fallback mock data generation to prevent memory issues
      if (!guidedResult) {
        console.warn('⚠️ SportMonks API failed - no fallback data generated');
        return res.status(500).json({
          success: false,
          error: 'SportMonks API failed and no fallback data available'
        });
      }
      
      // Get final summary from database
      const fixtureCount = await db.query('SELECT COUNT(*) FROM oracle.fixtures');
      const oddsCount = await db.query('SELECT COUNT(*) FROM oracle.fixture_odds');
      const leagueCount = await db.query('SELECT COUNT(*) FROM oracle.leagues');
      
      // Count Oddyssey fixtures (same day only)
      const today = new Date().toISOString().split('T')[0];
      
      const oddysseyFixturesCount = await db.query(
        `SELECT COUNT(*) FROM oracle.fixtures 
         WHERE DATE(match_date) = $1`,
        [today]
      );
      
      // Count guided market fixtures (days 2-7, beyond today)
      const guidedFixturesCount = await db.query(
        `SELECT COUNT(*) FROM oracle.fixtures 
         WHERE DATE(match_date) > $1 AND DATE(match_date) <= $2`,
        [today, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]]
      );

      console.log(`
📊 COMPLETE Database Summary:
   • Leagues: ${leagueCount.rows[0].count}
   • Total Fixtures: ${fixtureCount.rows[0].count}
   • Oddyssey Fixtures (1-day): ${oddysseyFixturesCount.rows[0].count}
   • Guided Market Fixtures (7-day): ${guidedFixturesCount.rows[0].count}
   • Total Odds: ${oddsCount.rows[0].count}
`);

      res.json({
        success: true,
        message: 'All fixtures populated successfully (Oddyssey + Guided Markets)',
        data: {
          leagues: parseInt(leagueCount.rows[0].count),
          total_fixtures: parseInt(fixtureCount.rows[0].count),
          oddyssey_fixtures: parseInt(oddysseyFixturesCount.rows[0].count),
          guided_market_fixtures: parseInt(guidedFixturesCount.rows[0].count),
          total_odds: parseInt(oddsCount.rows[0].count)
        }
      });
    } catch (error) {
      console.error('Error populating fixtures:', error);
      res.status(500).json({ success: false, error: 'Failed to populate fixtures: ' + error.message });
    }
  }

  async populateGuidedMarkets(req, res) {
    try {
      const { Pool } = require('pg');
      
      // Database connection
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });

      console.log('🚀 Starting GUIDED MARKETS fixtures population (hundreds of matches)...');
      
      // Test database connection
      const client = await pool.connect();
      console.log('✅ Database connected successfully');

      // Insert comprehensive fixtures for GUIDED MARKETS
      const fixtures = [];
      let fixtureId = 2000; // Start from 2000 to avoid conflicts with Oddyssey
      
      // Define all teams for different leagues
      const allTeams = {
        8: [ // Premier League
          'Manchester United', 'Liverpool', 'Arsenal', 'Chelsea', 'Manchester City', 'Tottenham',
          'Newcastle', 'Brighton', 'Aston Villa', 'West Ham', 'Crystal Palace', 'Wolves',
          'Everton', 'Brentford', 'Fulham', 'Nottingham Forest', 'Sheffield United', 'Burnley',
          'Luton Town', 'AFC Bournemouth'
        ],
        564: [ // La Liga
          'Barcelona', 'Real Madrid', 'Atletico Madrid', 'Sevilla', 'Real Sociedad', 'Athletic Bilbao',
          'Valencia', 'Villarreal', 'Real Betis', 'Osasuna', 'Celta Vigo', 'Getafe',
          'Las Palmas', 'Girona', 'Cadiz', 'Mallorca', 'Rayo Vallecano', 'Alaves'
        ],
        82: [ // Bundesliga
          'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen', 'Frankfurt',
          'Wolfsburg', 'Freiburg', 'Union Berlin', 'Werder Bremen', 'Borussia Monchengladbach',
          'Augsburg', 'Hoffenheim', 'Mainz', 'Cologne', 'VfL Bochum', 'Heidenheim'
        ],
        301: [ // Serie A
          'Juventus', 'AC Milan', 'Inter Milan', 'Napoli', 'Roma', 'Lazio',
          'Atalanta', 'Fiorentina', 'Bologna', 'Torino', 'Udinese', 'Sassuolo',
          'Genoa', 'Lecce', 'Cagliari', 'Empoli', 'Verona', 'Salernitana'
        ],
        501: [ // Ligue 1
          'PSG', 'Marseille', 'Lyon', 'Monaco', 'Nice', 'Lille',
          'Rennes', 'Lens', 'Toulouse', 'Montpellier', 'Nantes', 'Strasbourg',
          'Brest', 'Reims', 'Le Havre', 'Clermont', 'Metz', 'Lorient'
        ]
      };
      
      // Generate matches for next 30 days (for guided markets)
      for (let day = 0; day < 30; day++) {
        const matchDate = new Date(Date.now() + (day * 24 * 60 * 60 * 1000) + (12 * 60 * 60 * 1000));
        
        // 5-8 matches per day across all leagues
        const matchesPerDay = 5 + Math.floor(Math.random() * 4);
        
        for (let match = 0; match < matchesPerDay; match++) {
          // Cycle through leagues
          const leagueIds = Object.keys(allTeams);
          const league_id = parseInt(leagueIds[match % leagueIds.length]);
          const teams = allTeams[league_id];
          
          // Pick different teams
          const homeTeam = teams[Math.floor(Math.random() * teams.length)];
          let awayTeam = teams[Math.floor(Math.random() * teams.length)];
          
          // Ensure different teams
          while (awayTeam === homeTeam) {
            awayTeam = teams[Math.floor(Math.random() * teams.length)];
          }
          
          fixtures.push({
            fixture_id: fixtureId++,
            league_id,
            home_team: homeTeam,
            away_team: awayTeam,
            match_date: new Date(matchDate.getTime() + (match * 2 * 60 * 60 * 1000)), // 2 hour intervals
            status: 'NS'
          });
        }
      }

      // Insert all guided market fixtures
      for (const fixture of fixtures) {
        const fixtureName = `${fixture.home_team} vs ${fixture.away_team}`;
        console.log(`Inserting fixture: ${fixture.fixture_id} - ${fixtureName}`);
        
        await client.query(`
          INSERT INTO oracle.fixtures (id, name, league_id, home_team, away_team, match_date, status) 
          VALUES ($1, $2, $3, $4, $5, $6, $7) 
          ON CONFLICT (id) DO NOTHING
        `, [fixture.fixture_id, fixtureName, fixture.league_id, fixture.home_team, fixture.away_team, fixture.match_date, fixture.status]);
      }
      console.log(`✅ Inserted ${fixtures.length} Guided Market fixtures`);

      // Generate realistic odds for all guided market fixtures
      const odds = [];
      fixtures.forEach(fixture => {
        // Generate realistic odds for different markets
        const markets = [
          { market_id: 1, label: '1X2', value: { home: 1.5 + Math.random() * 2.5, draw: 2.8 + Math.random() * 1.4, away: 1.5 + Math.random() * 2.5 } },
          { market_id: 2, label: 'Over/Under 2.5', value: { over: 1.6 + Math.random() * 0.6, under: 1.6 + Math.random() * 0.6 } },
          { market_id: 3, label: 'Both Teams to Score', value: { yes: 1.5 + Math.random() * 0.8, no: 1.5 + Math.random() * 0.8 } }
        ];
        
        markets.forEach(market => {
          odds.push({
            fixture_id: fixture.fixture_id,
            bookmaker_id: 1, // Default bookmaker
            market_id: market.market_id,
            label: market.label,
            value: market.value
          });
        });
      });

      // Insert all odds
      for (const odd of odds) {
        await client.query(`
          INSERT INTO oracle.fixture_odds (fixture_id, bookmaker_id, market_id, label, value) 
          VALUES ($1, $2, $3, $4, $5) 
          ON CONFLICT (fixture_id, bookmaker_id, market_id, label) DO NOTHING
        `, [odd.fixture_id, odd.bookmaker_id, odd.market_id, odd.label, JSON.stringify(odd.value)]);
      }
      console.log(`✅ Inserted ${odds.length} Guided Market odds records`);

      // Get final summary
      const totalFixtures = await client.query('SELECT COUNT(*) FROM oracle.fixtures');
      const totalOdds = await client.query('SELECT COUNT(*) FROM oracle.fixture_odds');

      console.log(`
📊 TOTAL Database Summary:
   • Total Fixtures: ${totalFixtures.rows[0].count} (Oddyssey + Guided Markets)
   • Total Odds: ${totalOdds.rows[0].count}
   • Guided Market Fixtures: ${fixtures.length}
`);

      client.release();
      await pool.end();

      res.json({
        success: true,
        message: 'Guided Markets fixtures populated successfully',
        data: {
          guided_fixtures: fixtures.length,
          guided_odds: odds.length,
          total_fixtures: parseInt(totalFixtures.rows[0].count),
          total_odds: parseInt(totalOdds.rows[0].count)
        }
      });
    } catch (error) {
      console.error('Error populating Guided Market fixtures:', error);
      res.status(500).json({ success: false, error: 'Failed to populate Guided Market fixtures: ' + error.message });
    }
  }

  async getOracleMarkets(req, res) {
    try {
      const markets = await this.getActiveOracleMarkets();
      res.json({
        success: true,
        data: markets
      });
    } catch (error) {
      console.error('Error fetching oracle markets:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch oracle markets' });
    }
  }

  // Helper methods for blockchain queries
  async getPoolFromBlockchain(poolId) {
    try {
      // This would use your contract to get pool data
      // For now, return mock data structure
      return {
        poolId,
        title: "Sample Pool",
        creator: "0x...",
        deadline: new Date(Date.now() + 86400000).toISOString(),
        totalBets: "1000",
        totalYes: "600",
        totalNo: "400",
        status: "active",
        category: "sports",
        oracleType: "GUIDED",
        marketId: "0x..."
      };
    } catch (error) {
      console.error('Error querying blockchain for pool:', error);
      return null;
    }
  }

  async queryPools(options) {
    // Implement database query based on your chosen database
    // This is a mock implementation
    return {
      pools: [],
      total: 0
    };
  }

  async queryPoolBets(poolId, options) {
    // Implement database query
    return {
      bets: [],
      total: 0
    };
  }

  async calculatePoolStats(poolId) {
    // Calculate statistics for a specific pool
    return {
      totalVolume: "0",
      totalBettors: 0,
      yesPercentage: 0,
      noPercentage: 0,
      avgBetSize: "0",
      lastBetTime: null
    };
  }

  async getUserProfileData(address) {
    // Get user profile data
    return {
      address,
      totalBets: 0,
      totalVolume: "0",
      winRate: 0,
      poolsCreated: 0,
      joinedAt: new Date().toISOString()
    };
  }

  async queryUserBets(address, options) {
    // Get user bets
    return {
      bets: [],
      total: 0
    };
  }

  async getUserBetStatus(req, res) {
    try {
      const { id: poolId } = req.params;
      const { address } = req.query;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: 'User address is required'
        });
      }

      if (!poolId || isNaN(poolId)) {
        return res.status(400).json({
          success: false,
          error: 'Valid pool ID is required'
        });
      }

      // Query the database for user bets on this pool
      const db = require('../db/db');
      const result = await db.query(`
        SELECT 
          COALESCE(SUM(amount), 0) as total_bet_amount,
          COUNT(*) as bet_count,
          MAX(created_at) as last_bet_date
        FROM oracle.pool_bets 
        WHERE pool_id = $1 AND user_address = $2
      `, [poolId, address]);

      const hasBet = result.rows.length > 0 && result.rows[0].bet_count > 0;
      const betData = result.rows[0] || {};

      res.json({
        success: true,
        data: {
          hasBet,
          betAmount: hasBet ? parseFloat(betData.total_bet_amount || 0) : 0,
          betCount: hasBet ? parseInt(betData.bet_count || 0) : 0,
          lastBetDate: hasBet ? betData.last_bet_date : null
        }
      });

    } catch (error) {
      console.error('❌ Error getting user bet status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user bet status'
      });
    }
  }

  async queryUserPools(address, options) {
    // Get user pools
    return {
      pools: [],
      total: 0
    };
  }

  async calculateOverviewStats() {
    // Calculate platform-wide statistics
    return {
      totalPools: 0,
      totalVolume: "0",
      totalBettors: 0,
      activePools: 0,
      settledPools: 0,
      avgPoolSize: "0"
    };
  }

  async calculateCategoryStats() {
    // Calculate statistics by category
    return {
      sports: { pools: 0, volume: "0" },
      crypto: { pools: 0, volume: "0" },
      politics: { pools: 0, volume: "0" },
      entertainment: { pools: 0, volume: "0" }
    };
  }

  async calculateVolumeStats(timeframe) {
    // Calculate volume statistics over time
    return {
      timeframe,
      totalVolume: "0",
      volumeData: [],
      growth: 0
    };
  }

  async getOracleSystemStatus() {
    // Get oracle system status
    return {
      guidedOracle: { active: true, lastUpdate: new Date().toISOString() },
      optimisticOracle: { active: true, lastUpdate: new Date().toISOString() },
      totalMarkets: 0,
      pendingResolutions: 0
    };
  }

  async getActiveOracleMarkets() {
    // Get markets pending oracle resolution
    return {
      markets: [],
      total: 0
    };
  }

  async queryMarkets() {
    // Query all markets
    return {
      markets: [],
      total: 0
    };
  }

  async getMarketFromBlockchain(marketId) {
    // Get market data from blockchain
    return {
      marketId,
      title: "Sample Market",
      status: "active",
      outcomes: [],
      totalVolume: "0"
    };
  }

  errorHandler(error, req, res, next) {
    console.error('API Error:', error);
    
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }

  async start() {
    try {
      // Initialize services
    await this.initializeServices();
    
      // Start server
      const port = process.env.PORT || 3000;
      this.server = this.app.listen(port, async () => {
        console.log(`🚀 Bitredict API server running on port ${port}`);
        
        // Initialize database setup and sync after server starts
        await initializeDatabase();
        
        // Start synchronized cron job manager
        setTimeout(async () => {
          try {
            console.log('🔄 Starting synchronized cron job manager...');
            
            const cronSyncManager = require('../cron-sync-manager');
            await cronSyncManager.start();
            console.log('✅ Cron job synchronization completed');
            
          } catch (error) {
            console.error('❌ Error starting cron job synchronization:', error.message);
            // Don't crash the server for cron errors
          }
        }, 5000); // Wait 5 seconds after startup
      });

      // DISABLED: Auto-start to prevent memory crashes and infinite loops
      // Will be re-enabled once memory issues are resolved
      /*
      setTimeout(async () => {
        try {
          console.log('🔄 Auto-running fixture fetch on startup...');
          const SportMonksService = require('../services/sportmonks');
          const sportmonksService = new SportMonksService();
          
          // Check if API token is available
          if (!process.env.SPORTMONKS_API_TOKEN) {
            console.log('⚠️ SPORTMONKS_API_TOKEN not set, skipping auto-fetch');
            return;
          }
          
          // Fetch fixtures for the next 7 days (serves both guided markets and oddyssey)
          console.log('📅 Fetching real fixtures from SportMonks API...');
          await sportmonksService.fetchAndSaveFixtures();
          console.log('✅ Initial fixture fetch completed successfully (7 days for both services)');
          
          // Get oddyssey fixtures from existing 7-day data
          const oddysseyFixtures = await sportmonksService.fetchOddysseyFixtures();
          console.log(`✅ Retrieved ${oddysseyFixtures.length} fixtures for oddyssey from 7-day data`);
          
          // Start the Oddyssey scheduler (with error handling)
          try {
            const oddysseyScheduler = require('../cron/oddyssey-scheduler');
            await oddysseyScheduler.start();
            console.log('✅ Oddyssey scheduler started automatically');
          } catch (schedulerError) {
            console.error('❌ Error starting Oddyssey scheduler:', schedulerError.message);
            // Don't crash the server for scheduler errors
          }
          
          // Start the fixtures scheduler (with error handling) - BUT skip initial check to prevent double fetch
          try {
            const fixturesScheduler = require('../cron/fixtures-scheduler');
            // Skip the initial fixture check since we just fetched fixtures
            fixturesScheduler.skipInitialCheck = true;
            await fixturesScheduler.start();
            console.log('✅ Fixtures scheduler started automatically (skipped initial check)');
          } catch (schedulerError) {
            console.error('❌ Error starting fixtures scheduler:', schedulerError.message);
            // Don't crash the server for scheduler errors
          }
          
        } catch (error) {
          console.error('❌ Error in auto-fetch on startup:', error.message);
          // Non-critical error, don't crash the server
        }
      }, 10000); // Wait 10 seconds after startup to avoid overwhelming the system
      */

      return this.server;
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      throw error;
    }
  }

  async setupMissingSchemas(req, res) {
    try {
      console.log('🔧 Setting up missing database schemas...');
      
      const setupSchemas = require('../scripts/remote-setup-schemas');
      await setupSchemas();
      
      console.log('✅ Missing schemas setup completed successfully!');
      
      res.json({
        success: true,
        message: 'Missing database schemas set up successfully',
        tables_created: ['crypto_coins', 'crypto_price_snapshots', 'crypto_prediction_markets', 'oddyssey_cycles', 'oddyssey_slips', 'football_prediction_markets', 'football_resolution_logs', 'fixture_results']
      });
      
    } catch (error) {
      console.error('❌ Error setting up missing schemas:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async triggerOddysseyCycle(req, res) {
    try {
      console.log('🎯 Manually triggering Oddyssey cycle creation...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }
      
      const OddysseyManager = require('../services/oddyssey-manager');
      const oddysseyManager = new OddysseyManager();
      
      await oddysseyManager.initialize();
      const result = await oddysseyManager.startDailyCycle();
      
      console.log('✅ Manual Oddyssey cycle creation completed:', result);
      
      res.json({
        success: true,
        message: 'Oddyssey cycle created successfully',
        cycle_data: result
      });
      
    } catch (error) {
      console.error('❌ Error triggering Oddyssey cycle:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async selectOddysseyMatches(req, res) {
    try {
      console.log('🎯 Manually selecting Oddyssey matches for current date...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }

      const db = require('../db/db');
      const today = new Date().toISOString().split('T')[0];
      
      // Check if Oddyssey matches already exist for today
      console.log(`🔍 Checking for existing Oddyssey matches for ${today}...`);
      const existingMatches = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.daily_game_matches 
        WHERE game_date = $1
      `, [today]);
      
      const existingCount = parseInt(existingMatches.rows[0].count);
      if (existingCount > 0) {
        console.log(`✅ Oddyssey matches already exist for ${today} (${existingCount} matches)`);
        return res.json({
          success: true,
          message: 'Oddyssey matches already exist for today',
          data: {
            existing_matches: existingCount,
            game_date: today
          }
        });
      }

      // Select new Oddyssey matches
      console.log('🎯 Selecting Oddyssey matches for today...');
      const OddysseyMatchSelector = require('../services/oddyssey-match-selector');
      const oddysseySelector = new OddysseyMatchSelector();
      
      const selections = await oddysseySelector.selectDailyMatches();
      if (!selections || !selections.selectedMatches || selections.selectedMatches.length === 0) {
        console.warn('⚠️ No Oddyssey matches available for selection');
        return res.json({
          success: true,
          message: 'No Oddyssey matches available for selection',
          data: {
            selected_matches: 0,
            game_date: today
          }
        });
      }

      console.log(`💾 Saving ${selections.selectedMatches.length} Oddyssey matches...`);
      await oddysseySelector.saveOddysseyMatches(selections);
      
      console.log(`✅ Oddyssey matches saved: ${selections.selectedMatches.length} matches`);
      console.log(`📊 Selection quality: Easy: ${selections.summary.easy}, Medium: ${selections.summary.medium}, Hard: ${selections.summary.hard}`);

      res.json({
        success: true,
        message: 'Oddyssey matches selected and saved successfully',
        data: {
          selected_matches: selections.selectedMatches.length,
          selection_summary: selections.summary,
          game_date: today
        }
      });
      
    } catch (error) {
      console.error('❌ Error selecting Oddyssey matches:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'select_oddyssey_matches'
      });
    }
  }

  async fetch7DayFixtures(req, res) {
    try {
      console.log('🚀 Starting 7-day fixture fetch only...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }

      // Check if fixtures already exist for today
      const db = require('../db/db');
      const today = new Date().toISOString().split('T')[0];
      
      const existingFixtures = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.fixtures 
        WHERE DATE(match_date) = $1
      `, [today]);
      
      const existingCount = parseInt(existingFixtures.rows[0].count);
      console.log(`📊 Found ${existingCount} existing fixtures for today`);

      // Fetch 7-day fixtures using the new SportMonks service
      console.log('🔄 Fetching 7-day fixtures with new SportMonks service...');
      const SportMonksService = require('../services/sportmonks');
      const sportmonksService = new SportMonksService();
      
      const fixtureResults = await sportmonksService.fetchAndSave7DayFixtures();
      
      console.log(`✅ 7-day fixtures fetched: ${fixtureResults.totalFixtures} fixtures, ${fixtureResults.totalOdds} odds, ${fixtureResults.oddysseyFixtures} Oddyssey-ready`);

      // Get final database summary
      const fixtureCount = await db.query('SELECT COUNT(*) FROM oracle.fixtures');
      const oddsCount = await db.query('SELECT COUNT(*) FROM oracle.fixture_odds');
      const oddysseyCount = await db.query(`
        SELECT COUNT(*) FROM oracle.daily_game_matches WHERE game_date = $1
      `, [today]);

      res.json({
        success: true,
        message: '7-day fixtures fetched successfully',
        data: {
          fixture_results: fixtureResults,
          database_summary: {
            total_fixtures: parseInt(fixtureCount.rows[0].count),
            total_odds: parseInt(oddsCount.rows[0].count),
            oddyssey_matches: parseInt(oddysseyCount.rows[0].count)
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Error in fetch7DayFixtures:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'fetch_7day_fixtures'
      });
    }
  }

  async fetchOddysseyResults(req, res) {
    try {
      console.log('🎯 Fetching results for Oddyssey games...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }

      const db = require('../db/db');
      const { cycle_id, date } = req.body || {};
      
      let fixtureIds = [];
      let targetInfo = '';
      
      if (cycle_id) {
        // Fetch results for specific cycle
        console.log(`🎯 Fetching results for cycle ${cycle_id}...`);
        const cycleData = await db.query(`
          SELECT matches_data FROM oracle.oddyssey_cycles WHERE cycle_id = $1
        `, [cycle_id]);
        
        if (cycleData.rows.length === 0) {
          return res.json({
            success: false,
            message: `Cycle ${cycle_id} not found`,
            data: { matches_found: 0, results_fetched: 0 }
          });
        }
        
        const matchesData = cycleData.rows[0].matches_data;
        fixtureIds = matchesData.map(match => match.id.toString());
        targetInfo = `cycle ${cycle_id}`;
        
      } else if (date) {
        // Fetch results for specific date
        console.log(`🎯 Fetching results for date ${date}...`);
        const oddysseyMatches = await db.query(`
          SELECT fixture_id FROM oracle.daily_game_matches 
          WHERE DATE(game_date) = DATE($1)
        `, [date]);
        
        fixtureIds = oddysseyMatches.rows.map(match => match.fixture_id);
        targetInfo = `date ${date}`;
        
      } else {
        // Default: fetch results for today
        const today = new Date().toISOString().split('T')[0];
        console.log(`🎯 Fetching results for today (${today})...`);
        const oddysseyMatches = await db.query(`
          SELECT fixture_id FROM oracle.daily_game_matches 
          WHERE DATE(game_date) = DATE($1)
        `, [today]);
        
        fixtureIds = oddysseyMatches.rows.map(match => match.fixture_id);
        targetInfo = `today (${today})`;
      }
      
      if (fixtureIds.length === 0) {
        return res.json({
          success: true,
          message: `No Oddyssey matches found for ${targetInfo}`,
          data: {
            matches_found: 0,
            results_fetched: 0,
            results_updated: 0
          }
        });
      }

      console.log(`📊 Found ${fixtureIds.length} Oddyssey matches for ${targetInfo}`);

      // Fetch results for these fixtures
      const SportMonksService = require('../services/sportmonks');
      const sportmonksService = new SportMonksService();
      
      const results = await sportmonksService.fetchFixtureResults(fixtureIds);
      
      console.log(`✅ Fetched ${results.length} results from SportMonks`);

      // Save results to database
      let updatedCount = 0;
      for (const result of results) {
        try {
          // Save to fixture_results table with comprehensive data
          await db.query(`
            INSERT INTO oracle.fixture_results (
              id, fixture_id, home_score, away_score, ht_home_score, ht_away_score,
              result_1x2, result_ou25, finished_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
            ON CONFLICT (fixture_id) DO UPDATE SET
              home_score = EXCLUDED.home_score,
              away_score = EXCLUDED.away_score,
              ht_home_score = EXCLUDED.ht_home_score,
              ht_away_score = EXCLUDED.ht_away_score,
              result_1x2 = EXCLUDED.result_1x2,
              result_ou25 = EXCLUDED.result_ou25,
              finished_at = EXCLUDED.finished_at,
              updated_at = NOW()
          `, [
            `result_${result.fixture_id}`,
            result.fixture_id,
            result.home_score || null,
            result.away_score || null,
            result.ht_home_score || null,
            result.ht_away_score || null,
            result.result_1x2 || null,
            result.result_ou25 || null
          ]);
          
          updatedCount++;
          console.log(`✅ Saved result for fixture ${result.fixture_id}: ${result.home_team} ${result.home_score}-${result.away_score} ${result.away_team}`);
          
        } catch (saveError) {
          console.warn(`⚠️ Failed to save result for fixture ${result.fixture_id}:`, saveError.message);
        }
      }

      res.json({
        success: true,
        message: `Oddyssey results fetched and updated successfully for ${targetInfo}`,
        data: {
          target: targetInfo,
          matches_found: fixtureIds.length,
          results_fetched: results.length,
          results_updated: updatedCount,
          fixture_ids: fixtureIds
        }
      });
      
    } catch (error) {
      console.error('❌ Error in fetchOddysseyResults:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'fetch_oddyssey_results'
      });
    }
  }

  async resolveOddysseyCycles(req, res) {
    try {
      console.log('🎯 Resolving available Oddyssey cycles...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }

      // Use the Oddyssey results resolver
      const OddysseyResultsResolver = require('../services/oddyssey-results-resolver');
      const resolver = new OddysseyResultsResolver();
      
      const resolutionResult = await resolver.resolveAllPendingCycles();
      
      console.log(`✅ Cycle resolution completed: ${resolutionResult.resolvedCycles} cycles resolved`);

      res.json({
        success: true,
        message: 'Oddyssey cycles resolved successfully',
        data: {
          resolved_cycles: resolutionResult.resolvedCycles,
          total_cycles_checked: resolutionResult.totalCycles,
          resolution_details: resolutionResult.details
        }
      });
      
    } catch (error) {
      console.error('❌ Error in resolveOddysseyCycles:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'resolve_oddyssey_cycles'
      });
    }
  }

  async fetchGeneralResults(req, res) {
    try {
      console.log('🎯 Fetching general results for all completed matches...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }

      // Use the ResultsFetcherService for general results fetching
      const ResultsFetcherService = require('../services/results-fetcher-service');
      const resultsFetcher = new ResultsFetcherService();
      
      const result = await resultsFetcher.fetchAndSaveResults();
      
      console.log(`✅ General results fetching completed: ${result.fetched} fetched, ${result.saved} saved`);

      res.json({
        success: true,
        message: 'General results fetched and saved successfully',
        data: {
          status: result.status,
          fetched: result.fetched || 0,
          saved: result.saved || 0,
          duration: result.duration || 0,
          reason: result.reason || null
        }
      });
      
    } catch (error) {
      console.error('❌ Error in fetchGeneralResults:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'fetch_general_results'
      });
    }
  }

  async fetchAndSelectOddyssey(req, res) {
    try {
      console.log('🚀 Starting comprehensive 7-day fetch and Oddyssey selection...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }

      const db = require('../db/db');
      const today = new Date().toISOString().split('T')[0];
      
      // Step 1: Check if Oddyssey matches already exist for today
      console.log(`🔍 Checking for existing Oddyssey matches for ${today}...`);
      const existingMatches = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.daily_game_matches 
        WHERE game_date = $1
      `, [today]);
      
      const existingCount = parseInt(existingMatches.rows[0].count);
      
      if (existingCount > 0) {
        console.log(`✅ Oddyssey matches already exist for ${today} (${existingCount} matches) - skipping selection`);
        
        // Still fetch 7-day fixtures but don't overwrite Oddyssey
        console.log('🔄 Fetching 7-day fixtures (keeping existing Oddyssey matches)...');
        const SportMonksService = require('../services/sportmonks');
        const sportmonksService = new SportMonksService();
        const fixtureResults = await sportmonksService.fetchAndSave7DayFixtures();
        
        return res.json({
          success: true,
          message: 'Oddyssey matches already exist - fetched 7-day fixtures only',
          data: {
            oddyssey_status: 'existing_matches_preserved',
            existing_oddyssey_matches: existingCount,
            fixture_results: fixtureResults
          }
        });
      }

      // Step 2: Fetch 7-day fixtures using new service
      console.log('🔄 Fetching 7-day fixtures with new SportMonks service...');
      const SportMonksService = require('../services/sportmonks');
      const sportmonksService = new SportMonksService();
      const fixtureResults = await sportmonksService.fetchAndSave7DayFixtures();
      
      console.log(`✅ 7-day fixtures fetched: ${fixtureResults.totalFixtures} fixtures, ${fixtureResults.totalOdds} odds, ${fixtureResults.oddysseyFixtures} Oddyssey-ready`);

      // Step 3: Select Oddyssey matches for today
      console.log('🎯 Selecting Oddyssey matches for today...');
      const OddysseyMatchSelector = require('../services/oddyssey-match-selector');
      const oddysseySelector = new OddysseyMatchSelector();
      
      const selections = await oddysseySelector.selectDailyMatches();
      
      if (!selections || !selections.selectedMatches || selections.selectedMatches.length === 0) {
        console.warn('⚠️ No Oddyssey matches available for selection');
        return res.json({
          success: true,
          message: '7-day fixtures fetched but no Oddyssey matches available',
          data: {
            fixture_results: fixtureResults,
            oddyssey_status: 'no_matches_available',
            selected_matches: 0
          }
        });
      }

      // Step 4: Save Oddyssey selections
      console.log(`💾 Saving ${selections.selectedMatches.length} Oddyssey matches...`);
      await oddysseySelector.saveOddysseyMatches(selections);
      
      console.log(`✅ Oddyssey matches saved: ${selections.selectedMatches.length} matches`);
      console.log(`📊 Selection quality: Easy: ${selections.summary.easy}, Medium: ${selections.summary.medium}, Hard: ${selections.summary.hard}`);

      // Step 5: Create cycle on contract
      let contractResult = null;
      try {
        console.log('📤 Creating cycle on Oddyssey contract...');
        const OddysseyOracleBot = require('../services/oddyssey-oracle-bot');
        const oracleBot = new OddysseyOracleBot();
        
        // Format matches for contract
        const contractMatches = selections.selectedMatches.map(match => ({
          fixtureId: match.fixtureId,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          leagueName: match.leagueName,
          matchDate: match.matchDate,
          homeOdds: match.homeOdds,
          drawOdds: match.drawOdds,
          awayOdds: match.awayOdds,
          over25Odds: match.over25Odds,
          under25Odds: match.under25Odds
        }));
        
        await oracleBot.startNewDailyCycle(contractMatches);
        contractResult = { success: true, message: 'Cycle created on contract successfully' };
        console.log('✅ Cycle created on contract successfully');
        
      } catch (contractError) {
        console.error('❌ Failed to create cycle on contract:', contractError);
        contractResult = { 
          success: false, 
          error: contractError.message,
          message: 'Database matches saved but contract creation failed'
        };
      }

      // Step 6: Final database summary
      const fixtureCount = await db.query('SELECT COUNT(*) FROM oracle.fixtures');
      const oddsCount = await db.query('SELECT COUNT(*) FROM oracle.fixture_odds');
      const oddysseyCount = await db.query(`
        SELECT COUNT(*) FROM oracle.daily_game_matches WHERE game_date = $1
      `, [today]);

      console.log(`
📊 COMPLETE SUMMARY:
   • Total Fixtures: ${fixtureCount.rows[0].count}
   • Total Odds: ${oddsCount.rows[0].count}
   • Oddyssey Matches: ${oddysseyCount.rows[0].count}
   • 7-Day Fixtures: ${fixtureResults.totalFixtures}
   • Oddyssey-Ready: ${fixtureResults.oddysseyFixtures}
`);

      res.json({
        success: true,
        message: '7-day fixtures fetched and Oddyssey matches selected successfully',
        data: {
          fixture_results: fixtureResults,
          oddyssey_status: 'new_matches_selected',
          selected_matches: selections.selectedMatches.length,
          selection_summary: selections.summary,
          contract_result: contractResult,
          database_summary: {
            total_fixtures: parseInt(fixtureCount.rows[0].count),
            total_odds: parseInt(oddsCount.rows[0].count),
            oddyssey_matches: parseInt(oddysseyCount.rows[0].count)
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Error in fetchAndSelectOddyssey:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'fetch_and_select_oddyssey'
      });
    }
  }

  async fetchAndSelectOddysseyTomorrow(req, res) {
    try {
      console.log('🚀 Starting comprehensive 7-day fetch and Oddyssey selection for TOMORROW...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }

      const db = require('../db/db');
      
      // Calculate tomorrow's date in UTC
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      console.log(`📅 Target date for Oddyssey matches: ${tomorrowStr} (tomorrow in UTC)`);
      
      // Step 1: Check if Oddyssey matches already exist for tomorrow
      console.log(`🔍 Checking for existing Oddyssey matches for ${tomorrowStr}...`);
      const existingMatches = await db.query(`
        SELECT COUNT(*) as count 
        FROM oracle.daily_game_matches 
        WHERE game_date = $1
      `, [tomorrowStr]);
      
      const existingCount = parseInt(existingMatches.rows[0].count);
      
      if (existingCount > 0) {
        console.log(`✅ Oddyssey matches already exist for ${tomorrowStr} (${existingCount} matches) - skipping selection`);
        
        // Still fetch 7-day fixtures but don't overwrite Oddyssey
        console.log('🔄 Fetching 7-day fixtures (keeping existing Oddyssey matches)...');
        const SportMonksService = require('../services/sportmonks');
        const sportmonksService = new SportMonksService();
        const fixtureResults = await sportmonksService.fetchAndSave7DayFixtures();
        
        return res.json({
          success: true,
          message: 'Oddyssey matches already exist for tomorrow - fetched 7-day fixtures only',
          data: {
            target_date: tomorrowStr,
            oddyssey_status: 'existing_matches_preserved',
            existing_oddyssey_matches: existingCount,
            fixture_results: fixtureResults
          }
        });
      }

      // Step 2: Fetch 7-day fixtures using new service
      console.log('🔄 Fetching 7-day fixtures with new SportMonks service...');
      const SportMonksService = require('../services/sportmonks');
      const sportmonksService = new SportMonksService();
      const fixtureResults = await sportmonksService.fetchAndSave7DayFixtures();
      
      console.log(`✅ 7-day fixtures fetched: ${fixtureResults.totalFixtures} fixtures, ${fixtureResults.totalOdds} odds, ${fixtureResults.oddysseyFixtures} Oddyssey-ready`);

      // Step 3: Select Oddyssey matches for tomorrow
      console.log(`🎯 Selecting Oddyssey matches for ${tomorrowStr}...`);
      const OddysseyMatchSelector = require('../services/oddyssey-match-selector');
      const oddysseySelector = new OddysseyMatchSelector();
      
      // Override the date to select matches for tomorrow
      const selections = await oddysseySelector.selectDailyMatches(tomorrowStr);
      
      if (!selections || !selections.selectedMatches || selections.selectedMatches.length === 0) {
        console.warn('⚠️ No Oddyssey matches available for selection tomorrow');
        return res.json({
          success: true,
          message: '7-day fixtures fetched but no Oddyssey matches available for tomorrow',
          data: {
            target_date: tomorrowStr,
            fixture_results: fixtureResults,
            oddyssey_status: 'no_matches_available',
            selected_matches: 0
          }
        });
      }

      // Step 4: Save Oddyssey selections for tomorrow
      console.log(`💾 Saving ${selections.selectedMatches.length} Oddyssey matches for ${tomorrowStr}...`);
      await oddysseySelector.saveOddysseyMatches(selections, null, tomorrowStr);
      
      console.log(`✅ Oddyssey matches saved: ${selections.selectedMatches.length} matches`);
      console.log(`📊 Selection quality: Easy: ${selections.summary.easy}, Medium: ${selections.summary.medium}, Hard: ${selections.summary.hard}`);

      // Step 5: Create cycle on contract
      let contractResult = null;
      try {
        console.log('📤 Creating cycle on Oddyssey contract for tomorrow...');
        const OddysseyOracleBot = require('../services/oddyssey-oracle-bot');
        const oracleBot = new OddysseyOracleBot();
        
        // Format matches for contract
        const contractMatches = selections.selectedMatches.map(match => ({
          fixtureId: match.fixtureId,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          leagueName: match.leagueName,
          matchDate: match.matchDate,
          homeOdds: match.homeOdds,
          drawOdds: match.drawOdds,
          awayOdds: match.awayOdds,
          over25Odds: match.over25Odds,
          under25Odds: match.under25Odds
        }));
        
        await oracleBot.startNewDailyCycle(contractMatches);
        contractResult = { success: true, message: 'Cycle created on contract successfully for tomorrow' };
        console.log('✅ Cycle created on contract successfully for tomorrow');
        
      } catch (contractError) {
        console.error('❌ Failed to create cycle on contract:', contractError);
        contractResult = { 
          success: false, 
          error: contractError.message,
          message: 'Database matches saved but contract creation failed'
        };
      }

      // Step 6: Final database summary
      const fixtureCount = await db.query('SELECT COUNT(*) FROM oracle.fixtures');
      const oddsCount = await db.query('SELECT COUNT(*) FROM oracle.fixture_odds');
      const oddysseyCount = await db.query(`
        SELECT COUNT(*) FROM oracle.daily_game_matches WHERE game_date = $1
      `, [tomorrowStr]);

      console.log(`
📊 COMPLETE SUMMARY FOR TOMORROW (${tomorrowStr}):
   • Total Fixtures: ${fixtureCount.rows[0].count}
   • Total Odds: ${oddsCount.rows[0].count}
   • Oddyssey Matches: ${oddysseyCount.rows[0].count}
   • 7-Day Fixtures: ${fixtureResults.totalFixtures}
   • Oddyssey-Ready: ${fixtureResults.oddysseyFixtures}
`);

      res.json({
        success: true,
        message: '7-day fixtures fetched and Oddyssey matches selected successfully for tomorrow',
        data: {
          target_date: tomorrowStr,
          fixture_results: fixtureResults,
          oddyssey_status: 'new_matches_selected',
          selected_matches: selections.selectedMatches.length,
          selection_summary: selections.summary,
          contract_result: contractResult,
          database_summary: {
            total_fixtures: parseInt(fixtureCount.rows[0].count),
            total_odds: parseInt(oddsCount.rows[0].count),
            oddyssey_matches: parseInt(oddysseyCount.rows[0].count)
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Error in fetchAndSelectOddysseyTomorrow:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'fetch_and_select_oddyssey_tomorrow'
      });
    }
  }

  async checkTables(req, res) {
    try {
      console.log('🔍 Checking if tables exist...');
      
      const db = require('../db/db');
      await db.connect();
      
      const result = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'oracle' 
        AND table_name IN ('oddyssey_cycles', 'oddyssey_slips', 'crypto_coins', 'football_prediction_markets')
        ORDER BY table_name;
      `);
      
      console.log('📋 Found tables:', result.rows.map(row => row.table_name));
      
      res.json({
        success: true,
        tables_found: result.rows.map(row => row.table_name),
        total_tables: result.rows.length
      });
      
    } catch (error) {
      console.error('❌ Error checking tables:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async syncSchemas(req, res) {
    try {
      console.log('🔄 Starting manual schema sync...');
      
      const syncBridge = new SchemaSyncBridge();
      await syncBridge.fullSync();
      
      const status = await syncBridge.getSyncStatus();
      
      res.json({
        success: true,
        message: 'Schema sync completed successfully',
        status: status
      });
      
    } catch (error) {
      console.error('❌ Error syncing schemas:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'sync_schemas'
      });
    }
  }

  async getSyncStatus(req, res) {
    try {
      const syncBridge = new SchemaSyncBridge();
      const status = await syncBridge.getSyncStatus();
      
      res.json({
        success: true,
        status: status
      });
      
    } catch (error) {
      console.error('❌ Error getting sync status:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'get_sync_status'
      });
    }
  }

  async triggerCryptoPriceUpdate(req, res) {
    try {
      console.log('🎯 Manually triggering crypto price update...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }
      
      // Import and start crypto scheduler
      const CryptoScheduler = require('../cron/crypto-scheduler');
      const cryptoScheduler = new CryptoScheduler();
      
      // Update crypto prices
      const result = await cryptoScheduler.updateCryptoPrices();
      
      console.log('✅ Manual crypto price update completed:', result);
      
      res.json({
        success: true,
        message: 'Crypto price update completed successfully',
        result: result
      });
      
    } catch (error) {
      console.error('❌ Error triggering crypto price update:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async testOddysseyResolution(req, res) {
    try {
      console.log('🧪 Testing Oddyssey resolution system...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }

      // Use the Oddyssey results resolver
      const OddysseyResultsResolver = require('../services/oddyssey-results-resolver');
      const resolver = new OddysseyResultsResolver();
      
      // Run the test
      await resolver.testResolutionSystem();
      
      // Also run the actual resolution check
      const resolutionResult = await resolver.resolveAllPendingCycles();
      
      res.json({
        success: true,
        message: 'Oddyssey resolution system test completed',
        data: {
          resolution_result: resolutionResult,
          test_completed: true
        }
      });
      
    } catch (error) {
      console.error('❌ Error in testOddysseyResolution:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'test_oddyssey_resolution'
      });
    }
  }

  async updateFixtureStatus(req, res) {
    try {
      console.log('🔄 Manually triggering fixture status update...');
      
      // Check admin authorization
      const isAdminRequest = req.headers['x-admin-key'] === process.env.ADMIN_KEY;
      if (!isAdminRequest) {
        return res.status(403).json({
          success: false,
          error: 'Admin authorization required'
        });
      }

      // Use the SportMonks service
      const SportMonksService = require('../services/sportmonks');
      const sportMonksService = new SportMonksService();
      
      const result = await sportMonksService.updateFixtureStatus();
      
      res.json({
        success: true,
        message: 'Fixture status update completed',
        data: {
          fixtures_updated: result.updated,
          error: result.error || null
        }
      });
      
    } catch (error) {
      console.error('❌ Error in updateFixtureStatus:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        operation: 'update_fixture_status'
      });
    }
  }

  async start() {
    try {
      console.log('🚀 Starting Bitr Backend API...');
      
      // Initialize all services
      await this.initializeServices();
      
      // Start the HTTP server
      const port = config.api.port || 3000;
      this.server = this.app.listen(port, '0.0.0.0', () => {
        console.log(`✅ Bitr Backend API server running on http://0.0.0.0:${port}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 Health check: http://0.0.0.0:${port}/api/health`);
      });
      
      // Handle server errors
      this.server.on('error', (error) => {
        console.error('❌ Server error:', error);
        throw error;
      });
      
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      throw error;
    }
  }
}

// Initialize database setup and sync on startup
async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database and sync...');
    
    // DISABLED: Auto-apply perfect schema (manual control for debugging)
    console.log('🚫 Perfect database schema auto-apply DISABLED for manual control');
    // const { execSync } = require('child_process');
    // try {
    //   execSync('npx prisma db execute --file ./database/perfect-schema.sql --schema ./prisma/schema.prisma', { cwd: '/app' });
    //   console.log('✅ Perfect database schema applied successfully');
    // } catch (migrationError) {
    //   console.warn('⚠️ Schema application warning:', migrationError.message);
    //   console.log('📝 Continuing with startup - schema may have been previously applied');
    // }
    
    // Generate Prisma client
    try {
      execSync('npx prisma generate', { cwd: '/app' });
      console.log('✅ Prisma client generated successfully');
    } catch (generateError) {
      console.warn('⚠️ Prisma client generation warning:', generateError.message);
    }
    
    console.log('✅ Database initialization completed');
    
    // Initialize contract-to-database sync
    console.log('🔄 Initializing contract sync...');
    const syncer = new ContractToDbSync();
    await syncer.syncContractMatchesToDb();
    console.log('✅ Contract sync completed');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    console.error('   This is non-critical - server will continue running');
    // Don't fail the server startup, just log the error
  }
}

// Start server if run directly
if (require.main === module) {
  const api = new BitredictAPI();
  
  // Add graceful shutdown handling
  const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    
    try {
      if (api.server) {
        await new Promise((resolve) => {
          api.server.close(resolve);
        });
        console.log('✅ HTTP server closed');
      }
      
      // Close database connections
      const db = require('../db/db');
      await db.disconnect();
      console.log('✅ Database connections closed');
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  // Handle different shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });
  
  // Start the server
  api.start().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = BitredictAPI; 