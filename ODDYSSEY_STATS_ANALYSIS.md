# Oddyssey Leaderboard & Stats Analysis

## 🔍 **Current Status Analysis**

### ✅ **What's Already Implemented**

#### **Contract Level (Fully Implemented)**:
1. **Leaderboard Management**: ✅ **DONE ON CONTRACT**
   - `dailyLeaderboards[cycleId][rank]` mapping
   - `_updateLeaderboard()` function automatically manages rankings
   - Top 5 players per cycle with scores and correct predictions
   - `getDailyLeaderboard(cycleId)` view function

2. **Prize Pool Management**: ✅ **DONE ON CONTRACT**
   - `dailyPrizePools[cycleId]` mapping
   - Automatic prize pool accumulation from entry fees
   - Prize rollover mechanism for cycles without winners
   - `claimPrize(cycleId)` function with rank-based distribution

3. **Stats Tracking**: ✅ **COMPREHENSIVE ON CONTRACT**
   - **GlobalStats**: `totalVolume`, `totalSlips`, `highestOdd`
   - **CycleStats**: `volume`, `slips`, `evaluatedSlips`
   - **UserStats**: `totalSlips`, `totalWins`, `bestScore`, `averageScore`, `winRate`, `currentStreak`, `bestStreak`, `lastActiveCycle`

#### **Backend Level (Partially Implemented)**:
1. **Basic Stats Endpoint**: ✅ `/api/oddyssey/stats`
   - Only provides cycle-specific stats
   - Missing global and user stats endpoints

2. **Indexer Events**: ⚠️ **PARTIALLY IMPLEMENTED**
   - `UserStatsUpdated` event listener exists but not implemented
   - Contract emits comprehensive stats events

#### **Frontend Level (Partially Implemented)**:
1. **Stats Display**: ✅ **UI EXISTS**
   - Prize pool display area exists
   - User stats section exists
   - Global stats section exists
   - Using placeholder/default data

---

## ❌ **What's Missing**

### **Backend API Endpoints**:
1. **Global Stats Endpoint**: `/api/oddyssey/stats?type=global`
2. **User Stats Endpoint**: `/api/oddyssey/stats?type=user&address=0x...`
3. **Current Prize Pool Endpoint**: Real-time prize pool for current cycle
4. **Daily Players Count**: Players who participated today
5. **Daily Slips Count**: Slips placed today

### **Indexer Implementation**:
1. **UserStatsUpdated Event Handler**: Store user stats in database
2. **Global Stats Calculation**: Aggregate stats across all cycles
3. **Daily Stats Tracking**: Track daily participation metrics

### **Database Tables**:
1. **User Stats Table**: Store indexed user statistics
2. **Global Stats Table**: Store aggregated global statistics
3. **Daily Stats Table**: Store daily participation metrics

---

## 📊 **Contract Stats Available**

### **From Contract Directly**:
```solidity
// Global Stats
struct GlobalStats {
    uint256 totalVolume;      // ✅ Total ETH/STT volume
    uint32 totalSlips;        // ✅ All-time slips count
    uint256 highestOdd;       // ✅ Highest odd ever achieved
}

// Cycle Stats  
struct CycleStats {
    uint256 volume;           // ✅ Cycle volume
    uint32 slips;            // ✅ Slips in cycle
    uint32 evaluatedSlips;   // ✅ Evaluated slips
}

// User Stats
struct UserStats {
    uint256 totalSlips;       // ✅ User's total slips
    uint256 totalWins;        // ✅ User's wins
    uint256 bestScore;        // ✅ User's best score
    uint256 averageScore;     // ✅ User's average score
    uint256 winRate;          // ✅ Win rate (scaled by 10000)
    uint256 currentStreak;    // ✅ Current winning streak
    uint256 bestStreak;       // ✅ Best winning streak
    uint256 lastActiveCycle;  // ✅ Last cycle user participated
}
```

### **Available Contract Functions**:
```solidity
// View Functions
function getUserStats(address _user) external view returns (UserStats)
function getDailyLeaderboard(uint256 _cycleId) external view returns (LeaderboardEntry[5])
function stats() external view returns (GlobalStats)  // Global stats
function cycleStats(uint256 _cycleId) external view returns (CycleStats)
function dailyPrizePools(uint256 _cycleId) external view returns (uint256)
function cycleInfo(uint256 _cycleId) external view returns (CycleInfo)
```

---

## 🎯 **Implementation Plan**

### **Phase 1: Backend API Endpoints** (Priority: HIGH)

#### **1. Enhanced Stats Endpoint**
```javascript
// GET /api/oddyssey/stats?type=global
// GET /api/oddyssey/stats?type=user&address=0x...
// GET /api/oddyssey/stats?type=cycle&cycleId=123
```

#### **2. Real-time Data Endpoints**
```javascript
// GET /api/oddyssey/current-prize-pool
// GET /api/oddyssey/daily-stats
// GET /api/oddyssey/leaderboard/:cycleId
```

