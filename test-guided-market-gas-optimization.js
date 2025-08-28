#!/usr/bin/env node

require('dotenv').config();
const { ethers } = require('ethers');
const GuidedMarketService = require('./backend/services/guided-market-service');
const Web3Service = require('./backend/services/web3-service');

async function testGuidedMarketGasOptimization() {
  console.log('🚀 Testing Guided Market Gas Optimization...\n');

  try {
    // Initialize services
    const guidedMarketService = new GuidedMarketService();
    const web3Service = new Web3Service();

    console.log('📋 Initializing services...');
    await guidedMarketService.initialize();
    await web3Service.initialize();

    console.log('✅ Services initialized successfully\n');

    // Test 1: Gas cost analysis for football market
    console.log('🎯 Test 1: Gas Cost Analysis for Football Market');
    console.log('=' .repeat(50));

    const footballPoolData = {
      predictedOutcome: ethers.keccak256(ethers.toUtf8Bytes("home_team_wins")),
      odds: 200, // 2.0x
      creatorStake: 1000n * 10n ** 18n, // 1000 tokens
      eventStartTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      eventEndTime: Math.floor(Date.now() / 1000) + 7200, // 2 hours from now
      league: "Premier League",
      category: "football",
      region: "England",
      isPrivate: false,
      maxBetPerUser: 100n * 10n ** 18n,
      useBitr: false,
      oracleType: 0, // GUIDED
      marketId: ethers.keccak256(ethers.solidityPacked(['uint256'], [12345]))
    };

    const costAnalysis = await guidedMarketService.analyzePoolCreationCost(footballPoolData);
    
    console.log('📊 Gas Cost Analysis Results:');
    console.log(`   Method: ${costAnalysis.method}`);
    console.log(`   Estimated Gas: ${costAnalysis.estimate.toString()}`);
    console.log(`   Gas Limit with Buffer: ${costAnalysis.gasLimit.toString()}`);
    console.log(`   Gas Price: ${ethers.formatUnits(costAnalysis.gasPrice.gasPrice, 'gwei')} gwei`);
    console.log(`   Total Cost: ${ethers.formatEther(costAnalysis.totalCost)} STT`);
    console.log(`   Gas Cost: ${ethers.formatEther(costAnalysis.costBreakdown.gasCost)} STT`);
    console.log(`   Value: ${ethers.formatEther(costAnalysis.costBreakdown.value)} STT`);
    console.log('');

    // Test 2: Gas cost analysis for cryptocurrency market
    console.log('💰 Test 2: Gas Cost Analysis for Cryptocurrency Market');
    console.log('=' .repeat(50));

    const cryptoPoolData = {
      predictedOutcome: ethers.keccak256(ethers.toUtf8Bytes("btc_above_50000")),
      odds: 150, // 1.5x
      creatorStake: 2000n * 10n ** 18n, // 2000 tokens
      eventStartTime: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
      eventEndTime: Math.floor(Date.now() / 1000) + 90000, // 25 hours from now
      league: "Bitcoin",
      category: "cryptocurrency",
      region: "Global",
      isPrivate: false,
      maxBetPerUser: 500n * 10n ** 18n,
      useBitr: true, // Use BITR tokens
      oracleType: 0, // GUIDED
      marketId: ethers.keccak256(ethers.solidityPacked(['string', 'uint256'], ['BTC', 50000]))
    };

    const cryptoCostAnalysis = await guidedMarketService.analyzePoolCreationCost(cryptoPoolData);
    
    console.log('📊 Cryptocurrency Gas Cost Analysis Results:');
    console.log(`   Method: ${cryptoCostAnalysis.method}`);
    console.log(`   Estimated Gas: ${cryptoCostAnalysis.estimate.toString()}`);
    console.log(`   Gas Limit with Buffer: ${cryptoCostAnalysis.gasLimit.toString()}`);
    console.log(`   Gas Price: ${ethers.formatUnits(cryptoCostAnalysis.gasPrice.gasPrice, 'gwei')} gwei`);
    console.log(`   Total Cost: ${ethers.formatEther(cryptoCostAnalysis.totalCost)} STT`);
    console.log(`   Gas Cost: ${ethers.formatEther(cryptoCostAnalysis.costBreakdown.gasCost)} STT`);
    console.log(`   Value: ${ethers.formatEther(cryptoCostAnalysis.costBreakdown.value)} STT`);
    console.log('');

    // Test 3: Gas price recommendations
    console.log('⛽ Test 3: Gas Price Recommendations');
    console.log('=' .repeat(50));

    const recommendations = await web3Service.gasEstimator.getGasPriceRecommendations();
    
    console.log('📊 Gas Price Recommendations:');
    console.log(`   Slow: ${ethers.formatUnits(recommendations.slow.gasPrice, 'gwei')} gwei`);
    console.log(`   Medium: ${ethers.formatUnits(recommendations.medium.gasPrice, 'gwei')} gwei`);
    console.log(`   Fast: ${ethers.formatUnits(recommendations.fast.gasPrice, 'gwei')} gwei`);
    console.log('');

    // Test 4: Balance check
    console.log('💰 Test 4: Balance Check');
    console.log('=' .repeat(50));

    const walletAddress = web3Service.getWalletAddress();
    const balance = await web3Service.getBalance();
    const totalCost = costAnalysis.totalCost;
    
    const balanceCheck = await web3Service.gasEstimator.checkBalance(walletAddress, totalCost);
    
    console.log('📊 Balance Check Results:');
    console.log(`   Wallet Address: ${walletAddress}`);
    console.log(`   Current Balance: ${ethers.formatEther(balance)} STT`);
    console.log(`   Required Cost: ${ethers.formatEther(totalCost)} STT`);
    console.log(`   Has Sufficient Balance: ${balanceCheck.hasSufficientBalance}`);
    if (!balanceCheck.hasSufficientBalance) {
      console.log(`   Shortfall: ${ethers.formatEther(balanceCheck.shortfall)} STT`);
    }
    console.log('');

    // Test 5: Guided Oracle validation
    console.log('🔮 Test 5: Guided Oracle Validation');
    console.log('=' .repeat(50));

    const testMarketId = ethers.keccak256(ethers.solidityPacked(['uint256'], [12345]));
    const oracleValidation = await guidedMarketService.validateGuidedOracle(testMarketId);
    
    console.log('📊 Oracle Validation Results:');
    console.log(`   Market ID: ${testMarketId}`);
    console.log(`   Is Valid: ${oracleValidation.isValid}`);
    console.log(`   Is Set: ${oracleValidation.isSet}`);
    if (oracleValidation.error) {
      console.log(`   Error: ${oracleValidation.error}`);
    }
    console.log('');

    // Test 6: Service health check
    console.log('🏥 Test 6: Service Health Check');
    console.log('=' .repeat(50));

    const health = await guidedMarketService.getHealthStatus();
    
    console.log('📊 Health Status:');
    console.log(`   Status: ${health.status}`);
    console.log(`   Network: ${health.web3Service?.network?.name || 'Unknown'}`);
    console.log(`   Chain ID: ${health.web3Service?.network?.chainId || 'Unknown'}`);
    console.log(`   Block Number: ${health.web3Service?.blockNumber || 'Unknown'}`);
    console.log(`   Wallet Address: ${health.web3Service?.wallet?.address || 'Not configured'}`);
    console.log(`   Wallet Balance: ${health.web3Service?.wallet?.balance || 'Unknown'}`);
    console.log('');

    // Test 7: Predefined gas limits
    console.log('📏 Test 7: Predefined Gas Limits');
    console.log('=' .repeat(50));

    const gasEstimator = web3Service.gasEstimator;
    const functions = ['createPool', 'placeBet', 'addLiquidity', 'settlePool', 'claim'];
    
    console.log('📊 Predefined Gas Limits:');
    for (const func of functions) {
      const limit = gasEstimator.getPredefinedGasLimit(func);
      console.log(`   ${func}: ${limit.toString()}`);
    }
    console.log('');

    console.log('✅ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • Gas estimation working with multiple fallback methods');
    console.log('   • Cost analysis providing detailed breakdowns');
    console.log('   • Balance checking functional');
    console.log('   • Oracle validation integrated');
    console.log('   • Health monitoring operational');
    console.log('   • Predefined gas limits configured');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testGuidedMarketGasOptimization()
    .then(() => {
      console.log('\n🎉 Gas optimization test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testGuidedMarketGasOptimization };
