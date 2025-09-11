# BitR Backend API Endpoints Documentation

## Overview
This document lists all available API endpoints in the BitR backend system. The API is organized into different modules based on functionality.

## Base URL
- **Development**: `http://localhost:3000`
- **Production**: `https://bitr-backend.fly.dev`

## Database Schema
- **Primary Database**: `misty-tree-75530305` (Monad Network - bitr-db)
- **Main Schemas**: `oracle`, `analytics`, `core`, `oddyssey`, `airdrop`, `system`
- **Note**: All schemas and tables are now unified in the primary database

---

## 📊 **Analytics API** (`/api/analytics`)

### User Analytics
- `GET /user/cycle/:cycleId/:userAddress` - Get user analytics for specific cycle
- `GET /user/cumulative/:userAddress` - Get cumulative user analytics
- `GET /user/comparison/:userAddress` - Get user comparison data

### Leaderboards
- `GET /leaderboard/cycle/:cycleId` - Get cycle-specific leaderboard
- `GET /leaderboard/global` - Get global leaderboard
- `GET /leaderboard/creators` - Get creators leaderboard
- `GET /leaderboard/bettors` - Get bettors leaderboard
- `GET /leaderboards` - Get all leaderboards

### Platform Analytics
- `GET /cycle/:cycleId` - Get cycle analytics
- `GET /summary` - Get analytics summary
- `GET /global` - Get global analytics
- `GET /volume-history` - Get volume history
- `GET /categories` - Get category analytics
- `GET /user-activity` - Get user activity data
- `GET /platform-overview` - Get platform overview
- `GET /platform-stats` - Get platform statistics

### Processing
- `POST /process-all` - Process all analytics data

---

## 🎯 **BitR Pool API** (`/api/bitr-pool`)

### Pools Management
- `GET /pools` - Get all pools
- `GET /pools/:poolId` - Get specific pool
- `POST /pools` - Create new pool
- `POST /pools/:poolId/bet` - Place bet on pool
- `POST /pools/:poolId/settle` - Settle pool

### User Data
- `GET /user/:address/pools` - Get user's pools
- `GET /user/:address/bets` - Get user's bets
- `GET /statistics` - Get pool statistics

**Database Tables**: `analytics.pools` (misty-tree-75530305)

---

## 🎮 **Oddyssey API** (`/api/oddyssey`)

### Matches & Cycles
- `GET /matches` - Get matches (with date filter)
- `GET /current-cycle` - Get current cycle
- `GET /live-matches` - Get live matches
- `GET /contract-matches` - Get contract matches
- `GET /test-matches/:cycleId` - Get test matches for cycle

### Slips Management
- `POST /place-slip` - Place betting slip
- `GET /user-slips/:address/evaluated` - Get user's evaluated slips
- `GET /user-slips/:cycleId/:address` - Get user slips for cycle
- `GET /user-slips/:address` - Get all user slips
- `GET /slips/:playerAddress` - Get player slips
- `GET /slip-evaluation/:slipId` - Get slip evaluation
- `GET /evaluated-slip/:slipId` - Get evaluated slip
- `GET /user-slips-evaluated/:address` - Get user's evaluated slips

### Results & Data
- `GET /results/:date` - Get results for date
- `GET /available-dates` - Get available dates
- `GET /leaderboard` - Get leaderboard
- `GET /stats` - Get statistics
- `GET /current-prize-pool` - Get current prize pool
- `GET /daily-stats` - Get daily statistics

### Cycle Management
- `GET /cycle-sync` - Get cycle sync status
- `GET /cycle-sync-status` - Get cycle sync status
- `POST /cycle-sync/force` - Force cycle sync
- `POST /batch-fixtures` - Batch process fixtures

### Preferences
- `GET /preferences` - Get user preferences
- `POST /preferences` - Update user preferences

### Validation
- `GET /contract-validation` - Validate contract

**Database Tables**: 
- `oracle.oddyssey_cycles` (misty-tree-75530305)
- `oracle.oddyssey_slips` (misty-tree-75530305)
- `oracle.daily_game_matches` (misty-tree-75530305)

---

## 🎯 **Oddyssey Slips API** (`/api/oddyssey/slips`)

- `GET /:address` - Get slips by address
- `GET /:cycleId/:address` - Get slips by cycle and address

---

