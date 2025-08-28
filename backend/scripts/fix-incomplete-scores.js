const db = require('../db/db');

/**
 * Fix Incomplete Scores Script
 * 
 * This script fixes incomplete scores by manually setting the missing scores
 * based on the known results from SportMonks API.
 */
class FixIncompleteScores {
  async run() {
    console.log('🔧 Starting incomplete scores fix...');
    
    try {
      // Manual fixes based on the SportMonks API data we saw
      const fixes = [
        {
          fixtureId: '19427470',
          homeScore: 2,
          awayScore: 0,
          description: 'Everton vs Brighton & Hove Albion'
        },
        {
          fixtureId: '19433480',
          homeScore: 0,
          awayScore: 1,
          description: 'FSV Mainz 05 vs FC Köln'
        },
        {
          fixtureId: '19424883',
          homeScore: 2,
          awayScore: 0,
          description: 'Como vs Lazio'
        },
        {
          fixtureId: '19424886',
          homeScore: 2,
          awayScore: 0,
          description: 'Juventus vs Parma'
        },
        {
          fixtureId: '19433782',
          homeScore: 1,
          awayScore: 0,
          description: 'LOSC Lille vs Monaco'
        }
      ];

      console.log(`📊 Fixing ${fixes.length} incomplete scores...`);

      for (const fix of fixes) {
        try {
          // Update fixture_results table
          await db.query(`
            UPDATE oracle.fixture_results 
            SET 
              home_score = $1,
              away_score = $2,
              updated_at = NOW()
            WHERE fixture_id = $3
          `, [fix.homeScore, fix.awayScore, fix.fixtureId]);

          // Calculate outcomes
          const moneylineResult = this.calculateMoneylineResult(fix.homeScore, fix.awayScore);
          const overUnderResult = this.calculateOverUnderResult(fix.homeScore, fix.awayScore);

          // Update outcomes
          await db.query(`
            UPDATE oracle.fixture_results 
            SET 
              result_1x2 = $1,
              result_ou25 = $2,
              updated_at = NOW()
            WHERE fixture_id = $3
          `, [moneylineResult, overUnderResult, fix.fixtureId]);

          // Update fixture status to FT
          await db.query(`
            UPDATE oracle.fixtures 
            SET status = 'FT', updated_at = NOW()
            WHERE id = $1
          `, [fix.fixtureId]);

          console.log(`✅ Fixed ${fix.description}: ${fix.homeScore}-${fix.awayScore} → 1X2: ${moneylineResult}, O/U 2.5: ${overUnderResult}`);

        } catch (error) {
          console.error(`❌ Failed to fix ${fix.description}:`, error.message);
        }
      }

      console.log('🎉 Incomplete scores fix completed!');

    } catch (error) {
      console.error('❌ Error fixing incomplete scores:', error);
    }
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
}

// Run the fix if this script is executed directly
if (require.main === module) {
  const fixer = new FixIncompleteScores();
  fixer.run()
    .then(() => {
      console.log('✅ Incomplete scores fix completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Incomplete scores fix failed:', error);
      process.exit(1);
    });
}

module.exports = FixIncompleteScores;
