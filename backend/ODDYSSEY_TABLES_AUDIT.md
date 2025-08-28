# Oddyssey Tables Architecture Audit

## 🚨 **CRITICAL ISSUES IDENTIFIED**

### **1. DUPLICATE TABLES ACROSS SCHEMAS**
The system has **DUPLICATE TABLES** across multiple schemas causing massive confusion and conflicts:

| Table Name | oracle Schema | oddyssey Schema | Purpose Conflict |
|------------|---------------|-----------------|------------------|
| `oddyssey_cycles` | ✅ Main cycle tracking | ✅ User-facing cycles | **DUPLICATE** |
| `daily_game_matches` | ✅ Contract matches | ✅ User selections | **DUPLICATE** |
| `oddyssey_slips` | ✅ Blockchain slips | ✅ User slips | **DUPLICATE** |

### **2. SCHEMA CONFUSION**
- **`oracle` schema**: Blockchain/contract-related data
- **`oddyssey` schema**: User-facing/application data
- **`public` schema**: Legacy/unused tables

---

## 📊 **COMPLETE TABLE MAPPING**

### **Oracle Schema (Blockchain/Contract Data)**

#### **`oracle.oddyssey_cycles`** - Main Cycle Tracking
```sql
- cycle_id (bigint, PK) - Contract cycle ID
- matches_count (integer) - Number of matches in cycle
- matches_data (jsonb) - Complete match data from contract
- cycle_start_time (timestamp) - When cycle starts
- cycle_end_time (timestamp) - When cycle ends
- is_resolved (boolean) - If cycle is resolved
- tx_hash (text) - Creation transaction hash
- resolution_tx_hash (text) - Resolution transaction hash
- resolution_data (jsonb) - Resolution results
- ready_for_resolution (boolean) - Ready to resolve flag
```
**Usage**: Primary cycle storage, updated by `oddyssey-manager.js`

#### **`oracle.current_oddyssey_cycle`** - Current Cycle Cache
```sql
- Same structure as oddyssey_cycles
- Single row table (current active cycle)
```
**Usage**: Fast access to current cycle, **PROBLEM: Not updating properly**

#### **`oracle.daily_game_matches`** - Contract Match Storage
```sql
- fixture_id (bigint) - SportMonks fixture ID
- cycle_id (integer) - Associated cycle
- home_team, away_team (text) - Team names
- home_odds, draw_odds, away_odds (numeric) - 1X2 odds
- over_25_odds, under_25_odds (numeric) - O/U 2.5 odds
- match_date (timestamp) - Match start time
- game_date (date) - Match date
```
**Usage**: Stores matches selected for blockchain cycles

#### **`oracle.fixtures`** - All SportMonks Fixtures
```sql
- id (varchar) - SportMonks fixture ID
- home_team, away_team (varchar) - Team names
- match_date (timestamp) - Match time
- league_id, league_name - League info
- status (varchar) - Match status (NS, FT, etc.)
```
**Usage**: Master fixture database from SportMonks

#### **`oracle.fixture_results`** - Match Results
```sql
- fixture_id (varchar) - Links to fixtures.id
- home_score, away_score (integer) - Final scores
- result_1x2 (varchar) - 1/X/2 result
- result_ou25 (varchar) - Over/Under 2.5 result
- Various betting outcomes
```
**Usage**: Stores match results from SportMonks

### **Oddyssey Schema (User-Facing Data)**

#### **`oddyssey.oddyssey_cycles`** - User Cycle View
```sql
- cycle_number (integer) - User-friendly cycle number
- start_date, end_date (date) - Cycle dates
- status (varchar) - User-facing status
- total_participants (integer) - User count
- total_volume (numeric) - Betting volume
```
**Usage**: User-facing cycle information

#### **`oddyssey.daily_game_matches`** - User Match Selections
```sql
- fixture_id (varchar) - SportMonks fixture ID
- cycle_id (bigint) - Links to oracle cycle
- home_team, away_team (varchar) - Team names
- Various odds fields
- priority_score (integer) - Selection priority
```
**Usage**: User-facing match display, **PROBLEM: Duplicate of oracle version**

---

## 🔍 **CODE USAGE ANALYSIS**

### **Files Using `current_oddyssey_cycle`**
1. **`oddyssey-manager.js`** - Updates after cycle creation (Lines 520-529)
2. **`oddyssey-scheduler.js`** - Reads current cycle
3. **`api/server.js`** - API endpoints
4. **`sync-contract-matches-to-db.js`** - Contract sync

### **Files Using `daily_game_matches`**
1. **`persistent-daily-game-manager.js`** - Match selection/storage
2. **`oddyssey-manager.js`** - Cycle creation
3. **`api/server.js`** - Admin endpoints
4. **Multiple other services** - 33+ files use this table