## 🎯 **Oddyssey Slips Fix API** (`/api/oddyssey-slips-fix`)

- `GET /user-slips/:address/evaluated` - Get user's evaluated slips (fix endpoint)

---

## 🏈 **Matches API** (`/api/matches`)

- `GET /matches` - Get all matches
- `GET /match/:matchId` - Get specific match
- `POST /matches/batch` - Get multiple matches by IDs
- `GET /oddyssey/current` - Get current Oddyssey matches

---

## 🎯 **Guided Markets API** (`/api/guided-markets`)

### Football Markets
- `POST /football` - Create football market
- `POST /football/prepare` - Prepare football market
- `POST /football/confirm` - Confirm football market
- `GET /football/markets/:fixtureId` - Get football markets for fixture

### Cryptocurrency Markets
- `POST /cryptocurrency` - Create crypto market
- `POST /cryptocurrency/prepare` - Prepare crypto market
- `POST /cryptocurrency/confirm` - Confirm crypto market

### Pools Management
- `GET /pools` - Get guided market pools
- `GET /pools/:poolId` - Get specific pool
- `POST /pools/:poolId/bet` - Place bet on pool
- `POST /pools/:poolId/liquidity` - Add liquidity to pool
- `GET /pools/:poolId/progress` - Get pool progress
- `POST /pools/:poolId/settle` - Settle pool
- `POST /pools/:poolId/claim` - Claim pool winnings
- `GET /pools/category/:category` - Get pools by category
- `POST /pools/:poolId/boost` - Boost pool
- `GET /pools/creator/:address` - Get pools by creator

### Analysis & Validation
- `POST /analyze-cost` - Analyze market cost
- `GET /validate-oracle/:marketId` - Validate oracle for market

### Statistics & Health
- `GET /stats` - Get guided markets stats
- `GET /health` - Get health status

**Database Tables**: 
- `analytics.pools` (misty-tree-75530305)
- `oracle.fixtures` (misty-tree-75530305)
- `oracle.fixture_odds` (misty-tree-75530305)
- `oracle.fixture_mappings` (misty-tree-75530305)

---

## 🏆 **Pools API** (`/api/pools`)

- `POST /:poolId/refund` - Refund pool
- `GET /refundable/:userAddress` - Get refundable pools for user
- `GET /:poolId` - Get specific pool

---

## 🏆 **Pools Claimable API** (`/api/pools/claimable`)

- `GET /:userAddress` - Get claimable pools for user
- `POST /:userAddress/refresh` - Refresh claimable pools

---

## 👥 **Users API** (`/api/users`)

- `GET /:address` - Get user by address
- `GET /:address/profile` - Get user profile
- `GET /:address/badges` - Get user badges
- `GET /:address/activity` - Get user activity
- `GET /:address/category-performance` - Get user category performance
- `GET /:address/portfolio` - Get user portfolio

---

## 💰 **Staking API** (`/api/staking`)

- `GET /statistics` - Get staking statistics
- `GET /user/:address` - Get user staking data
- `GET /leaderboard` - Get staking leaderboard
- `GET /tiers` - Get staking tiers
- `GET /analytics` - Get staking analytics

---

## 🏅 **Reputation API** (`/api/reputation`)

- `GET /user/:address` - Get user reputation
- `GET /user/:address/history` - Get user reputation history

---

## 🔄 **Cycle Monitoring API** (`/api/cycle-monitoring`)

### Status & Health
- `GET /status` - Get monitoring status
- `GET /cycles` - Get cycle information
- `GET /issues` - Get monitoring issues
- `GET /health-history` - Get health history
- `GET /stats` - Get monitoring statistics

### Problem Detection
- `GET /missing-cycles` - Get missing cycles
- `GET /off-schedule` - Get off-schedule cycles
- `GET /failed-transactions` - Get failed transactions
- `GET /delayed-resolutions` - Get delayed resolutions

### Control
- `POST /trigger-check` - Trigger health check
- `POST /start` - Start monitoring
- `POST /stop` - Stop monitoring

---

## ⚽ **Fixtures API** (`/api/fixtures`)

### Data Retrieval
- `GET /upcoming` - Get upcoming fixtures
- `GET /between/:startDate/:endDate` - Get fixtures between dates
- `GET /date-range` - Get fixtures by date range
- `GET /today` - Get today's fixtures
- `GET /:fixtureId` - Get specific fixture

