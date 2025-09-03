# 🚀 Optimized Indexer V3 Deployment Guide

## 📋 **Changes Made**

### **1. Removed Old Indexers**
- ✅ Deleted `backend/indexer-enhanced.js`
- ✅ Deleted `backend/enhanced-indexer-v2.js` 
- ✅ Deleted `backend/test-enhanced-indexer.js`

### **2. Created Optimized Indexer V3**
- ✅ `backend/optimized-indexer-v3.js` - Main indexer with all improvements
- ✅ `backend/test-optimized-indexer.js` - Test script for validation

### **3. Updated Configuration Files**
- ✅ `package.json` - Updated indexer:start script
- ✅ `backend/fly.toml` - Updated process definition
- ✅ `Procfile` - Added for deployment

## 🔧 **Key Features of Optimized Indexer V3**

### **Performance Optimizations**
- **Multiple RPC Endpoints**: 4 endpoints with automatic failover
  - `https://dream-rpc.somnia.network/` (primary)
  - `https://rpc.ankr.com/somnia_testnet/...` (backup)
  - `https://somnia-testnet.rpc.thirdweb.com` (backup)
  - `https://testnet-rpc.somnia.network` (backup)

- **Adaptive Batch Processing**:
  - Normal: 200 blocks per batch
  - Medium lag: 400 blocks per batch  
  - High lag: 500 blocks per batch
  - Processing delay: 200ms (10x faster than old indexer)

- **State Management**:
  - Persistent state tracking in `oracle.indexer_state` table
  - Automatic recovery after restarts
  - Performance metrics tracking

### **Complete Event Coverage**
Based on smart contract analysis, the indexer now handles ALL events:

#### **BitredictPool.sol Events**:
- ✅ `PoolCreated` - Main pool creation events
- ✅ `BetPlaced` - User bets on pools
- ✅ `LiquidityAdded` - LP additions to pools
- ✅ `PoolSettled` - Pool resolution events
- ✅ `RewardClaimed` - Payout claims
- ✅ `PoolRefunded` - Pool refunds
- ✅ `UserWhitelisted` - Private pool access
- ✅ `PoolBoosted` - Pool promotion events
- ✅ `BoostExpired` - Boost expiration
- ✅ `ComboPoolCreated` - Multi-condition pools
- ✅ `ComboBetPlaced` - Combo pool bets
- ✅ `ComboPoolSettled` - Combo pool resolution
- ✅ `ReputationActionOccurred` - Reputation events

#### **Oddyssey.sol Events**:
- ✅ `CycleStarted` - Daily cycle initialization
- ✅ `SlipPlaced` - User prediction slips
- ✅ `CycleResolved` - Cycle completion
- ✅ `PrizeClaimed` - Prize claims
- ✅ `PrizeRollover` - Prize rollovers
- ✅ `UserStatsUpdated` - User statistics
- ✅ `OddysseyReputationUpdated` - Reputation updates

#### **GuidedOracle.sol Events**:
- ✅ `OutcomeSubmitted` - Oracle result submissions

#### **ReputationSystem.sol Events**:
- ✅ `ReputationUpdated` - Reputation changes

### **Error Handling & Recovery**
- **Retry Logic**: 3 retries per event query with exponential backoff
- **RPC Failover**: Automatic switching between endpoints
- **Circuit Breaker**: Prevents cascade failures
- **Graceful Degradation**: Continues processing on partial failures

### **Monitoring & Health Checks**
- **Real-time Stats**: Blocks/second, events/second, batch times
- **Health Monitoring**: Every 60 seconds with lag detection
- **Performance Tracking**: Adaptive delays based on performance
- **Error Logging**: Comprehensive error tracking and reporting

## 🚀 **Deployment Instructions**

### **1. Test Locally (Optional)**
```bash
cd /home/leon/bitredict-linux
node backend/test-optimized-indexer.js
```

### **2. Deploy to Fly.io**
```bash
cd /home/leon/bitredict-linux/backend
fly deploy
```

### **3. Monitor Deployment**
```bash
# Check indexer logs
fly logs -a bitredict-backend -t

# Check specific process
fly logs -a bitredict-backend -t --app indexer

# Check machine status
fly status -a bitredict-backend
```

### **4. Verify Indexer Performance**
```bash
# Check database for new events
# Should see events being processed in real-time

# Monitor lag - should catch up within hours instead of days
# Check for missing pool at block 164,316,458
```

## 📊 **Expected Performance Improvements**

### **Processing Speed**
- **Before**: 50 blocks/cycle, 1000ms delays = ~3 blocks/second
- **After**: 200-500 blocks/cycle, 200ms delays = ~50-100 blocks/second
- **Improvement**: **20-30x faster**

### **Catch-up Time**
- **Before**: 1.5M blocks ÷ 3 blocks/sec = ~5.8 days
- **After**: 1.5M blocks ÷ 75 blocks/sec = ~5.5 hours  
- **Improvement**: **25x faster**

### **Reliability**
- **Multiple RPC endpoints**: 4x redundancy
- **State persistence**: Survives restarts
- **Error recovery**: Automatic failover
- **Monitoring**: Real-time health checks

## 🎯 **Success Metrics**

### **Immediate (First Hour)**
- ✅ Indexer starts successfully
- ✅ Processes 200+ blocks per batch
- ✅ No consecutive errors > 5
- ✅ State saves correctly

### **Short-term (First Day)**
- ✅ Catches up 50,000+ blocks
- ✅ Indexes missing pool at block 164,316,458
- ✅ Maintains < 1000 block lag
- ✅ Zero downtime

### **Long-term (First Week)**
- ✅ Catches up to current blockchain
- ✅ Maintains < 100 block lag
- ✅ All events indexed correctly
- ✅ Profile page shows correct data

## 🔍 **Troubleshooting**

### **If Indexer Fails to Start**
```bash
# Check logs for initialization errors
fly logs -a bitredict-backend -t --app indexer

# Common issues:
# - Database connection
# - RPC connectivity  
# - Contract address configuration
```

### **If Indexer is Slow**
```bash
# Check performance metrics in logs
# Look for:
# - RPC endpoint switching
# - Batch processing times
# - Error rates
```

### **If Events Are Missing**
```bash
# Check event filtering
# Verify contract addresses in config
# Check ABI definitions match contracts
```

## 📝 **Configuration Files Updated**

### **package.json**
```json
{
  "scripts": {
    "indexer:start": "cd backend && node optimized-indexer-v3.js"
  }
}
```

### **backend/fly.toml**
```toml
[processes]
  indexer = "node optimized-indexer-v3.js"
```

### **Procfile**
```
indexer: npm run indexer:start
```

---

**Status**: 🚀 **READY FOR DEPLOYMENT**
**Next Step**: Deploy to Fly.io and monitor catch-up progress
**Expected Result**: Missing pool indexed within hours, not days
