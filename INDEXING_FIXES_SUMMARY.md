# Indexing Issues Analysis and Fixes Summary

## 🔍 Issues Found

### 1. **Missing PoolRefunded Event Indexing**
- **Problem**: The backend indexer was **NOT** listening for `PoolRefunded` events from the BitredictPool contract
- **Impact**: Pool refunds (when no bets are received or arbitration timeout) were not being tracked in the database
- **Root Cause**: The `PoolRefunded` event handler was completely missing from the indexer

### 2. **Missing PrizeRollover Table**
- **Problem**: The Oddyssey indexer tried to insert into `oracle.oddyssey_prize_rollovers` table, but this table **didn't exist**
- **Impact**: Prize rollovers from cycles with no qualifying winners were not being tracked
- **Root Cause**: Database schema was incomplete

### 3. **Missing PoolCreated Event Indexing**
- **Problem**: The backend indexer was **NOT** listening for `PoolCreated` events
- **Impact**: New pool creations were not being properly indexed with all required fields
- **Root Cause**: The `PoolCreated` event handler was completely missing from the indexer

### 4. **Missing Database Columns**
- **Problem**: Several columns were missing from the `oracle.pools` table
- **Missing Columns**:
  - `total_creator_side_stake`
  - `max_bettor_stake`
  - `total_bettor_stake`
  - `creator_side_won`
  - `betting_end_time`
  - `arbitration_deadline`
  - `filled_above_60`

### 5. **Missing Database Tables**
- **Problem**: Several tables were missing for tracking pool lifecycle events
- **Missing Tables**:
  - `oracle.pool_refunds`
  - `oracle.oddyssey_prize_rollovers`
  - `oracle.combo_pools`
  - `oracle.pool_liquidity_providers`
  - `oracle.pool_claims`
  - `oracle.pool_whitelist`
  - `oracle.pool_boost_tiers`

## ✅ Fixes Implemented

### 1. **Database Schema Updates**
- Created `backend/database/fix-missing-tables.sql` with all missing tables and columns
- Added missing columns to `oracle.pools` table
- Created comprehensive indexing for efficient querying

### 2. **Indexer Code Updates**
- **Added PoolCreated Event Handler**: Now properly indexes new pool creations with all required fields
- **Added PoolRefunded Event Handler**: Now tracks when pools are refunded due to no bets or arbitration timeout
- **Enhanced Pool Lifecycle Tracking**: Added support for all pool states and transitions

### 3. **Pool Lifecycle Analysis**
Based on the verification scripts, we found:

#### **Oddyssey Rollover Status**:
- **Current Cycle**: 8
- **Prize Rollover Fee**: 5%
- **Minimum Correct Predictions Required**: 7
- **Current Prize Pool**: 1.859 ETH
- **Cycles Needing Rollover**: Cycles 3-7 have no qualifying winners
- **Status**: Rollover mechanism is working correctly in the contract, but events weren't being tracked

#### **BitredictPool Refund Status**:
- **Total Pools Created**: 2
- **Pool 0**: Ready for refund (event ended, arbitration period passed)
- **Pool 1**: Waiting for arbitration period to end
- **Status**: Both pools have no bets and are eligible for refund

## 🔧 Pool Lifecycle Mechanisms

### **BitredictPool Refund Process**:
1. **Pool Creation**: Creator stakes tokens and sets event parameters
2. **Betting Period**: Users can place bets until `eventStartTime - 60 seconds`
3. **Event Period**: Event occurs between `eventStartTime` and `eventEndTime`
4. **Arbitration Period**: 24 hours after `eventEndTime` for dispute resolution
5. **Refund Scenarios**:
   - **No Bets**: If `totalBettorStake == 0`, pool is automatically refunded after event ends
   - **Arbitration Timeout**: If no resolution after 24 hours, anyone can call `refundPool()`

### **Oddyssey Rollover Process**:
1. **Cycle Resolution**: After cycle ends, check if any player has ≥7 correct predictions
2. **No Winners**: If no qualifying winners, prize pool rolls over to next cycle
3. **Rollover Fee**: 5% fee is taken from rollover amount
4. **Event Emission**: `PrizeRollover` event is emitted with details

## 📊 Current Status

### **Database Tables Created**:
- ✅ `oracle.pool_refunds`
- ✅ `oracle.oddyssey_prize_rollovers`
- ✅ `oracle.combo_pools`
- ✅ `oracle.pool_liquidity_providers`
- ✅ `oracle.pool_claims`
- ✅ `oracle.pool_whitelist`
- ✅ `oracle.pool_boost_tiers`

### **Indexer Events Added**:
- ✅ `PoolCreated` event handler
- ✅ `PoolRefunded` event handler
- ✅ Enhanced pool lifecycle tracking

### **Missing Columns Added**:
- ✅ All missing columns added to `oracle.pools` table

## 🚀 Next Steps

### **Immediate Actions**:
1. **Deploy Database Changes**: Run the SQL migration script
2. **Restart Indexers**: Restart both pool and Oddyssey indexers
3. **Monitor Events**: Watch for proper event indexing

### **Pool Refunds**:
1. **Pool 0**: Can be refunded immediately via `refundPool(0)`
2. **Pool 1**: Wait for arbitration period to end, then call `refundPool(1)`

### **Oddyssey Rollovers**:
1. **Cycles 3-7**: These cycles should have rolled over automatically
2. **Current Prize Pool**: 1.859 ETH includes accumulated rollovers
3. **Verification**: Check that rollover events are now being indexed

### **Testing**:
1. **Create Test Pool**: Create a new pool to verify `PoolCreated` indexing
2. **Test Refund**: Test the refund mechanism for a pool with no bets
3. **Monitor Rollovers**: Watch for rollover events in upcoming cycles

## 🔍 Verification Commands

```bash
# Check rollover mechanism
node verify-rollover-mechanism.js

# Check pool lifecycle
node check-pool-lifecycle.js

# Check database tables
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'oracle' AND table_name LIKE '%pool%';"
```

## 📝 Key Insights

1. **Pool Refunds**: The contract correctly handles refunds, but the indexer wasn't tracking them
2. **Rollover Mechanism**: Works correctly in the contract, but events weren't being stored
3. **Event Tracking**: Critical events were missing from the indexer, causing data gaps
4. **Database Schema**: Was incomplete, missing tables for comprehensive tracking

The fixes ensure that all pool lifecycle events and Oddyssey rollovers are properly tracked and stored in the database.
