require('dotenv').config();

module.exports = {
  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'bitredict',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    maxConnections: 20,
    connectionTimeout: 30000
  },

  // Blockchain configuration
  blockchain: {
    rpcUrl: process.env.RPC_URL || 'https://dream-rpc.somnia.network/',
    fallbackRpcUrl: process.env.FALLBACK_RPC_URL || 'https://rpc.ankr.com/somnia_testnet/df5096a95ddedfa5ec32ad231b63250e719aef9ee7edcbbcea32b8539ae47205',
    chainId: process.env.CHAIN_ID || 50312,
    privateKey: process.env.PRIVATE_KEY,
    contractAddresses: {
      bitredictPool: process.env.BITREDICT_POOL_ADDRESS || '0x5a66a41b884aF70d5671b322C3e6ac1346CC885C',
      guidedOracle: process.env.GUIDED_ORACLE_ADDRESS || '0x9F91C01bB21385ac9959a1d51e33E65515688DC8',
      optimisticOracle: process.env.OPTIMISTIC_ORACLE_ADDRESS || '0x114832D788b27c530deCe033c72286927036e7CF',
      reputationSystem: process.env.REPUTATION_SYSTEM_ADDRESS || '0x94DBC95350AaCcC9DeAbdd9cf60B189a149636C7',
      bitrToken: process.env.BITR_TOKEN_ADDRESS || '0xe10e734b6d475f4004C354CA5086CA7968efD4fd',
      stakingContract: process.env.STAKING_CONTRACT_ADDRESS || '0x286A4690904fe9158a316Dfd5eA506d28F497395',
      bitrFaucet: process.env.BITR_FAUCET_ADDRESS || '0xb0816D384EEC3c41dc75083b2B7C3771A01d0618',
      oddyssey: process.env.ODDYSSEY_ADDRESS || '0x9f9D719041C8F0EE708440f15AE056Cd858DCF4e'
    }
  },

  // API configuration
  api: {
    port: process.env.PORT || 3000,
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [
        'https://bitredict.vercel.app',
        'https://bitredict.io',
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

  // Indexer configuration
  indexer: {
    startBlock: process.env.START_BLOCK || 'latest',
    batchSize: process.env.BATCH_SIZE || 1, // Process only 1 block at a time
    pollInterval: process.env.POLL_INTERVAL || 2000, // 2 seconds for polling
    confirmationBlocks: process.env.CONFIRMATION_BLOCKS || 12, // 12 confirmation blocks for security
    maxRetries: process.env.MAX_RETRIES || 3,
    retryDelay: process.env.RETRY_DELAY || 5000 // 5 seconds
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
