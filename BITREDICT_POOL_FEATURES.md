# BitredictPool Enhanced Features Documentation

## Overview
The BitredictPool contract has been enhanced with comprehensive features for pool progress tracking, boosted pools system, and combo (parlay) pools functionality.

## 🎯 Pool Progress & Metrics for UI

### How Pool Size is Calculated

**Current Implementation:**
```solidity
// Pool size formula (CORRECTED)
maxBettorStake = creatorStake / (odds / 100 - 1)
totalPoolSize = totalCreatorSideStake + maxBettorStake

// Example: Creator stakes 200 STT at 5.00x odds
maxBettorStake = 200 / (5 - 1) = 200 / 4 = 50 STT
totalPoolSize = 200 + 50 = 250 STT

// Verification: 50 STT × 5.00x = 250 STT payout
// → 50 STT (bettor stake) + 200 STT (creator stake) = 250 STT ✅ Balanced
```

**Liquidity Provider (LP) Handling:**
- When users "think like the creator" and add liquidity, they join the creator's side
- This increases `totalCreatorSideStake`, which increases pool capacity
- LPs share proportionally in winnings if creator side wins

### New Getter Functions for UI Progress Bars

#### 1. `getPoolProgress(uint256 poolId)`
Returns comprehensive metrics for pool progress visualization:

```solidity
function getPoolProgress(uint256 poolId) external view returns (
    uint256 totalPoolSize,        // Total possible pool size
    uint256 currentBettorStake,   // Current bettor stakes
    uint256 maxBettorCapacity,    // Maximum bettor capacity
    uint256 creatorSideStake,     // Total creator + LP stakes
    uint256 fillPercentage,       // Fill % in basis points (0-10000)
    uint256 bettorCount,          // Number of unique bettors
    uint256 lpCount               // Number of LPs
)
```

**UI Usage:**
```javascript
const [totalPoolSize, currentBettorStake, maxBettorCapacity, creatorSideStake, fillPercentage, bettorCount, lpCount] = await contract.getPoolProgress(poolId);

// Progress bar: fillPercentage / 100 = percentage (0-100%)
const progressPercent = fillPercentage / 100;

// Pool capacity: currentBettorStake / maxBettorCapacity
const capacityFilled = currentBettorStake / maxBettorCapacity;
```

#### 2. `getPoolFinancials(uint256 poolId)`
Returns detailed financial breakdown:

```solidity
function getPoolFinancials(uint256 poolId) external view returns (
    uint256 creatorStake,           // Original creator stake
    uint256 lpStake,                // Total LP contributions
    uint256 bettorStake,            // Total bettor stakes
    uint256 potentialCreatorPayout, // Creator side potential winnings
    uint256 potentialBettorPayout   // Bettor side potential winnings
)
```

## ⚡ Boosted Pools Revenue System

### Boost Tiers
| Tier | Fee | Visibility Level | Max Slots |
|------|-----|------------------|-----------|
| 🔹 Bronze | 2 STT | Higher ranking | 5 |
| 🔸 Silver | 3 STT | Front page + highlighted | 5 |
| 🟣 Gold | 5 STT | Pinned to top + "Gold Pool" badge | 5 |

### Key Features
- **24-hour duration**: Boosts last exactly 24 hours
- **Limited slots**: Maximum 5 pools per tier at any time
- **Creator-only**: Only pool creators can boost their pools
- **Before event start**: Pools can only be boosted before event starts
- **Upgradeable**: Creators can upgrade boost tiers (previous boost gets refunded in time)

### Functions

#### 1. Check Boost Availability
```solidity
function canBoostPool(BoostTier tier) external view returns (
    bool canBoost,       // Whether tier has available slots
    uint256 currentCount, // Current active boosts for tier
    uint256 maxCount     // Maximum allowed for tier
)
```

#### 2. Boost a Pool
```solidity
function boostPool(uint256 poolId, BoostTier tier) external;
```

**Requirements:**
- Only pool creator can call
- Event must not have started
- Tier must have available slots
- Creator must have approved STT tokens for fee

