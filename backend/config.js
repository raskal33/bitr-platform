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
    rpcUrl: process.env.RPC_URL || 'https://testnet-rpc.monad.xyz/',
    fallbackRpcUrl: process.env.FALLBACK_RPC_URL || 'https://frosty-summer-model.monad-testnet.quiknode.pro/bfedff2990828aad13692971d0dbed22de3c9783/',
    // Multi-RPC configuration for load balancing
    rpcUrls: [
      'https://testnet-rpc.monad.xyz/',                    // Monad official (25 req/sec)
      'https://frosty-summer-model.monad-testnet.quiknode.pro/bfedff2990828aad13692971d0dbed22de3c9783/', // QuickNode (15 req/sec)
      'https://rpc.ankr.com/monad_testnet'                 // Ankr (30 req/sec) - BEST!
    ],
    // Free tier optimization
    freeTierMode: process.env.FREE_TIER_MODE === 'true',
    chainId: process.env.CHAIN_ID || 10143,
    privateKey: process.env.PRIVATE_KEY,
    startBlock: process.env.START_BLOCK || 0,
    // Indexer settings
    indexer: {
      pollInterval: parseInt(process.env.POLL_INTERVAL) || 5000, // 5 seconds between polls
      rpcDelay: parseInt(process.env.RPC_DELAY) || 100, // 100ms delay between RPC calls
      batchSize: parseInt(process.env.BATCH_SIZE) || 1, // Process 1 block at a time
      maxRetries: parseInt(process.env.MAX_RETRIES) || 3
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
        'https://bitredict.vercel.app',
        'https://bitredict.io',
        'https://bitr-front-ap9z.vercel.app',
        'http://localhost:8080',
        'http://localhost:3000'
      ],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'X-API-Key',
        'Accept',
        'Origin'
      ],
      credentials: true,
      optionsSuccessStatus: 200,
      preflightContinue: false
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

  // Indexer configuration - Monad Testnet Optimized
  indexer: {
    startBlock: process.env.START_BLOCK || '164312555', // Start from recent block instead of 0
    batchSize: process.env.BATCH_SIZE || 100, // Reduced for Monad's 400ms blocks
    pollInterval: process.env.POLL_INTERVAL || 500, // 500ms polling (faster than block time)
    confirmationBlocks: process.env.CONFIRMATION_BLOCKS || 2, // Reduced for Monad's 800ms finality
    maxRetries: process.env.MAX_RETRIES || 5, // Increased for higher throughput
    retryDelay: process.env.RETRY_DELAY || 2000, // 2 seconds (reduced for fast recovery)
    // Monad-specific settings
    monadOptimized: true,
    blockTime: 400, // 400ms block time
    finality: 800, // 800ms finality
    maxLag: 500 // Maximum acceptable lag in blocks
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
