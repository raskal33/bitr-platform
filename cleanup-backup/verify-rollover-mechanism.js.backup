const { ethers } = require('ethers');
const config = require('./backend/config');

async function verifyRolloverMechanism() {
  console.log('🔍 Verifying Oddyssey rollover mechanism...\n');

  try {
    // Connect to the blockchain
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Load Oddyssey contract ABI and address
    const oddysseyABI = require('./backend/oddyssey-contract-abi.json').abi;
    const oddysseyAddress = config.blockchain.contractAddresses?.oddyssey;
    
    if (!oddysseyAddress) {
      console.error('❌ Oddyssey contract address not configured');
      return;
    }

    const oddysseyContract = new ethers.Contract(oddysseyAddress, oddysseyABI, provider);

    // Get current cycle
    const currentCycle = await oddysseyContract.getCurrentCycle();
    console.log(`📅 Current cycle: ${currentCycle}`);

    // Check prize rollover fee percentage
    const rolloverFeePercentage = await oddysseyContract.PRIZE_ROLLOVER_FEE_PERCENTAGE();
    console.log(`💰 Prize rollover fee percentage: ${rolloverFeePercentage} (${Number(rolloverFeePercentage) / 100}%)`);

    // Check minimum correct predictions required
    const minCorrectPredictions = await oddysseyContract.MIN_CORRECT_PREDICTIONS();
    console.log(`🎯 Minimum correct predictions required: ${minCorrectPredictions}`);

    // Check daily leaderboard size
    const dailyLeaderboardSize = await oddysseyContract.DAILY_LEADERBOARD_SIZE();
    console.log(`🏆 Daily leaderboard size: ${dailyLeaderboardSize}`);

    // Check recent cycles for rollover events
    console.log('\n🔍 Checking recent cycles for rollover events...');
    
    const fromBlock = await provider.getBlockNumber() - 1000; // Last 1k blocks
    const toBlock = await provider.getBlockNumber();
    
    // Query PrizeRollover events
    const rolloverEvents = await oddysseyContract.queryFilter(
      oddysseyContract.filters.PrizeRollover(),
      fromBlock,
      toBlock
    );

    console.log(`📊 Found ${rolloverEvents.length} prize rollover events in last 1k blocks`);

    if (rolloverEvents.length > 0) {
      console.log('\n📋 Rollover events details:');
      for (const event of rolloverEvents) {
        const { fromCycleId, toCycleId, amount } = event.args;
        const block = await event.getBlock();
        
        console.log(`  • Cycle ${fromCycleId} → ${toCycleId}: ${ethers.formatEther(amount)} ETH`);
        console.log(`    Block: ${event.blockNumber}, Time: ${new Date(block.timestamp * 1000)}`);
      }
    } else {
      console.log('⚠️ No rollover events found - this could mean:');
      console.log('  1. All cycles had winners meeting minimum requirements');
      console.log('  2. No cycles have completed yet');
      console.log('  3. Rollover mechanism hasn\'t been triggered');
    }

    // Check recent cycles for completion
    console.log('\n🔍 Checking recent cycles for completion status...');
    
    const cycleResolvedEvents = await oddysseyContract.queryFilter(
      oddysseyContract.filters.CycleResolved(),
      fromBlock,
      toBlock
    );

    console.log(`📊 Found ${cycleResolvedEvents.length} cycle resolved events in last 1k blocks`);

    if (cycleResolvedEvents.length > 0) {
      console.log('\n📋 Recent cycle resolutions:');
      for (const event of cycleResolvedEvents.slice(-5)) { // Last 5 events
        const { cycleId, prizePool } = event.args;
        const block = await event.getBlock();
        
        console.log(`  • Cycle ${cycleId}: Prize pool ${ethers.formatEther(prizePool)} ETH`);
        console.log(`    Block: ${event.blockNumber}, Time: ${new Date(block.timestamp * 1000)}`);
        
        // Check if this cycle had any winners
        try {
          const leaderboard = await oddysseyContract.getDailyLeaderboard(cycleId);
          const topWinner = leaderboard[0];
          
          if (topWinner.player !== ethers.ZeroAddress) {
            console.log(`    🏆 Top winner: ${topWinner.player} with ${topWinner.correctCount} correct predictions`);
            
            if (topWinner.correctCount >= minCorrectPredictions) {
              console.log(`    ✅ Cycle ${cycleId} had qualifying winners - no rollover needed`);
            } else {
              console.log(`    ❌ Cycle ${cycleId} had no qualifying winners - should have rolled over`);
            }
          } else {
            console.log(`    ❌ Cycle ${cycleId} had no participants`);
          }
        } catch (error) {
          console.log(`    ⚠️ Could not check leaderboard for cycle ${cycleId}: ${error.message}`);
        }
      }
    }

    // Check current prize pool
    console.log('\n💰 Checking current prize pool...');
    try {
      const currentPrizePool = await oddysseyContract.dailyPrizePools(currentCycle);
      console.log(`Current prize pool: ${ethers.formatEther(currentPrizePool)} ETH`);
    } catch (error) {
      console.log(`Could not get current prize pool: ${error.message}`);
    }

    // Check if any cycles are ready for rollover
    console.log('\n🔍 Checking if any cycles are ready for rollover...');
    
    for (let cycle = Math.max(1, Number(currentCycle) - 5); cycle < Number(currentCycle); cycle++) {
      try {
        const leaderboard = await oddysseyContract.getDailyLeaderboard(cycle);
        const topWinner = leaderboard[0];
        
        if (topWinner.player === ethers.ZeroAddress || topWinner.correctCount < minCorrectPredictions) {
          console.log(`⚠️ Cycle ${cycle} may need rollover: No qualifying winners`);
          
          // Check if prize pool exists for this cycle
          try {
            const prizePool = await oddysseyContract.dailyPrizePools(cycle);
            if (prizePool > 0) {
              console.log(`  💰 Cycle ${cycle} has prize pool: ${ethers.formatEther(prizePool)} ETH`);
              console.log(`  🔄 This should roll over to cycle ${cycle + 1}`);
            }
          } catch (error) {
            console.log(`  ⚠️ Could not check prize pool for cycle ${cycle}: ${error.message}`);
          }
        }
      } catch (error) {
        console.log(`⚠️ Could not check cycle ${cycle}: ${error.message}`);
      }
    }

    console.log('\n✅ Rollover mechanism verification complete!');

  } catch (error) {
    console.error('❌ Error verifying rollover mechanism:', error);
  }
}

// Run the verification
verifyRolloverMechanism().catch(console.error);
