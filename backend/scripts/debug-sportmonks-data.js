const SportMonksService = require('../services/sportmonks');

/**
 * Debug SportMonks Data Script
 * 
 * This script helps debug what data is being returned from SportMonks API
 * for the problematic fixtures.
 */
class DebugSportMonksData {
  constructor() {
    this.sportmonksService = new SportMonksService();
  }

  async run() {
    console.log('🔍 Debugging SportMonks API data...');
    
    try {
      // Test with a few problematic fixture IDs
      const fixtureIds = [
        '19427470', // Everton vs Brighton
        '19433480', // FSV Mainz 05 vs FC Köln
        '19424883', // Como vs Lazio
        '19424886', // Juventus vs Parma
        '19433782'  // LOSC Lille vs Monaco
      ];

      for (const fixtureId of fixtureIds) {
        console.log(`\n📊 Debugging fixture ${fixtureId}...`);
        
        try {
          const response = await this.sportmonksService.axios.get(`/fixtures/${fixtureId}`, {
            params: {
              'api_token': this.sportmonksService.apiToken,
              'include': 'scores;participants;state;league'
            }
          });

          const fixture = response.data.data;
          if (!fixture) {
            console.log(`   ❌ No fixture data received`);
            continue;
          }

          console.log(`   📅 Match: ${fixture.participants?.[0]?.name || 'Unknown'} vs ${fixture.participants?.[1]?.name || 'Unknown'}`);
          console.log(`   🏟️ League: ${fixture.league?.name || 'Unknown'}`);
          console.log(`   📊 Status: ${fixture.state?.state || 'Unknown'}`);
          console.log(`   🕐 Time: ${fixture.time?.starting_at?.date || 'Unknown'}`);
          
          if (fixture.scores && fixture.scores.length > 0) {
            console.log(`   📈 Scores:`);
            fixture.scores.forEach((score, index) => {
              console.log(`      ${index + 1}. ${score.description}: ${JSON.stringify(score.score)} (participant: ${score.participant_id})`);
            });
          } else {
            console.log(`   ❌ No scores available`);
          }

          // Try to parse the score like the service does
          const fullTimeScore = fixture.scores?.find(s => 
            s.description === 'FT' || s.description === 'FULLTIME'
          );
          
          if (!fullTimeScore && fixture.state?.state === 'FT') {
            const currentScore = fixture.scores?.find(s => s.description === 'CURRENT');
            console.log(`   ⚠️ No FT score found, using CURRENT: ${currentScore ? JSON.stringify(currentScore.score) : 'None'}`);
          }

        } catch (error) {
          console.log(`   ❌ Error fetching fixture ${fixtureId}: ${error.message}`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error('❌ Error debugging SportMonks data:', error);
    }
  }
}

// Run the debug if this script is executed directly
if (require.main === module) {
  const debuggerInstance = new DebugSportMonksData();
  debuggerInstance.run()
    .then(() => {
      console.log('\n✅ Debug completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Debug failed:', error);
      process.exit(1);
    });
}

module.exports = DebugSportMonksData;
