const axios = require('axios');

const SPORTMONKS_API_TOKEN = 'kEVE9kajA1hKVo4t6RsIEOgPUb0yUgtOmoqGpXztl5Lt75ePxFIqIaDXBDFc';
const API_BASE_URL = 'https://api.sportmonks.com/v3/football';

async function debugCycle4Matches() {
  console.log('🔍 Debugging Cycle 4 missing matches...\n');

  // The 2 missing matches from cycle 4
  const fixtureIds = ['19539274', '19426528']; // Kairat vs Celtic, Eintracht Braunschweig vs VfB Stuttgart

  for (const fixtureId of fixtureIds) {
    console.log(`📊 Debugging fixture ${fixtureId}...`);
    
    try {
      const response = await axios.get(`${API_BASE_URL}/fixtures/${fixtureId}`, {
        params: {
          'api_token': SPORTMONKS_API_TOKEN,
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

      // Check if match is finished
      const isFinished = ['FT', 'AET', 'PEN'].includes(fixture.state?.state);
      console.log(`   ✅ Match finished: ${isFinished}`);

      // Try to find 90-minute score
      const fullTimeScore = fixture.scores?.find(s => 
        s.description === 'FT' || s.description === 'FULLTIME'
      );
      
      if (fullTimeScore) {
        console.log(`   🎯 Found 90-minute score: ${fullTimeScore.description} - ${JSON.stringify(fullTimeScore.score)}`);
      } else {
        console.log(`   ⚠️ No 90-minute score found`);
        
        // Check if we can use CURRENT score for FT matches
        if (fixture.state?.state === 'FT') {
          const currentScore = fixture.scores?.find(s => s.description === 'CURRENT');
          if (currentScore) {
            console.log(`   🔄 Using CURRENT score for FT match: ${JSON.stringify(currentScore.score)}`);
          }
        }
      }

    } catch (error) {
      console.log(`   ❌ Error fetching fixture ${fixtureId}: ${error.message}`);
    }
    
    console.log('');
  }
}

// Run the debug
debugCycle4Matches().catch(console.error);