### Leagues
- `GET /leagues/popular` - Get popular leagues

### Management
- `POST /refresh` - Refresh fixtures
- `POST /manual-fetch` - Manually fetch fixtures

### Debug
- `GET /debug-odds` - Debug odds data

**Database Tables**: 
- `oracle.fixtures` (misty-tree-75530305)
- `oracle.fixture_odds` (misty-tree-75530305)
- `oracle.leagues` (misty-tree-75530305)

---

## 💎 **Crypto API** (`/api/crypto`)

### Market Data
- `GET /all` - Get all crypto data
- `GET /coins` - Get coins list
- `GET /popular` - Get popular coins
- `GET /prices/:symbol` - Get price for symbol
- `GET /search` - Search coins
- `GET /targets/:coinId` - Get targets for coin

### Markets
- `GET /markets/active` - Get active markets
- `GET /markets/pending` - Get pending markets
- `POST /markets` - Create market

### Health
- `GET /health` - Get crypto API health

**Database Tables**: 
- `oracle.crypto_coins` (misty-tree-75530305)
- `oracle.crypto_price_snapshots` (misty-tree-75530305)
- `oracle.crypto_prediction_markets` (misty-tree-75530305)

---

## 👑 **Admin API** (`/api/admin`)

- `GET /status` - Get admin status
- `GET /health` - Get admin health
- `POST /fixtures/refresh` - Refresh fixtures
- `POST /restart` - Restart services
- `POST /populate-fixtures` - Populate fixtures from SportMonks
- `POST /populate-guided-markets` - Populate guided markets
- `POST /setup-database` - Setup database schema
- `POST /setup-missing-schemas` - Setup missing schemas
- `POST /trigger-oddyssey-cycle` - Trigger Oddyssey cycle
- `POST /select-oddyssey-matches` - Select Oddyssey matches
- `POST /fetch-7day-fixtures` - Fetch 7-day fixtures
- `POST /fetch-oddyssey-results` - Fetch Oddyssey results
- `POST /resolve-oddyssey-cycles` - Resolve Oddyssey cycles
- `POST /fetch-general-results` - Fetch general results
- `POST /fetch-and-select-oddyssey` - Fetch and select Oddyssey
- `POST /fetch-and-select-oddyssey-tomorrow` - Fetch and select Oddyssey for tomorrow
- `POST /sync-schemas` - Sync schemas
- `GET /sync-status` - Get sync status
- `GET /check-tables` - Check tables
- `POST /trigger-crypto-price-update` - Trigger crypto price update
- `POST /test-oddyssey-resolution` - Test Oddyssey resolution
- `POST /update-fixture-status` - Update fixture status

---

## 📋 **Terms API** (`/api/terms`)

- `GET /current` - Get current terms
- `GET /summary` - Get terms summary
- `GET /version/:version` - Get specific version
- `POST /accept` - Accept terms

---

## 💧 **Faucet API** (`/api/faucet`)

- `POST /authenticate` - Authenticate user
- `POST /accept-terms` - Accept terms
- `GET /eligibility/:address` - Check eligibility
- `POST /claim` - Claim tokens
- `GET /statistics` - Get faucet statistics
- `GET /activity/:address` - Get user activity

**Database Tables**: 
- `airdrop.faucet_claims` (misty-tree-75530305)
- `airdrop.bitr_activities` (misty-tree-75530305)

---

## 🎁 **Airdrop API** (`/api/airdrop`)

- `GET /eligibility/:address` - Check airdrop eligibility
- `GET /statistics` - Get airdrop statistics
- `POST /snapshot` - Take airdrop snapshot
- `GET /leaderboard` - Get airdrop leaderboard

**Database Tables**: 
- `airdrop.eligibility` (misty-tree-75530305)
- `airdrop.snapshots` (misty-tree-75530305)
- `airdrop.snapshot_balances` (misty-tree-75530305)

---

## 💬 **Social API** (`/api/social`)

### Comments & Discussions
- `GET /pools/:poolId/comments` - Get pool comments
- `POST /pools/:poolId/comments` - Add pool comment
- `GET /discussions` - Get discussions
- `POST /discussions` - Create discussion
- `GET /discussions/:discussionId/replies` - Get discussion replies

