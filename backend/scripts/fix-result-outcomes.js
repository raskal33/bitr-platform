const db = require('../db/db');

/**
 * Fix Result Outcomes Script
 * 
 * This script calculates and updates the result_1x2 and result_ou25 outcomes
 * for matches that have scores but missing outcomes.
 */
class FixResultOutcomes {
  constructor() {
    this.outcomes = {
      moneyline: {
        '1': '1', // Home win
        'X': 'X', // Draw
        '2': '2'  // Away win
      },
      overUnder: {
        'Over': 'Over',
        'Under': 'Under'
      }
    };
  }

  calculateMoneylineResult(homeScore, awayScore) {
    if (homeScore > awayScore) return '1';
    if (homeScore < awayScore) return '2';
    return 'X';
  }

  calculateOverUnderResult(homeScore, awayScore) {
    const totalGoals = homeScore + awayScore;
    return totalGoals > 2.5 ? 'Over' : 'Under';
  }

  async run() {
    console.log('🔧 Starting result outcomes fix...');
    
    try {
      // Get fixtures that have scores but missing outcomes
      const result = await db.query(`
        SELECT 
          f.id,
          f.home_team,
          f.away_team,
          f.status,
          fr.home_score,
          fr.away_score,
          fr.result_1x2,
          fr.result_ou25
        FROM oracle.fixtures f
        INNER JOIN oracle.fixture_results fr ON f.id::VARCHAR = fr.fixture_id::VARCHAR
        WHERE fr.home_score IS NOT NULL
        AND fr.away_score IS NOT NULL
        AND (fr.result_1x2 IS NULL OR fr.result_ou25 IS NULL)
        ORDER BY f.match_date
      `);

      if (result.rows.length === 0) {
        console.log('✅ No fixtures need outcome updates');
        return;
      }

      console.log(`📊 Found ${result.rows.length} fixtures that need outcome updates`);

      let updatedCount = 0;
      for (const fixture of result.rows) {
        try {
          // Calculate outcomes
          const moneylineResult = this.calculateMoneylineResult(fixture.home_score, fixture.away_score);
          const overUnderResult = this.calculateOverUnderResult(fixture.home_score, fixture.away_score);

          // Update outcomes
          await db.query(`
            UPDATE oracle.fixture_results 
            SET 
              result_1x2 = $1,
              result_ou25 = $2,
              updated_at = NOW()
            WHERE fixture_id = $3
          `, [moneylineResult, overUnderResult, fixture.id]);

          console.log(`✅ Updated outcomes for fixture ${fixture.id}: ${fixture.home_team} vs ${fixture.away_team} (${fixture.home_score}-${fixture.away_score}) → 1X2: ${moneylineResult}, O/U 2.5: ${overUnderResult}`);
          updatedCount++;

        } catch (error) {
          console.error(`❌ Failed to update outcomes for fixture ${fixture.id}:`, error.message);
        }
      }

      console.log(`🎉 Updated outcomes for ${updatedCount}/${result.rows.length} fixtures`);

    } catch (error) {
      console.error('❌ Error fixing result outcomes:', error);
    }
  }
}

// Run the fix if this script is executed directly
if (require.main === module) {
  const fixer = new FixResultOutcomes();
  fixer.run()
    .then(() => {
      console.log('✅ Outcome fixes completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Outcome fixes failed:', error);
      process.exit(1);
    });
}

module.exports = FixResultOutcomes;
