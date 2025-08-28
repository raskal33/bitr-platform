# Database Schema Audit Tools

## 🎯 Purpose

These tools detect database schema mismatches that can break production, like the recent `column f.home_odds does not exist` errors.

## 🛠️ Available Tools

### 1. Quick Schema Audit (Recommended)
```bash
npm run audit:schema:quick
# or
node scripts/quick-schema-audit.js
```

**Focus**: Critical issues that break production
- ❌ Getting odds from `fixtures` table (should use `daily_game_matches`)
- ❌ Getting scores from `fixtures` table (should use `fixture_results`)  
- ❌ Non-existent columns like `finished_at`
- ⚠️ Missing schema prefixes

### 2. Full Schema Audit (Comprehensive)
```bash
npm run audit:schema:full
# or  
node scripts/run-schema-audit.js
```

**Focus**: Complete codebase analysis
- All missing tables/columns
- Wrong table usage patterns
- Performance issues (missing indexes)
- SQL injection vulnerabilities
- Generates detailed JSON report

## 📊 Recent Audit Results

### ✅ Critical Issues: **0** (All Fixed!)
The production-breaking issues have been resolved:
- ✅ Fixed `f.home_odds` errors in `/api/oddyssey/current-cycle`
- ✅ Fixed `f.draw_odds` errors in `/api/oddyssey/matches`
- ✅ Removed all non-existent column references

### ⚠️ Warnings: **150** (Non-critical)
Mostly missing schema prefixes like:
```sql
-- ⚠️ Warning
FROM users WHERE id = ?

-- ✅ Better  
FROM public.users WHERE id = ?
```

## 🗄️ Database Schema Guide

### `oracle.fixtures` - Basic Match Info
```sql
-- ✅ HAS: Basic match data
id, home_team, away_team, match_date, status, league_name

-- ❌ DOES NOT HAVE: Odds or scores
home_odds, draw_odds, away_odds, home_score, away_score
```

### `oracle.daily_game_matches` - Match Odds
```sql  
-- ✅ HAS: Odds data
fixture_id, home_odds, draw_odds, away_odds, over_25_odds, under_25_odds

-- Use for: Getting betting odds
```

### `oracle.fixture_results` - Match Results
```sql
-- ✅ HAS: Score data  
fixture_id, home_score, away_score, outcome_1x2, finished_at

-- Use for: Getting match results and scores
```

## 🚨 Common Mistakes to Avoid

### ❌ Wrong: Getting odds from fixtures
```sql
SELECT f.home_odds, f.draw_odds 
FROM oracle.fixtures f  -- ❌ These columns don't exist!
```

### ✅ Correct: Getting odds from daily_game_matches
```sql
SELECT dgm.home_odds, dgm.draw_odds 
FROM oracle.daily_game_matches dgm
WHERE dgm.fixture_id = ?
```

### ❌ Wrong: Getting scores from fixtures  
```sql
SELECT f.home_score, f.away_score
FROM oracle.fixtures f  -- ❌ These columns don't exist!
```

### ✅ Correct: Getting scores from fixture_results
```sql
SELECT fr.home_score, fr.away_score
FROM oracle.fixture_results fr  
WHERE fr.fixture_id = ?
```

## 🔧 Integration

Add to your `package.json`:
```json
{
  "scripts": {
    "audit:schema:quick": "node scripts/quick-schema-audit.js",
    "audit:schema:full": "node scripts/run-schema-audit.js"
  }
}
```

## 🎯 When to Run

### Before Deployment (Critical)
```bash
npm run audit:schema:quick
```
Must show **0 critical issues** before deploying to production.

### During Development (Optional)
```bash
npm run audit:schema:full  
```
Comprehensive analysis for optimization and best practices.

### After Schema Changes (Recommended)
Run audit after any database migrations or schema updates.

## 📈 Benefits

1. **Prevents Production Errors**: Catches schema mismatches before deployment
2. **Saves Debug Time**: No more hunting for missing column errors in logs  
3. **Enforces Best Practices**: Proper table usage and schema prefixes
4. **Performance Insights**: Identifies missing indexes and slow queries
5. **Documentation**: Auto-generates schema usage guide

## 🔍 Example Output

```
⚡ QUICK SCHEMA AUDIT REPORT
============================================================
📊 SUMMARY:
   🔴 Critical Issues: 0
   🟡 Warnings: 150

✅ NO CRITICAL ISSUES - Production safe!
============================================================
```

## 🛡️ Production Safety

The audit tools ensure:
- ✅ All SQL queries use existing columns
- ✅ Proper table usage (odds from daily_game_matches, scores from fixture_results)
- ✅ No missing table references
- ✅ Schema-aware code that won't break on deployment