### Reactions & Interactions
- `POST /reactions` - Add reaction
- `GET /reactions/:targetType/:targetId` - Get reactions

### User Social Features
- `GET /users/:address/badges` - Get user badges
- `POST /users/:address/check-badges` - Check user badges
- `GET /badges/leaderboard` - Get badges leaderboard
- `GET /users/:address/social-stats` - Get user social stats

### Pool Social Features
- `GET /pools/:poolId/reflections` - Get pool reflections
- `POST /pools/:poolId/reflections` - Add pool reflection
- `GET /pools/:poolId/challenge-score` - Get challenge score
- `POST /pools/:poolId/calculate-challenge-score` - Calculate challenge score
- `GET /pools/:poolId/bitr-rewards` - Get BTR rewards
- `POST /pools/:poolId/award-bitr` - Award BTR

### Community
- `GET /community-stats` - Get community statistics

**Database Tables**: 
- `core.pool_comments` (misty-tree-75530305)
- `core.community_discussions` (misty-tree-75530305)
- `core.discussion_replies` (misty-tree-75530305)
- `core.social_reactions` (misty-tree-75530305)
- `core.user_badges` (misty-tree-75530305)
- `core.pool_reflections` (misty-tree-75530305)

---

## 🏆 **Pools Social API** (`/api/pools-social`)

- `GET /trending` - Get trending pools
- `GET /featured` - Get featured pools
- `GET /:poolId/comments` - Get pool comments
- `POST /:poolId/comments/:commentId/like` - Like comment
- `POST /notify-creation` - Notify pool creation

**Database Tables**: 
- `analytics.pools` (misty-tree-75530305)
- `core.pool_comments` (misty-tree-75530305)

---

## 🏥 **Health API** (`/api/health`)

### Basic Health
- `GET /` - Basic health check
- `GET /detailed` - Detailed health check
- `GET /readiness` - Readiness check
- `GET /liveness` - Liveness check

### Service Health
- `GET /database` - Database health
- `GET /services` - Services health
- `GET /cron` - Cron jobs health
- `GET /oddyssey` - Oddyssey health
- `GET /oracle` - Oracle health
- `GET /detailed-services` - Detailed services health

### Monitoring
- `GET /metrics` - Get metrics
- `GET /alerts` - Get alerts
- `POST /test` - Test health endpoint

**Database Tables**: 
- `system.health_checks` (misty-tree-75530305)
- `system.performance_metrics` (misty-tree-75530305)

---

## ⚙️ **Cron Coordination API** (`/api/cron-coordination`)

### Status & Health
- `GET /status` - Get coordination status
- `GET /health` - Get coordination health
- `GET /history` - Get execution history
- `GET /metrics` - Get coordination metrics

### Job Triggers
- `POST /trigger/fixtures-refresh` - Trigger fixtures refresh
- `POST /trigger/odds-update` - Trigger odds update
- `POST /trigger/oddyssey-cycle` - Trigger Oddyssey cycle
- `POST /trigger/oddyssey-matches` - Trigger Oddyssey matches
- `POST /trigger/oddyssey-resolution` - Trigger Oddyssey resolution
- `POST /trigger/results-fetching` - Trigger results fetching
- `POST /trigger/results-resolution` - Trigger results resolution

### Emergency Controls
- `POST /emergency/force-release-locks` - Force release locks
- `POST /emergency/restart` - Emergency restart

### Lock Management
- `GET /history/:jobName` - Get job history
- `POST /locks/:jobName/release` - Release job lock
- `GET /locks/:jobName/status` - Get lock status

**Database Tables**: 
- `system.cron_execution_log` (misty-tree-75530305)
- `system.cron_locks` (misty-tree-75530305)

---

## 📊 **Monitoring Dashboard API** (`/api/monitoring-dashboard`)

- `GET /status` - Get dashboard status
- `GET /health-checks` - Get health checks
- `GET /health-check/:id` - Get specific health check
- `POST /run-health-checks` - Run health checks
- `GET /alerts` - Get alerts

**Database Tables**: 
- `system.health_checks` (misty-tree-75530305)
- `system.performance_metrics` (misty-tree-75530305)

---

## 📝 **Notes**

### Authentication
- Most endpoints require authentication via wallet signature
- Some endpoints have rate limiting applied
- Admin endpoints require special permissions

