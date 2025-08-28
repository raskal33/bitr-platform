# Persistent Daily Game Manager Service

## Overview

The Persistent Daily Game Manager Service ensures consistent daily match selection for the Oddyssey prediction game. Once matches are selected and persisted for a date, they never change, providing a stable gaming experience.

## Key Features

### 1. Overwrite Protection
- Matches are selected only once per date
- Subsequent calls return existing matches without modification
- Prevents inconsistencies in daily game data

### 2. Complete Odds Data
- Ensures all matches have complete 1X2 and Over/Under 2.5 odds
- Validates odds quality before selection
- Filters out mock or default odds values

### 3. Quality-Based Selection
- Prioritizes popular leagues and competitions
- Balances match difficulty and timing
- Ensures good distribution across time slots

### 4. Date-Based Match Selection
- Matches must start after 11:00 AM UTC
- Selects exactly 10 matches per date
- Validates match timing and data completeness

## API Methods

### `selectAndPersistDailyMatches(date)`

Selects and persists daily matches with overwrite protection.

**Parameters:**
- `date` (string|Date, optional): Target date (defaults to today)

**Returns:**
```javascript
{
  success: true,
  message: 'Daily matches selected and persisted successfully',
  date: '2025-01-15',
  matchCount: 10,
  cycleId: 1737123456,
  overwriteProtected: false
}
```

**Overwrite Protection Response:**
```javascript
{
  success: true,
  message: 'Matches already exist - overwrite protection active',
  date: '2025-01-15',
  matchCount: 10,
  overwriteProtected: true
}
```

### `getDailyMatches(date)`

Retrieves daily matches from persistent storage only.

**Parameters:**
- `date` (string|Date, optional): Target date (defaults to today)

**Returns:**
```javascript
{
  success: true,
  date: '2025-01-15',
  matches: [
    {
      id: 12345,
      fixture_id: 12345,
      home_team: 'Manchester United',
      away_team: 'Liverpool',
      league_name: 'Premier League',
      match_date: '2025-01-15T15:00:00.000Z',
      home_odds: 2.10,
      draw_odds: 3.40,
      away_odds: 3.20,
      over_25_odds: 1.85,
      under_25_odds: 1.95,
      display_order: 1,
      cycle_id: 1737123456
    }
    // ... 9 more matches
  ],
  cycleId: 1737123456
}
```

### `validateMatchCount(date)`

Validates that exactly 10 matches exist for a date.

**Parameters:**
- `date` (string|Date, optional): Target date (defaults to today)

**Returns:**
```javascript
{
  date: '2025-01-15',
  count: 10,
  expected: 10,
  isValid: true,
  message: 'Exactly 10 matches found'
}
```

## Database Schema

The service uses the `oddyssey.daily_game_matches` table:

```sql
CREATE TABLE oddyssey.daily_game_matches (
    id BIGSERIAL PRIMARY KEY,
    fixture_id BIGINT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    league_name TEXT NOT NULL,
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    game_date DATE NOT NULL,
    home_odds DECIMAL(10,2) NOT NULL,
    draw_odds DECIMAL(10,2) NOT NULL,
    away_odds DECIMAL(10,2) NOT NULL,
    over_25_odds DECIMAL(10,2) NOT NULL,
    under_25_odds DECIMAL(10,2) NOT NULL,
    selection_type TEXT DEFAULT '1x2_ou25',
    priority_score INTEGER DEFAULT 0,
    cycle_id INTEGER NOT NULL,
    display_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_fixture_cycle UNIQUE (fixture_id, cycle_id)
);
```

## Usage Examples

### Basic Usage

```javascript
const PersistentDailyGameManager = require('./services/persistent-daily-game-manager');

const manager = new PersistentDailyGameManager();

// Select and persist matches for today
const result = await manager.selectAndPersistDailyMatches();
console.log(`Selected ${result.matchCount} matches`);

// Get matches for today
const matches = await manager.getDailyMatches();
console.log(`Found ${matches.matches.length} matches`);

// Validate match count
const validation = await manager.validateMatchCount();
console.log(`Validation: ${validation.isValid ? 'PASS' : 'FAIL'}`);
```

### API Integration

```javascript
// In your Express route
router.post('/select-matches', async (req, res) => {
  try {
    const result = await persistentDailyGameManager.selectAndPersistDailyMatches();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/matches', async (req, res) => {
  try {
    const result = await persistentDailyGameManager.getDailyMatches();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## Match Selection Criteria

### Quality Scoring
1. **League Priority** (0-30 points): Popular leagues get higher scores
2. **Odds Balance** (0-20 points): Competitive matches preferred
3. **Odds Reasonableness** (0-15 points): Realistic odds ranges
4. **Over/Under Quality** (0-10 points): Balanced O/U markets
5. **Timing** (0-10 points): Afternoon/evening matches preferred
6. **Randomization** (0-5 points): Ensures variety

### Filtering Criteria
- Matches must start after 11:00 AM UTC
- Complete odds data required (1X2 + O/U 2.5)
- No women's leagues or teams
- No mock/default odds values
- Valid fixture status (NS, Fixture)

### Time Distribution
- Maximum 3 matches per hour slot
- Preference for 15:00-21:00 UTC matches
- Ensures good spread across the day

## Error Handling

The service includes comprehensive error handling:

- **Insufficient Matches**: Throws error if less than 10 suitable matches found
- **Invalid Data**: Validates all match data before persistence
- **Database Errors**: Proper transaction handling with rollback
- **Duplicate Prevention**: Unique constraints prevent data corruption

## Testing

Use the validation script to test the service:

```bash
node validate-persistent-service.js
```

This validates:
- Service class structure
- Method implementations
- Data validation logic
- Date formatting
- Error handling

## Integration Notes

### Cron Job Integration
```javascript
// Daily at 00:30 UTC
cron.schedule('30 0 * * *', async () => {
  try {
    await persistentDailyGameManager.selectAndPersistDailyMatches();
    console.log('✅ Daily matches selected');
  } catch (error) {
    console.error('❌ Failed to select daily matches:', error);
  }
});
```

### Frontend Integration
The service provides data in the exact format expected by the frontend, ensuring seamless integration with existing UI components.

### Monitoring
- Use `validateMatchCount()` for health checks
- Monitor overwrite protection triggers
- Track match selection quality scores
- Alert on insufficient match scenarios