#### 3. Get Pool Boost Status
```solidity
function getPoolBoost(uint256 poolId) external view returns (
    BoostTier tier,    // Current boost tier
    uint256 expiry,    // When boost expires (timestamp)
    bool isActive      // Whether boost is currently active
)
```

#### 4. Cleanup Expired Boosts
```solidity
function cleanupExpiredBoosts(uint256[] calldata poolIds) external;
```
- Anyone can call to maintain system efficiency
- Automatically removes expired boosts
- Updates available slot counts

### UI Integration
```javascript
// Check if Gold boost is available
const [canBoost, current, max] = await contract.canBoostPool(3); // 3 = Gold tier
if (canBoost) {
  // Show boost button
  document.getElementById('boostButton').style.display = 'block';
} else {
  // Show "Gold tier full (5/5)" message
  document.getElementById('boostStatus').innerHTML = `Gold tier full (${current}/${max})`;
}

// Get pool boost status
const [tier, expiry, isActive] = await contract.getPoolBoost(poolId);
if (isActive) {
  const tierNames = ['None', 'Bronze', 'Silver', 'Gold'];
  const remainingTime = expiry - Date.now() / 1000;
  // Show boost badge and countdown
}
```

## 🛠️ Combo (Parlay) Pools

### Overview
Combo pools allow creators to create prediction markets based on multiple combined outcomes. All conditions must be met for bettors to win.

### Key Features
- **2-4 conditions maximum**: Each combo pool can have 2, 3, or 4 outcome conditions
- **Combined odds**: Total odds calculated from all conditions (max 500x)
- **ANY condition fails = Creator wins**: Creator wins if ANY single condition doesn't match expected outcome
- **ALL conditions must succeed**: Bettors only win if ALL conditions match expected outcomes

### Example Combo Pool
**3-Match Parlay:**
1. Chelsea wins vs Arsenal
2. Everton wins vs Liverpool  
3. Barcelona over 2.5 goals vs Madrid

**Combined odds: 5.00x**
- Creator stakes 200 STT
- Max bettor capacity: 200 / (5 - 1) = 50 STT
- If ANY condition fails → Creator wins entire pool
- If ALL conditions succeed → Bettors win at 5.00x odds

## 📊 Summary of All Enhancements

### Pool Progress Calculations (ANSWERED YOUR QUESTIONS):

1. **How is pool size calculated?**
   - `maxBettorStake = creatorStake / (odds / 100 - 1)`
   - `totalPoolSize = totalCreatorSideStake + maxBettorStake`
   
2. **Getter functions for progress bars:**
   - `getPoolProgress(poolId)` - Returns all metrics for UI
   - `getPoolFinancials(poolId)` - Financial breakdown
   
3. **LP handling:**
   - LPs increase `totalCreatorSideStake`
   - This increases pool capacity dynamically
   - LPs share proportionally in creator-side winnings

4. **maxBetPerUser implemented:**
   - Creators can set betting limits (e.g., 2 STT max per user)
   - Set to 0 for no limit
   - Enforced in `placeBet()` function

### Boosted Pools Revenue System:
- 3 tiers: Bronze (2 STT), Silver (3 STT), Gold (5 STT)
- 24-hour duration, 5 slots max per tier
- Revenue generator for platform

### Combo Pools:
- 2-4 event parlays with combined odds
- Creator wins if ANY condition fails
- Bettors win only if ALL conditions succeed
- Full oracle integration for step-by-step resolution

### New Functions Added:
- **Pool Progress:** `getPoolProgress()`, `getPoolFinancials()`
- **Boost System:** `boostPool()`, `canBoostPool()`, `getPoolBoost()`, `cleanupExpiredBoosts()`
- **Combo Pools:** `createComboPool()`, `placeComboBet()`, `resolveComboCondition()`, `claimCombo()`, `getComboConditions()`, `getComboPoolProgress()`

All functions include proper access controls, input validation, and gas optimization for production deployment. 