### Caching
- Many endpoints use caching middleware for performance
- Cache durations vary by endpoint (15s to 60s)

### Error Handling
- All endpoints use asyncHandler for consistent error handling
- Standard HTTP status codes are used
- Error responses include descriptive messages

### Rate Limiting
- Some endpoints have rate limiting (e.g., place-slip: 3 requests per minute)
- Rate limits are applied per user address

### Parameters
- Path parameters are denoted with `:paramName`
- Query parameters are optional unless specified
- Request bodies are JSON format for POST endpoints

---

## 🔄 **API Versioning**
- Current version: v1
- Version is included in the base URL path
- Backward compatibility is maintained when possible

---

*Last updated: 2025-01-09*
*Total endpoints: 212*

## 🔄 **Frontend-Backend Sync Status**

### ✅ **Verified Sync Areas**
- **Analytics API**: Frontend calls match backend endpoints
- **Oddyssey API**: Frontend hooks use correct backend routes
- **Guided Markets API**: Frontend services align with backend implementation
- **Database Schema**: Tables exist and are properly structured
- **API Configuration**: Frontend API config points to correct backend URL

### 📊 **Database Distribution**
- **Primary Database** (`misty-tree-75530305`): All schemas unified - Oracle, Oddyssey, Core, Airdrop, System, Analytics
- **Note**: All missing tables from Somnia deployment have been migrated to Monad deployment

### 🚀 **Deployment Status**
- **Backend**: Deployed on Fly.io at `https://bitr-backend.fly.dev`
- **Frontend**: Deployed on Vercel (separate directory: `/home/leon/bitr-front`)
- **Database**: Neon.tech with proper schema distribution

---

## 🎯 **FRONTEND API USAGE ANALYSIS**

### 📱 **Frontend Services & Expected Endpoints**

#### **Analytics Service** (`/services/analyticsService.ts`)
**Expected Endpoints:**
- `GET /api/analytics/global?timeframe={24h|7d|30d|all}` - Global platform statistics
- `GET /api/analytics/volume-history?timeframe={24h|7d|30d}` - Volume history for charts
- `GET /api/analytics/categories?timeframe={24h|7d|30d|all}` - Category statistics
- `GET /api/analytics/leaderboard/creators?limit={number}&sortBy={total_volume|win_rate|total_pools}` - Top creators
- `GET /api/analytics/leaderboard/bettors?limit={number}&sortBy={profit_loss|total_volume|win_rate|total_bets}` - Top bettors
- `GET /api/analytics/user-activity` - Hourly user activity patterns
- `GET /api/analytics/platform-overview?timeframe={24h|7d|30d|all}` - Platform overview
- `GET /api/analytics/leaderboards` - All leaderboards

**Data Format Expectations:**
```typescript
interface GlobalStats {
  totalVolume: number;
  totalPools: number;
  totalBets: number;
  activePools: number;
}

interface VolumeHistoryItem {
  date: string;
  volume: number;
  pools: number;
  users: number;
}

interface CategoryStats {
  category: string;
  poolCount: number;
  totalVolume: number;
  avgPoolSize: number;
  participantCount: number;
}
```

#### **Oddyssey Service** (`/services/oddysseyService.ts`)
**Expected Endpoints:**
- `GET /api/oddyssey/matches` - Current matches (yesterday, today, tomorrow)
- `GET /api/oddyssey/current-cycle` - Current cycle information
- `POST /api/oddyssey/live-matches` - Live match data
- `GET /api/oddyssey/leaderboard` - Cycle leaderboard
- `GET /api/oddyssey/stats?type={global|user}&address={address}` - Statistics
- `GET /api/oddyssey/current-prize-pool` - Current prize pool
- `GET /api/oddyssey/daily-stats` - Daily statistics
- `POST /api/oddyssey/place-slip` - Place betting slip
- `GET /api/oddyssey/user-slips/{address}` - User slips
- `GET /api/oddyssey/user-slips/{cycleId}/{address}` - User slips for cycle
- `GET /api/oddyssey/evaluated-slip/{slipId}` - Evaluated slip details
- `GET /api/oddyssey/slip-evaluation/{slipId}` - Slip evaluation
- `GET /api/oddyssey/results/{date}` - Results by date
- `GET /api/oddyssey/available-dates` - Available dates
- `GET /api/oddyssey/cycle-sync-status` - Cycle sync status
- `POST /api/oddyssey/cycle-sync/force` - Force cycle sync
- `GET /api/oddyssey/preferences` - User preferences
- `POST /api/oddyssey/preferences` - Update preferences

