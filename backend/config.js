require('dotenv').config();

module.exports = {
  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'bitr-db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    maxConnections: 20,
    connectionTimeout: 30000
  },

  // Blockchain configuration - Monad Testnet
  blockchain: {
    rpcUrl: process.env.RPC_URL || 'https://rpc.ankr.com/monad_testnet/df5096a95ddedfa5ec32ad231b63250e719aef9ee7edcbbcea32b8539ae47205',
    fallbackRpcUrl: process.env.FALLBACK_RPC_URL || 'https://testnet-rpc.monad.xyz/',
    // Multi-RPC configuration for load balancing - ANKR Premium First!
    rpcUrls: [
      'https://rpc.ankr.com/monad_testnet/df5096a95ddedfa5ec32ad231b63250e719aef9ee7edcbbcea32b8539ae47205', // ANKR Premium (500+ req/sec) - PRIMARY!
      'https://testnet-rpc.monad.xyz/',                    // Monad official (25 req/sec) - Fallback
      'https://frosty-summer-model.monad-testnet.quiknode.pro/bfedff2990828aad13692971d0dbed22de3c9783/', // QuickNode (15 req/sec) - Emergency
    ],
    // Free tier optimization
    freeTierMode: process.env.FREE_TIER_MODE === 'true',
    chainId: process.env.CHAIN_ID || 10143,
    privateKey: process.env.PRIVATE_KEY,
    startBlock: process.env.START_BLOCK || 0,
    // Indexer settings - BALANCED PREMIUM RPC (Conservative but effective)
    indexer: {
      pollInterval: parseInt(process.env.POLL_INTERVAL) || 1000, // 1s between polls (balanced)
      rpcDelay: parseInt(process.env.RPC_DELAY) || 50, // 50ms delay between RPC calls (balanced)
      batchSize: parseInt(process.env.BATCH_SIZE) || 20, // Process 20 blocks at a time (balanced)
      maxRetries: parseInt(process.env.MAX_RETRIES) || 5, // More retries for reliability
      maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 4, // Conservative parallel requests
      aggressiveMode: process.env.AGGRESSIVE_MODE !== 'false' // Enable aggressive indexing by default
    },
    // Monad-specific settings
    monad: {
      baseFee: '50000000000', // 50 gwei base fee (hard-coded on testnet)
      priorityFee: '2000000000', // 2 gwei priority fee
      maxGasLimit: 30000000, // 30M gas per transaction
      blockGasLimit: 150000000, // 150M gas per block
      blockTime: 400, // 400ms block time
      finality: 800, // 800ms finality
      throughput: 10000, // 10,000 TPS
      gasCharging: 'gas_limit', // Charges gas_limit, not gas_used
      compatibility: 'Cancun', // EVM Cancun fork compatibility
    },
    contractAddresses: {
      bitrPool: process.env.BITR_POOL_ADDRESS || '0x080dB155ded47b08D9807ad38Be550784D4Df1e6',
      guidedOracle: process.env.GUIDED_ORACLE_ADDRESS || '0x9CFB1097577480BD0eDe1795018c89786c541097',
      optimisticOracle: process.env.OPTIMISTIC_ORACLE_ADDRESS || '0x36fddb1844B89D4c0A00497A1C6B56B958bCcFB6',
      reputationSystem: process.env.REPUTATION_SYSTEM_ADDRESS || '0x86F7B172caFC2BaB08E6c93BD984fab0b08630e2',
      bitrToken: process.env.BITR_TOKEN_ADDRESS || '0xbB966Dd2696005c9e893304819237Ea4006A9380',
      stakingContract: process.env.STAKING_CONTRACT_ADDRESS || '0xD7A8f141320b4C060F8067741C812773166928E4',
      bitrFaucet: process.env.BITR_FAUCET_ADDRESS || '0x9320ddf7CA7A2826DA3d557BD6A6661Ec7df13c0',
      oddyssey: process.env.ODDYSSEY_ADDRESS || '0x6E51d91Adb14395B43Ad5b2A1A4f3F6C99332A5A'
    }
  },

  // API configuration
  api: {
    port: process.env.PORT || 3000,
    adminKey: process.env.ADMIN_KEY,
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [
        'https://bitr-front-ap9z.vercel.app',
        'https://bitredict.io',
        'https://bitr-front-ap9z.vercel.app',
        'https://predict-linux.vercel.app',
        'http://localhost:8080',
        'http://localhost:3000',
        'http://localhost:3001'
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'X-API-Key',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers'
      ],
      credentials: true,
      optionsSuccessStatus: 200,
      preflightContinue: false,
      maxAge: 86400 // 24 hours cache for preflight
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10000, // Temporarily increased to 10000 to prevent frontend loop issues
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },
    // Specific rate limits for different endpoints
    endpointLimits: {
      faucet: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 120 // Increased to 120 requests per minute for faucet endpoints
      },
      statistics: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 240 // Increased to 240 requests per minute for statistics
      },
      oddyssey: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 300 // 300 requests per minute for oddyssey endpoints
      }
    }
  },

  // Oracle configuration
  oracle: {
    port: process.env.ORACLE_PORT || 3001,
    signerPrivateKey: process.env.ORACLE_SIGNER_PRIVATE_KEY,
    updateInterval: process.env.ORACLE_UPDATE_INTERVAL || 60000, // 1 minute
    dataSources: {
      sports: process.env.SPORTS_API_KEY,
      crypto: process.env.CRYPTO_API_KEY,
      weather: process.env.WEATHER_API_KEY
    }
  },

  // SportMonks API configuration
  sportmonks: {
    baseUrl: process.env.SPORTMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football',
    apiToken: process.env.SPORTMONKS_API_TOKEN,
    rateLimitDelay: process.env.SPORTMONKS_RATE_LIMIT_DELAY || 100, // ms between requests
    timeout: process.env.SPORTMONKS_TIMEOUT || 30000, // 30 seconds
    retryAttempts: process.env.SPORTMONKS_RETRY_ATTEMPTS || 3,
    popularLeagues: [
      2,    // UEFA Champions League
      5,    // UEFA Europa League
      8,    // Premier League
      82,   // Bundesliga
      564,  // La Liga
      301,  // Serie A
      501,  // Ligue 1
      271,  // Eredivisie
      2105, // World Cup
      1     // FIFA World Cup
    ]
  },

  // Coinpaprika API configuration
  coinpaprika: {
    baseUrl: process.env.COINPAPRIKA_BASE_URL || 'https://api.coinpaprika.com/v1',
    apiToken: process.env.COINPAPRIKA_API_TOKEN, // Optional - API is free without token
    rateLimitDelay: process.env.COINPAPRIKA_RATE_LIMIT_DELAY || 1000, // 1 second between requests
    timeout: process.env.COINPAPRIKA_TIMEOUT || 30000, // 30 seconds
    retryAttempts: process.env.COINPAPRIKA_RETRY_ATTEMPTS || 3,
    popularCoins: [
      'btc-bitcoin',
      'eth-ethereum', 
      'sol-solana',
      'ada-cardano',
      'matic-polygon',
      'avax-avalanche',
      'dot-polkadot',
      'link-chainlink',
      'uni-uniswap',
      'ltc-litecoin'
    ]
  },

  // Indexer configuration - MONAD 400ms BLOCK OPTIMIZED
  indexer: {
    startBlock: process.env.START_BLOCK || '164312555', // Start from recent block instead of 0
    batchSize: process.env.BATCH_SIZE || 25, // Optimized for 400ms blocks (25 blocks = 10 seconds)
    pollInterval: process.env.POLL_INTERVAL || 300, // 300ms polling (faster than block time for real-time)
    confirmationBlocks: process.env.CONFIRMATION_BLOCKS || 1, // Minimal confirmations for 400ms blocks
    maxRetries: process.env.MAX_RETRIES || 5, // Reasonable retries
    retryDelay: process.env.RETRY_DELAY || 500, // 500ms retry delay (faster for 400ms blocks)
    maxConcurrentBatches: process.env.MAX_CONCURRENT_BATCHES || 3, // Higher concurrency for fast blocks
    // Monad-specific settings - 400ms BLOCK OPTIMIZED
    monadOptimized: true,
    premiumRpc: true, // Flag for premium RPC optimizations
    blockTime: 400, // 400ms block time - CRITICAL FOR TIMING
    finality: 800, // 800ms finality (2 blocks)
    maxLag: 25, // STRICT: Never exceed 25 blocks (10 seconds) for 400ms blocks
    lagAlertThreshold: 15, // Alert if lag exceeds 15 blocks (6 seconds)
    emergencyMode: {
      enabled: true,
      lagThreshold: 50, // Trigger emergency mode at 50 blocks lag (20 seconds)
      maxBatchSize: 75, // Emergency batch size for fast catch-up
      minPollInterval: 100 // Emergency polling interval (100ms - very fast)
    }
  },

  // External services
  externalServices: {
    feeCollector: process.env.FEE_COLLECTOR,
    oracleSigners: process.env.ORACLE_SIGNERS ? process.env.ORACLE_SIGNERS.split(',') : []
  },

  // Airdrop configuration
  airdrop: {
    totalSupply: '5000000000000000000000000', // 5M BITR
    faucetAmount: '20000000000000000000000', // 20K BITR per user
    requirements: {
      minBITRActions: 20,
      minOddysseySlips: 3,
      stakingRequired: true,
      sttActivityRequired: true
    },
    snapshotSchedule: '0 0 * * 0', // Weekly on Sunday at midnight
    eligibilityUpdateInterval: 300000 // 5 minutes
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log'
  }
};
