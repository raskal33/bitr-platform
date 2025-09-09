const { ethers } = require('ethers');
const path = require('path');
const config = require('../config');
const GasEstimator = require('../utils/gas-estimator');
const MonadGasOptimizer = require('../utils/monad-gas-optimizer');

class Web3Service {
  // Contract constants
  MATCH_COUNT = 10;
  
  // Contract enums
  BetType = {
    MONEYLINE: 0,
    OVER_UNDER: 1
  };
  
  MoneylineResult = {
    NotSet: 0,
    HomeWin: 1,
    Draw: 2,
    AwayWin: 3
  };
  
  OverUnderResult = {
    NotSet: 0,
    Over: 1,
    Under: 2
  };
  
  CycleState = {
    NotSet: 0,
    Active: 1,
    Resolved: 2,
    Cancelled: 3
  };
  
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.oddysseyContract = null;
    this.bitrPoolContract = null;
    this.guidedOracleContract = null;
    this.optimisticOracleContract = null;
    this.bitrTokenContract = null;
    this.gasEstimator = null;
    this.monadGasOptimizer = new MonadGasOptimizer();
    this.isInitialized = false;
  }

  /**
   * Get Monad-optimized gas settings for transactions
   * @param {number} estimatedGas - Estimated gas from ethers
   * @param {string} operationType - Type of operation (placeSlip, evaluateSlip, etc.)
   * @returns {Object} Gas settings optimized for Monad
   */
  getMonadGasSettings(estimatedGas, operationType = 'standard') {
    return this.monadGasOptimizer.getOptimizedGasSettings(estimatedGas, operationType);
  }

  /**
   * Get fallback gas settings when estimation fails
   */
  getFallbackGasSettings(operationType) {
    return this.monadGasOptimizer.getFallbackGasSettings(operationType);
  }

  /**
   * Initialize the Web3Service with provider and wallet
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize provider
      
      // Initialize provider with proper configuration
      const rpcUrl = process.env.RPC_URL || config.blockchain.rpcUrl;
      if (!rpcUrl) {
        throw new Error('RPC_URL environment variable not set');
      }
      
      this.provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
        timeout: 30000,
        retryCount: 3
      });
      
      // Test the provider connection
      try {
        await this.provider.getNetwork();
        console.log('✅ Provider connection test successful');
      } catch (error) {
        console.error('❌ Provider connection test failed:', error.message);
        throw error;
      }
      
      // Initialize wallet if private key is provided
      if (process.env.PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY) {
        const privateKey = process.env.PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY;
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        console.log('✅ Web3Service initialized with wallet:', this.wallet.address);
      } else {
        console.warn('⚠️ Web3Service initialized without wallet (PRIVATE_KEY not set)');
      }

      // Initialize gas estimator with BitrPool contract for guided markets
      this.bitrPoolContract = new ethers.Contract(
        config.blockchain.contractAddresses.bitrPool,
        this.getBitrPoolABI(),
        this.provider
      );
      this.gasEstimator = new GasEstimator(this.provider, this.bitrPoolContract, this.monadGasOptimizer.settings);
      
      this.isInitialized = true;
      console.log('✅ Web3Service fully initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize Web3Service:', error.message);
      throw error;
    }
  }

  /**
   * Get wallet address
   */
  getWalletAddress() {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }
    return this.wallet.address;
  }

  /**
   * Get Oddyssey contract instance
   */
  
  /**
   * Get Oddyssey contract instance
   */
  async getOddysseyContract() {
    if (this.oddysseyContract) {
      return this.oddysseyContract;
    }

    // Ensure provider is initialized
    if (!this.provider) {
      await this.initialize();
    }

    const contractAddress = process.env.ODDYSSEY_ADDRESS;
    if (!contractAddress) {
      throw new Error('ODDYSSEY_ADDRESS environment variable not set');
    }

    // Import the ABI
    let OddysseyABI;
    try {
      // Try multiple possible paths for the ABI
      const possiblePaths = [
        path.join(__dirname, '../oddyssey-contract-abi.json'),
        path.join(__dirname, '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
        path.join(__dirname, '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
        path.join(__dirname, './oddyssey-contract-abi.json'),
        path.join(__dirname, './solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
        '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
        '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
        './solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          OddysseyABI = require(abiPath).abi;
          console.log(`✅ Oddyssey ABI loaded from: ${abiPath}`);
          console.log(`   ABI length: ${OddysseyABI.length}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          console.log(`   ❌ Failed to load from: ${abiPath}`);
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ Oddyssey contract artifacts not found, using fallback ABI');
      console.warn('Error details:', error.message);
      // Complete fallback ABI matching actual contract
      OddysseyABI = [
        // Admin functions
        "function oracle() external view returns (address)",
        "function devWallet() external view returns (address)",
        "function setOracle(address _newOracle) external",
        "function setEntryFee(uint256 _newFee) external",
        
        // Oracle functions
        "function startDailyCycle(tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] _matches) external",
        "function resolveDailyCycle(uint256 _cycleId, tuple(uint8 moneyline, uint8 overUnder)[10] _results) external",
        "function resolveMultipleCycles(uint256[] memory _cycleIds, tuple(uint8 moneyline, uint8 overUnder)[10][] memory _results) external",
        
        // Public functions
        "function placeSlip(tuple(uint64 matchId, uint8 betType, bytes32 selection, uint32 selectedOdd)[10] memory _predictions) external payable",
        "function evaluateSlip(uint256 _slipId) external",
        "function evaluateMultipleSlips(uint256[] memory _slipIds) external",
        "function claimPrize(uint256 _cycleId) external",
        "function claimMultiplePrizes(uint256[] memory _cycleIds) external",
        
        // View functions - Core
        "function dailyCycleId() external view returns (uint256)",
        "function slipCount() external view returns (uint256)",
        "function entryFee() external view returns (uint256)",
        
        // View functions - Enhanced
        "function getCurrentCycleInfo() external view returns (uint256 cycleId, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount)",
        "function getCycleStatus(uint256 _cycleId) external view returns (bool exists, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount, bool hasWinner)",
        "function getCurrentCycle() external view returns (uint256)",
        "function isCycleInitialized(uint256 _cycleId) external view returns (bool)",
        
        // Match and cycle data
        "function getDailyMatches(uint256 _cycleId) external view returns (tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] memory)",
        "function getCycleMatches(uint256 _cycleId) external view returns (tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] memory)",
        "function getDailyLeaderboard(uint256 _cycleId) external view returns (tuple(address player, uint256 slipId, uint256 finalScore, uint8 correctCount)[5] memory)",
        
        // User data
        "function getUserSlipsForCycle(address _user, uint256 _cycleId) external view returns (uint256[] memory)",
        "function getSlip(uint256 _slipId) external view returns (tuple(address player, uint256 cycleId, uint256 placedAt, tuple(uint64 matchId, uint8 betType, bytes32 selection, uint32 selectedOdd)[10] predictions, uint256 finalScore, uint8 correctCount, bool isEvaluated) memory)",
        "function getUserStats(address _user) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle)",
        "function getUserStatsWithReputation(address _user) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle, uint256 totalReputation, uint256 totalCorrectPredictions)",
        "function getOddysseyReputation(address _user) external view returns (uint256 totalReputation, uint256 totalCorrectPredictions)",
        
        // Mappings access
        "function userStats(address) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle)",
        "function userOddysseyReputation(address) external view returns (uint256)",
        "function userOddysseyCorrectPredictions(address) external view returns (uint256)",
        "function dailyPrizePools(uint256) external view returns (uint256)",
        "function dailyCycleEndTimes(uint256) external view returns (uint256)",
        "function claimableStartTimes(uint256) external view returns (uint256)",
        "function isCycleResolved(uint256) external view returns (bool)",
        "function prizeClaimed(uint256, uint8) external view returns (bool)",
        "function cycleInfo(uint256) external view returns (uint256 startTime, uint256 endTime, uint256 prizePool, uint32 slipCount, uint32 evaluatedSlips, uint8 state, bool hasWinner)",
        "function cycleStats(uint256) external view returns (uint256 volume, uint32 slips, uint32 evaluatedSlips)",
        "function stats() external view returns (uint256 totalVolume, uint32 totalSlips, uint256 highestOdd)",
        
        // Constants
        "function MATCH_COUNT() external view returns (uint256)",
        "function DAILY_LEADERBOARD_SIZE() external view returns (uint256)",
        "function MIN_CORRECT_PREDICTIONS() external view returns (uint256)",
        "function ODDS_SCALING_FACTOR() external view returns (uint256)",
        "function MAX_CYCLES_TO_RESOLVE() external view returns (uint256)",
        "function DEV_FEE_PERCENTAGE() external view returns (uint256)",
        "function PRIZE_ROLLOVER_FEE_PERCENTAGE() external view returns (uint256)",
        
        // Events (for filtering)
        "event CycleStarted(uint256 indexed cycleId, uint256 endTime)",
        "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)",
        "event CycleResolved(uint256 indexed cycleId, uint256 prizePool)",
        "event PrizeClaimed(uint256 indexed cycleId, address indexed player, uint256 rank, uint256 amount)",
        "event UserStatsUpdated(address indexed user, uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 winRate)",
        "event OddysseyReputationUpdated(address indexed user, uint256 pointsEarned, uint256 correctPredictions, uint256 totalReputation)"
      ];
    }
    
    // Always use wallet for Oddyssey contract (needs write operations)
    if (!this.wallet) {
      throw new Error('Wallet not initialized - Oddyssey contract requires write operations');
    }
    this.oddysseyContract = new ethers.Contract(contractAddress, OddysseyABI, this.wallet);
    
    console.log('✅ Oddyssey contract initialized:', contractAddress);
    return this.oddysseyContract;
  }

  /**
   * Get BITR Token contract instance
   */
  async getBITRTokenContract() {
    if (this.bitrTokenContract) {
      return this.bitrTokenContract;
    }

    const contractAddress = process.env.BITR_TOKEN_ADDRESS;
    if (!contractAddress) {
      throw new Error('BITR_TOKEN_ADDRESS environment variable not set');
    }

    let BitrTokenABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/BitrToken.sol/BitrToken.json',
        '../solidity/artifacts/contracts/BitrToken.sol/BitrToken.json',
        '../../solidity/artifacts/contracts/BitrToken.sol/BitrToken.json',
        path.join(__dirname, '../solidity/artifacts/contracts/BitrToken.sol/BitrToken.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/BitrToken.sol/BitrToken.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          BitrTokenABI = require(abiPath).abi;
          console.log(`✅ BitrToken ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ BitrToken contract artifacts not found, using fallback ABI');
      BitrTokenABI = [
        "function balanceOf(address owner) external view returns (uint256)",
        "function allowance(address owner, address spender) external view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address to, uint256 amount) external returns (bool)"
      ];
    }
    
    // BITR Token needs write operations (approve, transfer), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - BITR Token contract requires write operations');
    }
    this.bitrTokenContract = new ethers.Contract(contractAddress, BitrTokenABI, this.wallet);
    
    console.log('✅ BITR Token contract initialized:', contractAddress);
    return this.bitrTokenContract;
  }

  /**
   * Get BitrPool contract instance
   */
  async getBitrPoolContract() {
    if (this.bitrPoolContract) {
      return this.bitrPoolContract;
    }

    const contractAddress = process.env.BITR_POOL_ADDRESS;
    if (!contractAddress) {
      throw new Error('BITR_POOL_ADDRESS environment variable not set');
    }

    let BitrPoolABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/BitrPool.sol/BitrPool.json',
        '../solidity/artifacts/contracts/BitrPool.sol/BitrPool.json',
        '../../solidity/artifacts/contracts/BitrPool.sol/BitrPool.json',
        path.join(__dirname, '../solidity/artifacts/contracts/BitrPool.sol/BitrPool.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/BitrPool.sol/BitrPool.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          BitrPoolABI = require(abiPath).abi;
          console.log(`✅ BitrPool ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ BitrPool contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual BitrPool contract
      BitrPoolABI = [
        // Core pool functions
        "function createPool(bytes32 _predictedOutcome, uint256 _odds, uint256 _creatorStake, uint256 _eventStartTime, uint256 _eventEndTime, string memory _league, string memory _category, uint8 _marketType, bool _isPrivate, uint256 _maxBetPerUser, bool _useBitr, uint8 _oracleType, bytes32 _marketId) external payable",
        "function placeBet(uint256 poolId, uint256 amount) external payable",
        "function addLiquidity(uint256 poolId, uint256 amount) external payable",
        "function withdrawLiquidity(uint256 poolId) external",
        "function withdrawCreatorStake(uint256 poolId) external",
        "function settlePool(uint256 poolId, bytes32 outcome) external",
        "function settlePoolAutomatically(uint256 poolId) external",
        "function claim(uint256 poolId) external",
        "function refundPool(uint256 poolId) external",
        
        // Combo pool functions
        "function createComboPool(tuple(bytes32 marketId, bytes32 expectedOutcome, bool resolved, bytes32 actualOutcome)[] memory conditions, uint16 combinedOdds, uint256 creatorStake, uint256 earliestEventStart, uint256 latestEventEnd, string memory category, uint256 maxBetPerUser, bool useBitr) external payable",
        "function placeComboBet(uint256 comboPoolId, uint256 amount) external payable",
        "function resolveComboCondition(uint256 comboPoolId, uint256 conditionIndex, bytes32 actualOutcome) external",
        "function claimCombo(uint256 comboPoolId) external",
        
        // Boost system functions
        "function boostPool(uint256 poolId, uint8 tier) external payable",
        "function cleanupExpiredBoosts(uint256[] calldata poolIds) external",
        
        // Private pool management
        "function addToWhitelist(uint256 poolId, address user) external",
        "function removeFromWhitelist(uint256 poolId, address user) external",
        
        // Fee management
        "function distributeFees(address stakingContract) external",
        "function adjustedFeeRate(address user) external view returns (uint256)",
        
        // View functions - Core data
        "function poolCount() external view returns (uint256)",
        "function comboPoolCount() external view returns (uint256)",
        "function pools(uint256) external view returns (address creator, uint16 odds, bool settled, bool creatorSideWon, bool isPrivate, bool usesBitr, bool filledAbove60, uint8 oracleType, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, bytes32 predictedOutcome, bytes32 result, bytes32 marketId, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, uint256 arbitrationDeadline, string league, string category, string region, uint256 maxBetPerUser)",
        "function comboPools(uint256) external view returns (address creator, uint256 creatorStake, uint256 totalCreatorSideStake, uint256 maxBettorStake, uint256 totalBettorStake, uint16 totalOdds, bool settled, bool creatorSideWon, bool usesBitr, uint256 eventStartTime, uint256 eventEndTime, uint256 bettingEndTime, uint256 resultTimestamp, string category, uint256 maxBetPerUser)",
        
        // View functions - User data
        "function poolBettors(uint256, uint256) external view returns (address)",
        "function bettorStakes(uint256, address) external view returns (uint256)",
        "function poolLPs(uint256, uint256) external view returns (address)",
        "function lpStakes(uint256, address) external view returns (uint256)",
        "function claimed(uint256, address) external view returns (bool)",
        "function comboPoolBettors(uint256, uint256) external view returns (address)",
        "function comboBettorStakes(uint256, address) external view returns (uint256)",
        "function comboPoolLPs(uint256, uint256) external view returns (address)",
        "function comboLPStakes(uint256, address) external view returns (uint256)",
        "function comboClaimed(uint256, address) external view returns (bool)",
        
        // View functions - Pool queries
        "function getPoolsByCategory(bytes32 categoryHash, uint256 limit, uint256 offset) external view returns (uint256[] memory poolIds)",
        "function getActivePoolsByCreator(address creator, uint256 limit, uint256 offset) external view returns (uint256[] memory poolIds)",
        
        // View functions - Boost system
        "function poolBoostTier(uint256) external view returns (uint8)",
        "function poolBoostExpiry(uint256) external view returns (uint256)",
        "function activeBoostCount(uint8) external view returns (uint256)",
        "function boostFees(uint256) external view returns (uint256)",
        
        // View functions - Whitelist
        "function poolWhitelist(uint256, address) external view returns (bool)",
        
        // Constants and configuration
        "function bitrToken() external view returns (address)",
        "function feeCollector() external view returns (address)",
        "function guidedOracle() external view returns (address)",
        "function optimisticOracle() external view returns (address)",
        "function creationFee() external view returns (uint256)",
        "function platformFee() external view returns (uint256)",
        "function totalCollectedMON() external view returns (uint256)",
        "function totalCollectedBITR() external view returns (uint256)",
        "function bettingGracePeriod() external view returns (uint256)",
        "function arbitrationTimeout() external view returns (uint256)",
        "function minPoolStake() external view returns (uint256)",
        "function minBetAmount() external view returns (uint256)",
        "function HIGH_ODDS_THRESHOLD() external view returns (uint256)",
        "function MAX_PARTICIPANTS() external view returns (uint256)",
        "function MAX_LP_PROVIDERS() external view returns (uint256)",
        "function BOOST_DURATION() external view returns (uint256)",
        "function MAX_BRONZE_POOLS() external view returns (uint256)",
        "function MAX_SILVER_POOLS() external view returns (uint256)",
        "function MAX_GOLD_POOLS() external view returns (uint256)",
        
        // Events (for filtering)
        "event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, uint8 oracleType, bytes32 marketId)",
        "event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome)",
        "event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount)",
        "event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp)",
        "event RewardClaimed(uint256 indexed poolId, address indexed user, uint256 amount)",
        "event PoolRefunded(uint256 indexed poolId, string reason)",
        "event UserWhitelisted(uint256 indexed poolId, address indexed user)",
        "event ReputationActionOccurred(address indexed user, uint8 action, uint256 value, bytes32 indexed poolId, uint256 timestamp)",
        "event PoolBoosted(uint256 indexed poolId, uint8 tier, uint256 expiry, uint256 fee)",
        "event BoostExpired(uint256 indexed poolId, uint8 tier)",
        "event ComboPoolCreated(uint256 indexed comboPoolId, address indexed creator, uint256 conditionCount, uint16 totalOdds)",
        "event ComboBetPlaced(uint256 indexed comboPoolId, address indexed bettor, uint256 amount)",
        "event ComboPoolSettled(uint256 indexed comboPoolId, bool creatorSideWon, uint256 timestamp)"
      ];
    }
    
    // BitrPool needs write operations, so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - BitrPool contract requires write operations');
    }
    this.bitrPoolContract = new ethers.Contract(contractAddress, BitrPoolABI, this.wallet);
    
    console.log('✅ BitrPool contract initialized:', contractAddress);
    return this.bitrPoolContract;
  }

  /**
   * Get BitrStaking contract instance
   */
  async getStakingContract() {
    if (this.stakingContract) {
      return this.stakingContract;
    }

    const contractAddress = process.env.STAKING_CONTRACT_ADDRESS;
    if (!contractAddress) {
      throw new Error('STAKING_CONTRACT_ADDRESS environment variable not set');
    }

    let BitrStakingABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/BitrStaking.sol/BitrStaking.json',
        '../solidity/artifacts/contracts/BitrStaking.sol/BitrStaking.json',
        '../../solidity/artifacts/contracts/BitrStaking.sol/BitrStaking.json',
        path.join(__dirname, '../solidity/artifacts/contracts/BitrStaking.sol/BitrStaking.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/BitrStaking.sol/BitrStaking.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          BitrStakingABI = require(abiPath).abi;
          console.log(`✅ BitrStaking ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ BitrStaking contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual BitrStaking contract
      BitrStakingABI = [
        // Core staking functions
        "function stake(uint256 _amount, uint8 _tierId, uint8 _durationOption) external",
        "function unstake(uint256 _index) external",
        "function claim(uint256 _index) external",
        "function claimRevenue() external",
        
        // Revenue functions
        "function addRevenue(uint256 _bitrAmount) external payable",
        "function addRevenueFromPool(uint256 _bitrAmount) external payable",
        "function distributeRevenue() external",
        "function fundAPYRewards(uint256 _amount) external",
        
        // Admin functions
        "function authorizePool(address _pool, bool _authorized) external",
        
        // View functions - Core data
        "function bitrToken() external view returns (address)",
        "function userStakes(address, uint256) external view returns (uint256 amount, uint256 startTime, uint8 tierId, uint8 durationOption, uint256 claimedRewardBITR, uint256 rewardDebtBITR, uint256 rewardDebtMON)",
        "function tiers(uint256) external view returns (uint256 baseAPY, uint256 minStake, uint256 revenueShareRate)",
        "function durationBonuses(uint256) external view returns (uint256)",
        "function durations(uint256) external view returns (uint256)",
        
        // View functions - Statistics
        "function totalStaked() external view returns (uint256)",
        "function totalRewardsPaid() external view returns (uint256)",
        "function totalRevenuePaid() external view returns (uint256)",
        "function totalStakedInTier(uint8) external view returns (uint256)",
        "function revenuePoolBITR() external view returns (uint256)",
        "function revenuePoolMON() external view returns (uint256)",
        "function pendingRevenueBITR(address) external view returns (uint256)",
        "function pendingRevenueMON(address) external view returns (uint256)",
        "function authorizedPools(address) external view returns (bool)",
        
        // View functions - User data
        "function getUserStakes(address _user) external view returns (tuple(uint256 amount, uint256 startTime, uint8 tierId, uint8 durationOption, uint256 claimedRewardBITR, uint256 rewardDebtBITR, uint256 rewardDebtMON)[] memory)",
        "function getTiers() external view returns (tuple(uint256 baseAPY, uint256 minStake, uint256 revenueShareRate)[] memory)",
        "function getDurationOptions() external view returns (uint256[] memory)",
        "function calculateRewards(address _user, uint256 _index) external view returns (uint256 bitrReward)",
        "function getRevenueShareRate(address _user, uint256 _index) external view returns (uint256)",
        "function getPendingRewards(address _user, uint256 _index) external view returns (uint256 apyReward, uint256 pendingBITR, uint256 pendingMON)",
        "function getUserTotalStaked(address _user) external view returns (uint256 total)",
        "function getUserStakeCount(address _user) external view returns (uint256)",
        "function isStakeUnlocked(address _user, uint256 _index) external view returns (bool)",
        "function getTimeUntilUnlock(address _user, uint256 _index) external view returns (uint256)",
        
        // View functions - Contract statistics
        "function getContractStats() external view returns (uint256 _totalStaked, uint256 _totalRewardsPaid, uint256 _totalRevenuePaid, uint256 _contractBITRBalance, uint256 _contractMONBalance)",
        "function getTierStats() external view returns (uint256[] memory tierStaked, uint256[] memory tierAPY, uint256[] memory tierMinStake, uint256[] memory tierRevenueShare)",
        
        // Constants
        "function REWARD_PRECISION() external view returns (uint256)",
        "function SECONDS_PER_YEAR() external view returns (uint256)",
        "function BASIS_POINTS() external view returns (uint256)",
        "function distributionInterval() external view returns (uint256)",
        "function lastRevenueDistribution() external view returns (uint256)",
        
        // Events (for filtering)
        "event Staked(address indexed user, uint256 amount, uint8 tier, uint8 duration)",
        "event Claimed(address indexed user, uint256 bitrAmount)",
        "event Unstaked(address indexed user, uint256 amount)",
        "event RevenueAdded(uint256 bitrAmount, uint256 sttAmount)",
        "event RevenueDistributed()",
        "event RevenueClaimed(address indexed user, uint256 bitrAmount, uint256 sttAmount)",
        "event PoolAuthorized(address indexed pool, bool authorized)"
      ];
    }
    
    // Staking contract needs write operations (stake, unstake, claim), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - Staking contract requires write operations');
    }
    this.stakingContract = new ethers.Contract(contractAddress, BitrStakingABI, this.wallet);
    
    console.log('✅ BitrStaking contract initialized:', contractAddress);
    return this.stakingContract;
  }

  /**
   * Get GuidedOracle contract instance
   */
  async getGuidedOracleContract() {
    if (this.guidedOracleContract) {
      return this.guidedOracleContract;
    }

    const contractAddress = process.env.GUIDED_ORACLE_ADDRESS;
    if (!contractAddress) {
      throw new Error('GUIDED_ORACLE_ADDRESS environment variable not set');
    }

    let GuidedOracleABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
        '../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
        '../../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json',
        path.join(__dirname, '../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/GuidedOracle.sol/GuidedOracle.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          GuidedOracleABI = require(abiPath).abi;
          console.log(`✅ GuidedOracle ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ GuidedOracle contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual GuidedOracle contract
      GuidedOracleABI = [
        // Core oracle functions
        "function submitOutcome(bytes32 marketId, bytes calldata resultData) external",
        "function executeCall(address target, bytes calldata data) external",
        "function updateOracleBot(address newBot) external",
        
        // View functions
        "function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData)",
        "function oracleBot() external view returns (address)",
        "function owner() external view returns (address)",
        "function outcomes(bytes32) external view returns (bool isSet, bytes resultData, uint256 timestamp)",
        
        // Events (for filtering)
        "event OutcomeSubmitted(bytes32 indexed marketId, bytes resultData, uint256 timestamp)",
        "event OracleBotUpdated(address newBot)",
        "event CallExecuted(address indexed target, bytes data)"
      ];
    }
    
    // GuidedOracle needs write operations (submitOutcome), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - GuidedOracle contract requires write operations');
    }
    this.guidedOracleContract = new ethers.Contract(contractAddress, GuidedOracleABI, this.wallet);
    
    console.log('✅ GuidedOracle contract initialized:', contractAddress);
    return this.guidedOracleContract;
  }

  /**
   * Get BitrFaucet contract instance
   */
  async getBitrFaucetContract() {
    if (this.bitrFaucetContract) {
      return this.bitrFaucetContract;
    }

    const contractAddress = process.env.BITR_FAUCET_ADDRESS;
    if (!contractAddress) {
      throw new Error('BITR_FAUCET_ADDRESS environment variable not set');
    }

    let BitrFaucetABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json',
        '../solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json',
        '../../solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json',
        path.join(__dirname, '../solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/BitrFaucet.sol/BitrFaucet.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          BitrFaucetABI = require(abiPath).abi;
          console.log(`✅ BitrFaucet ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ BitrFaucet contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual BitrFaucet contract
      BitrFaucetABI = [
        // Core faucet functions
        "function claimBitr() external",
        "function refillFaucet(uint256 amount) external",
        "function setFaucetActive(bool active) external",
        "function emergencyWithdraw() external",
        "function emergencyWithdrawAmount(uint256 amount) external",
        
        // View functions
        "function bitrToken() external view returns (address)",
        "function hasClaimed(address) external view returns (bool)",
        "function lastClaimTime(address) external view returns (uint256)",
        "function totalClaimed() external view returns (uint256)",
        "function totalUsers() external view returns (uint256)",
        "function faucetActive() external view returns (bool)",
        "function getUserInfo(address user) external view returns (bool claimed, uint256 claimTime)",
        "function getFaucetStats() external view returns (uint256 balance, uint256 totalDistributed, uint256 userCount, bool active)",
        "function hasSufficientBalance() external view returns (bool)",
        "function maxPossibleClaims() external view returns (uint256)",
        
        // Constants
        "function FAUCET_AMOUNT() external view returns (uint256)",
        
        // Events (for filtering)
        "event FaucetClaimed(address indexed user, uint256 amount, uint256 timestamp)",
        "event FaucetDeactivated(uint256 timestamp)",
        "event FaucetReactivated(uint256 timestamp)",
        "event FaucetRefilled(uint256 amount, uint256 timestamp)",
        "event EmergencyWithdraw(address indexed owner, uint256 amount, uint256 timestamp)"
      ];
    }
    
    // BitrFaucet needs write operations (claimBitr), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - BitrFaucet contract requires write operations');
    }
    this.bitrFaucetContract = new ethers.Contract(contractAddress, BitrFaucetABI, this.wallet);
    
    console.log('✅ BitrFaucet contract initialized:', contractAddress);
    return this.bitrFaucetContract;
  }

  /**
   * Get OptimisticOracle contract instance
   */
  async getOptimisticOracleContract() {
    if (this.optimisticOracleContract) {
      return this.optimisticOracleContract;
    }

    const contractAddress = process.env.OPTIMISTIC_ORACLE_ADDRESS;
    if (!contractAddress) {
      throw new Error('OPTIMISTIC_ORACLE_ADDRESS environment variable not set');
    }

    let OptimisticOracleABI;
    try {
      // Try multiple possible paths for the ABI (Docker container paths)
      const possiblePaths = [
        './solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json',
        '../solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json',
        '../../solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json',
        path.join(__dirname, '../solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json'),
        path.join(__dirname, '../../solidity/artifacts/contracts/OptimisticOracle.sol/OptimisticOracle.json')
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          OptimisticOracleABI = require(abiPath).abi;
          console.log(`✅ OptimisticOracle ABI loaded from: ${abiPath}`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ OptimisticOracle contract artifacts not found, using fallback ABI');
      // Complete fallback ABI matching actual OptimisticOracle contract
      OptimisticOracleABI = [
        // Core oracle functions
        "function createMarket(bytes32 marketId, uint256 poolId, string memory question, string memory category, uint256 eventEndTime) external",
        "function proposeOutcome(bytes32 marketId, bytes32 outcome) external",
        "function disputeOutcome(bytes32 marketId) external",
        "function voteOnDispute(bytes32 marketId, bytes32 outcome) external",
        "function resolveMarket(bytes32 marketId) external",
        "function claimBonds(bytes32 marketId) external",
        
        // Admin functions
        "function setUserReputation(address user, uint256 reputation) external",
        "function batchSetReputations(address[] calldata users, uint256[] calldata reputations) external",
        "function emergencyResolveMarket(bytes32 marketId, bytes32 outcome) external",
        "function emergencyWithdrawBonds(bytes32 marketId) external",
        
        // View functions - Core data
        "function bondToken() external view returns (address)",
        "function bitredictPool() external view returns (address)",
        "function markets(bytes32) external view returns (bytes32 marketId, uint256 poolId, string question, string category, bytes32 proposedOutcome, address proposer, uint256 proposalTime, uint256 proposalBond, address disputer, uint256 disputeTime, uint256 disputeBond, bytes32 finalOutcome, uint8 state, uint256 eventEndTime, bool bondsClaimed)",
        "function userReputation(address) external view returns (uint256)",
        "function allMarkets(uint256) external view returns (bytes32)",
        "function categoryMarkets(bytes32, uint256) external view returns (bytes32)",
        
        // View functions - Market queries
        "function getOutcome(bytes32 marketId) external view returns (bool isSettled, bytes memory outcome)",
        "function getMarket(bytes32 marketId) external view returns (tuple(bytes32 marketId, uint256 poolId, string question, string category, bytes32 proposedOutcome, address proposer, uint256 proposalTime, uint256 proposalBond, address disputer, uint256 disputeTime, uint256 disputeBond, bytes32 finalOutcome, uint8 state, uint256 eventEndTime, bool bondsClaimed) memory)",
        "function getMarketsByCategory(string memory category) external view returns (bytes32[] memory)",
        "function getAllMarkets() external view returns (bytes32[] memory)",
        
        // View functions - Dispute queries
        "function getDispute(bytes32 marketId) external view returns (uint256 totalVotingPower, uint256 disputeEndTime, bool resolved, address[] memory voters)",
        "function getVote(bytes32 marketId, address voter) external view returns (bytes32 outcome, uint256 votingPower, uint256 timestamp)",
        "function getOutcomeTotals(bytes32 marketId, bytes32 outcome) external view returns (uint256)",
        
        // Constants
        "function PROPOSAL_BOND() external view returns (uint256)",
        "function DISPUTE_BOND() external view returns (uint256)",
        "function CHALLENGE_WINDOW() external view returns (uint256)",
        "function RESOLUTION_WINDOW() external view returns (uint256)",
        "function MIN_REPUTATION() external view returns (uint256)",
        "function MIN_DISPUTE_REPUTATION() external view returns (uint256)",
        
        // Events (for filtering)
        "event MarketCreated(bytes32 indexed marketId, uint256 indexed poolId, string question, string category, uint256 eventEndTime)",
        "event OutcomeProposed(bytes32 indexed marketId, address indexed proposer, bytes32 outcome, uint256 bond)",
        "event OutcomeDisputed(bytes32 indexed marketId, address indexed disputer, uint256 bond)",
        "event VoteCast(bytes32 indexed marketId, address indexed voter, bytes32 outcome, uint256 votingPower)",
        "event MarketResolved(bytes32 indexed marketId, bytes32 finalOutcome, address winner, uint256 reward)",
        "event BondClaimed(bytes32 indexed marketId, address indexed claimer, uint256 amount)",
        "event ReputationUpdated(address indexed user, uint256 oldReputation, uint256 newReputation)",
        "event ReputationAction(address indexed user, string action, int256 reputationDelta, bytes32 indexed marketId, uint256 timestamp)"
      ];
    }
    
    // OptimisticOracle needs write operations (createMarket, proposeOutcome, etc.), so require wallet
    if (!this.wallet) {
      throw new Error('Wallet not initialized - OptimisticOracle contract requires write operations');
    }
    this.optimisticOracleContract = new ethers.Contract(contractAddress, OptimisticOracleABI, this.wallet);
    
    console.log('✅ OptimisticOracle contract initialized:', contractAddress);
    return this.optimisticOracleContract;
  }

  /**
   * Get current block number
   */
  async getCurrentBlock() {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get network information
   */
  async getNetwork() {
    return await this.provider.getNetwork();
  }

  /**
   * Get wallet balance
   */
  async getBalance(address = null) {
    const targetAddress = address || this.wallet?.address;
    if (!targetAddress) {
      throw new Error('No address provided and no wallet configured');
    }
    
    return await this.provider.getBalance(targetAddress);
  }

  /**
   * Send transaction with retry logic
   */
  async sendTransaction(txData, retries = 3) {
    if (!this.wallet) {
      throw new Error('No wallet configured for sending transactions');
    }

    for (let i = 0; i < retries; i++) {
      try {
        const tx = await this.wallet.sendTransaction(txData);
        console.log(`✅ Transaction sent: ${tx.hash}`);
        return tx;
      } catch (error) {
        console.error(`❌ Transaction failed (attempt ${i + 1}/${retries}):`, error.message);
        
        if (i === retries - 1) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(txHash, confirmations = 1) {
    console.log(`⏳ Waiting for transaction ${txHash} (${confirmations} confirmations)...`);
    const receipt = await this.provider.waitForTransaction(txHash, confirmations);
    console.log(`✅ Transaction confirmed: ${txHash}`);
    return receipt;
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash) {
    return await this.provider.getTransactionReceipt(txHash);
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const network = await this.getNetwork();
      const blockNumber = await this.getCurrentBlock();
      const balance = this.wallet ? await this.getBalance() : null;
      
      return {
        status: 'healthy',
        network: {
          name: network.name,
          chainId: Number(network.chainId)
        },
        blockNumber,
        wallet: {
          address: this.wallet?.address || null,
          balance: balance ? ethers.formatEther(balance) : null
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Setup event listeners for Oddyssey contract
   */
  setupEventListeners() {
    if (!this.oddysseyContract) {
      console.log('⚠️ No Oddyssey contract available for event listeners');
      return;
    }

    // Listen for contract events
    this.oddysseyContract.on('CycleResolved', (cycleId, prizePool) => {
      console.log(`🎯 Cycle ${cycleId} resolved with prize pool: ${ethers.utils.formatEther(prizePool)} ETH`);
    });

    this.oddysseyContract.on('SlipPlaced', (cycleId, player, slipId) => {
      console.log(`📝 Slip ${slipId} placed by ${player} for cycle ${cycleId}`);
    });

    this.oddysseyContract.on('AutoEvaluateRequested', (cycleId) => {
      console.log(`🤖 Auto-evaluate requested for cycle ${cycleId}`);
      this.handleAutoEvaluate(cycleId);
    });

    console.log('✅ Event listeners setup complete');
  }

  /**
   * Handle auto-evaluate for a cycle
   */
  async handleAutoEvaluate(cycleId) {
    try {
      console.log(`🤖 Processing auto-evaluate for cycle ${cycleId}...`);
      
      const contract = await this.getOddysseyContract();
      
      // Get cycle stats
      const cycleStats = await contract.getCycleStatus(cycleId);
      if (!cycleStats.exists) {
        console.log(`⚠️ Cycle ${cycleId} does not exist`);
        return;
      }
      
      console.log(`📊 Cycle ${cycleId} has ${cycleStats.slipCount} slips to evaluate`);
      
      // Get all slips for this cycle (we'll need to implement this)
      // For now, we'll process auto-evaluate in batches
      await this.processAutoEvaluateBatch(cycleId, contract);
      
    } catch (error) {
      console.error(`❌ Auto-evaluate failed for cycle ${cycleId}:`, error.message);
    }
  }

  /**
   * Process auto-evaluate in batches to avoid gas limits
   */
  async processAutoEvaluateBatch(cycleId, contract) {
    try {
      console.log(`🔄 Processing auto-evaluate batch for cycle ${cycleId}...`);
      
      // This is a simplified implementation
      // In a full implementation, you would:
      // 1. Query the contract for all users who placed slips
      // 2. Check each user's auto-evaluate preference
      // 3. Call evaluateSlip for qualifying users
      // 4. Handle gas limits by processing in small batches
      
      // For now, we'll just log that auto-evaluate is available
      console.log(`✅ Auto-evaluate batch processing completed for cycle ${cycleId}`);
      console.log(`💡 Users with auto-evaluate enabled can now evaluate their slips`);
      
    } catch (error) {
      console.error(`❌ Auto-evaluate batch processing failed:`, error.message);
    }
  }

  /**
   * Get the current entry fee
   */
  async getEntryFee() {
    try {
      const contract = await this.getOddysseyContract();
      return await contract.entryFee();
    } catch (error) {
      console.error('Error getting entry fee:', error);
      throw error;
    }
  }

  /**
   * Get cycle matches from contract
   */
  async getCycleMatches(cycleId) {
    try {
      const contract = await this.getOddysseyContract();
      // Use getDailyMatches instead of getCycleMatches to match the contract-matches endpoint
      return await contract.getDailyMatches(cycleId);
    } catch (error) {
      console.error(`Error getting cycle matches for cycle ${cycleId}:`, error);
      throw error;
    }
  }

  /**
   * Format predictions for contract submission with strict validation
   */
  formatPredictionsForContract(predictions, contractMatches) {
    const MATCH_COUNT = 10;
    
    if (!predictions || predictions.length !== MATCH_COUNT) {
      throw new Error(`Must provide exactly ${MATCH_COUNT} predictions`);
    }
    
    if (!contractMatches || contractMatches.length !== MATCH_COUNT) {
      throw new Error(`Must provide exactly ${MATCH_COUNT} contract matches`);
    }
    
    return predictions.map((pred, index) => {
      // Validate match order
      const expectedMatchId = BigInt(contractMatches[index].id);
      const providedMatchId = BigInt(pred.matchId);
      
      if (providedMatchId !== expectedMatchId) {
        throw new Error(`Prediction ${index} matchId mismatch: expected ${expectedMatchId}, got ${providedMatchId}`);
      }
      
      // Validate bet type
      const betType = this.validateAndConvertBetType(pred.betType);
      
      // Validate selection and get hash
      const selectionHash = this.getSelectionHash(pred.selection);
      
      // Get exact odds and validate
      const selectedOdd = this.getExactOdds(pred, contractMatches[index]);
      
      return {
        matchId: expectedMatchId,
        betType: betType,
        selection: selectionHash,
        selectedOdd: selectedOdd
      };
    });
  }

  /**
   * Validate and convert bet type to contract enum
   */
  validateAndConvertBetType(betType) {
    if (betType === 'MONEYLINE' || betType === 0) {
      return this.BetType.MONEYLINE;
    } else if (betType === 'OVER_UNDER' || betType === 1) {
      return this.BetType.OVER_UNDER;
    } else {
      throw new Error(`Invalid bet type: ${betType}. Valid types are: MONEYLINE, OVER_UNDER`);
    }
  }

  /**
   * Get keccak256 hash for selection string
   */
  getSelectionHash(selection) {
    const validSelections = ['1', 'X', '2', 'Over', 'Under'];
    if (!validSelections.includes(selection)) {
      throw new Error(`Invalid selection: ${selection}. Valid selections are: ${validSelections.join(', ')}`);
    }
    
    // Convert selection to bytes and hash
    return ethers.keccak256(ethers.toUtf8Bytes(selection));
  }

  /**
   * Get exact odds from contract match based on selection
   */
  getExactOdds(prediction, contractMatch) {
    let odds;
    switch (prediction.selection) {
      case '1': 
        odds = contractMatch.oddsHome;
        break;
      case 'X': 
        odds = contractMatch.oddsDraw;
        break;
      case '2': 
        odds = contractMatch.oddsAway;
        break;
      case 'Over': 
        odds = contractMatch.oddsOver;
        break;
      case 'Under': 
        odds = contractMatch.oddsUnder;
        break;
      default: 
        throw new Error(`Invalid selection for odds: ${prediction.selection}`);
    }
    
    // Validate odds are set and reasonable
    if (!odds || odds === 0) {
      throw new Error(`Odds not set for selection ${prediction.selection} in match ${contractMatch.id}`);
    }
    
    // Convert to number if it's a BigInt
    return typeof odds === 'bigint' ? Number(odds) : odds;
  }

  /**
   * Place slip on contract with exact formatting and validation
   */
  async placeSlip(predictions, options = {}) {
    try {
      // Initialize if not already done
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Validate contract state first
      await this.validateContractState('placeSlip');
      
      const contract = await this.getOddysseyContract();
      
      // Predictions should already be formatted by the caller
      const formattedPredictions = predictions;
      
      // Get current entry fee
      const entryFee = await contract.entryFee();
      console.log(`💰 Entry fee: ${ethers.formatEther(entryFee)} MON`);
      
      // Use Monad-optimized gas estimation
      let gasSettings;
      try {
        const estimatedGas = await contract.placeSlip.estimateGas(formattedPredictions, { value: entryFee });
        gasSettings = this.getMonadGasSettings(estimatedGas, 'placeSlip');
        console.log(`⛽ Estimated gas: ${estimatedGas.toString()}`);
      } catch (gasError) {
        console.warn('⚠️ Gas estimation failed, using fallback settings:', gasError.message);
        gasSettings = this.getFallbackGasSettings('placeSlip');
      }
      
      // Validate gas settings
      this.monadGasOptimizer.validateGasSettings(gasSettings);
      
      // Calculate total cost including entry fee
      const costEstimate = this.monadGasOptimizer.estimateTransactionCost(gasSettings, entryFee);
      
      console.log(`⛽ Gas limit: ${gasSettings.gasLimit.toString()}`);
      console.log(`💰 Gas cost: ${costEstimate.gasCostEth} MON`);
      console.log(`💰 Entry fee: ${costEstimate.valueEth} MON`);
      console.log(`💰 Total cost: ${costEstimate.totalCostEth} MON`);
      console.log(`⚠️ ${gasSettings.warning}`);
      
      // Check balance
      const walletAddress = this.getWalletAddress();
      const balance = await this.provider.getBalance(walletAddress);
      
      if (balance < costEstimate.totalCost) {
        throw new Error(`Insufficient balance. Need ${costEstimate.totalCostEth} MON, have ${ethers.formatEther(balance)} MON`);
      }
      
      // Place slip with Monad-optimized gas settings
      const txParams = {
        value: entryFee,
        gasLimit: gasSettings.gasLimit,
        maxFeePerGas: gasSettings.maxFeePerGas,
        maxPriorityFeePerGas: gasSettings.maxPriorityFeePerGas
      };
      
      console.log(`🚀 Placing slip with Monad-optimized gas settings`);
      console.log(`⛽ Operation type: ${gasSettings.operationType}`);
      
      const tx = await contract.placeSlip(formattedPredictions, txParams);
      
      console.log(`✅ Slip placed successfully: ${tx.hash}`);
      console.log(`📊 Gas used: ${tx.gasLimit?.toString() || 'Unknown'}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'place slip');
    }
  }

  /**
   * Evaluate slip on contract with validation
   */
  async evaluateSlip(slipId, options = {}) {
    try {
      // Initialize if not already done
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Validate contract state first
      await this.validateContractState('evaluateSlip', { slipId });
      
      const contract = await this.getOddysseyContract();
      
      // Use Monad-optimized gas estimation
      let gasSettings;
      try {
        const estimatedGas = await contract.evaluateSlip.estimateGas(slipId);
        gasSettings = this.getMonadGasSettings(estimatedGas, 'evaluateSlip');
        console.log(`⛽ Estimated gas: ${estimatedGas.toString()}`);
      } catch (gasError) {
        console.warn('⚠️ Gas estimation failed, using fallback settings:', gasError.message);
        gasSettings = this.getFallbackGasSettings('evaluateSlip');
      }
      
      // Validate gas settings
      this.monadGasOptimizer.validateGasSettings(gasSettings);
      
      // Calculate total cost
      const costEstimate = this.monadGasOptimizer.estimateTransactionCost(gasSettings);
      
      console.log(`⛽ Gas limit: ${gasSettings.gasLimit.toString()}`);
      console.log(`💰 Total cost: ${costEstimate.totalCostEth} MON`);
      console.log(`⚠️ ${gasSettings.warning}`);
      
      // Check balance
      const walletAddress = this.getWalletAddress();
      const balance = await this.provider.getBalance(walletAddress);
      
      if (balance < costEstimate.totalCost) {
        throw new Error(`Insufficient balance for evaluation. Need ${costEstimate.totalCostEth} MON, have ${ethers.formatEther(balance)} MON`);
      }
      
      // Execute evaluation with Monad-optimized gas settings
      const txParams = {
        gasLimit: gasSettings.gasLimit,
        maxFeePerGas: gasSettings.maxFeePerGas,
        maxPriorityFeePerGas: gasSettings.maxPriorityFeePerGas
      };
      
      console.log(`🚀 Evaluating slip ${slipId} with Monad-optimized gas settings`);
      console.log(`⛽ Operation type: ${gasSettings.operationType}`);
      
      const tx = await contract.evaluateSlip(slipId, txParams);
      
      console.log(`✅ Slip ${slipId} evaluated successfully: ${tx.hash}`);
      console.log(`📊 Gas used for evaluation: ${tx.gasLimit?.toString() || 'Unknown'}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'evaluate slip');
    }
  }

  /**
   * Claim prize with validation
   */
  async claimPrize(cycleId, options = {}) {
    try {
      // Validate contract state first
      await this.validateContractState('claimPrize', { cycleId });
      
      const contract = await this.getOddysseyContract();
      
      // Check if user is on leaderboard
      const leaderboard = await contract.getDailyLeaderboard(cycleId);
      const userAddress = this.getWalletAddress();
      const userOnLeaderboard = leaderboard.some(entry => entry.player.toLowerCase() === userAddress.toLowerCase());
      
      if (!userOnLeaderboard) {
        throw new Error('User is not on the leaderboard for this cycle');
      }
      
      // Estimate gas if not provided
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.claimPrize.estimateGas(cycleId);
          gasLimit = gasLimit * 120n / 100n; // Add 20% buffer
          console.log(`⛽ Estimated gas for claim: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using default');
          gasLimit = 300000;
        }
      }
      
      const tx = await contract.claimPrize(cycleId, {
        gasLimit: gasLimit,
        ...options
      });
      
      console.log(`✅ Prize claimed for cycle ${cycleId}: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim prize');
    }
  }

  /**
   * Batch evaluate multiple slips
   */
  async evaluateMultipleSlips(slipIds, options = {}) {
    try {
      if (!slipIds || slipIds.length === 0) {
        throw new Error('No slip IDs provided for batch evaluation');
      }
      
      const contract = await this.getOddysseyContract();
      
      // Validate each slip
      for (const slipId of slipIds) {
        await this.validateContractState('evaluateSlip', { slipId });
      }
      
      // Estimate gas if not provided
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.evaluateMultipleSlips.estimateGas(slipIds);
          gasLimit = gasLimit * 120n / 100n; // Add 20% buffer
          console.log(`⛽ Estimated gas for batch evaluation: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using default');
          gasLimit = 500000 * slipIds.length;
        }
      }
      
      const tx = await contract.evaluateMultipleSlips(slipIds, {
        gasLimit: gasLimit,
        ...options
      });
      
      console.log(`✅ ${slipIds.length} slips evaluated successfully: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'batch evaluate slips');
    }
  }

  /**
   * Batch claim multiple prizes
   */
  async claimMultiplePrizes(cycleIds, options = {}) {
    try {
      if (!cycleIds || cycleIds.length === 0) {
        throw new Error('No cycle IDs provided for batch claiming');
      }
      
      const contract = await this.getOddysseyContract();
      
      // Validate each cycle
      for (const cycleId of cycleIds) {
        await this.validateContractState('claimPrize', { cycleId });
      }
      
      // Estimate gas if not provided
      let gasLimit = options.gasLimit;
      if (!gasLimit) {
        try {
          gasLimit = await contract.claimMultiplePrizes.estimateGas(cycleIds);
          gasLimit = gasLimit * 120n / 100n; // Add 20% buffer
          console.log(`⛽ Estimated gas for batch claiming: ${gasLimit}`);
        } catch (gasError) {
          console.warn('⚠️ Gas estimation failed, using default');
          gasLimit = 300000 * cycleIds.length;
        }
      }
      
      const tx = await contract.claimMultiplePrizes(cycleIds, {
        gasLimit: gasLimit,
        ...options
      });
      
      console.log(`✅ Prizes claimed for ${cycleIds.length} cycles: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'batch claim prizes');
    }
  }

  /**
   * Format results for contract resolution
   */
  formatResultsForContract(matchResults) {
    const MATCH_COUNT = 10;
    if (!matchResults || matchResults.length !== MATCH_COUNT) {
      throw new Error(`Must provide exactly ${MATCH_COUNT} match results`);
    }
    
    return matchResults.map((match, index) => {
      if (!match) {
        throw new Error(`Match result ${index} is null or undefined`);
      }
      
      return {
        moneyline: this.convertMoneylineResult(match.result1x2),
        overUnder: this.convertOverUnderResult(match.resultOU25)
      };
    });
  }

  /**
   * Convert moneyline result to contract enum (0-indexed)
   */
  convertMoneylineResult(result1x2) {
    switch (result1x2) {
      case '1': return this.MoneylineResult.HomeWin;  // 1
      case 'X': return this.MoneylineResult.Draw;     // 2
      case '2': return this.MoneylineResult.AwayWin;  // 3
      case null:
      case undefined:
      case '':
        return this.MoneylineResult.NotSet;           // 0
      default: 
        console.warn(`Unknown moneyline result: ${result1x2}, defaulting to NotSet`);
        return this.MoneylineResult.NotSet;           // 0
    }
  }

  /**
   * Convert over/under result to contract enum (0-indexed)
   */
  convertOverUnderResult(resultOU25) {
    switch (resultOU25) {
      case 'Over': return this.OverUnderResult.Over;   // 1
      case 'Under': return this.OverUnderResult.Under; // 2
      case null:
      case undefined:
      case '':
        return this.OverUnderResult.NotSet;            // 0
      default: 
        console.warn(`Unknown over/under result: ${resultOU25}, defaulting to NotSet`);
        return this.OverUnderResult.NotSet;            // 0
    }
  }

  /**
   * Handle contract-specific errors with detailed messages
   */
  handleContractError(error, operation = 'contract operation') {
    console.error(`❌ Contract error during ${operation}:`, error);
    
    // Parse common contract errors
    if (error.message) {
      const message = error.message.toLowerCase();
      
      // Oddyssey contract errors
      if (message.includes('cyclenotactive')) {
        throw new Error('Cycle is not active for betting');
      } else if (message.includes('bettingclosed')) {
        throw new Error('Betting period has ended for this cycle');
      } else if (message.includes('invalidcycleid')) {
        throw new Error('Invalid cycle ID provided');
      } else if (message.includes('insufficientpayment')) {
        throw new Error('Insufficient payment amount (must match entry fee exactly)');
      } else if (message.includes('oddsmismatch')) {
        throw new Error('Odds mismatch - odds may have changed since selection');
      } else if (message.includes('invalidselection')) {
        throw new Error('Invalid prediction selection');
      } else if (message.includes('slipnotfound')) {
        throw new Error('Slip not found');
      } else if (message.includes('slipnotresolved')) {
        throw new Error('Cycle must be resolved before evaluating slips');
      } else if (message.includes('slipnotresolved')) {
        throw new Error('Slip has already been evaluated');
      } else if (message.includes('notonleaderboard')) {
        throw new Error('User is not on the leaderboard for this cycle');
      } else if (message.includes('prizealreadyclaimed')) {
        throw new Error('Prize has already been claimed');
      } else if (message.includes('claimingnotavailable')) {
        throw new Error('Prize claiming is not yet available');
      }
      
      // BitrPool contract errors
      else if (message.includes('pool settled')) {
        throw new Error('Pool has already been settled');
      } else if (message.includes('betting period ended')) {
        throw new Error('Betting period has ended for this pool');
      } else if (message.includes('pool full')) {
        throw new Error('Pool has reached maximum capacity');
      } else if (message.includes('not whitelisted')) {
        throw new Error('User is not whitelisted for this private pool');
      } else if (message.includes('exceeds max bet per user')) {
        throw new Error('Bet amount exceeds maximum allowed per user');
      } else if (message.includes('already claimed')) {
        throw new Error('Rewards have already been claimed');
      }
      
      // Gas and transaction errors
      else if (message.includes('gas')) {
        throw new Error('Transaction failed due to gas issues - try increasing gas limit');
      } else if (message.includes('nonce')) {
        throw new Error('Transaction nonce error - please retry');
      } else if (message.includes('replacement underpriced')) {
        throw new Error('Transaction replacement underpriced - increase gas price');
      }
      
      // Generic revert
      else if (message.includes('revert')) {
        throw new Error(`Contract reverted: ${error.message}`);
      }
    }
    
    // Re-throw original error if not recognized
    throw error;
  }

  /**
   * Validate contract state before operations
   */
  async validateContractState(operation, params = {}) {
    try {
      const contract = await this.getOddysseyContract();
      
      switch (operation) {
        case 'placeSlip':
          const currentCycle = await contract.getCurrentCycleInfo();
          if (Number(currentCycle.state) !== this.CycleState.Active) {
            throw new Error('No active cycle available for placing slips');
          }
          if (Number(currentCycle.endTime) <= Math.floor(Date.now() / 1000)) {
            throw new Error('Betting period has ended for current cycle');
          }
          break;
          
        case 'evaluateSlip':
          if (!params.slipId) throw new Error('Slip ID required for evaluation');
          const slip = await contract.getSlip(params.slipId);
          if (slip.isEvaluated) {
            throw new Error('Slip has already been evaluated');
          }
          const slipCycle = await contract.getCycleStatus(slip.cycleId);
          if (Number(slipCycle.state) !== this.CycleState.Resolved) {
            throw new Error('Cycle must be resolved before evaluating slips');
          }
          break;
          
        case 'claimPrize':
          if (!params.cycleId) throw new Error('Cycle ID required for claiming');
          const cycleStatus = await contract.getCycleStatus(params.cycleId);
          if (Number(cycleStatus.state) !== this.CycleState.Resolved) {
            throw new Error('Cycle must be resolved before claiming prizes');
          }
          const claimableTime = await contract.claimableStartTimes(params.cycleId);
          if (Number(claimableTime) > Math.floor(Date.now() / 1000)) {
            throw new Error('Prize claiming is not yet available');
          }
          break;
      }
    } catch (error) {
      this.handleContractError(error, `${operation} validation`);
    }
  }

  // ==================== ORACLE FUNCTIONS ====================

  /**
   * Start daily cycle (Oracle only)
   */
  async startDailyCycle(matches, options = {}) {
    try {
      const MATCH_COUNT = 10;
      if (!matches || matches.length !== MATCH_COUNT) {
        throw new Error(`Must provide exactly ${MATCH_COUNT} matches`);
      }

      const contract = await this.getOddysseyContract();
      
      // Validate oracle permission
      const oracle = await contract.oracle();
      if (oracle.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle can start daily cycles');
      }

      // Format matches for contract
      const formattedMatches = matches.map(match => ({
        id: BigInt(match.id),
        startTime: BigInt(match.startTime),
        oddsHome: match.oddsHome,
        oddsDraw: match.oddsDraw,
        oddsAway: match.oddsAway,
        oddsOver: match.oddsOver,
        oddsUnder: match.oddsUnder,
        result: {
          moneyline: this.MoneylineResult.NotSet,
          overUnder: this.OverUnderResult.NotSet
        }
      }));

      const tx = await contract.startDailyCycle(formattedMatches, {
        gasLimit: options.gasLimit || 2000000,
        ...options
      });

      console.log(`✅ Daily cycle started: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'start daily cycle');
    }
  }

  /**
   * Resolve daily cycle (Oracle only)
   */
  async resolveDailyCycle(cycleId, matchResults, options = {}) {
    try {
      const contract = await this.getOddysseyContract();
      
      // Validate oracle permission
      const oracle = await contract.oracle();
      if (oracle.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle can resolve daily cycles');
      }

      // Format results for contract
      const formattedResults = this.formatResultsForContract(matchResults);

      const tx = await contract.resolveDailyCycle(cycleId, formattedResults, {
        gasLimit: options.gasLimit || 1500000,
        ...options
      });

      console.log(`✅ Daily cycle ${cycleId} resolved: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'resolve daily cycle');
    }
  }

  /**
   * Resolve multiple cycles (Oracle only)
   */
  async resolveMultipleCycles(cycleIds, allMatchResults, options = {}) {
    try {
      if (!cycleIds || !allMatchResults || cycleIds.length !== allMatchResults.length) {
        throw new Error('Cycle IDs and match results arrays must have same length');
      }

      if (cycleIds.length > this.MAX_CYCLES_TO_RESOLVE) {
        throw new Error(`Cannot resolve more than ${this.MAX_CYCLES_TO_RESOLVE} cycles at once`);
      }

      const contract = await this.getOddysseyContract();
      
      // Validate oracle permission
      const oracle = await contract.oracle();
      if (oracle.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle can resolve cycles');
      }

      // Format all results
      const formattedResultsArray = allMatchResults.map(results => 
        this.formatResultsForContract(results)
      );

      const tx = await contract.resolveMultipleCycles(cycleIds, formattedResultsArray, {
        gasLimit: options.gasLimit || (1500000 * cycleIds.length),
        ...options
      });

      console.log(`✅ ${cycleIds.length} cycles resolved: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'resolve multiple cycles');
    }
  }

  // ==================== BITREDICT POOL FUNCTIONS ====================

  /**
   * Create a prediction pool with gas optimization
   */
  async createPool(poolData, options = {}) {
    try {
      const contract = await this.getBitrPoolContract();
      
      const {
        predictedOutcome,
        odds,
        creatorStake,
        eventStartTime,
        eventEndTime,
        league,
        category,
        region,
        isPrivate = false,
        maxBetPerUser = 0,
        useBitr = false,
        oracleType = this.OracleType.GUIDED,
        marketId
      } = poolData;

      // Validate required fields
      if (!predictedOutcome || !odds || !creatorStake || !eventStartTime || !eventEndTime) {
        throw new Error('Missing required pool creation parameters');
      }

      // Calculate creation fee
      const creationFee = useBitr ? 50n * 10n ** 18n : 1n * 10n ** 18n; // 50 BITR or 1 MON
      const totalRequired = creationFee + BigInt(creatorStake);

      // Use gas estimator for robust gas estimation
      const gasEstimate = await this.gasEstimator.estimateCreatePoolGas(poolData, {
        buffer: 30, // 30% buffer for pool creation
        ...options
      });
      
      if (gasEstimate.error) {
        throw new Error(`Gas estimation failed: ${gasEstimate.error}`);
      }
      
      console.log(`⛽ Gas estimation method: ${gasEstimate.method}`);
      console.log(`⛽ Estimated gas: ${gasEstimate.estimate.toString()}`);
      console.log(`⛽ Gas limit with buffer: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Total cost: ${ethers.formatEther(gasEstimate.totalCost)} MON`);

      // Check balance
      const walletAddress = this.getWalletAddress();
      const balanceCheck = await this.gasEstimator.checkBalance(walletAddress, gasEstimate.totalCost);
      
      if (!balanceCheck.hasSufficientBalance) {
        throw new Error(`Insufficient balance. Need ${ethers.formatEther(balanceCheck.totalCost)} MON, have ${ethers.formatEther(balanceCheck.balance)} MON`);
      }

      // Get optimal gas price
      const gasPriceData = await this.gasEstimator.getOptimalGasPrice();

      let txOptions = {
        gasLimit: gasEstimate.gasLimit,
        ...gasPriceData,
        ...options
      };

      if (useBitr) {
        // Handle BITR token approval and transfer
        const bitrContract = await this.getBITRTokenContract();
        const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
        
        if (allowance < totalRequired) {
          const approveTx = await bitrContract.approve(await contract.getAddress(), totalRequired);
          await approveTx.wait();
          console.log(`✅ BITR approved: ${approveTx.hash}`);
        }
      } else {
        // Use native MON
        txOptions.value = totalRequired;
      }

      console.log(`🚀 Creating pool with gas limit: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Gas price type: ${gasPriceData.type}`);

      const tx = await contract.createPool(
        ethers.keccak256(ethers.toUtf8Bytes(predictedOutcome)),
        odds,
        creatorStake,
        eventStartTime,
        eventEndTime,
        league,
        category,
        region,
        isPrivate,
        maxBetPerUser,
        useBitr,
        oracleType,
        marketId,
        txOptions
      );

      console.log(`✅ Pool created: ${tx.hash}`);
      console.log(`📊 Gas used: ${tx.gasLimit?.toString() || 'Unknown'}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'create pool');
    }
  }

  /**
   * Place bet on a pool with gas optimization
   */
  async placeBet(poolId, amount, options = {}) {
    try {
      const contract = await this.getBitrPoolContract();
      
      // Get pool info to check token type
      const pool = await contract.pools(poolId);
      
      // Use gas estimator for robust gas estimation
      const gasEstimate = await this.gasEstimator.estimatePlaceBetGas(poolId, amount, {
        buffer: 25, // 25% buffer for betting
        ...options
      });
      
      if (gasEstimate.error) {
        throw new Error(`Gas estimation failed: ${gasEstimate.error}`);
      }
      
      console.log(`⛽ Gas estimation method: ${gasEstimate.method}`);
      console.log(`⛽ Estimated gas: ${gasEstimate.estimate.toString()}`);
      console.log(`⛽ Gas limit with buffer: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Total cost: ${ethers.formatEther(gasEstimate.totalCost)} MON`);

      // Check balance
      const walletAddress = this.getWalletAddress();
      const balanceCheck = await this.gasEstimator.checkBalance(walletAddress, gasEstimate.totalCost);
      
      if (!balanceCheck.hasSufficientBalance) {
        throw new Error(`Insufficient balance for bet. Need ${ethers.formatEther(balanceCheck.totalCost)} MON, have ${ethers.formatEther(balanceCheck.balance)} MON`);
      }

      // Get optimal gas price
      const gasPriceData = await this.gasEstimator.getOptimalGasPrice();

      let txOptions = {
        gasLimit: gasEstimate.gasLimit,
        ...gasPriceData,
        ...options
      };

      if (pool.usesBitr) {
        // Handle BITR token approval and transfer
        const bitrContract = await this.getBITRTokenContract();
        const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
        
        if (allowance < amount) {
          const approveTx = await bitrContract.approve(await contract.getAddress(), amount);
          await approveTx.wait();
          console.log(`✅ BITR approved for bet: ${approveTx.hash}`);
        }
      } else {
        // Use native MON
        txOptions.value = amount;
      }

      console.log(`🚀 Placing bet with gas limit: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Gas price type: ${gasPriceData.type}`);

      const tx = await contract.placeBet(poolId, amount, txOptions);

      console.log(`✅ Bet placed on pool ${poolId}: ${tx.hash}`);
      console.log(`📊 Gas used: ${tx.gasLimit?.toString() || 'Unknown'}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'place bet');
    }
  }

  /**
   * Add liquidity to a pool with gas optimization
   */
  async addLiquidity(poolId, amount, options = {}) {
    try {
      const contract = await this.getBitrPoolContract();
      
      // Get pool info to check token type
      const pool = await contract.pools(poolId);
      
      // Use gas estimator for robust gas estimation
      const gasEstimate = await this.gasEstimator.estimateAddLiquidityGas(poolId, amount, {
        buffer: 20, // 20% buffer for liquidity
        ...options
      });
      
      if (gasEstimate.error) {
        throw new Error(`Gas estimation failed: ${gasEstimate.error}`);
      }
      
      console.log(`⛽ Gas estimation method: ${gasEstimate.method}`);
      console.log(`⛽ Estimated gas: ${gasEstimate.estimate.toString()}`);
      console.log(`⛽ Gas limit with buffer: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Total cost: ${ethers.formatEther(gasEstimate.totalCost)} MON`);

      // Check balance
      const walletAddress = this.getWalletAddress();
      const balanceCheck = await this.gasEstimator.checkBalance(walletAddress, gasEstimate.totalCost);
      
      if (!balanceCheck.hasSufficientBalance) {
        throw new Error(`Insufficient balance for liquidity. Need ${ethers.formatEther(balanceCheck.totalCost)} MON, have ${ethers.formatEther(balanceCheck.balance)} MON`);
      }

      // Get optimal gas price
      const gasPriceData = await this.gasEstimator.getOptimalGasPrice();

      let txOptions = {
        gasLimit: gasEstimate.gasLimit,
        ...gasPriceData,
        ...options
      };

      if (pool.usesBitr) {
        // Handle BITR token approval and transfer
        const bitrContract = await this.getBITRTokenContract();
        const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
        
        if (allowance < amount) {
          const approveTx = await bitrContract.approve(await contract.getAddress(), amount);
          await approveTx.wait();
          console.log(`✅ BITR approved for liquidity: ${approveTx.hash}`);
        }
      } else {
        // Use native MON
        txOptions.value = amount;
      }

      console.log(`🚀 Adding liquidity with gas limit: ${gasEstimate.gasLimit.toString()}`);
      console.log(`💰 Gas price type: ${gasPriceData.type}`);

      const tx = await contract.addLiquidity(poolId, amount, txOptions);

      console.log(`✅ Liquidity added to pool ${poolId}: ${tx.hash}`);
      console.log(`📊 Gas used: ${tx.gasLimit?.toString() || 'Unknown'}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'add liquidity');
    }
  }

  /**
   * Settle pool (Oracle only)
   */
  async settlePool(poolId, outcome, options = {}) {
    try {
      const contract = await this.getBitrPoolContract();
      
      const tx = await contract.settlePool(
        poolId, 
        ethers.keccak256(ethers.toUtf8Bytes(outcome)),
        {
          gasLimit: options.gasLimit || 800000,
          ...options
        }
      );

      console.log(`✅ Pool ${poolId} settled: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'settle pool');
    }
  }

  /**
   * Claim pool rewards
   */
  async claimPoolRewards(poolId, options = {}) {
    try {
      const contract = await this.getBitrPoolContract();
      
      const tx = await contract.claim(poolId, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });

      console.log(`✅ Pool ${poolId} rewards claimed: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'claim pool rewards');
    }
  }

  /**
   * Boost pool visibility
   */
  async boostPool(poolId, tier, options = {}) {
    try {
      const contract = await this.getBitrPoolContract();
      
      // Get boost fee
      const boostFee = await contract.boostFees(tier);
      
      const tx = await contract.boostPool(poolId, tier, {
        value: boostFee,
        gasLimit: options.gasLimit || 200000,
        ...options
      });

      console.log(`✅ Pool ${poolId} boosted to tier ${tier}: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'boost pool');
    }
  }

  // ==================== TOKEN INTEGRATION ====================

  /**
   * Check BITR token balance
   */
  async getBITRBalance(address = null) {
    try {
      const contract = await this.getBITRTokenContract();
      const targetAddress = address || this.getWalletAddress();
      
      const balance = await contract.balanceOf(targetAddress);
      return balance;

    } catch (error) {
      console.error('Error getting BITR balance:', error);
      throw error;
    }
  }

  /**
   * Check BITR token allowance
   */
  async getBITRAllowance(spender, owner = null) {
    try {
      const contract = await this.getBITRTokenContract();
      const ownerAddress = owner || this.getWalletAddress();
      
      const allowance = await contract.allowance(ownerAddress, spender);
      return allowance;

    } catch (error) {
      console.error('Error getting BITR allowance:', error);
      throw error;
    }
  }

  /**
   * Approve BITR token spending
   */
  async approveBITR(spender, amount, options = {}) {
    try {
      const contract = await this.getBITRTokenContract();
      
      const tx = await contract.approve(spender, amount, {
        gasLimit: options.gasLimit || 100000,
        ...options
      });

      console.log(`✅ BITR approved: ${tx.hash}`);
      return tx;

    } catch (error) {
      this.handleContractError(error, 'approve BITR');
    }
  }

  // ==================== STAKING FUNCTIONS ====================

  /**
   * Stake BITR tokens
   */
  async stakeBITR(amount, tierId, durationOption, options = {}) {
    try {
      const contract = await this.getStakingContract();
      const bitrContract = await this.getBITRTokenContract();
      
      // Check allowance and approve if needed
      const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
      if (allowance < amount) {
        const approveTx = await bitrContract.approve(await contract.getAddress(), amount);
        await approveTx.wait();
        console.log(`✅ BITR approved for staking: ${approveTx.hash}`);
      }
      
      const tx = await contract.stake(amount, tierId, durationOption, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ BITR staked: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'stake BITR');
    }
  }

  /**
   * Unstake BITR tokens
   */
  async unstakeBITR(stakeIndex, options = {}) {
    try {
      const contract = await this.getStakingContract();
      
      const tx = await contract.unstake(stakeIndex, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ BITR unstaked: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'unstake BITR');
    }
  }

  /**
   * Claim staking rewards
   */
  async claimStakingRewards(stakeIndex, options = {}) {
    try {
      const contract = await this.getStakingContract();
      
      const tx = await contract.claim(stakeIndex, {
        gasLimit: options.gasLimit || 300000,
        ...options
      });
      
      console.log(`✅ Staking rewards claimed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim staking rewards');
    }
  }

  /**
   * Claim revenue rewards
   */
  async claimRevenueRewards(options = {}) {
    try {
      const contract = await this.getStakingContract();
      
      const tx = await contract.claimRevenue({
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ Revenue rewards claimed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim revenue rewards');
    }
  }

  // ==================== FAUCET FUNCTIONS ====================

  /**
   * Claim BITR from faucet
   */
  async claimFromFaucet(options = {}) {
    try {
      const contract = await this.getBitrFaucetContract();
      
      // Check if user has already claimed
      const userInfo = await contract.getUserInfo(this.getWalletAddress());
      if (userInfo.claimed) {
        throw new Error('User has already claimed from faucet');
      }
      
      // Check if faucet is active and has sufficient balance
      const faucetStats = await contract.getFaucetStats();
      if (!faucetStats.active) {
        throw new Error('Faucet is not currently active');
      }
      
      const hasSufficient = await contract.hasSufficientBalance();
      if (!hasSufficient) {
        throw new Error('Faucet has insufficient balance');
      }
      
      const tx = await contract.claimBitr({
        gasLimit: options.gasLimit || 200000,
        ...options
      });
      
      console.log(`✅ BITR claimed from faucet: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim from faucet');
    }
  }

  // ==================== GUIDED ORACLE FUNCTIONS ====================

  /**
   * Submit outcome to guided oracle (Oracle bot only)
   */
  async submitGuidedOutcome(marketId, resultData, options = {}) {
    try {
      const contract = await this.getGuidedOracleContract();
      
      // Validate oracle bot permission
      const oracleBot = await contract.oracleBot();
      if (oracleBot.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle bot can submit outcomes');
      }
      
      const tx = await contract.submitOutcome(marketId, resultData, {
        gasLimit: options.gasLimit || 300000,
        ...options
      });
      
      console.log(`✅ Guided outcome submitted: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'submit guided outcome');
    }
  }

  /**
   * Execute call through guided oracle (Oracle bot only)
   */
  async executeGuidedCall(target, data, options = {}) {
    try {
      const contract = await this.getGuidedOracleContract();
      
      // Validate oracle bot permission
      const oracleBot = await contract.oracleBot();
      if (oracleBot.toLowerCase() !== this.getWalletAddress().toLowerCase()) {
        throw new Error('Only oracle bot can execute calls');
      }
      
      const tx = await contract.executeCall(target, data, {
        gasLimit: options.gasLimit || 500000,
        ...options
      });
      
      console.log(`✅ Guided call executed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'execute guided call');
    }
  }

  // ==================== OPTIMISTIC ORACLE FUNCTIONS ====================

  /**
   * Propose outcome for optimistic oracle
   */
  async proposeOptimisticOutcome(marketId, outcome, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      const bondToken = await contract.bondToken();
      const proposalBond = await contract.PROPOSAL_BOND();
      
      // Check user reputation
      const userReputation = await contract.userReputation(this.getWalletAddress());
      const minReputation = await contract.MIN_REPUTATION();
      if (userReputation < minReputation) {
        throw new Error(`Insufficient reputation: ${userReputation} < ${minReputation}`);
      }
      
      // Handle bond token approval
      const bitrContract = await this.getBITRTokenContract();
      const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
      if (allowance < proposalBond) {
        const approveTx = await bitrContract.approve(await contract.getAddress(), proposalBond);
        await approveTx.wait();
        console.log(`✅ BITR approved for proposal bond: ${approveTx.hash}`);
      }
      
      const tx = await contract.proposeOutcome(marketId, outcome, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ Optimistic outcome proposed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'propose optimistic outcome');
    }
  }

  /**
   * Dispute optimistic outcome
   */
  async disputeOptimisticOutcome(marketId, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      const disputeBond = await contract.DISPUTE_BOND();
      
      // Check user reputation
      const userReputation = await contract.userReputation(this.getWalletAddress());
      const minReputation = await contract.MIN_DISPUTE_REPUTATION();
      if (userReputation < minReputation) {
        throw new Error(`Insufficient reputation for dispute: ${userReputation} < ${minReputation}`);
      }
      
      // Handle bond token approval
      const bitrContract = await this.getBITRTokenContract();
      const allowance = await bitrContract.allowance(this.getWalletAddress(), await contract.getAddress());
      if (allowance < disputeBond) {
        const approveTx = await bitrContract.approve(await contract.getAddress(), disputeBond);
        await approveTx.wait();
        console.log(`✅ BITR approved for dispute bond: ${approveTx.hash}`);
      }
      
      const tx = await contract.disputeOutcome(marketId, {
        gasLimit: options.gasLimit || 400000,
        ...options
      });
      
      console.log(`✅ Optimistic outcome disputed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'dispute optimistic outcome');
    }
  }

  /**
   * Vote on disputed outcome
   */
  async voteOnOptimisticDispute(marketId, outcome, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      
      // Check user reputation
      const userReputation = await contract.userReputation(this.getWalletAddress());
      const minReputation = await contract.MIN_DISPUTE_REPUTATION();
      if (userReputation < minReputation) {
        throw new Error(`Insufficient reputation for voting: ${userReputation} < ${minReputation}`);
      }
      
      const tx = await contract.voteOnDispute(marketId, outcome, {
        gasLimit: options.gasLimit || 300000,
        ...options
      });
      
      console.log(`✅ Vote cast on dispute: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'vote on dispute');
    }
  }

  /**
   * Resolve optimistic market
   */
  async resolveOptimisticMarket(marketId, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      
      const tx = await contract.resolveMarket(marketId, {
        gasLimit: options.gasLimit || 600000,
        ...options
      });
      
      console.log(`✅ Optimistic market resolved: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'resolve optimistic market');
    }
  }

  /**
   * Claim bonds from optimistic oracle
   */
  async claimOptimisticBonds(marketId, options = {}) {
    try {
      const contract = await this.getOptimisticOracleContract();
      
      const tx = await contract.claimBonds(marketId, {
        gasLimit: options.gasLimit || 500000,
        ...options
      });
      
      console.log(`✅ Optimistic bonds claimed: ${tx.hash}`);
      return tx;
      
    } catch (error) {
      this.handleContractError(error, 'claim optimistic bonds');
    }
  }

  // ==================== UTILITY FUNCTIONS ====================

  /**
   * Get comprehensive contract status
   */
  async getContractStatus() {
    try {
      const oddysseyContract = await this.getOddysseyContract();
      const poolContract = await this.getBitrPoolContract();
      
      const [
        currentCycle,
        cycleInfo,
        entryFee,
        poolCount,
        totalCollectedSTT,
        totalCollectedBITR
      ] = await Promise.all([
        oddysseyContract.getCurrentCycle(),
        oddysseyContract.getCurrentCycleInfo(),
        oddysseyContract.entryFee(),
        poolContract.poolCount(),
        poolContract.totalCollectedSTT(),
        poolContract.totalCollectedBITR()
      ]);

      // Try to get additional contract statuses
      let stakingStats = null;
      let faucetStats = null;
      
      try {
        const stakingContract = await this.getStakingContract();
        stakingStats = await stakingContract.getContractStats();
      } catch (error) {
        console.warn('Could not fetch staking stats:', error.message);
      }
      
      try {
        const faucetContract = await this.getBitrFaucetContract();
        faucetStats = await faucetContract.getFaucetStats();
      } catch (error) {
        console.warn('Could not fetch faucet stats:', error.message);
      }

      return {
        oddyssey: {
          currentCycle: Number(currentCycle),
          cycleInfo: {
            cycleId: Number(cycleInfo.cycleId),
            state: Number(cycleInfo.state),
            endTime: Number(cycleInfo.endTime),
            prizePool: cycleInfo.prizePool.toString(),
            slipCount: Number(cycleInfo.cycleSlipCount)
          },
          entryFee: entryFee.toString()
        },
        pools: {
          totalPools: Number(poolCount),
          totalCollectedSTT: totalCollectedSTT.toString(),
          totalCollectedBITR: totalCollectedBITR.toString()
        },
        staking: stakingStats ? {
          totalStaked: stakingStats._totalStaked.toString(),
          totalRewardsPaid: stakingStats._totalRewardsPaid.toString(),
          totalRevenuePaid: stakingStats._totalRevenuePaid.toString(),
          contractBITRBalance: stakingStats._contractBITRBalance.toString(),
          contractSTTBalance: stakingStats._contractSTTBalance.toString()
        } : null,
        faucet: faucetStats ? {
          balance: faucetStats.balance.toString(),
          totalDistributed: faucetStats.totalDistributed.toString(),
          userCount: Number(faucetStats.userCount),
          active: faucetStats.active
        } : null
      };

    } catch (error) {
      console.error('Error getting contract status:', error);
      throw error;
    }
  }

  /**
   * Enhanced health check with contract status
   */
  async healthCheck() {
    try {
      const network = await this.getNetwork();
      const blockNumber = await this.getCurrentBlock();
      const balance = this.wallet ? await this.getBalance() : null;
      
      let contractStatus = null;
      try {
        contractStatus = await this.getContractStatus();
      } catch (contractError) {
        console.warn('Contract status check failed:', contractError.message);
      }
      
      return {
        status: 'healthy',
        network: {
          name: network.name,
          chainId: Number(network.chainId)
        },
        blockNumber,
        wallet: {
          address: this.wallet?.address || null,
          balance: balance ? ethers.formatEther(balance) : null
        },
        contracts: contractStatus
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Get BitrPool contract ABI
   */
  getBitrPoolABI() {
    return [
      // Core functions
      "function createGuidedPool(tuple(uint8 marketType, bytes32 marketId, uint256 endTime, uint256 entryFee, uint256 maxParticipants, string memory description) memory _poolData) external",
      "function createOpenPool(tuple(uint8 marketType, bytes32 marketId, uint256 endTime, uint256 entryFee, uint256 maxParticipants, string memory description) memory _poolData) external",
      "function joinPool(uint256 _poolId, uint8 _prediction) external payable",
      "function resolvePool(uint256 _poolId, uint8 _outcome) external",
      "function claimReward(uint256 _poolId) external",
      
      // View functions
      "function getPool(uint256 _poolId) external view returns (tuple(uint8 marketType, bytes32 marketId, uint256 endTime, uint256 entryFee, uint256 maxParticipants, string memory description, address creator, uint8 state, uint256 totalStake, uint256 participantCount, uint8 winningOutcome, uint256 createdAt))",
      "function getUserPools(address _user) external view returns (uint256[] memory)",
      "function getPoolParticipants(uint256 _poolId) external view returns (address[] memory)",
      "function getPoolStakes(uint256 _poolId) external view returns (uint256[] memory)",
      
      // Events
      "event PoolCreated(uint256 indexed poolId, address indexed creator, uint8 marketType, bytes32 marketId, uint256 endTime, uint256 entryFee, uint256 maxParticipants)",
      "event PoolJoined(uint256 indexed poolId, address indexed participant, uint8 prediction, uint256 stake)",
      "event PoolResolved(uint256 indexed poolId, uint8 outcome, uint256 totalStake, uint256 winnerCount)",
      "event RewardClaimed(uint256 indexed poolId, address indexed participant, uint256 reward)"
    ];
  }
}

module.exports = Web3Service; 