### **Phase 2: Database Schema** (Priority: HIGH)

#### **1. User Stats Table**
```sql
CREATE TABLE oracle.oddyssey_user_stats (
    address VARCHAR(42) PRIMARY KEY,
    total_slips INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    best_score BIGINT DEFAULT 0,
    average_score BIGINT DEFAULT 0,
    win_rate INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    last_active_cycle INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **2. Daily Stats Table**
```sql
CREATE TABLE oracle.oddyssey_daily_stats (
    date DATE PRIMARY KEY,
    cycle_id INTEGER,
    daily_players INTEGER DEFAULT 0,
    daily_slips INTEGER DEFAULT 0,
    prize_pool DECIMAL(18,6) DEFAULT 0,
    avg_score DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### **Phase 3: Indexer Implementation** (Priority: MEDIUM)

#### **1. UserStatsUpdated Event Handler**
```javascript
async handleUserStatsUpdated(event) {
    const { user, totalSlips, totalWins, bestScore, winRate } = event.args;
    
    await db.query(`
        INSERT INTO oracle.oddyssey_user_stats 
        (address, total_slips, total_wins, best_score, win_rate, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (address) DO UPDATE SET
            total_slips = EXCLUDED.total_slips,
            total_wins = EXCLUDED.total_wins,
            best_score = EXCLUDED.best_score,
            win_rate = EXCLUDED.win_rate,
            updated_at = NOW()
    `, [user, totalSlips, totalWins, bestScore, winRate]);
}
```

#### **2. Daily Stats Aggregation**
```javascript
async calculateDailyStats() {
    // Aggregate daily participation from contract data
    // Update oracle.oddyssey_daily_stats table
}
```

### **Phase 4: Frontend Integration** (Priority: LOW)

#### **1. Real-time Stats Display**
- Connect to new backend endpoints
- Display current cycle prize pool
- Show daily players/slips counts
- Update user stats from contract data

---

## 🚀 **Quick Implementation (Immediate)**

### **1. Contract-Direct Stats (No Backend Changes)**
```javascript
// Frontend can call contract directly for:
const globalStats = await oddysseyContract.stats();
const userStats = await oddysseyContract.getUserStats(userAddress);
const currentPrizePool = await oddysseyContract.dailyPrizePools(currentCycleId);
const leaderboard = await oddysseyContract.getDailyLeaderboard(currentCycleId);
```

### **2. Backend Stats Endpoints (30 minutes)**
```javascript
// Add to api/oddyssey.js
router.get('/stats', async (req, res) => {
    const { type, address, cycleId } = req.query;
    
    if (type === 'global') {
        // Call contract.stats()
    } else if (type === 'user' && address) {
        // Call contract.getUserStats(address)
    } else if (type === 'cycle' && cycleId) {
        // Call contract.cycleStats(cycleId)
    }
});
```

---

## 📈 **Stats That Should Be Displayed**

### **Current Cycle Stats**:
- ✅ **Prize Pool**: `dailyPrizePools[currentCycleId]`
- ✅ **Players Today**: `cycleStats[currentCycleId].slips` (unique players)
- ✅ **Slips Today**: `cycleStats[currentCycleId].slips`
- ✅ **Cycle End Time**: `cycleInfo[currentCycleId].endTime`

### **Global Stats**:
- ✅ **Total Players**: Count unique addresses from all cycles
- ✅ **Total Volume**: `globalStats.totalVolume`
- ✅ **Total Slips**: `globalStats.totalSlips`
- ✅ **Highest Score**: `globalStats.highestOdd`

### **User Stats** (when connected):
- ✅ **Total Slips**: `userStats.totalSlips`
- ✅ **Total Wins**: `userStats.totalWins`
- ✅ **Best Score**: `userStats.bestScore`
- ✅ **Win Rate**: `userStats.winRate / 100`
- ✅ **Current Streak**: `userStats.currentStreak`
- ✅ **Best Streak**: `userStats.bestStreak`

---

## ✅ **Summary**

### **Leaderboard**: ✅ **FULLY IMPLEMENTED ON CONTRACT**
- No backend work needed
- Contract manages everything automatically
- Frontend can call `getDailyLeaderboard(cycleId)` directly

### **Prize Pool**: ✅ **FULLY IMPLEMENTED ON CONTRACT**  
- Contract tracks prize pools per cycle
- Automatic rollover mechanism
- Frontend can call `dailyPrizePools[cycleId]` directly

### **Stats**: ⚠️ **CONTRACT HAS DATA, BACKEND MISSING ENDPOINTS**
- Contract tracks comprehensive stats
- Backend needs endpoints to serve this data
- Frontend has UI but uses placeholder data

### **Immediate Action Required**:
1. **Add backend stats endpoints** (30 minutes)
2. **Update frontend to call real endpoints** (15 minutes)
3. **Implement indexer stats handlers** (optional, for performance)

**The contract is fully functional - we just need to expose the data properly!** 🎯
