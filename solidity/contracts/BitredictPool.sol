// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IGuidedOracle {
    function getOutcome(bytes32 marketId) external view returns (bool isSet, bytes memory resultData);
}

interface IOptimisticOracle {
    function getOutcome(bytes32 marketId) external view returns (bool isSettled, bytes memory outcome);
}

enum OracleType {
    GUIDED,
    OPEN
}

enum BoostTier {
    NONE,
    BRONZE,
    SILVER,
    GOLD
}

enum ReputationAction {
    POOL_CREATED,
    POOL_FILLED_ABOVE_60,
    POOL_SPAMMED,
    BET_WON_HIGH_VALUE,
    OUTCOME_PROPOSED_CORRECTLY,
    OUTCOME_PROPOSED_INCORRECTLY,
    CHALLENGE_SUCCESSFUL,
    CHALLENGE_FAILED
}

interface IBitredictStaking {
    function addRevenue(uint256 bitrAmount, uint256 sttAmount) external;
}

interface IReputationSystem {
    function getUserReputation(address user) external view returns (uint256);
    function canCreateGuidedPool(address user) external view returns (bool);
    function canCreateOpenPool(address user) external view returns (bool);
}

contract BitredictPool is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IERC20 public bitrToken;
    uint256 public poolCount;
    uint256 public comboPoolCount;
    // Creation fees: 1 STT for STT pools, 50 BITR for BITR pools
    uint256 public constant creationFeeSTT = 1e18;     // 1 STT
    uint256 public constant creationFeeBITR = 50e18;   // 50 BITR
    uint256 public constant platformFee = 500;
    address public immutable feeCollector;
    address public immutable guidedOracle;
    address public immutable optimisticOracle;
    IReputationSystem public reputationSystem;
    
    uint256 public totalCollectedSTT;
    uint256 public totalCollectedBITR;
    
    uint256 public constant bettingGracePeriod = 60;
    uint256 public constant arbitrationTimeout = 24 hours;
    // Minimum stakes: 5 STT for STT pools, 1000 BITR for BITR pools
    uint256 public constant minPoolStakeSTT = 5e18;    // 5 STT
    uint256 public constant minPoolStakeBITR = 1000e18; // 1000 BITR
    uint256 public constant minBetAmount = 1e18;
    uint256 public constant HIGH_ODDS_THRESHOLD = 500;
    
    uint256 public constant MAX_PARTICIPANTS = 500;
    uint256 public constant MAX_LP_PROVIDERS = 100;
    
    uint256 public constant BOOST_DURATION = 24 hours;
    uint256 public constant MAX_BRONZE_POOLS = 5;
    uint256 public constant MAX_SILVER_POOLS = 5;
    uint256 public constant MAX_GOLD_POOLS = 5;
    uint256[4] public boostFees = [0, 2e18, 3e18, 5e18];
    mapping(BoostTier => uint256) public activeBoostCount;
    mapping(uint256 => BoostTier) public poolBoostTier;
    mapping(uint256 => uint256) public poolBoostExpiry;
    
   
    
    mapping(uint256 => mapping(address => bool)) public poolWhitelist;

    mapping(bytes32 => uint256[]) public categoryPools;
    mapping(address => uint256[]) public creatorActivePools;
    mapping(uint256 => uint256) public poolIdToCreatorIndex;
    struct OutcomeCondition {
        bytes32 marketId;           // SportMonks match ID or external reference
        bytes32 expectedOutcome;    // Expected result for this condition
        bool resolved;              // Whether this condition has been resolved
        bytes32 actualOutcome;      // Actual result (set when resolved)
    }

    struct ComboPool {
        address creator;
        uint256 creatorStake;
        uint256 totalCreatorSideStake;
        uint256 maxBettorStake;
        uint256 totalBettorStake;
        uint16 totalOdds;           // Combined odds for all conditions
        bool settled;
        bool creatorSideWon;
        bool usesBitr;
        uint256 eventStartTime;     // Earliest event start time
        uint256 eventEndTime;       // Latest event end time
        uint256 bettingEndTime;
        uint256 resultTimestamp;
        string category;
        uint256 maxBetPerUser;
        OutcomeCondition[] conditions; // Array of conditions (max 4)
    }

    mapping(uint256 => ComboPool) public comboPools;
    mapping(uint256 => address[]) public comboPoolBettors;
    mapping(uint256 => mapping(address => uint256)) public comboBettorStakes;
    mapping(uint256 => address[]) public comboPoolLPs;
    mapping(uint256 => mapping(address => uint256)) public comboLPStakes;
    mapping(uint256 => mapping(address => bool)) public comboClaimed;

    constructor(
        address _bitrToken,
        address _feeCollector,
        address _guidedOracle,
        address _optimisticOracle
    ) Ownable(msg.sender) {
        bitrToken = IERC20(_bitrToken);
        feeCollector = _feeCollector;
        guidedOracle = _guidedOracle;
        optimisticOracle = _optimisticOracle;
    }
    
    /**
     * @dev Set the reputation system contract (only owner)
     */
    function setReputationSystem(address _reputationSystem) external onlyOwner {
        reputationSystem = IReputationSystem(_reputationSystem);
    }

    struct Pool {
        // --- Packed for gas efficiency ---
        address creator;            // 20 bytes
        uint16 odds;                // 2 bytes (e.g., 150 = 1.50x)
        bool settled;               // 1 byte
        bool creatorSideWon;        // 1 byte
        bool isPrivate;             // 1 byte
        bool usesBitr;              // 1 byte
        bool filledAbove60;         // 1 byte
        OracleType oracleType;      // 1 byte (0 = GUIDED, 1 = OPEN)
        // Total packed: 28 bytes, 2 slots

        uint256 creatorStake;
        uint256 totalCreatorSideStake; // Total liquidity on creator's side (including creator + LPs)
        uint256 maxBettorStake; // Calculated based on total creator side stake
        uint256 totalBettorStake; // Total stake from people betting ON the predicted outcome
        bytes32 predictedOutcome; // What the creator thinks WON'T happen
        bytes32 result;
        bytes32 marketId;           // External market reference (Sportmonks ID, coin symbol, etc.)
        
        uint256 eventStartTime;
        uint256 eventEndTime;
        uint256 bettingEndTime; // eventStartTime - grace period
        uint256 resultTimestamp;
        uint256 arbitrationDeadline; // eventEndTime + arbitration timeout
        
        string league;
        string category; // "football", "basketball", etc.
        string region;
        
        uint256 maxBetPerUser;
    }

    mapping(uint256 => Pool) public pools;
    mapping(uint256 => address[]) public poolBettors; // People betting ON the predicted outcome
    mapping(uint256 => mapping(address => uint256)) public bettorStakes; // Stakes of people betting ON
    mapping(uint256 => address[]) public poolLPs; // People betting AGAINST (with creator)
    mapping(uint256 => mapping(address => uint256)) public lpStakes; // LP stakes
    mapping(uint256 => mapping(address => bool)) public claimed;

    event PoolCreated(uint256 indexed poolId, address indexed creator, uint256 eventStartTime, uint256 eventEndTime, OracleType oracleType, bytes32 marketId);
    event BetPlaced(uint256 indexed poolId, address indexed bettor, uint256 amount, bool isForOutcome);
    event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount);
    event PoolSettled(uint256 indexed poolId, bytes32 result, bool creatorSideWon, uint256 timestamp);
    event RewardClaimed(uint256 indexed poolId, address indexed user, uint256 amount);
    event PoolRefunded(uint256 indexed poolId, string reason);
    event UserWhitelisted(uint256 indexed poolId, address indexed user);
    event ReputationActionOccurred(
        address indexed user,
        ReputationAction action,
        uint256 value,           // Associated value (stake amount, etc.)
        bytes32 indexed poolId,
        uint256 timestamp
    );

    // Boost system events
    event PoolBoosted(uint256 indexed poolId, BoostTier tier, uint256 expiry, uint256 fee);
    event BoostExpired(uint256 indexed poolId, BoostTier tier);

    // Combo pool events
    event ComboPoolCreated(uint256 indexed comboPoolId, address indexed creator, uint256 conditionCount, uint16 totalOdds);
    event ComboBetPlaced(uint256 indexed comboPoolId, address indexed bettor, uint256 amount);
    event ComboPoolSettled(uint256 indexed comboPoolId, bool creatorSideWon, uint256 timestamp);



    modifier validPool(uint256 poolId) {
        require(poolId < poolCount, "Invalid pool");
        _;
    }

    modifier validComboPool(uint256 comboPoolId) {
        require(comboPoolId < comboPoolCount, "Invalid combo pool");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == guidedOracle || msg.sender == optimisticOracle, "Not oracle");
        _;
    }

    function createPool(
        bytes32 _predictedOutcome,
        uint256 _odds,
        uint256 _creatorStake,
        uint256 _eventStartTime,
        uint256 _eventEndTime,
        string memory _league,
        string memory _category,
        string memory _region,
        bool _isPrivate,
        uint256 _maxBetPerUser,
        bool _useBitr,
        OracleType _oracleType,
        bytes32 _marketId
    ) external payable {
        require(_odds > 100 && _odds <= 10000, "Invalid odds: must be between 1.01 and 100.00");
        
        // Check reputation requirements based on oracle type
        if (address(reputationSystem) != address(0)) {
            if (_oracleType == OracleType.OPEN) {
                require(reputationSystem.canCreateOpenPool(msg.sender), "Insufficient reputation for OPEN pools (need 100+)");
            } else {
                require(reputationSystem.canCreateGuidedPool(msg.sender), "Insufficient reputation for GUIDED pools (need 40+)");
            }
        }
        
        // Check minimum stake based on token type
        if (_useBitr) {
            require(_creatorStake >= minPoolStakeBITR, "BITR stake below minimum (1000 BITR)");
        } else {
            require(_creatorStake >= minPoolStakeSTT, "STT stake below minimum (5 STT)");
        }
        require(_creatorStake <= 1000000 * 1e18, "Stake too large"); // Max 1M tokens
        require(_eventStartTime > block.timestamp, "Event must be in future");
        require(_eventEndTime > _eventStartTime, "Event end must be after start");
        require(_eventStartTime > block.timestamp + bettingGracePeriod, "Event too soon");
        require(_eventStartTime < block.timestamp + 365 days, "Event too far");

        // Calculate total required based on token type
        uint256 creationFee = _useBitr ? creationFeeBITR : creationFeeSTT;
        uint256 totalRequired = creationFee + _creatorStake;
        
        if (_useBitr) {
            // Use BITR token
            require(bitrToken.transferFrom(msg.sender, address(this), totalRequired), "BITR transfer failed");
            totalCollectedBITR += creationFee;
        } else {
            // Use native STT
            require(msg.value == totalRequired, "Incorrect STT amount");
            totalCollectedSTT += creationFee;
        }

        uint256 maxStake = _creatorStake / (_odds / 100 - 1);
        uint256 bettingEnd = _eventStartTime - bettingGracePeriod;
        uint256 arbitrationEnd = _eventEndTime + arbitrationTimeout;

        pools[poolCount] = Pool({
            creator: msg.sender,
            predictedOutcome: _predictedOutcome,
            odds: uint16(_odds),
            creatorStake: _creatorStake,
            totalCreatorSideStake: _creatorStake, // Initialize with creator's stake
            maxBettorStake: maxStake,
            totalBettorStake: 0,
            result: bytes32(0),
            marketId: _marketId,
            settled: false,
            creatorSideWon: false,
            eventStartTime: _eventStartTime,
            eventEndTime: _eventEndTime,
            bettingEndTime: bettingEnd,
            resultTimestamp: 0,
            arbitrationDeadline: arbitrationEnd,
            league: _league,
            category: _category,
            region: _region,
            isPrivate: _isPrivate,
            maxBetPerUser: _maxBetPerUser,
            usesBitr: _useBitr,
            filledAbove60: false,
            oracleType: _oracleType
        });

        // Creator is the first LP
        poolLPs[poolCount].push(msg.sender);
        lpStakes[poolCount][msg.sender] = _creatorStake;

        // --- Indexing for efficient lookups ---
        bytes32 categoryHash = keccak256(bytes(_category));
        categoryPools[categoryHash].push(poolCount);
        creatorActivePools[msg.sender].push(poolCount);
        poolIdToCreatorIndex[poolCount] = creatorActivePools[msg.sender].length - 1;

        emit ReputationActionOccurred(msg.sender, ReputationAction.POOL_CREATED, _creatorStake, bytes32(poolCount), block.timestamp);
        emit PoolCreated(poolCount, msg.sender, _eventStartTime, _eventEndTime, _oracleType, _marketId);
        
        poolCount++;
    }

    function placeBet(uint256 poolId, uint256 amount) external payable validPool(poolId) {
        Pool storage poolPtr = pools[poolId];
        Pool memory pool = poolPtr;

        require(!pool.settled, "Pool settled");
        require(amount >= minBetAmount, "Bet below minimum");
        require(amount <= 100000 * 1e18, "Bet too large"); // Max 100K tokens per bet
        require(block.timestamp < pool.bettingEndTime, "Betting period ended");
        
        uint256 effectiveCreatorSideStake = pool.creatorStake;
        if (pool.totalBettorStake == 0 || pool.totalBettorStake + amount > pool.creatorStake) {
            // If no bets yet or when bets would exceed creator's initial stake, include LP stakes
            effectiveCreatorSideStake = pool.totalCreatorSideStake;
        }
        
        uint256 poolOdds = uint256(pool.odds);
        require(poolOdds >= 100, "Invalid odds for calculation");
        uint256 currentMaxBettorStake = effectiveCreatorSideStake / (poolOdds / 100 - 1);
        
        require(pool.totalBettorStake + amount <= currentMaxBettorStake, "Pool full");
        require(pool.totalBettorStake <= type(uint256).max - amount, "Stake overflow");
        
        uint256 currentBettorStake = bettorStakes[poolId][msg.sender];
        if (currentBettorStake == 0) {
            require(poolBettors[poolId].length < MAX_PARTICIPANTS, "Too many participants");
        }
        
        if (pool.isPrivate) {
            require(poolWhitelist[poolId][msg.sender], "Not whitelisted for private pool");
        }
        
        if (pool.maxBetPerUser > 0) {
            require(currentBettorStake + amount <= pool.maxBetPerUser, "Exceeds max bet per user");
        }

        if (currentBettorStake == 0) {
            poolBettors[poolId].push(msg.sender);
        }

        bettorStakes[poolId][msg.sender] = currentBettorStake + amount;
        poolPtr.totalBettorStake = pool.totalBettorStake + amount;
        poolPtr.maxBettorStake = currentMaxBettorStake;

        if (!poolPtr.filledAbove60 && (poolPtr.totalBettorStake * 100) / currentMaxBettorStake >= 60) {
            poolPtr.filledAbove60 = true;
            emit ReputationActionOccurred(pool.creator, ReputationAction.POOL_FILLED_ABOVE_60, poolPtr.totalBettorStake, bytes32(poolId), block.timestamp);
        }

        // TOKEN CONSISTENCY: Ensure bettor uses same token as pool creator
        if (pool.usesBitr) {
            require(bitrToken.transferFrom(msg.sender, address(this), amount), "BITR transfer failed");
        } else {
            require(msg.value == amount, "Incorrect STT amount");
        }

        emit BetPlaced(poolId, msg.sender, amount, true);
    }

    function addLiquidity(uint256 poolId, uint256 amount) external payable validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!pool.settled, "Pool settled");
        require(amount >= minBetAmount, "Liquidity below minimum");
        require(amount <= 500000 * 1e18, "Liquidity too large"); // Max 500K tokens
        require(block.timestamp < pool.bettingEndTime, "Betting period ended");
        
        // SECURITY: Prevent overflow in total creator side stake
        require(pool.totalCreatorSideStake <= type(uint256).max - amount, "Creator stake overflow");
        
        // GAS LIMIT: Prevent too many LP providers
        if (lpStakes[poolId][msg.sender] == 0) {
            require(poolLPs[poolId].length < MAX_LP_PROVIDERS, "Too many LP providers");
        }
        
        // Check private pool access
        if (pool.isPrivate) {
            require(poolWhitelist[poolId][msg.sender], "Not whitelisted for private pool");
        }

        if (lpStakes[poolId][msg.sender] == 0) {
            poolLPs[poolId].push(msg.sender);
        }

        lpStakes[poolId][msg.sender] += amount;
        pool.totalCreatorSideStake += amount;

        // ENHANCED STAKE LOGIC: Recalculate max bettor stake
        // If no bets yet, use total creator side stake for immediate capacity increase
        // If bets exceed creator's initial stake, also use total creator side stake
        uint256 effectiveCreatorSideStake = pool.creatorStake;
        if (pool.totalBettorStake == 0 || pool.totalBettorStake > pool.creatorStake) {
            effectiveCreatorSideStake = pool.totalCreatorSideStake;
        }
        
        require(uint256(pool.odds) >= 100, "Invalid odds for calculation");
        pool.maxBettorStake = effectiveCreatorSideStake / (uint256(pool.odds) / 100 - 1);

        // TOKEN CONSISTENCY: Use the same token as the pool
        if (pool.usesBitr) {
            require(bitrToken.transferFrom(msg.sender, address(this), amount), "BITR transfer failed");
        } else {
            require(msg.value == amount, "Incorrect STT amount");
        }

        emit LiquidityAdded(poolId, msg.sender, amount);
    }

    // LP WITHDRAWAL: LPs can only withdraw after event starts when no bets placed
    function withdrawLiquidity(uint256 poolId) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!pool.settled, "Pool already settled");
        require(msg.sender != pool.creator, "Creator cannot use this function");
        require(lpStakes[poolId][msg.sender] > 0, "No liquidity provided");
        require(block.timestamp >= pool.eventStartTime, "Event not started yet");
        require(pool.totalBettorStake == 0, "Pool has bets, cannot withdraw");
        
        uint256 lpStake = lpStakes[poolId][msg.sender];
        lpStakes[poolId][msg.sender] = 0;
        pool.totalCreatorSideStake -= lpStake;
        
        // Recalculate max bettor stake after withdrawal
        uint256 effectiveCreatorSideStake = pool.creatorStake;
        if (pool.totalBettorStake > pool.creatorStake) {
            effectiveCreatorSideStake = pool.totalCreatorSideStake;
        }
        
        // MATHEMATICAL EDGE CASE: Ensure odds are valid
        if (uint256(pool.odds) >= 100) {
            pool.maxBettorStake = effectiveCreatorSideStake / (uint256(pool.odds) / 100 - 1);
        }
        
        // Remove from LP array (gas intensive but necessary for clean state)
        address[] storage lps = poolLPs[poolId];
        for (uint256 i = 0; i < lps.length; i++) {
            if (lps[i] == msg.sender) {
                lps[i] = lps[lps.length - 1];
                lps.pop();
                break;
            }
        }
        
        if (pool.usesBitr) {
            require(bitrToken.transfer(msg.sender, lpStake), "BITR LP withdrawal failed");
        } else {
            (bool success, ) = payable(msg.sender).call{value: lpStake}("");
            require(success, "STT LP withdrawal failed");
        }
        
        emit LiquidityAdded(poolId, msg.sender, 0); // 0 amount indicates withdrawal
    }

    function withdrawCreatorStake(uint256 poolId) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(msg.sender == pool.creator, "Only creator can withdraw");
        require(!pool.settled, "Pool already settled");
        require(pool.totalBettorStake == 0, "Pool has bets, cannot withdraw");
        require(block.timestamp > pool.bettingEndTime, "Betting period not ended");
        
        // Mark pool as settled to prevent further interactions
        pool.settled = true;
        
        // Refund all liquidity providers (including creator)
        address[] memory lps = poolLPs[poolId];
        for (uint256 i = 0; i < lps.length; i++) {
            address lp = lps[i];
            uint256 stake = lpStakes[poolId][lp];
            if (stake > 0) {
                if (pool.usesBitr) {
                    require(bitrToken.transfer(lp, stake), "BITR LP refund failed");
                } else {
                    (bool success, ) = payable(lp).call{value: stake}("");
                    require(success, "STT LP refund failed");
                }
            }
        }
        
        _removePoolFromCreatorActiveList(poolId);
        
        emit PoolRefunded(poolId, "No bets received");
    }

    function settlePool(uint256 poolId, bytes32 outcome) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!pool.settled, "Already settled");
        require(block.timestamp >= pool.eventEndTime, "Event not ended yet");

        // Handle different oracle types
        if (pool.oracleType == OracleType.GUIDED) {
            require(msg.sender == guidedOracle, "Only guided oracle can settle guided pools");
            // For guided pools, we can optionally validate the outcome against the marketId
            // This could be enhanced to automatically fetch from GuidedOracle contract
        } else if (pool.oracleType == OracleType.OPEN) {
            require(msg.sender == optimisticOracle, "Only optimistic oracle can settle open pools");
            // For open pools, the optimistic oracle handles all validation
        } else {
            revert("Invalid oracle type");
        }

        pool.result = outcome;
        pool.settled = true;
        pool.creatorSideWon = (outcome != pool.predictedOutcome);
        pool.resultTimestamp = block.timestamp;

        _removePoolFromCreatorActiveList(poolId);
        emit PoolSettled(poolId, outcome, pool.creatorSideWon, block.timestamp);
    }

    // Automatic settlement function that fetches outcome from appropriate oracle
    function settlePoolAutomatically(uint256 poolId) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!pool.settled, "Already settled");
        require(block.timestamp >= pool.eventEndTime, "Event not ended yet");

        bytes32 outcome;
        bool isReady = false;

        if (pool.oracleType == OracleType.GUIDED) {
            // Fetch outcome from GuidedOracle
            // For SportMonks fixture IDs, use the market ID directly as it's already the correct hash
            (bool isSet, bytes memory resultData) = IGuidedOracle(guidedOracle).getOutcome(pool.marketId);
            require(isSet, "Guided outcome not available yet");
            outcome = bytes32(resultData);
            isReady = true;
        } else if (pool.oracleType == OracleType.OPEN) {
            // Fetch outcome from OptimisticOracle
            (bool isSettled, bytes memory resultData) = IOptimisticOracle(optimisticOracle).getOutcome(pool.marketId);
            require(isSettled, "Optimistic outcome not finalized yet");
            outcome = bytes32(resultData);
            isReady = true;
        } else {
            revert("Invalid oracle type");
        }

        require(isReady, "Outcome not ready");

        pool.result = outcome;
        pool.settled = true;
        pool.creatorSideWon = (outcome != pool.predictedOutcome);
        pool.resultTimestamp = block.timestamp;

        _removePoolFromCreatorActiveList(poolId);
        emit PoolSettled(poolId, outcome, pool.creatorSideWon, block.timestamp);
    }

    function claim(uint256 poolId) external validPool(poolId) {
        Pool memory pool = pools[poolId];
        require(pool.settled, "Not settled");
        require(!claimed[poolId][msg.sender], "Already claimed");

        // Set claimed flag BEFORE any state changes or external calls (reentrancy protection)
        claimed[poolId][msg.sender] = true;

        uint256 payout = 0;
        uint256 stake = 0;
        bool isWinner = false;

        // Check if the caller is an LP or a Bettor and if their side won
        if (pool.creatorSideWon) {
            stake = lpStakes[poolId][msg.sender];
            if (stake > 0) {
                isWinner = true;
                // LP wins - calculate payout
                uint256 sharePercentage = (stake * 10000) / pool.totalCreatorSideStake;
                payout = stake + ((pool.totalBettorStake * sharePercentage) / 10000);
                
            }
        } else { // Bettor side won
            stake = bettorStakes[poolId][msg.sender];
            if (stake > 0) {
                isWinner = true;
                // Bettor wins - calculate payout
                uint256 poolOdds = uint256(pool.odds);
                payout = (stake * poolOdds) / 100;
                uint256 profit = payout - stake;
                uint256 fee = (profit * adjustedFeeRate(msg.sender)) / 10000;
                payout -= fee;

                // Transfer fee to fee collector
                if (fee > 0) {
                    if (pool.usesBitr) {
                        totalCollectedBITR += fee;
                    } else {
                        totalCollectedSTT += fee;
                    }
                }

                // Reputation for high-value winning bets
                uint256 minValueSTT = 10 * 1e18;  // 10 STT
                uint256 minValueBITR = 2000 * 1e18; // 2000 BITR
                bool qualifiesForReputation = pool.usesBitr ? 
                    (stake >= minValueBITR) : (stake >= minValueSTT);
                
                if (qualifiesForReputation) {
                    emit ReputationActionOccurred(msg.sender, ReputationAction.BET_WON_HIGH_VALUE, stake, bytes32(poolId), block.timestamp);
                }
            }
        }

        if (payout > 0) {
            if (pool.usesBitr) {
                require(bitrToken.transfer(msg.sender, payout), "BITR payout failed");
            } else {
                (bool success, ) = payable(msg.sender).call{value: payout}("");
                require(success, "STT payout failed");
            }
            emit RewardClaimed(poolId, msg.sender, payout);
        }
    }



    function adjustedFeeRate(address user) public view returns (uint256) {
        uint256 bitrBalance = bitrToken.balanceOf(user);
        // BITR discount tiers (holding BITR reduces fees)
        if (bitrBalance >= 50000 * 1e18) return platformFee * 50 / 100;  // 50% discount
        if (bitrBalance >= 20000 * 1e18) return platformFee * 70 / 100;  // 30% discount
        if (bitrBalance >= 5000 * 1e18) return platformFee * 80 / 100;   // 20% discount
        if (bitrBalance >= 2000 * 1e18) return platformFee * 90 / 100;   // 10% discount
        return platformFee; // No discount
    }

    function distributeFees(address stakingContract) external {
        require(msg.sender == feeCollector, "Only fee collector");
        uint256 _stt = totalCollectedSTT;
        uint256 _bitr = totalCollectedBITR;

        if (_stt > 0) {
            uint256 sttStakers = (_stt * 30) / 100;
            totalCollectedSTT = 0;
            (bool success1, ) = payable(feeCollector).call{value: _stt - sttStakers}("");
            require(success1, "STT fee collector transfer failed");
            (bool success2, ) = payable(stakingContract).call{value: sttStakers}("");
            require(success2, "STT staking transfer failed");
        }
        
        if (_bitr > 0) {
            uint256 bitrStakers = (_bitr * 30) / 100;
            totalCollectedBITR = 0;
            bitrToken.transfer(feeCollector, _bitr - bitrStakers);
            bitrToken.transfer(stakingContract, bitrStakers);
        }

        if (_stt > 0 || _bitr > 0) {
            IBitredictStaking(stakingContract).addRevenue((_bitr * 30) / 100, (_stt * 30) / 100);
        }
    }

    // Removed admin functions for full decentralization
    // Fee collector, creation fee, platform fee, and discount token are immutable after deployment



    /// @notice Retrieves a paginated list of pool IDs for a given category.
    /// @param categoryHash The keccak256 hash of the category string.
    /// @param limit The maximum number of pool IDs to return.
    /// @param offset The starting index for pagination.
    function getPoolsByCategory(bytes32 categoryHash, uint256 limit, uint256 offset) 
        external view returns (uint256[] memory poolIds) 
    {
        uint256[] storage allPoolIds = categoryPools[categoryHash];
        uint256 total = allPoolIds.length;

        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 count = total - offset > limit ? limit : total - offset;
        poolIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            poolIds[i] = allPoolIds[offset + i];
        }
    }

    /// @notice Retrieves a paginated list of *active* pool IDs created by a specific user.
    /// @param creator The address of the pool creator.
    /// @param limit The maximum number of pool IDs to return.
    /// @param offset The starting index for pagination.
    function getActivePoolsByCreator(address creator, uint256 limit, uint256 offset) 
        external view returns (uint256[] memory poolIds) 
    {
        uint256[] storage activePools = creatorActivePools[creator];
        uint256 total = activePools.length;

        if (offset >= total) {
            return new uint256[](0);
        }

        uint256 count = total - offset > limit ? limit : total - offset;
        poolIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            poolIds[i] = activePools[offset + i];
        }
    }



    // Arbitration timeout fallback
    function refundPool(uint256 poolId) external validPool(poolId) {
        Pool storage pool = pools[poolId];
        require(!pool.settled, "Already settled");
        require(block.timestamp > pool.arbitrationDeadline, "Arbitration period not expired");
        
        pool.settled = true;
        
        // Refund all liquidity providers (creator side)
        address[] memory lps = poolLPs[poolId];
        for (uint256 i = 0; i < lps.length; i++) {
            address lp = lps[i];
            uint256 stake = lpStakes[poolId][lp];
            if (stake > 0) {
                if (pool.usesBitr) {
                    require(bitrToken.transfer(lp, stake), "BITR LP refund failed");
                } else {
                    (bool success, ) = payable(lp).call{value: stake}("");
                    require(success, "STT LP refund failed");
                }
            }
        }
        
        // Refund all bettors
        address[] memory bettors = poolBettors[poolId];
        for (uint256 i = 0; i < bettors.length; i++) {
            address bettor = bettors[i];
            uint256 stake = bettorStakes[poolId][bettor];
            if (stake > 0) {
                if (pool.usesBitr) {
                    require(bitrToken.transfer(bettor, stake), "BITR bettor refund failed");
                } else {
                    (bool success, ) = payable(bettor).call{value: stake}("");
                    require(success, "STT bettor refund failed");
                }
            }
        }
        
        _removePoolFromCreatorActiveList(poolId);
        
        emit PoolRefunded(poolId, "Arbitration timeout");
    }

    // Private pool management
    function addToWhitelist(uint256 poolId, address user) external validPool(poolId) {
        require(msg.sender == pools[poolId].creator, "Not creator");
        poolWhitelist[poolId][user] = true;
        emit UserWhitelisted(poolId, user);
    }

    function removeFromWhitelist(uint256 poolId, address user) external validPool(poolId) {
        require(msg.sender == pools[poolId].creator, "Not creator");
        poolWhitelist[poolId][user] = false;
    }

    // --- Internal helper functions ---
    function _removePoolFromCreatorActiveList(uint256 poolId) internal {
        address creator = pools[poolId].creator;
        uint256[] storage activePools = creatorActivePools[creator];
        uint256 index = poolIdToCreatorIndex[poolId];
        
        if (index < activePools.length && activePools[index] == poolId) {
            uint256 lastIndex = activePools.length - 1;
            if (index != lastIndex) {
                uint256 lastPoolId = activePools[lastIndex];
                activePools[index] = lastPoolId;
                poolIdToCreatorIndex[lastPoolId] = index;
            }
            activePools.pop();
            delete poolIdToCreatorIndex[poolId];
        }
    }





    // === BOOST SYSTEM FUNCTIONS ===

    /// @notice Boost a pool for enhanced visibility
    /// @param poolId The pool to boost
    /// @param tier The boost tier to apply
    function boostPool(uint256 poolId, BoostTier tier) external payable validPool(poolId) {
        require(tier != BoostTier.NONE, "Invalid boost tier");
        require(msg.sender == pools[poolId].creator, "Only creator can boost");
        require(pools[poolId].eventStartTime > block.timestamp, "Event already started");
        
        // Check if tier has available slots
        uint256 maxForTier;
        if (tier == BoostTier.BRONZE) maxForTier = MAX_BRONZE_POOLS;
        else if (tier == BoostTier.SILVER) maxForTier = MAX_SILVER_POOLS;
        else if (tier == BoostTier.GOLD) maxForTier = MAX_GOLD_POOLS;
        else revert("Invalid tier");
        
        require(activeBoostCount[tier] < maxForTier, "Boost tier full");
        
        // Remove existing boost if any
        BoostTier currentTier = poolBoostTier[poolId];
        if (currentTier != BoostTier.NONE && block.timestamp < poolBoostExpiry[poolId]) {
            activeBoostCount[currentTier]--;
        }
        
        // Charge boost fee (native STT only)
        uint256 fee = boostFees[uint256(tier)];
        require(msg.value == fee, "Incorrect boost fee amount");
        totalCollectedSTT += fee;
        
        // Apply new boost
        poolBoostTier[poolId] = tier;
        poolBoostExpiry[poolId] = block.timestamp + BOOST_DURATION;
        activeBoostCount[tier]++;
        
        emit PoolBoosted(poolId, tier, poolBoostExpiry[poolId], fee);
    }

    /// @notice Clean up expired boosts (anyone can call to maintain system)
    /// @param poolIds Array of pool IDs to check for expired boosts
    function cleanupExpiredBoosts(uint256[] calldata poolIds) external {
        for (uint256 i = 0; i < poolIds.length; i++) {
            uint256 poolId = poolIds[i];
            if (poolId >= poolCount) continue;
            
            BoostTier tier = poolBoostTier[poolId];
            uint256 expiry = poolBoostExpiry[poolId];
            
            if (tier != BoostTier.NONE && block.timestamp >= expiry) {
                poolBoostTier[poolId] = BoostTier.NONE;
                poolBoostExpiry[poolId] = 0;
                activeBoostCount[tier]--;
                
                emit BoostExpired(poolId, tier);
            }
        }
    }

    // === COMBO POOL FUNCTIONS ===

    /// @notice Create a combo (parlay) pool with multiple outcome conditions
    /// @param conditions Array of outcome conditions (max 4)
    /// @param combinedOdds Total combined odds for all conditions
    /// @param creatorStake Creator's stake amount
    /// @param earliestEventStart Start time of earliest event
    /// @param latestEventEnd End time of latest event
    /// @param category Pool category
    /// @param maxBetPerUser Maximum bet per user (0 for no limit)
    /// @param useBitr Whether to use BITR token
    function createComboPool(
        OutcomeCondition[] memory conditions,
        uint16 combinedOdds,
        uint256 creatorStake,
        uint256 earliestEventStart,
        uint256 latestEventEnd,
        string memory category,
        uint256 maxBetPerUser,
        bool useBitr
    ) external payable {
        require(conditions.length >= 2 && conditions.length <= 4, "2-4 conditions required");
        require(combinedOdds > 100 && combinedOdds <= 50000, "Invalid combined odds"); // Max 500x
        // Check minimum stake based on token type
        if (useBitr) {
            require(creatorStake >= minPoolStakeBITR, "BITR stake below minimum (1000 BITR)");
        } else {
            require(creatorStake >= minPoolStakeSTT, "STT stake below minimum (5 STT)");
        }
        require(earliestEventStart > block.timestamp + bettingGracePeriod, "Event too soon");
        require(latestEventEnd > earliestEventStart, "Invalid event times");
        
        // Calculate creation fee based on token type
        uint256 creationFee = useBitr ? creationFeeBITR : creationFeeSTT;
        uint256 totalRequired = creationFee + creatorStake;
        
        if (useBitr) {
            require(bitrToken.transferFrom(msg.sender, address(this), totalRequired), "BITR transfer failed");
            totalCollectedBITR += creationFee;
        } else {
            require(msg.value == totalRequired, "Incorrect STT amount");
            totalCollectedSTT += creationFee;
        }
        
        // Calculate max bettor stake
        uint256 maxBettorStake = creatorStake / (combinedOdds / 100 - 1);
        uint256 bettingEndTime = earliestEventStart - bettingGracePeriod;
        
        // Create combo pool
        ComboPool storage newPool = comboPools[comboPoolCount];
        newPool.creator = msg.sender;
        newPool.creatorStake = creatorStake;
        newPool.totalCreatorSideStake = creatorStake;
        newPool.maxBettorStake = maxBettorStake;
        newPool.totalBettorStake = 0;
        newPool.totalOdds = combinedOdds;
        newPool.settled = false;
        newPool.creatorSideWon = false;
        newPool.usesBitr = useBitr;
        newPool.eventStartTime = earliestEventStart;
        newPool.eventEndTime = latestEventEnd;
        newPool.bettingEndTime = bettingEndTime;
        newPool.resultTimestamp = 0;
        newPool.category = category;
        newPool.maxBetPerUser = maxBetPerUser;
        
        // Add conditions
        for (uint256 i = 0; i < conditions.length; i++) {
            newPool.conditions.push(conditions[i]);
        }
        
        // Creator is first LP
        comboPoolLPs[comboPoolCount].push(msg.sender);
        comboLPStakes[comboPoolCount][msg.sender] = creatorStake;
        
        emit ComboPoolCreated(comboPoolCount, msg.sender, conditions.length, combinedOdds);
        emit ReputationActionOccurred(msg.sender, ReputationAction.POOL_CREATED, creatorStake, bytes32(comboPoolCount), block.timestamp);
        
        comboPoolCount++;
    }

    /// @notice Place a bet on a combo pool
    /// @param comboPoolId The combo pool ID
    /// @param amount Bet amount
    function placeComboBet(uint256 comboPoolId, uint256 amount) external payable validComboPool(comboPoolId) {
        ComboPool storage pool = comboPools[comboPoolId];
        
        require(!pool.settled, "Pool settled");
        require(amount >= minBetAmount, "Bet below minimum");
        require(block.timestamp < pool.bettingEndTime, "Betting period ended");
        require(pool.totalBettorStake + amount <= pool.maxBettorStake, "Pool full");
        
        if (pool.maxBetPerUser > 0) {
            require(comboBettorStakes[comboPoolId][msg.sender] + amount <= pool.maxBetPerUser, "Exceeds max bet per user");
        }
        
        // Add to bettors if first bet
        if (comboBettorStakes[comboPoolId][msg.sender] == 0) {
            require(comboPoolBettors[comboPoolId].length < MAX_PARTICIPANTS, "Too many participants");
            comboPoolBettors[comboPoolId].push(msg.sender);
        }
        
        comboBettorStakes[comboPoolId][msg.sender] += amount;
        pool.totalBettorStake += amount;
        
        // Transfer tokens
        if (pool.usesBitr) {
            require(bitrToken.transferFrom(msg.sender, address(this), amount), "BITR transfer failed");
        } else {
            require(msg.value == amount, "Incorrect STT amount");
        }
        
        emit ComboBetPlaced(comboPoolId, msg.sender, amount);
    }

    /// @notice Resolve a condition in a combo pool
    /// @param comboPoolId The combo pool ID
    /// @param conditionIndex Index of the condition to resolve
    /// @param actualOutcome The actual outcome for this condition
    function resolveComboCondition(uint256 comboPoolId, uint256 conditionIndex, bytes32 actualOutcome) external onlyOracle validComboPool(comboPoolId) {
        ComboPool storage pool = comboPools[comboPoolId];
        require(!pool.settled, "Pool already settled");
        require(conditionIndex < pool.conditions.length, "Invalid condition index");
        require(!pool.conditions[conditionIndex].resolved, "Condition already resolved");
        
        pool.conditions[conditionIndex].resolved = true;
        pool.conditions[conditionIndex].actualOutcome = actualOutcome;
        
        // Check if all conditions are resolved
        bool allResolved = true;
        bool creatorWins = false; // Creator wins if ANY condition fails
        
        for (uint256 i = 0; i < pool.conditions.length; i++) {
            if (!pool.conditions[i].resolved) {
                allResolved = false;
                break;
            }
            
            // If any condition doesn't match expected outcome, creator wins
            if (pool.conditions[i].actualOutcome != pool.conditions[i].expectedOutcome) {
                creatorWins = true;
            }
        }
        
        // Settle pool if all conditions resolved
        if (allResolved && block.timestamp >= pool.eventEndTime) {
            pool.settled = true;
            pool.creatorSideWon = creatorWins;
            pool.resultTimestamp = block.timestamp;
            
            emit ComboPoolSettled(comboPoolId, creatorWins, block.timestamp);
        }
    }

    /// @notice Claim winnings from a combo pool
    /// @param comboPoolId The combo pool ID
    function claimCombo(uint256 comboPoolId) external validComboPool(comboPoolId) {
        ComboPool storage pool = comboPools[comboPoolId];
        require(pool.settled, "Not settled");
        require(!comboClaimed[comboPoolId][msg.sender], "Already claimed");
        
        comboClaimed[comboPoolId][msg.sender] = true;
        
        uint256 payout = 0;
        uint256 stake = 0;
        
        if (pool.creatorSideWon) {
            // LP wins
            stake = comboLPStakes[comboPoolId][msg.sender];
            if (stake > 0) {
                uint256 sharePercentage = (stake * 10000) / pool.totalCreatorSideStake;
                payout = stake + ((pool.totalBettorStake * sharePercentage) / 10000);
            }
        } else {
            // Bettor wins
            stake = comboBettorStakes[comboPoolId][msg.sender];
            if (stake > 0) {
                payout = (stake * uint256(pool.totalOdds)) / 100;
                uint256 profit = payout - stake;
                uint256 fee = (profit * adjustedFeeRate(msg.sender)) / 10000;
                payout -= fee;
                
                if (fee > 0) {
                    if (pool.usesBitr) {
                        totalCollectedBITR += fee;
                    } else {
                        totalCollectedSTT += fee;
                    }
                }
            }
        }
        
        if (payout > 0) {
            if (pool.usesBitr) {
                require(bitrToken.transfer(msg.sender, payout), "BITR payout failed");
            } else {
                (bool success, ) = payable(msg.sender).call{value: payout}("");
                require(success, "STT payout failed");
            }
            emit RewardClaimed(comboPoolId, msg.sender, payout);
        }
    }



}