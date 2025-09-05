// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Oddyssey is Ownable, ReentrancyGuard {
    uint256 public constant DAILY_LEADERBOARD_SIZE = 5;
    uint256 public constant MATCH_COUNT = 10;
    uint256 public constant ODDS_SCALING_FACTOR = 1000;
    uint256 public constant MIN_CORRECT_PREDICTIONS = 7;
    uint256 public constant MAX_CYCLES_TO_RESOLVE = 50; // Prevent unbounded loops
    uint256 public immutable DEV_FEE_PERCENTAGE;
    uint256 public immutable PRIZE_ROLLOVER_FEE_PERCENTAGE;

    enum BetType { MONEYLINE, OVER_UNDER }
    enum MoneylineResult { NotSet, HomeWin, Draw, AwayWin }
    enum OverUnderResult { NotSet, Over, Under }
    enum CycleState { NotStarted, Active, Ended, Resolved }

    struct Result {
        MoneylineResult moneyline;
        OverUnderResult overUnder;
    }

    struct Match {
        uint64 id;              // SportMonks match ID - sufficient for identification
        uint64 startTime;
        uint32 oddsHome;
        uint32 oddsDraw;
        uint32 oddsAway;
        uint32 oddsOver;
        uint32 oddsUnder;
        Result result;
    }

    struct UserPrediction {
        uint64 matchId;          // Match ID from oracle (SportMonks ID)
        BetType betType;         // MONEYLINE or OVER_UNDER
        bytes32 selection;       // keccak256('1'), keccak256('X'), keccak256('2'), keccak256('Over'), keccak256('Under')
        uint32 selectedOdd;      // Fixed odd for that selection (scaled by 1000)
    }

    struct Slip {
        address player;
        uint256 cycleId;
        uint256 placedAt;
        UserPrediction[MATCH_COUNT] predictions;
        uint256 finalScore;
        uint8 correctCount;
        bool isEvaluated;
    }

    struct LeaderboardEntry {
        address player;
        uint256 slipId;
        uint256 finalScore;
        uint8 correctCount;
    }

    struct GlobalStats {
        uint256 totalVolume;
        uint32 totalSlips;
        uint256 highestOdd;
    }

    struct CycleStats {
        uint256 volume;
        uint32 slips;
        uint32 evaluatedSlips;
    }

    struct CycleInfo {
        uint256 startTime;      // When cycle was created
        uint256 endTime;        // When betting closes
        uint256 prizePool;      // Total prize pool for this cycle
        uint32 slipCount;       // Number of slips placed
        uint32 evaluatedSlips;  // Number of evaluated slips
        CycleState state;       // Current cycle state
        bool hasWinner;         // Whether cycle has valid winners
    }



    struct UserStats {
        uint256 totalSlips;
        uint256 totalWins;
        uint256 bestScore;
        uint256 averageScore;
        uint256 winRate; // Scaled by 10000, e.g., 5000 = 50%
        uint256 currentStreak;
        uint256 bestStreak;
        uint256 lastActiveCycle;
    }

    address public oracle;
    address public immutable devWallet;
    uint256 public entryFee;
    uint256 public dailyCycleId;
    uint256 public slipCount;

    mapping(address => UserStats) public userStats;
    
    mapping(address => uint256) public userOddysseyReputation;
    mapping(address => uint256) public userOddysseyCorrectPredictions;

    mapping(uint256 => Match[MATCH_COUNT]) public dailyMatches;
    mapping(uint256 => uint256) public dailyCycleEndTimes;
    mapping(uint256 => uint256) public claimableStartTimes;
    mapping(uint256 => uint256) public dailyPrizePools;
    mapping(uint256 => CycleStats) public cycleStats;
    mapping(uint256 => CycleInfo) public cycleInfo;

    mapping(uint256 => Slip) public slips;
    mapping(uint256 => mapping(address => uint256[])) private s_userSlipsPerCycle;
    mapping(uint256 => LeaderboardEntry[DAILY_LEADERBOARD_SIZE]) public dailyLeaderboards;
    mapping(uint256 => bool) public isCycleResolved;
    mapping(uint256 => mapping(uint8 => bool)) public prizeClaimed;

    GlobalStats public stats;

    // --- Events ---

    event OracleSet(address indexed newOracle);
    event EntryFeeSet(uint256 indexed newFee);
    event CycleStarted(uint256 indexed cycleId, uint256 endTime);
    event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId);
    event SlipEvaluated(uint256 indexed slipId, address indexed player, uint256 indexed cycleId, uint8 correctCount, uint256 finalScore);
    event CycleResolved(uint256 indexed cycleId, uint256 prizePool);
    event CycleEnded(uint256 indexed cycleId, uint256 endTime, uint32 totalSlips);
    event PrizeClaimed(uint256 indexed cycleId, address indexed player, uint256 rank, uint256 amount);
    event PrizeRollover(uint256 indexed fromCycleId, uint256 indexed toCycleId, uint256 amount);
    event UserStatsUpdated(address indexed user, uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 winRate);
    event OddysseyReputationUpdated(address indexed user, uint256 pointsEarned, uint256 correctPredictions, uint256 totalReputation);
    event LeaderboardUpdated(uint256 indexed cycleId, address indexed player, uint256 indexed slipId, uint8 rank, uint256 finalScore);
    event AnalyticsUpdated(uint256 indexed cycleId, uint256 totalVolume, uint32 totalSlips, uint256 averageScore);

    // --- Errors ---

    // Authorization Errors
    error Unauthorized();
    error InvalidAddress();
    error NotOracle();
    error NotOwner();
    
    // Configuration Errors
    error InvalidFee();
    error InvalidDevWallet();
    error InvalidOracleAddress();
    error FeeTooHigh();
    error FeeTooLow();
    
    // Cycle Management Errors
    error InvalidCycleId();
    error CycleNotActive();
    error CycleNotResolved();
    error CycleAlreadyResolved();
    error CycleDoesNotExist();
    error CycleAlreadyStarted();
    error CycleNotEnded();
    error CycleExpired();
    error TooManyCycles();
    error CycleLimitExceeded();
    
    // Betting Window Errors
    error BettingClosed();
    error BettingNotClosed();
    error BettingNotStarted();
    error BettingWindowExpired();
    error BettingWindowNotReady();
    
    // Prediction Validation Errors
    error InvalidPredictionCount();
    error TooManyPredictions();
    error TooFewPredictions();
    error InvalidSelection();
    error InvalidBetType();
    error InvalidMatchId();
    error MatchIdMismatch();
    error MatchOrderMismatch();
    error PredictionOutOfOrder();
    error DuplicatePrediction();
    error InvalidPredictionFormat();
    
    // Odds Validation Errors
    error OddsNotSet();
    error OddsMismatch();
    error OddsTooHigh();
    error OddsTooLow();
    error OddsInvalid();
    error OddsExpired();
    error OddsNotAvailable();
    
    // Slip Management Errors
    error SlipAlreadyEvaluated();
    error SlipNotFound();
    error SlipNotEvaluated();
    error SlipExpired();
    error SlipInvalid();
    error SlipLimitExceeded();
    error SlipAlreadyPlaced();
    error SlipNotPlaced();
    
    // Leaderboard Errors
    error NotOnLeaderboard();
    error LeaderboardFull();
    error LeaderboardNotReady();
    error InvalidRank();
    error RankNotFound();
    
    // Prize Management Errors
    error PrizeAlreadyClaimed();
    error PrizeNotAvailable();
    error PrizeNotEarned();
    error PrizeExpired();
    error PrizeAmountInvalid();
    error ClaimingNotAvailable();
    error ClaimingExpired();
    error ClaimingNotReady();
    
    // Payment Errors
    error InsufficientPayment();
    error ExcessivePayment();
    error PaymentRequired();
    error PaymentFailed();
    error TransferFailed();
    error RefundFailed();
    
    // Match Data Errors
    error InvalidMatchData();
    error DuplicateMatchId();
    error MatchDataIncomplete();
    error MatchDataExpired();
    error MatchDataInvalid();
    error MatchNotReady();
    error MatchAlreadyStarted();
    error MatchNotFound();
    
    // Timing Errors
    error InvalidStartTime();
    error StartTimeInPast();
    error StartTimeTooSoon();
    error StartTimeTooLate();
    error EndTimeInvalid();
    error EndTimeBeforeStart();
    error TimeWindowInvalid();
    
    // Result Validation Errors
    error ResultNotSet();
    error ResultInvalid();
    error ResultAlreadySet();
    error ResultExpired();
    error ResultMismatch();
    error ResultIncomplete();
    
    // Gas and Transaction Errors
    error GasLimitExceeded();
    error TransactionFailed();
    error TransactionExpired();
    error TransactionInvalid();
    error ReentrancyDetected();
    
    // State Errors
    error InvalidState();
    error StateTransitionInvalid();
    error StateNotReady();
    error StateExpired();
    error StateMismatch();
    
    // Data Validation Errors
    error DataInvalid();
    error DataIncomplete();
    error DataExpired();
    error DataMismatch();
    error DataTooLarge();
    error DataTooSmall();

    // --- Modifiers ---

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }
    
    // Remove duplicate onlyOwner modifier - using OpenZeppelin's version
    
    modifier validCycleId(uint256 _cycleId) {
        if (_cycleId == 0 || _cycleId > dailyCycleId) revert InvalidCycleId();
        _;
    }
    
    modifier cycleExists(uint256 _cycleId) {
        if (cycleInfo[_cycleId].startTime == 0) revert CycleDoesNotExist();
        _;
    }
    
    modifier cycleActive(uint256 _cycleId) {
        if (cycleInfo[_cycleId].state != CycleState.Active) revert CycleNotActive();
        _;
    }
    
    modifier cycleResolved(uint256 _cycleId) {
        if (cycleInfo[_cycleId].state != CycleState.Resolved) revert CycleNotResolved();
        _;
    }
    
    modifier bettingOpen(uint256 _cycleId) {
        CycleInfo storage cycle = cycleInfo[_cycleId];
        if (cycle.state != CycleState.Active) revert BettingNotStarted();
        if (block.timestamp >= cycle.endTime) revert BettingClosed();
        _;
    }
    
    modifier validPayment() {
        if (msg.value != entryFee) revert InsufficientPayment();
        _;
    }
    
    modifier validSlipId(uint256 _slipId) {
        if (_slipId >= slipCount) revert SlipNotFound();
        _;
    }



    // --- Constructor ---

    constructor(address _devWallet, uint256 _initialEntryFee) Ownable(msg.sender) {
        if (_devWallet == address(0)) revert InvalidDevWallet();
        if (_initialEntryFee != 0.5 ether) revert InvalidFee(); // Must be exactly 0.5 MON
        
        devWallet = _devWallet;
        entryFee = _initialEntryFee;
        oracle = msg.sender; // Initially set oracle to deployer
        DEV_FEE_PERCENTAGE = 500; // 5%
        PRIZE_ROLLOVER_FEE_PERCENTAGE = 500; // 5%
    }

    // --- Admin Functions ---

    function setOracle(address _newOracle) external onlyOwner {
        if (_newOracle == address(0)) revert InvalidOracleAddress();
        if (_newOracle == oracle) revert InvalidOracleAddress();
        address oldOracle = oracle;
        oracle = _newOracle;
        emit OracleSet(_newOracle);
    }

    function setEntryFee(uint256 _newFee) external onlyOwner {
        if (_newFee != 0.5 ether) revert InvalidFee(); // Must be exactly 0.5 MON
        if (_newFee == entryFee) revert InvalidFee();
        entryFee = _newFee;
        emit EntryFeeSet(_newFee);
    }



    // --- Oracle Functions ---

    function startDailyCycle(Match[MATCH_COUNT] memory _matches) external onlyOracle {
        // Validate that all matches have valid data
        uint64 earliestStartTime = type(uint64).max;
        
        for (uint i = 0; i < MATCH_COUNT; i++) {
            Match memory matchData = _matches[i];
            
            // Validate match data
            if (matchData.id == 0) revert MatchNotFound();
            if (matchData.startTime <= block.timestamp + 300) revert StartTimeTooSoon();
            if (matchData.oddsHome == 0 || matchData.oddsDraw == 0 || matchData.oddsAway == 0) revert OddsNotSet();
            if (matchData.oddsOver == 0 || matchData.oddsUnder == 0) revert OddsNotSet();
            
            // Check for duplicates
            for (uint j = i + 1; j < MATCH_COUNT; j++) {
                if (matchData.id == _matches[j].id) revert DuplicateMatchId();
            }
            
            if (matchData.startTime < earliestStartTime) {
                earliestStartTime = matchData.startTime;
            }
        }
        
        if (earliestStartTime <= block.timestamp + 300) revert StartTimeTooSoon();

        dailyCycleId++;
        uint256 cycle = dailyCycleId;

        _handlePrizeRollover(cycle - 1);

        // Set betting deadline 5 minutes before first match
        uint256 bettingDeadline = earliestStartTime - 300;

        // Store cycle data
        dailyMatches[cycle] = _matches;
        dailyCycleEndTimes[cycle] = bettingDeadline;
        claimableStartTimes[cycle] = type(uint256).max; // Default to indefinite
        isCycleResolved[cycle] = false;

        // Initialize cycle info
        cycleInfo[cycle] = CycleInfo({
            startTime: block.timestamp,
            endTime: bettingDeadline,
            prizePool: 0,
            slipCount: 0,
            evaluatedSlips: 0,
            state: CycleState.Active,
            hasWinner: false
        });

        emit CycleStarted(cycle, bettingDeadline);
    }

    function resolveDailyCycle(uint256 _cycleId, Result[MATCH_COUNT] memory _results) 
        public 
        onlyOracle 
        validCycleId(_cycleId)
        cycleExists(_cycleId)
    {
        CycleInfo storage cycle = cycleInfo[_cycleId];
        
        if (cycle.state == CycleState.Resolved) revert CycleAlreadyResolved();
        if (block.timestamp <= cycle.endTime) revert BettingNotClosed();

        // First mark cycle as ended if not already
        if (cycle.state == CycleState.Active) {
            cycle.state = CycleState.Ended;
            emit CycleEnded(_cycleId, cycle.endTime, cycle.slipCount);
        }

        // Update match results
        for (uint i = 0; i < MATCH_COUNT; i++) {
            dailyMatches[_cycleId][i].result = _results[i];
        }

        // Update cycle state to resolved
        cycle.state = CycleState.Resolved;
        isCycleResolved[_cycleId] = true;
        
        // Set claiming deadline (24 hours from now, or immediate if no slips)
        if (cycle.slipCount == 0) {
            claimableStartTimes[_cycleId] = block.timestamp;
        } else {
            claimableStartTimes[_cycleId] = block.timestamp + 24 hours;
        }

        // Emit analytics event
        uint256 averageScore = 0;
        if (cycle.slipCount > 0) {
            // Calculate average score from evaluated slips
            uint256 totalScore = 0;
            uint32 evaluatedCount = 0;
            // This would need to be calculated from actual slip data
            // For now, we'll emit with basic stats
        }

        emit CycleResolved(_cycleId, dailyPrizePools[_cycleId]);
        emit AnalyticsUpdated(_cycleId, cycle.prizePool, cycle.slipCount, averageScore);
    }

    /**
     * @dev Resolve multiple cycles in batch (gas efficient)
     * @param _cycleIds Array of cycle IDs to resolve
     * @param _results Array of results for each cycle
     */
    function resolveMultipleCycles(
        uint256[] memory _cycleIds,
        Result[MATCH_COUNT][] memory _results
    ) external onlyOracle {
        if (_cycleIds.length != _results.length) revert InvalidPredictionCount();
        if (_cycleIds.length > MAX_CYCLES_TO_RESOLVE) revert TooManyCycles();
        
        for (uint i = 0; i < _cycleIds.length; i++) {
            resolveDailyCycle(_cycleIds[i], _results[i]);
        }
    }

    // --- Public Functions ---

    function placeSlip(UserPrediction[MATCH_COUNT] memory _predictions) external payable nonReentrant {
        uint256 cycle = dailyCycleId;
        if (cycle == 0) revert CycleNotActive();
        
        CycleInfo storage currentCycleInfo = cycleInfo[cycle];
        if (currentCycleInfo.state != CycleState.Active) revert CycleNotActive();
        if (block.timestamp >= currentCycleInfo.endTime) revert BettingClosed();

        // Check exact payment
        if (msg.value != entryFee) revert InsufficientPayment();

        Match[MATCH_COUNT] storage currentMatches = dailyMatches[cycle];

        for (uint i = 0; i < MATCH_COUNT; i++) {
            UserPrediction memory p = _predictions[i];
            // Ensure predictions are for the correct matches and in order
            if (p.matchId != currentMatches[i].id) revert MatchIdMismatch();
            Match memory m = currentMatches[i];

            uint32 odd;
            if (p.betType == BetType.MONEYLINE) {
                if (p.selection == keccak256(bytes("1"))) odd = m.oddsHome;
                else if (p.selection == keccak256(bytes("X"))) odd = m.oddsDraw;
                else if (p.selection == keccak256(bytes("2"))) odd = m.oddsAway;
                else revert InvalidSelection();
            } else if (p.betType == BetType.OVER_UNDER) {
                if (p.selection == keccak256(bytes("Over"))) odd = m.oddsOver;
                else if (p.selection == keccak256(bytes("Under"))) odd = m.oddsUnder;
                else revert InvalidSelection();
            } else {
                revert InvalidBetType();
            }
            if (odd == 0) revert OddsNotSet();
            if (p.selectedOdd != odd) revert OddsMismatch();
        }

        uint256 slipId = slipCount;
        slips[slipId] = Slip({
            player: msg.sender,
            cycleId: cycle,
            placedAt: block.timestamp,
            predictions: _predictions,
            finalScore: 0,
            correctCount: 0,
            isEvaluated: false
        });
        slipCount++;

        s_userSlipsPerCycle[cycle][msg.sender].push(slipId);
        dailyPrizePools[cycle] += msg.value;
        
        // Update stats
        stats.totalVolume += msg.value;
        stats.totalSlips++;
        cycleStats[cycle].volume += msg.value;
        cycleStats[cycle].slips++;
        currentCycleInfo.prizePool += msg.value;
        currentCycleInfo.slipCount++;
        
        // Update user stats
        _updateUserStats(msg.sender, cycle, true);
        
        // Note: Auto-evaluate is handled by the backend for better gas efficiency
        // Users can set autoEvaluate preference, but actual evaluation happens via backend
        
        emit SlipPlaced(cycle, msg.sender, slipId);
    }

    function evaluateSlip(uint256 _slipId) external nonReentrant {
        if (_slipId >= slipCount) revert SlipNotFound();
        
        Slip storage slip = slips[_slipId];
        uint256 cycleIdOfSlip = slip.cycleId;

        if (cycleInfo[cycleIdOfSlip].state != CycleState.Resolved) revert CycleNotResolved();
        if (slip.isEvaluated) revert SlipAlreadyEvaluated();
        
        uint8 correctCount = 0;
        uint256 score = ODDS_SCALING_FACTOR; // Start with 1000 (scaled by 1000)
        Match[MATCH_COUNT] storage currentMatches = dailyMatches[cycleIdOfSlip];

        for(uint i = 0; i < MATCH_COUNT; i++) {
            UserPrediction memory p = slip.predictions[i];
            Match memory m = currentMatches[i];
            bool isCorrect = false;

            if (p.betType == BetType.MONEYLINE) {
                if ((p.selection == keccak256(bytes("1")) && m.result.moneyline == MoneylineResult.HomeWin) ||
                    (p.selection == keccak256(bytes("X")) && m.result.moneyline == MoneylineResult.Draw) ||
                    (p.selection == keccak256(bytes("2")) && m.result.moneyline == MoneylineResult.AwayWin)) {
                    isCorrect = true;
                }
            } else { // OverUnder
                if ((p.selection == keccak256(bytes("Over")) && m.result.overUnder == OverUnderResult.Over) ||
                    (p.selection == keccak256(bytes("Under")) && m.result.overUnder == OverUnderResult.Under)) {
                    isCorrect = true;
                }
            }

            if (isCorrect) {
                correctCount++;
                // FIXED: Only multiply odds for correct predictions
                // Example: 5 correct predictions with 2.0 odds each = 2*2*2*2*2 = 32
                score = (score * p.selectedOdd) / ODDS_SCALING_FACTOR;
            }
            // FIXED: Do NOT multiply score for incorrect predictions
        }

        slip.correctCount = correctCount;
        slip.isEvaluated = true;
        slip.finalScore = (correctCount > 0) ? score : 0;

        // Emit slip evaluation event
        emit SlipEvaluated(_slipId, slip.player, cycleIdOfSlip, correctCount, slip.finalScore);

        _updateLeaderboard(cycleIdOfSlip, slip.player, _slipId, slip.finalScore, correctCount);
        
        // Update user stats after evaluation
        _updateUserStats(slip.player, cycleIdOfSlip, false);
        
        // Track evaluated slips and check for early claim unlock
        CycleStats storage statsForCycle = cycleStats[cycleIdOfSlip];
        CycleInfo storage cycle = cycleInfo[cycleIdOfSlip];
        
        statsForCycle.evaluatedSlips++;
        cycle.evaluatedSlips++;
        
        if (statsForCycle.evaluatedSlips == statsForCycle.slips) {
            claimableStartTimes[cycleIdOfSlip] = block.timestamp;
        }
    }

    function claimPrize(uint256 _cycleId) external nonReentrant {
        if (cycleInfo[_cycleId].state != CycleState.Resolved) revert CycleNotResolved();
        if (block.timestamp < claimableStartTimes[_cycleId]) revert ClaimingNotAvailable();
        
        LeaderboardEntry[DAILY_LEADERBOARD_SIZE] storage leaderboard = dailyLeaderboards[_cycleId];
        uint8 rank = 0;
        bool playerFound = false;

        for (uint8 i = 0; i < DAILY_LEADERBOARD_SIZE; i++) {
            if (leaderboard[i].player == msg.sender) {
                rank = i;
                playerFound = true;
                break;
            }
        }

        if (!playerFound) revert NotOnLeaderboard();

        if (prizeClaimed[_cycleId][rank]) revert PrizeAlreadyClaimed();

        uint256 prizeAmount = _calculatePrize(rank, dailyPrizePools[_cycleId]);
        if (prizeAmount == 0) { // This can happen if prize pool was 0
            prizeClaimed[_cycleId][rank] = true;
            return;
        }

        prizeClaimed[_cycleId][rank] = true;

        uint256 devFee = (prizeAmount * DEV_FEE_PERCENTAGE) / 10000;
        uint256 userShare = prizeAmount - devFee;
        
        // Transfer native MON
        (bool success1, ) = payable(devWallet).call{value: devFee}("");
        if (!success1) revert TransferFailed();
        
        (bool success2, ) = payable(msg.sender).call{value: userShare}("");
        if (!success2) revert TransferFailed();

        emit PrizeClaimed(_cycleId, msg.sender, rank, userShare);
    }

    // --- View Functions ---

    function getDailyMatches(uint256 _cycleId) external view returns (Match[MATCH_COUNT] memory) {
        return dailyMatches[_cycleId];
    }

    function getDailyLeaderboard(uint256 _cycleId) external view returns (LeaderboardEntry[DAILY_LEADERBOARD_SIZE] memory) {
        return dailyLeaderboards[_cycleId];
    }

    function getUserSlipsForCycle(address _user, uint256 _cycleId) external view returns (uint256[] memory) {
        return s_userSlipsPerCycle[_cycleId][_user];
    }

    function getSlip(uint256 _slipId) external view returns (Slip memory) {
        return slips[_slipId];
    }

    // --- User Analytics Functions ---

    function getUserStats(address _user) external view returns (
        uint256 totalSlips,
        uint256 totalWins,
        uint256 bestScore,
        uint256 averageScore,
        uint256 winRate,
        uint256 currentStreak,
        uint256 bestStreak,
        uint256 lastActiveCycle
    ) {
        UserStats storage userStat = userStats[_user];
        return (
            userStat.totalSlips,
            userStat.totalWins,
            userStat.bestScore,
            userStat.averageScore,
            userStat.winRate,
            userStat.currentStreak,
            userStat.bestStreak,
            userStat.lastActiveCycle
        );
    }

    /**
     * @notice Get total number of slips placed by a user (for faucet eligibility)
     * @param _user User address
     * @return totalSlips Total number of slips placed across all cycles
     */
    function getUserTotalSlips(address _user) external view returns (uint256) {
        return userStats[_user].totalSlips;
    }

    // --- Enhanced View Functions for Frontend Integration ---

    /**
     * @dev Get current cycle information with enhanced data
     */
    function getCurrentCycleInfo() external view returns (
        uint256 cycleId,
        uint8 state,
        uint256 endTime,
        uint256 prizePool,
        uint32 cycleSlipCount
    ) {
        cycleId = dailyCycleId;
        if (cycleId > 0) {
            CycleInfo memory info = cycleInfo[cycleId];
            return (cycleId, uint8(info.state), info.endTime, info.prizePool, info.slipCount);
        }
        return (0, 0, 0, 0, 0);
    }

    /**
     * @dev Get detailed cycle status
     */
    function getCycleStatus(uint256 _cycleId) external view returns (
        bool exists,
        uint8 state,
        uint256 endTime,
        uint256 prizePool,
        uint32 cycleSlipCount,
        bool hasWinner
    ) {
        if (_cycleId == 0 || _cycleId > dailyCycleId) {
            return (false, 0, 0, 0, 0, false);
        }
        
        CycleInfo memory info = cycleInfo[_cycleId];
        return (
            info.startTime > 0,
            uint8(info.state),
            info.endTime,
            info.prizePool,
            info.slipCount,
            info.hasWinner
        );
    }

    /**
     * @dev Get user statistics with reputation data
     */
    function getUserStatsWithReputation(address _user) external view returns (
        uint256 totalSlips,
        uint256 totalWins,
        uint256 bestScore,
        uint256 averageScore,
        uint256 winRate,
        uint256 currentStreak,
        uint256 bestStreak,
        uint256 lastActiveCycle,
        uint256 totalReputation,
        uint256 totalCorrectPredictions
    ) {
        UserStats storage userStat = userStats[_user];
        return (
            userStat.totalSlips,
            userStat.totalWins,
            userStat.bestScore,
            userStat.averageScore,
            userStat.winRate,
            userStat.currentStreak,
            userStat.bestStreak,
            userStat.lastActiveCycle,
            userOddysseyReputation[_user],
            userOddysseyCorrectPredictions[_user]
        );
    }

    // --- Batch Operations ---

    function evaluateMultipleSlips(uint256[] memory _slipIds) external {
        for (uint256 i = 0; i < _slipIds.length; i++) {
            this.evaluateSlip(_slipIds[i]);
        }
    }

    function claimMultiplePrizes(uint256[] memory _cycleIds) external {
        for (uint256 i = 0; i < _cycleIds.length; i++) {
            this.claimPrize(_cycleIds[i]);
        }
    }

    // --- Internal Functions ---

    function _updateLeaderboard(uint256 _cycleId, address _player, uint256 _slipId, uint256 _finalScore, uint8 _correctCount) private {
        if (_correctCount < MIN_CORRECT_PREDICTIONS) return;

        LeaderboardEntry[DAILY_LEADERBOARD_SIZE] storage leaderboard = dailyLeaderboards[_cycleId];
        int256 position = -1;

        // Get slip placement time for tiebreaker
        Slip storage currentSlip = slips[_slipId];
        uint256 currentPlacedAt = currentSlip.placedAt;

        for (uint256 i = DAILY_LEADERBOARD_SIZE; i > 0; i--) {
            uint256 index = i - 1;
            LeaderboardEntry storage entry = leaderboard[index];
            
            bool shouldReplace = false;
            
            if (_finalScore > entry.finalScore) {
                // Higher score wins
                shouldReplace = true;
            } else if (_finalScore == entry.finalScore) {
                // Same score - check tiebreakers
                if (_correctCount > entry.correctCount) {
                    // Tiebreaker 1: More correct predictions wins
                    shouldReplace = true;
                } else if (_correctCount == entry.correctCount) {
                    // Tiebreaker 2: Earlier submission time wins
                    if (entry.player == address(0)) {
                        // Empty slot
                        shouldReplace = true;
                    } else {
                        // Compare submission times - need to get the existing slip's placement time
                        Slip storage existingSlip = slips[entry.slipId];
                        if (currentPlacedAt < existingSlip.placedAt) {
                            shouldReplace = true;
                        }
                    }
                }
            }
            
            if (shouldReplace) {
                position = int256(index);
            } else {
                break;
            }
        }

        if (position != -1) {
            for (uint256 i = DAILY_LEADERBOARD_SIZE - 1; i > uint256(position); i--) {
                leaderboard[i] = leaderboard[i-1];
            }
            leaderboard[uint256(position)] = LeaderboardEntry({player: _player, slipId: _slipId, finalScore: _finalScore, correctCount: _correctCount});
            
            // Mark cycle as having winners
            cycleInfo[_cycleId].hasWinner = true;
            
            // Emit leaderboard update event
            emit LeaderboardUpdated(_cycleId, _player, _slipId, uint8(uint256(position)), _finalScore);
        }
    }

    function _calculatePrize(uint8 _rank, uint256 _totalPrizePool) private pure returns (uint256) {
        uint256 percentage;
        if (_rank == 0) percentage = 4000;      // 40%
        else if (_rank == 1) percentage = 3000; // 30%
        else if (_rank == 2) percentage = 2000; // 20%
        else if (_rank == 3) percentage = 500;  // 5%
        else if (_rank == 4) percentage = 500;  // 5%
        else return 0;

        return (_totalPrizePool * percentage) / 10000;
    }

    function _updateUserStats(address _user, uint256 _cycleId, bool _isPlacing) private {
        UserStats storage userStat = userStats[_user];
        
        if (_isPlacing) {
            // Update when placing slip
            userStat.totalSlips++;
            userStat.lastActiveCycle = _cycleId;
        } else {
            // Update when evaluating slip - we need to find the user's slip for this cycle
            uint256[] storage userSlips = s_userSlipsPerCycle[_cycleId][_user];
            if (userSlips.length > 0) {
                uint256 latestSlipId = userSlips[userSlips.length - 1];
                Slip storage slip = slips[latestSlipId];
                
                // Calculate reputation points based on performance (updated to match backend)
                uint256 reputationPoints = 0;
                
                if (slip.correctCount >= MIN_CORRECT_PREDICTIONS) {
                    userStat.totalWins++;
                    
                    // Only add to total correct predictions if slip qualifies
                    userOddysseyCorrectPredictions[_user] += slip.correctCount;
                    
                    // Base points for qualifying (7+ correct)
                    reputationPoints = 3;
                    
                    // Bonus points for high accuracy
                    if (slip.correctCount >= 8) reputationPoints = 4; // Excellent
                    if (slip.correctCount >= 9) reputationPoints = 6; // Outstanding
                    if (slip.correctCount == 10) reputationPoints = 8; // Perfect score
                    
                    // Winner bonus (top 5 in cycle) - check if user is on leaderboard
                    bool isWinner = false;
                    for (uint8 i = 0; i < DAILY_LEADERBOARD_SIZE; i++) {
                        if (dailyLeaderboards[_cycleId][i].player == _user) {
                            isWinner = true;
                            break;
                        }
                    }
                    if (isWinner) reputationPoints += 10;
                    
                    // Champion bonus (can be earned only once) - simplified logic
                    // In practice, this would be tracked separately
                    // reputationPoints += 15; // Champion bonus
                    
                    // Update best score
                    if (slip.finalScore > userStat.bestScore) {
                        userStat.bestScore = slip.finalScore;
                        reputationPoints += 2; // Bonus for new best score
                    }
                    
                    // Update streaks
                    if (_cycleId == userStat.lastActiveCycle + 1) {
                        userStat.currentStreak++;
                        if (userStat.currentStreak > userStat.bestStreak) {
                            userStat.bestStreak = userStat.currentStreak;
                            reputationPoints += 3; // Bonus for new best streak
                        }
                    } else {
                        userStat.currentStreak = 1;
                    }
                } else {
                    userStat.currentStreak = 0;
                    // Participation points (even if not winning)
                    reputationPoints = 1;
                    // Do NOT add to total correct predictions for slips < 7 correct
                }
                
                // Update total reputation
                userOddysseyReputation[_user] += reputationPoints;
                
                // Update average score and win rate
                if (userStat.totalSlips > 0) {
                    userStat.averageScore = (userStat.averageScore * (userStat.totalSlips - 1) + slip.finalScore) / userStat.totalSlips;
                    userStat.winRate = (userStat.totalWins * 10000) / userStat.totalSlips;
                }
                
                emit OddysseyReputationUpdated(_user, reputationPoints, slip.correctCount, userOddysseyReputation[_user]);
            }
        }
        
        emit UserStatsUpdated(_user, userStat.totalSlips, userStat.totalWins, userStat.bestScore, userStat.winRate);
    }

    function _handlePrizeRollover(uint256 _previousCycleId) private {
        if (_previousCycleId == 0) return;

        LeaderboardEntry[DAILY_LEADERBOARD_SIZE] storage leaderboard = dailyLeaderboards[_previousCycleId];
        if (leaderboard[0].player == address(0) || leaderboard[0].correctCount < MIN_CORRECT_PREDICTIONS) {
            uint256 prizeToRoll = dailyPrizePools[_previousCycleId];
            if (prizeToRoll > 0) {
                uint256 fee = (prizeToRoll * PRIZE_ROLLOVER_FEE_PERCENTAGE) / 10000;
                uint256 amountToTransfer = prizeToRoll - fee;

                dailyPrizePools[_previousCycleId] = 0;
                dailyPrizePools[_previousCycleId + 1] += amountToTransfer;
                
                // Transfer rollover fee to dev wallet
                (bool success, ) = payable(devWallet).call{value: fee}("");
                if (!success) revert TransferFailed();

                emit PrizeRollover(_previousCycleId, _previousCycleId + 1, amountToTransfer);
            }
        }
    }
    
    // --- View Functions for External Integration ---
    
    function getCurrentCycle() external view returns (uint256) {
        return dailyCycleId;
    }
    
    /**
     * @dev Get comprehensive cycle analytics
     */
    function getCycleAnalytics(uint256 _cycleId) external view returns (
        uint256 totalVolume,
        uint32 totalSlips,
        uint32 evaluatedSlips,
        uint256 averageScore,
        uint256 highestScore,
        uint8 winnersCount,
        bool hasRollover
    ) {
        if (_cycleId == 0 || _cycleId > dailyCycleId) {
            return (0, 0, 0, 0, 0, 0, false);
        }
        
        CycleInfo memory cycle = cycleInfo[_cycleId];
        CycleStats memory cycleStatsData = cycleStats[_cycleId];
        LeaderboardEntry[DAILY_LEADERBOARD_SIZE] memory leaderboard = dailyLeaderboards[_cycleId];
        
        // Count actual winners (non-zero entries)
        uint8 winners = 0;
        uint256 highest = 0;
        for (uint8 i = 0; i < DAILY_LEADERBOARD_SIZE; i++) {
            if (leaderboard[i].player != address(0)) {
                winners++;
                if (leaderboard[i].finalScore > highest) {
                    highest = leaderboard[i].finalScore;
                }
            }
        }
        
        return (
            cycleStatsData.volume,
            cycleStatsData.slips,
            cycleStatsData.evaluatedSlips,
            0, // Average score would need to be calculated from all slips
            highest,
            winners,
            !cycle.hasWinner && cycle.prizePool > 0
        );
    }
    
    /**
     * @dev Get prize pool breakdown for a cycle
     */
    function getPrizePoolBreakdown(uint256 _cycleId) external view returns (
        uint256 totalPool,
        uint256 firstPlace,
        uint256 secondPlace,
        uint256 thirdPlace,
        uint256 fourthPlace,
        uint256 fifthPlace,
        uint256 devFee,
        bool hasRollover
    ) {
        uint256 pool = dailyPrizePools[_cycleId];
        if (pool == 0) {
            return (0, 0, 0, 0, 0, 0, 0, false);
        }
        
        CycleInfo memory cycle = cycleInfo[_cycleId];
        bool rollover = !cycle.hasWinner;
        
        if (rollover) {
            uint256 fee = (pool * PRIZE_ROLLOVER_FEE_PERCENTAGE) / 10000;
            return (pool, 0, 0, 0, 0, 0, fee, true);
        }
        
        return (
            pool,
            _calculatePrize(0, pool),
            _calculatePrize(1, pool),
            _calculatePrize(2, pool),
            _calculatePrize(3, pool),
            _calculatePrize(4, pool),
            0,
            false
        );
    }
    
    function isCycleInitialized(uint256 _cycleId) external view returns (bool) {
        if (_cycleId > dailyCycleId || _cycleId == 0) {
            return false;
        }
        
        // Check if the cycle has matches data
        return dailyMatches[_cycleId][0].id > 0;
    }
    
    function getCycleMatches(uint256 _cycleId) external view returns (Match[MATCH_COUNT] memory) {
        require(_cycleId <= dailyCycleId && _cycleId > 0, "Cycle does not exist");
        
        // Check if the cycle has any matches data
        Match[MATCH_COUNT] memory matches = dailyMatches[_cycleId];
        
        // If the first match has no ID, the cycle might be uninitialized
        if (matches[0].id == 0) {
            // Return empty matches array for uninitialized cycles
            // This prevents revert and allows the system to handle gracefully
            Match[MATCH_COUNT] memory emptyMatches;
            return emptyMatches;
        }
        
        return matches;
    }
    
    function getOddysseyReputation(address _user) external view returns (
        uint256 totalReputation,
        uint256 totalCorrectPredictions
    ) {
        return (
            userOddysseyReputation[_user],
            userOddysseyCorrectPredictions[_user]
        );
    }
    
} 