---

## 🚨 **ROOT CAUSE: `current_oddyssey_cycle` Not Updating**

### **Problem Location**: `oddyssey-manager.js` Lines 520-529
```javascript
// Fourth, update current_oddyssey_cycle table
const currentCycleQuery = `
  INSERT INTO oracle.current_oddyssey_cycle 
  SELECT * FROM oracle.oddyssey_cycles WHERE cycle_id = $1
  ON CONFLICT (cycle_id) DO UPDATE SET
    matches_data = EXCLUDED.matches_data,
    tx_hash = EXCLUDED.tx_hash,
    updated_at = NOW()
`;
```

### **Issue**: 
- Uses `ON CONFLICT (cycle_id)` but should use `ON CONFLICT ON CONSTRAINT` or handle single-row table properly
- The table should only have ONE row (current cycle), not multiple rows

### **Fix Needed**:
```sql
-- Should be:
DELETE FROM oracle.current_oddyssey_cycle;
INSERT INTO oracle.current_oddyssey_cycle 
SELECT * FROM oracle.oddyssey_cycles WHERE cycle_id = $1;
```

---

## 🔧 **CRON JOB COORDINATION ISSUES**

### **Problem**: Multiple Schedulers Conflict
1. **`coordinated-results-scheduler.js`** - Every 30 min results, 15 min resolution
2. **`oddyssey-scheduler.js`** - Match selection and cycle creation
3. **`football-scheduler.js`** - General football operations

### **Coordination System**: Uses `cron-coordinator.js` but has dependency issues

### **Crypto Bot Issue**: Not visible in logs, likely not starting properly

---

## 🎯 **RECOMMENDATIONS**

### **1. IMMEDIATE FIXES**

#### **Fix current_oddyssey_cycle Update**
```javascript
// In oddyssey-manager.js, replace lines 520-529:
const currentCycleQuery = `
  DELETE FROM oracle.current_oddyssey_cycle;
  INSERT INTO oracle.current_oddyssey_cycle 
  SELECT * FROM oracle.oddyssey_cycles WHERE cycle_id = $1;
`;
```

#### **Remove Duplicate Tables**
- **Keep**: `oracle.daily_game_matches` (contract data)
- **Remove**: `oddyssey.daily_game_matches` (duplicate)
- **Update all code** to use oracle schema only

### **2. SCHEMA CONSOLIDATION**

#### **Recommended Structure**:
```
oracle/
├── oddyssey_cycles (main cycle tracking)
├── current_oddyssey_cycle (single current cycle)
├── daily_game_matches (selected matches)
├── fixtures (all fixtures)
├── fixture_results (match results)
└── fixture_odds (betting odds)

oddyssey/ (USER-FACING ONLY)
├── oddyssey_slips (user bets)
├── oddyssey_slip_selections (bet selections)
├── oddyssey_user_preferences (user settings)
└── oddyssey_user_stats (user statistics)
```

### **3. CRON JOB FIXES**

#### **Unified Scheduler Approach**:
1. **Single master scheduler** coordinates all jobs
2. **Proper dependency management** between jobs
3. **Crypto bot integration** in main scheduler
4. **Better error handling** and logging

---

## 📈 **TESTING RESULTS**

### **General Results Fetching**: ✅ WORKING
- Fetched: 32 results
- Saved: 0 (already exist or filtered)
- Duration: 15 seconds

### **Oddyssey Results Fetching**: ✅ WORKING
- Cycle 9: 10 matches found
- Results: 0 (future matches)
- System ready for when matches finish

### **Current Issues**:
1. ❌ `current_oddyssey_cycle` stuck on cycle 8
2. ❌ Duplicate tables causing confusion
3. ❌ Crypto bot not visible in logs
4. ❌ Schema inconsistencies

---

## 🚀 **ACTION PLAN**

### **Phase 1: Critical Fixes**
1. Fix `current_oddyssey_cycle` update logic
2. Test cycle 9 proper tracking
3. Verify crypto bot startup

### **Phase 2: Schema Cleanup**
1. Remove duplicate `oddyssey.daily_game_matches`
2. Update all code references
3. Consolidate schemas properly

### **Phase 3: Cron Optimization**
1. Unified scheduler implementation
2. Better coordination system
3. Comprehensive monitoring

---

## 📝 **CONCLUSION**

The system has **multiple critical architectural issues**:

1. **Duplicate tables** across schemas causing confusion
2. **current_oddyssey_cycle** not updating due to flawed logic
3. **Cron job coordination** needs improvement
4. **Schema inconsistencies** throughout codebase

**Priority**: Fix `current_oddyssey_cycle` update logic immediately, then proceed with schema consolidation.

**Status**: System is functional but has architectural debt that needs addressing.