**Data Format Expectations:**
```typescript
interface OddysseyCycle {
  cycle_id: number;
  created_at: string;
  updated_at: string;
  matches_count: number;
  matches_data: string;
  cycle_start_time: string;
  cycle_end_time: string;
  resolved_at?: string;
  is_resolved: boolean;
  tx_hash?: string;
  resolution_tx_hash?: string;
  seconds_remaining?: number;
  matches: OddysseyMatch[];
}

interface OddysseyMatch {
  id: number;
  fixture_id: number;
  home_team: string;
  away_team: string;
  match_date: string;
  league_name: string;
  home_odds: number;
  draw_odds: number;
  away_odds: number;
  over_odds?: number;
  under_odds?: number;
  market_type: string;
  display_order: number;
  odds_data?: any;
}
```

#### **Faucet Service** (`/services/faucetService.ts`)
**Expected Endpoints:**
- `GET /api/faucet/statistics` - Faucet statistics
- `GET /api/faucet/eligibility/{address}` - Check eligibility
- `POST /api/faucet/claim` - Claim tokens
- `GET /api/faucet/activity/{address}` - User activity

**Data Format Expectations:**
```typescript
interface FaucetStatistics {
  faucet: {
    active: boolean;
    balance: string;
    totalDistributed: string;
    totalUsers: string;
    maxPossibleClaims: string;
    hasSufficientBalance: boolean;
  };
  constants: {
    faucetAmount: string;
    contractAddress: string;
  };
  formatted: {
    balance: string;
    totalDistributed: string;
    faucetAmount: string;
  };
}
```

#### **Airdrop Service** (`/services/airdropService.ts`)
**Expected Endpoints:**
- `GET /api/airdrop/eligibility/{address}` - Check airdrop eligibility
- `GET /api/airdrop/statistics` - Airdrop statistics
- `GET /api/airdrop/leaderboard?limit={number}` - Airdrop leaderboard

#### **Staking Service** (`/services/stakingService.ts`)
**Expected Endpoints:**
- `GET /api/staking/statistics` - Staking statistics
- `GET /api/staking/user/{address}` - User staking data
- `GET /api/staking/leaderboard?limit={number}&timeframe={7d|30d|90d|all}` - Staking leaderboard
- `GET /api/staking/tiers` - Staking tiers
- `GET /api/staking/analytics?timeframe={7d|30d|90d}` - Staking analytics

**Data Format Expectations:**
```typescript
interface StakingStatistics {
  contract: {
    totalStakers: number;
    totalStaked: string;
    totalRewards: string;
    totalRewardsPaid: string;
    active: boolean;
    contractAddress: string;
  };
  analytics: {
    uniqueStakers: number;
    totalStakes: number;
    avgStakeAmount: string;
    firstStakeTime: string;
    lastActivity: string;
    stakes24h: number;
    unstakes24h: number;
  };
  tiers: StakingTier[];
  formatted: {
    totalStaked: string;
    totalRewards: string;
    totalRewardsPaid: string;
  };
}
```

#### **Optimistic Oracle Service** (`/services/optimisticOracleService.ts`)
**Expected Endpoints:**
- `GET /api/optimistic-oracle/statistics` - Oracle statistics
- `GET /api/optimistic-oracle/market/{marketId}` - Get market by ID
- `GET /api/optimistic-oracle/markets?state={number}&category={string}&limit={number}&offset={number}` - Get markets
- `GET /api/optimistic-oracle/user/{address}/activity` - User market activity
- `GET /api/optimistic-oracle/user/{address}/reputation` - User reputation
- `GET /api/optimistic-oracle/markets/by-category` - Markets by category
- `GET /api/optimistic-oracle/markets/pending` - Pending markets
- `GET /api/optimistic-oracle/markets/disputed` - Disputed markets
- `GET /api/optimistic-oracle/resolutions?limit={number}` - Resolution history

