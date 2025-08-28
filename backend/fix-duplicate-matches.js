const db = require('./db/db');

class DuplicateMatchFixer {
  constructor() {
    this.db = db;
  }

  /**
   * Fix duplicate matches for a specific date
   */
  async fixDuplicateMatches(targetDate = null) {
    try {
      const date = targetDate || new Date().toISOString().split('T')[0];
      console.log(`🔧 Fixing duplicate matches for ${date}...`);

      // Check for duplicates
      const duplicates = await this.db.query(`
        SELECT fixture_id, COUNT(*) as count 
        FROM oracle.daily_game_matches 
        WHERE game_date = $1 
        GROUP BY fixture_id 
        HAVING COUNT(*) > 1
      `, [date]);

      if (duplicates.rows.length === 0) {
        console.log(`✅ No duplicates found for ${date}`);
        return { success: true, message: 'No duplicates found' };
      }

      console.log(`🚨 Found ${duplicates.rows.length} fixtures with duplicates`);

      // Delete duplicates, keeping only the first entry
      const result = await this.db.query(`
        DELETE FROM oracle.daily_game_matches 
        WHERE id NOT IN (
          SELECT MIN(id) 
          FROM oracle.daily_game_matches 
          WHERE game_date = $1 
          GROUP BY fixture_id
        ) AND game_date = $1
      `, [date]);

      console.log(`✅ Removed ${result.rowCount} duplicate entries`);

      // Verify fix
      const verification = await this.db.query(`
        SELECT COUNT(*) as total, COUNT(DISTINCT fixture_id) as unique
        FROM oracle.daily_game_matches 
        WHERE game_date = $1
      `, [date]);

      const { total, unique } = verification.rows[0];
      console.log(`📊 After fix: ${total} total matches, ${unique} unique fixtures`);

      return {
        success: true,
        message: `Fixed duplicates for ${date}`,
        removed: result.rowCount,
        total: parseInt(total),
        unique: parseInt(unique)
      };

    } catch (error) {
      console.error('❌ Error fixing duplicates:', error);
      throw error;
    }
  }

  /**
   * Add unique constraint to prevent future duplicates
   */
  async addUniqueConstraint() {
    try {
      console.log('🔧 Adding unique constraint to prevent future duplicates...');

      // Add unique constraint on fixture_id and game_date
      await this.db.query(`
        ALTER TABLE oracle.daily_game_matches 
        ADD CONSTRAINT unique_fixture_date 
        UNIQUE (fixture_id, game_date)
      `);

      console.log('✅ Unique constraint added successfully');

    } catch (error) {
      if (error.code === '23505') {
        console.log('ℹ️ Unique constraint already exists');
      } else {
        console.error('❌ Error adding unique constraint:', error);
        throw error;
      }
    }
  }

  /**
   * Validate cycle matches for duplicates
   */
  async validateCycleMatches(cycleId) {
    try {
      console.log(`🔍 Validating cycle ${cycleId} matches...`);

      const matches = await this.db.query(`
        SELECT fixture_id, COUNT(*) as count
        FROM oracle.daily_game_matches 
        WHERE cycle_id = $1
        GROUP BY fixture_id
        HAVING COUNT(*) > 1
      `, [cycleId]);

      if (matches.rows.length > 0) {
        console.log(`🚨 Cycle ${cycleId} has ${matches.rows.length} duplicate fixtures:`);
        matches.rows.forEach(row => {
          console.log(`   - ${row.fixture_id}: ${row.count} entries`);
        });
        return false;
      }

      console.log(`✅ Cycle ${cycleId} has no duplicate matches`);
      return true;

    } catch (error) {
      console.error('❌ Error validating cycle matches:', error);
      throw error;
    }
  }

  /**
   * Fix a specific cycle by removing duplicates and reassigning matches
   */
  async fixCycle(cycleId) {
    try {
      console.log(`🔧 Fixing cycle ${cycleId}...`);

      // Remove cycle_id from all matches
      await this.db.query(`
        UPDATE oracle.daily_game_matches 
        SET cycle_id = NULL 
        WHERE cycle_id = $1
      `, [cycleId]);

      // Delete cycle record
      await this.db.query(`
        DELETE FROM oracle.oddyssey_cycles 
        WHERE cycle_id = $1
      `, [cycleId]);

      console.log(`✅ Cycle ${cycleId} removed from database`);

      // Get available matches for today
      const availableMatches = await this.db.query(`
        SELECT fixture_id, home_team, away_team, league_name, match_date, 
               home_odds, draw_odds, away_odds, over_25_odds, under_25_odds
        FROM oracle.daily_game_matches 
        WHERE game_date = CURRENT_DATE 
        AND cycle_id IS NULL
        ORDER BY match_date
        LIMIT 10
      `);

      if (availableMatches.rows.length < 10) {
        throw new Error(`Not enough matches available: ${availableMatches.rows.length}/10`);
      }

      // Assign matches to cycle
      for (let i = 0; i < availableMatches.rows.length; i++) {
        const match = availableMatches.rows[i];
        await this.db.query(`
          UPDATE oracle.daily_game_matches 
          SET cycle_id = $1, display_order = $2
          WHERE fixture_id = $3
        `, [cycleId, i + 1, match.fixture_id]);
      }

      console.log(`✅ Cycle ${cycleId} fixed with ${availableMatches.rows.length} matches`);

      return {
        success: true,
        cycleId: cycleId,
        matchCount: availableMatches.rows.length
      };

    } catch (error) {
      console.error('❌ Error fixing cycle:', error);
      throw error;
    }
  }
}

// CLI usage
if (require.main === module) {
  const fixer = new DuplicateMatchFixer();
  const command = process.argv[2];
  const arg = process.argv[3];

  async function run() {
    try {
      switch (command) {
        case 'fix-date':
          await fixer.fixDuplicateMatches(arg);
          break;
        case 'add-constraint':
          await fixer.addUniqueConstraint();
          break;
        case 'validate-cycle':
          await fixer.validateCycleMatches(parseInt(arg));
          break;
        case 'fix-cycle':
          await fixer.fixCycle(parseInt(arg));
          break;
        default:
          console.log('🔧 Duplicate Match Fixer');
          console.log('');
          console.log('Usage:');
          console.log('  node fix-duplicate-matches.js fix-date [YYYY-MM-DD]  - Fix duplicates for date');
          console.log('  node fix-duplicate-matches.js add-constraint        - Add unique constraint');
          console.log('  node fix-duplicate-matches.js validate-cycle [ID]   - Validate cycle matches');
          console.log('  node fix-duplicate-matches.js fix-cycle [ID]        - Fix specific cycle');
      }
    } catch (error) {
      console.error('💥 Error:', error.message);
      process.exit(1);
    } finally {
      process.exit(0);
    }
  }

  run();
}

module.exports = DuplicateMatchFixer;
