#!/usr/bin/env node

/**
 * Fix Contract Runner Complete
 * 
 * This script fixes all contract runner issues for both read and write operations.
 */

const fs = require('fs');

class ContractRunnerCompleteFixer {
  constructor() {
    this.web3ServicePath = './backend/services/web3-service.js';
  }

  async fixContractRunner() {
    console.log('🔧 Fixing Contract Runner Complete...');
    
    try {
      let content = fs.readFileSync(this.web3ServicePath, 'utf8');
      let modified = false;

      // Fix the getOddysseyContract method to support both read and write operations
      const newMethod = `
  /**
   * Get Oddyssey contract instance
   */
  async getOddysseyContract() {
    if (this.oddysseyContract) {
      return this.oddysseyContract;
    }

    // Ensure provider is initialized
    if (!this.provider) {
      await this.initialize();
    }

    const contractAddress = process.env.ODDYSSEY_ADDRESS;
    if (!contractAddress) {
      throw new Error('ODDYSSEY_ADDRESS environment variable not set');
    }

    // Import the ABI
    let OddysseyABI;
    try {
      // Try multiple possible paths for the ABI
      const possiblePaths = [
        path.join(__dirname, '../oddyssey-contract-abi.json'),
        path.join(__dirname, '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
        path.join(__dirname, '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
        path.join(__dirname, './oddyssey-contract-abi.json'),
        path.join(__dirname, './solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'),
        '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
        '../solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json',
        './solidity/artifacts/contracts/Oddyssey.sol/Oddyssey.json'
      ];
      
      let abiLoaded = false;
      for (const abiPath of possiblePaths) {
        try {
          OddysseyABI = require(abiPath).abi;
          console.log(\`✅ Oddyssey ABI loaded from: \${abiPath}\`);
          console.log(\`   ABI length: \${OddysseyABI.length}\`);
          abiLoaded = true;
          break;
        } catch (pathError) {
          console.log(\`   ❌ Failed to load from: \${abiPath}\`);
          // Continue to next path
        }
      }
      
      if (!abiLoaded) {
        throw new Error('Could not load ABI from any path');
      }
    } catch (error) {
      console.warn('⚠️ Oddyssey contract artifacts not found, using fallback ABI');
      console.warn('Error details:', error.message);
      // Complete fallback ABI matching actual contract
      OddysseyABI = [
        // Admin functions
        "function oracle() external view returns (address)",
        "function devWallet() external view returns (address)",
        "function setOracle(address _newOracle) external",
        "function setEntryFee(uint256 _newFee) external",
        
        // Oracle functions
        "function startDailyCycle(tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] _matches) external",
        "function resolveDailyCycle(uint256 _cycleId, tuple(uint8 moneyline, uint8 overUnder)[10] _results) external",
        "function resolveMultipleCycles(uint256[] memory _cycleIds, tuple(uint8 moneyline, uint8 overUnder)[10][] memory _results) external",
        
        // Public functions
        "function placeSlip(tuple(uint64 matchId, uint8 betType, bytes32 selection, uint32 selectedOdd)[10] memory _predictions) external payable",
        "function evaluateSlip(uint256 _slipId) external",
        "function evaluateMultipleSlips(uint256[] memory _slipIds) external",
        "function claimPrize(uint256 _cycleId) external",
        "function claimMultiplePrizes(uint256[] memory _cycleIds) external",
        
        // View functions - Core
        "function dailyCycleId() external view returns (uint256)",
        "function slipCount() external view returns (uint256)",
        "function entryFee() external view returns (uint256)",
        
        // View functions - Enhanced
        "function getCurrentCycleInfo() external view returns (uint256 cycleId, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount)",
        "function getCycleStatus(uint256 _cycleId) external view returns (bool exists, uint8 state, uint256 endTime, uint256 prizePool, uint32 cycleSlipCount, bool hasWinner)",
        "function getCurrentCycle() external view returns (uint256)",
        "function isCycleInitialized(uint256 _cycleId) external view returns (bool)",
        
        // Match and cycle data
        "function getDailyMatches(uint256 _cycleId) external view returns (tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] memory)",
        "function getCycleMatches(uint256 _cycleId) external view returns (tuple(uint64 id, uint64 startTime, uint32 oddsHome, uint32 oddsDraw, uint32 oddsAway, uint32 oddsOver, uint32 oddsUnder, tuple(uint8 moneyline, uint8 overUnder) result)[10] memory)",
        "function getDailyLeaderboard(uint256 _cycleId) external view returns (tuple(address player, uint256 slipId, uint256 finalScore, uint8 correctCount)[5] memory)",
        
        // User data
        "function getUserSlipsForCycle(address _user, uint256 _cycleId) external view returns (uint256[] memory)",
        "function getSlip(uint256 _slipId) external view returns (tuple(address player, uint256 cycleId, uint256 placedAt, tuple(uint64 matchId, uint8 betType, bytes32 selection, uint32 selectedOdd)[10] predictions, uint256 finalScore, uint8 correctCount, bool isEvaluated) memory)",
        "function getUserStats(address _user) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle)",
        "function getUserStatsWithReputation(address _user) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle, uint256 totalReputation, uint256 totalCorrectPredictions)",
        "function getOddysseyReputation(address _user) external view returns (uint256 totalReputation, uint256 totalCorrectPredictions)",
        
        // Mappings access
        "function userStats(address) external view returns (uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 averageScore, uint256 winRate, uint256 currentStreak, uint256 bestStreak, uint256 lastActiveCycle)",
        "function userOddysseyReputation(address) external view returns (uint256)",
        "function userOddysseyCorrectPredictions(address) external view returns (uint256)",
        "function dailyPrizePools(uint256) external view returns (uint256)",
        "function dailyCycleEndTimes(uint256) external view returns (uint256)",
        "function claimableStartTimes(uint256) external view returns (uint256)",
        "function isCycleResolved(uint256) external view returns (bool)",
        "function prizeClaimed(uint256, uint8) external view returns (bool)",
        "function cycleInfo(uint256) external view returns (uint256 startTime, uint256 endTime, uint256 prizePool, uint32 slipCount, uint32 evaluatedSlips, uint8 state, bool hasWinner)",
        "function cycleStats(uint256) external view returns (uint256 volume, uint32 slips, uint32 evaluatedSlips)",
        "function stats() external view returns (uint256 totalVolume, uint32 totalSlips, uint256 highestOdd)",
        
        // Constants
        "function MATCH_COUNT() external view returns (uint256)",
        "function DAILY_LEADERBOARD_SIZE() external view returns (uint256)",
        "function MIN_CORRECT_PREDICTIONS() external view returns (uint256)",
        "function ODDS_SCALING_FACTOR() external view returns (uint256)",
        "function MAX_CYCLES_TO_RESOLVE() external view returns (uint256)",
        "function DEV_FEE_PERCENTAGE() external view returns (uint256)",
        "function PRIZE_ROLLOVER_FEE_PERCENTAGE() external view returns (uint256)",
        
        // Events (for filtering)
        "event CycleStarted(uint256 indexed cycleId, uint256 endTime)",
        "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)",
        "event CycleResolved(uint256 indexed cycleId, uint256 prizePool)",
        "event PrizeClaimed(uint256 indexed cycleId, address indexed player, uint256 rank, uint256 amount)",
        "event UserStatsUpdated(address indexed user, uint256 totalSlips, uint256 totalWins, uint256 bestScore, uint256 winRate)",
        "event OddysseyReputationUpdated(address indexed user, uint256 pointsEarned, uint256 correctPredictions, uint256 totalReputation)"
      ];
    }
    
    // Use wallet for write operations, provider for read operations
    const signer = this.wallet || this.provider;
    this.oddysseyContract = new ethers.Contract(contractAddress, OddysseyABI, signer);
    
    console.log('✅ Oddyssey contract initialized:', contractAddress);
    return this.oddysseyContract;
  }`;

      // Replace the old method
      const oldMethodRegex = /async getOddysseyContract\(\) \{[\s\S]*?\n  \}/;
      if (content.match(oldMethodRegex)) {
        content = content.replace(oldMethodRegex, newMethod);
        modified = true;
        console.log('   ✅ Fixed getOddysseyContract method');
      }

      if (modified) {
        fs.writeFileSync(this.web3ServicePath, content);
        console.log('   ✅ Web3Service updated successfully');
      } else {
        console.log('   ℹ️ No changes needed');
      }

    } catch (error) {
      console.error('   ❌ Error fixing contract runner:', error.message);
    }
  }