**Data Format Expectations:**
```typescript
interface OptimisticMarket {
  marketId: string;
  poolId: number;
  question: string;
  category: string;
  proposedOutcome: string | null;
  proposer: string | null;
  proposalTime: number;
  proposalBond: string;
  disputer: string | null;
  disputeTime: number;
  disputeBond: string;
  state: MarketState;
  finalOutcome: string | null;
  resolutionTime: number;
}

enum MarketState {
  PENDING = 0,
  PROPOSED = 1,
  DISPUTED = 2,
  RESOLVED = 3,
  EXPIRED = 4
}
```

#### **Pool Service** (`/services/poolService.ts`)
**Expected Endpoints:**
- `GET /api/guided-markets/pools?limit={number}&offset={number}` - Get pools
- `GET /api/guided-markets/pools/category/{category}?limit={number}&offset={number}` - Get pools by category
- `GET /api/guided-markets/pools/{poolId}` - Get specific pool
- `GET /api/guided-markets/pools/creator/{creatorAddress}?limit={number}&offset={number}` - Get pools by creator
- `POST /api/bitr-pool/pools` - Create pool
- `POST /api/guided-markets/pools/{poolId}/boost` - Boost pool
- `POST /api/guided-markets/pools/{poolId}/bet` - Place bet
- `GET /api/guided-markets/pools/{poolId}/progress` - Get pool progress
- `POST /api/guided-markets/pools/{poolId}/liquidity` - Add liquidity
- `GET /api/guided-markets/stats` - Guided markets stats

#### **Guided Market Service** (`/services/guidedMarketService.ts`)
**Expected Endpoints:**
- `GET /api/fixtures/upcoming?limit={number}` - Upcoming fixtures
- `GET /api/fixtures/date-range?start_date={date}&end_date={date}&limit={number}&page={number}` - Fixtures by date range
- `GET /api/crypto/all?limit={number}&page={number}` - All crypto data
- `GET /api/crypto/popular` - Popular coins
- `GET /api/crypto/targets/{coinId}?timeframe={string}` - Crypto targets
- `POST /api/guided-markets/football/prepare` - Prepare football market
- `POST /api/guided-markets/football/confirm` - Confirm football market
- `POST /api/guided-markets/cryptocurrency/prepare` - Prepare crypto market
- `POST /api/guided-markets/cryptocurrency/confirm` - Confirm crypto market

### ❌ **MISSING BACKEND ENDPOINTS**

#### **1. Optimistic Oracle API** - **CRITICAL MISSING**
**Status**: Frontend expects `/api/optimistic-oracle/*` endpoints but backend has NO optimistic oracle routes
**Impact**: High - Frontend has full service implementation expecting these endpoints
**Required Endpoints:**
- `GET /api/optimistic-oracle/statistics`
- `GET /api/optimistic-oracle/market/{marketId}`
- `GET /api/optimistic-oracle/markets`
- `GET /api/optimistic-oracle/user/{address}/activity`
- `GET /api/optimistic-oracle/user/{address}/reputation`
- `GET /api/optimistic-oracle/markets/by-category`
- `GET /api/optimistic-oracle/markets/pending`
- `GET /api/optimistic-oracle/markets/disputed`
- `GET /api/optimistic-oracle/resolutions`

#### **2. Enhanced Analytics Endpoints** - **PARTIALLY MISSING**
**Status**: Frontend expects enhanced analytics endpoints that may not exist
**Impact**: Medium - Some analytics features may not work
**Missing Endpoints:**
- `GET /api/analytics/platform-overview` - May not exist
- `GET /api/analytics/leaderboards` - May not exist

#### **3. API Configuration Mismatch**
**Status**: Frontend config expects `https://api.bitr.app` but backend is at `https://bitr-backend.fly.dev`
**Impact**: High - All API calls will fail if not properly configured
**Fix Required**: Update frontend environment variables or backend deployment

### 🔧 **REQUIRED FIXES**

#### **Priority 1: Create Optimistic Oracle API**
- Create `/api/optimistic-oracle.js` router
- Implement all expected endpoints
- Add to server.js routes
- Create database tables if needed

#### **Priority 2: Verify Enhanced Analytics**
- Check if `/api/enhanced-analytics` covers all frontend expectations
- Add missing endpoints if needed

#### **Priority 3: Fix API Configuration**
- Ensure frontend points to correct backend URL
- Update environment variables

#### **Priority 4: Data Format Verification**
- Verify all response formats match frontend TypeScript interfaces
- Fix any mismatches in data structure
