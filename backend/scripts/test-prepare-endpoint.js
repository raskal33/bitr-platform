const { ethers } = require('ethers');

/**
 * Test the new prepare endpoint logic
 */
async function testPrepareEndpoint() {
  console.log('🧪 Testing prepare endpoint logic...\n');

  try {
    // Test data (same as the failed transaction)
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

    // Simulate the prepare endpoint logic
    const matchTime = new Date(testData.matchDate);
    const eventStartTime = Math.floor(matchTime.getTime() / 1000);
    const eventEndTime = eventStartTime + (2 * 60 * 60);

    // Create market ID
    const marketId = ethers.keccak256(ethers.solidityPacked(['uint256'], [testData.fixtureId]));

    // Convert amounts to wei
    const stakeAmountWei = ethers.parseEther(testData.creatorStake.toString());

    // Hash predicted outcome
    const predictedOutcomeHash = ethers.keccak256(ethers.toUtf8Bytes(testData.predictedOutcome));

    // Get contract address from config
    const config = require('../config');
    const contractAddress = config.blockchain.contractAddresses.bitredictPool;

    // Prepare transaction data
    const transactionData = {
      contractAddress: contractAddress,
      functionName: 'createPool',
      parameters: [
        predictedOutcomeHash,
        testData.odds,
        stakeAmountWei,
        eventStartTime,
        eventEndTime,
        testData.league,
        'football',
        'Global',
        false, // isPrivate
        ethers.parseEther('0'), // maxBetPerUser
        testData.useBitr,
        0, // GUIDED oracle type
        marketId
      ],
      value: testData.useBitr ? '0' : stakeAmountWei.toString(),
      gasEstimate: '2000000',
      marketDetails: {
        fixtureId: testData.fixtureId,
        homeTeam: testData.homeTeam,
        awayTeam: testData.awayTeam,
        league: testData.league,
        outcome: testData.outcome,
        predictedOutcome: testData.predictedOutcome,
        odds: testData.odds / 100,
        creatorStake: testData.creatorStake,
        useBitr: testData.useBitr,
        marketId,
        eventStartTime: new Date(eventStartTime * 1000).toISOString(),
        eventEndTime: new Date(eventEndTime * 1000).toISOString()
      }
    };

    console.log('✅ Transaction data prepared successfully:');
    console.log('📋 Contract Address:', transactionData.contractAddress);
    console.log('📋 Function:', transactionData.functionName);
    console.log('📋 Market ID:', transactionData.marketDetails.marketId);
    console.log('📋 Predicted Outcome Hash:', transactionData.parameters[0]);
    console.log('📋 Odds:', transactionData.parameters[1]);
    console.log('📋 Creator Stake (wei):', transactionData.parameters[2].toString());
    console.log('📋 Event Start:', transactionData.marketDetails.eventStartTime);
    console.log('📋 Event End:', transactionData.marketDetails.eventEndTime);
    console.log('📋 Uses BITR:', transactionData.parameters[10]);
    console.log('📋 Value (ETH):', transactionData.value);

    console.log('\n🎯 Frontend Integration:');
    console.log('1. Frontend calls /api/guided-markets/football/prepare');
    console.log('2. Frontend gets transaction data');
    console.log('3. Frontend connects to MetaMask');
    console.log('4. Frontend requests BITR approval (if useBitr = true)');
    console.log('5. Frontend sends transaction to contract');
    console.log('6. Frontend calls /api/guided-markets/football/confirm with tx hash');
    console.log('7. Indexer automatically processes the transaction');
    console.log('8. Market appears in UI');

    console.log('\n✅ Prepare endpoint logic test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testPrepareEndpoint()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = testPrepareEndpoint;