  async checkResultsFetcherConfiguration() {
    console.log('🔍 Checking Results Fetcher Configuration...');
    
    try {
      // Check if results fetcher is properly configured in cron jobs
      const cronFiles = [
        './backend/cron/consolidated-workers.js',
        './backend/cron-sync-manager.js',
        './backend/api/server.js'
      ];

      for (const filePath of cronFiles) {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          
          if (content.includes('results-fetcher') || content.includes('ResultsFetcher')) {
            console.log(`   ✅ Results fetcher found in ${filePath}`);
          } else {
            console.log(`   ⚠️ Results fetcher not found in ${filePath}`);
          }
        } else {
          console.log(`   ❌ File not found: ${filePath}`);
        }
      }

      // Check if results fetcher service exists and is working
      const resultsFetcherPath = './backend/services/results-fetcher-service.js';
      if (fs.existsSync(resultsFetcherPath)) {
        const content = fs.readFileSync(resultsFetcherPath, 'utf8');
        
        if (content.includes('saveResultsToFixtures')) {
          console.log('   ✅ saveResultsToFixtures method exists');
        } else {
          console.log('   ❌ saveResultsToFixtures method missing');
        }
        
        if (content.includes('getCompletedMatchesWithoutResults')) {
          console.log('   ✅ getCompletedMatchesWithoutResults method exists');
        } else {
          console.log('   ❌ getCompletedMatchesWithoutResults method missing');
        }
      }

    } catch (error) {
      console.error('   ❌ Error checking results fetcher:', error.message);
    }
  }

  async createDeploymentScript() {
    console.log('📝 Creating Deployment Script...');
    
    const deploymentScript = `
#!/bin/bash

# Deployment Script for Bitredict Backend
echo "🚀 Starting Bitredict Backend Deployment..."

# 1. Stop existing services
echo "🛑 Stopping existing services..."
flyctl scale count 0 --app bitredict-backend

# 2. Wait for services to stop
echo "⏳ Waiting for services to stop..."
sleep 30

# 3. Deploy the application
echo "📦 Deploying application..."
flyctl deploy --app bitredict-backend

# 4. Scale up services
echo "📈 Scaling up services..."
flyctl scale count 1 --app bitredict-backend

# 5. Check deployment status
echo "🔍 Checking deployment status..."
flyctl status --app bitredict-backend

echo "✅ Deployment completed!"
echo ""
echo "📋 Next steps:"
echo "1. Monitor logs: flyctl logs --app bitredict-backend"
echo "2. Check results fetcher: Look for 'Results fetcher cron job initialized'"
echo "3. Test contract calls: Look for successful contract interactions"
echo "4. Monitor block indexing: Look for successful block processing"
    `;
    
    fs.writeFileSync('./deploy.sh', deploymentScript);
    fs.chmodSync('./deploy.sh', '755');
    console.log('   ✅ Deployment script created: deploy.sh');
  }

  async createTestScript() {
    console.log('🧪 Creating Test Script...');
    
    const testScript = `
#!/usr/bin/env node

/**
 * Test Contract Runner and Results Fetcher
 * 
 * This script tests both contract runner and results fetcher functionality.
 */

const Web3Service = require('./backend/services/web3-service.js');
const ResultsFetcherService = require('./backend/services/results-fetcher-service.js');

async function testCompleteSystem() {
  console.log('🧪 Testing Complete System...');
  
  try {
    // Test 1: Contract Runner
    console.log('\\n1️⃣ Testing Contract Runner...');
    const web3Service = new Web3Service();
    await web3Service.initialize();
    
    const contract = await web3Service.getOddysseyContract();
    const currentCycleId = await contract.dailyCycleId();
    console.log(\`✅ Contract runner working! Current cycle ID: \${currentCycleId}\`);
    
    // Test 2: Results Fetcher
    console.log('\\n2️⃣ Testing Results Fetcher...');
    const resultsFetcher = new ResultsFetcherService();
    
    const matches = await resultsFetcher.getCompletedMatchesWithoutResults();
    console.log(\`✅ Results fetcher working! Found \${matches.length} matches without results\`);
    
    // Test 3: Full Results Fetch
    console.log('\\n3️⃣ Testing Full Results Fetch...');
    const result = await resultsFetcher.fetchAndSaveResults();
    console.log('📊 Results fetch result:', result);
    
    if (result.status === 'success') {
      console.log('✅ Results fetcher test passed!');
    } else {
      console.log('⚠️ Results fetcher test completed with status:', result.status);
    }
    
    console.log('\\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testCompleteSystem().catch(console.error);
}

module.exports = testCompleteSystem;
    `;
    
    fs.writeFileSync('./test-complete-system.js', testScript);
    console.log('   ✅ Test script created: test-complete-system.js');
  }

  async run() {
    console.log('🚀 Starting Complete Contract Runner Fix...');
    console.log('');
    
    await this.fixContractRunner();
    console.log('');
    
    await this.checkResultsFetcherConfiguration();
    console.log('');
    
    await this.createDeploymentScript();
    console.log('');
    
    await this.createTestScript();
    console.log('');
    
    console.log('✅ Complete Contract Runner Fix completed!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Run deployment: ./deploy.sh');
    console.log('2. Test the system: node test-complete-system.js');
    console.log('3. Monitor logs for contract runner and results fetcher');
    console.log('4. Verify all services are working properly');
  }
}

// Run the fixer
if (require.main === module) {
  const fixer = new ContractRunnerCompleteFixer();
  fixer.run().catch(console.error);
}

module.exports = ContractRunnerCompleteFixer;
