const express = require('express');
const app = express();

app.use(express.json());

// Load the guided markets router
const guidedMarketsRouter = require('../api/guided-markets');
app.use('/api/guided-markets', guidedMarketsRouter);

const server = app.listen(3001, () => {
  console.log('✅ Test server running on port 3001');
  
  // Test the prepare endpoint
  const testData = {
    fixtureId: '19539274',
    homeTeam: 'Kairat',
    awayTeam: 'Celtic',
    league: 'Champions League',
    matchDate: '2025-08-26T16:45:00.000Z',
    outcome: 'away_win',
    predictedOutcome: 'away wins and you win',
    odds: 180,
    creatorStake: 1000,
    useBitr: true
  };

  const request = require('http').request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/guided-markets/football/prepare',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (result.success) {
          console.log('✅ Prepare endpoint working!');
          console.log('Contract Address:', result.data?.contractAddress);
          console.log('Function:', result.data?.functionName);
          console.log('Market ID:', result.data?.marketDetails?.marketId);
        } else {
          console.log('❌ Prepare endpoint error:', result.error);
        }
      } catch (error) {
        console.log('❌ Parse error:', error.message);
        console.log('Raw response:', data);
      }
      server.close();
      process.exit(0);
    });
  });

  request.on('error', (err) => {
    console.error('❌ Request error:', err);
    server.close();
    process.exit(1);
  });

  request.write(JSON.stringify(testData));
  request.end();
});


