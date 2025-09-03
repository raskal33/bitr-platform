const { ethers } = require('ethers');
const config = require('./backend/config');

async function checkPoolLifecycle() {
  console.log('🔍 Checking BitredictPool lifecycle and refund mechanisms...\n');

  try {
    // Connect to the blockchain
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Load BitredictPool contract ABI and address
    const poolABI = require('./solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    const poolAddress = config.blockchain.contractAddresses?.bitredictPool;
    
    if (!poolAddress) {
      console.error('❌ BitredictPool contract address not configured');
      return;
    }

    const poolContract = new ethers.Contract(poolAddress, poolABI, provider);

    // Get pool count
    const poolCount = await poolContract.poolCount();
    console.log(`📊 Total pools created: ${poolCount}`);

    // Check recent pool refund events
    console.log('\n🔍 Checking recent pool refund events...');
    
    const fromBlock = await provider.getBlockNumber() - 1000; // Last 1k blocks
    const toBlock = await provider.getBlockNumber();
    
    // Query PoolRefunded events
    const refundEvents = await poolContract.queryFilter(
      poolContract.filters.PoolRefunded(),
      fromBlock,
      toBlock
    );

    console.log(`📊 Found ${refundEvents.length} pool refund events in last 1k blocks`);

    if (refundEvents.length > 0) {
      console.log('\n📋 Pool refund events details:');
      for (const event of refundEvents) {
        const { poolId, reason } = event.args;
        const block = await event.getBlock();
        
        console.log(`  • Pool ${poolId}: ${reason}`);
        console.log(`    Block: ${event.blockNumber}, Time: ${new Date(block.timestamp * 1000)}`);
        
        // Get pool details
        try {
          const pool = await poolContract.pools(poolId);
          console.log(`    Creator: ${pool.creator}`);
          console.log(`    Creator stake: ${ethers.formatEther(pool.creatorStake)} tokens`);
          console.log(`    Total bettor stake: ${ethers.formatEther(pool.totalBettorStake)} tokens`);
          console.log(`    Event start: ${new Date(pool.eventStartTime.toNumber() * 1000)}`);
          console.log(`    Event end: ${new Date(pool.eventEndTime.toNumber() * 1000)}`);
          console.log(`    Settled: ${pool.settled}`);
        } catch (error) {
          console.log(`    ⚠️ Could not get pool details: ${error.message}`);
        }
      }
    } else {
      console.log('⚠️ No pool refund events found - this could mean:');
      console.log('  1. All pools received bets');
      console.log('  2. No pools have reached arbitration timeout');
      console.log('  3. Refund mechanism hasn\'t been triggered');
    }

    // Check recent pool creation events
    console.log('\n🔍 Checking recent pool creation events...');
    
    const creationEvents = await poolContract.queryFilter(
      poolContract.filters.PoolCreated(),
      fromBlock,
      toBlock
    );

    console.log(`📊 Found ${creationEvents.length} pool creation events in last 1k blocks`);

    if (creationEvents.length > 0) {
      console.log('\n📋 Recent pool creations:');
      for (const event of creationEvents.slice(-5)) { // Last 5 events
        const { poolId, creator, eventStartTime, eventEndTime, oracleType, marketId } = event.args;
        const block = await event.getBlock();
        
        console.log(`  • Pool ${poolId} by ${creator}`);
        console.log(`    Event: ${new Date(eventStartTime.toNumber() * 1000)} to ${new Date(eventEndTime.toNumber() * 1000)}`);
        console.log(`    Oracle type: ${oracleType === 0 ? 'GUIDED' : 'OPEN'}`);
        console.log(`    Market ID: ${marketId}`);
        console.log(`    Block: ${event.blockNumber}, Time: ${new Date(block.timestamp * 1000)}`);
        
        // Check if this pool has received any bets
        try {
          const pool = await poolContract.pools(poolId);
          const bettors = await poolContract.poolBettors(poolId);
          
          console.log(`    Creator stake: ${ethers.formatEther(pool.creatorStake)} tokens`);
          console.log(`    Total bettor stake: ${ethers.formatEther(pool.totalBettorStake)} tokens`);
          console.log(`    Bettors count: ${bettors.length}`);
          
          if (Number(pool.totalBettorStake) === 0) {
            console.log(`    ⚠️ Pool ${poolId} has no bets - may be eligible for refund`);
            
            // Check if event has ended
                      const now = Math.floor(Date.now() / 1000);
          if (now > Number(pool.eventEndTime)) {
            console.log(`    ✅ Event has ended - pool can be refunded`);
            
            // Check if arbitration period has passed
            const arbitrationDeadline = Number(pool.eventEndTime) + (24 * 60 * 60); // 24 hours
              if (now > arbitrationDeadline) {
                console.log(`    ✅ Arbitration period has passed - pool can be refunded via refundPool()`);
              } else {
                console.log(`    ⏳ Arbitration period ends: ${new Date(arbitrationDeadline * 1000)}`);
              }
                      } else {
            console.log(`    ⏳ Event ends: ${new Date(Number(pool.eventEndTime) * 1000)}`);
          }
          }
        } catch (error) {
          console.log(`    ⚠️ Could not get pool details: ${error.message}`);
        }
      }
    }

    // Check for pools that might need refunding
    console.log('\n🔍 Checking for pools that might need refunding...');
    
    const recentPools = Math.min(10, Number(poolCount)); // Check last 10 pools
    
    for (let i = Math.max(0, Number(poolCount) - recentPools); i < Number(poolCount); i++) {
      try {
        const pool = await poolContract.pools(i);
        
        if (Number(pool.totalBettorStake) === 0 && !pool.settled) {
          console.log(`⚠️ Pool ${i} has no bets and is not settled`);
          console.log(`  Creator: ${pool.creator}`);
          console.log(`  Creator stake: ${ethers.formatEther(pool.creatorStake)} tokens`);
          console.log(`  Event end: ${new Date(Number(pool.eventEndTime) * 1000)}`);
          
          const now = Math.floor(Date.now() / 1000);
          const arbitrationDeadline = Number(pool.eventEndTime) + (24 * 60 * 60);
          
          if (now > Number(pool.eventEndTime)) {
            if (now > arbitrationDeadline) {
              console.log(`  ✅ Ready for refund via refundPool()`);
            } else {
              console.log(`  ⏳ Waiting for arbitration period to end`);
            }
          } else {
            console.log(`  ⏳ Event hasn't ended yet`);
          }
        }
      } catch (error) {
        console.log(`⚠️ Could not check pool ${i}: ${error.message}`);
      }
    }

    // Check combo pool refunds
    console.log('\n🔍 Checking combo pool refunds...');
    
    const comboRefundEvents = await poolContract.queryFilter(
      poolContract.filters.ComboPoolSettled(),
      fromBlock,
      toBlock
    );

    console.log(`📊 Found ${comboRefundEvents.length} combo pool settlement events in last 1k blocks`);

    if (comboRefundEvents.length > 0) {
      console.log('\n📋 Combo pool settlements:');
      for (const event of comboRefundEvents) {
        const { comboPoolId, creatorSideWon, timestamp } = event.args;
        const block = await event.getBlock();
        
        console.log(`  • Combo Pool ${comboPoolId}: Creator side ${creatorSideWon ? 'won' : 'lost'}`);
        console.log(`    Block: ${event.blockNumber}, Time: ${new Date(block.timestamp * 1000)}`);
      }
    }

    console.log('\n✅ Pool lifecycle check complete!');

  } catch (error) {
    console.error('❌ Error checking pool lifecycle:', error);
  }
}

// Run the check
checkPoolLifecycle().catch(console.error);
