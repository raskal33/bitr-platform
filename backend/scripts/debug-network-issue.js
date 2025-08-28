#!/usr/bin/env node

/**
 * Debug Network Issue
 * 
 * This script investigates the network issue causing contradictory results
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function debugNetworkIssue() {
  console.log('🔍 Debugging Network Issue...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    console.log(`RPC URL: ${process.env.RPC_URL || 'https://dream-rpc.somnia.network/'}`);
    
    // Test network connectivity
    console.log('\n🌐 Network Connectivity Test:');
    
    try {
      const blockNumber = await provider.getBlockNumber();
      console.log(`✅ Current block: ${blockNumber}`);
      
      const balance = await provider.getBalance(wallet.address);
      console.log(`✅ Wallet balance: ${ethers.formatEther(balance)} STT`);
      
    } catch (e) {
      console.log(`❌ Network connectivity issue: ${e.message}`);
      return;
    }
    
    // Load contract ABIs
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    const BitrTokenABI = require('../../solidity/artifacts/contracts/BitredictToken.sol/BitredictToken.json').abi;
    
    // Initialize contracts
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, BitredictPoolABI, wallet);
    const bitrToken = new ethers.Contract(process.env.BITR_TOKEN_ADDRESS, BitrTokenABI, wallet);
    
    console.log('\n📊 Contract State Analysis:');
    
    // Check pool count
    let poolCount;
    try {
      poolCount = await bitredictPool.poolCount();
      console.log(`Pool Count: ${poolCount}`);
    } catch (e) {
      console.log(`❌ Error reading pool count: ${e.message}`);
      return;
    }
    
    // Check if pools actually exist by trying to read them
    console.log('\n🔍 Pool Data Reading Test:');
    
    for (let i = 0; i < Number(poolCount); i++) {
      console.log(`\nTesting Pool ${i}:`);
      
      try {
        // Try to read the pool data
        const pool = await bitredictPool.pools(i);
        
        // Test each field individually to see which one causes the BigInt error
        console.log(`  ✅ Pool ${i} exists`);
        
        try {
          console.log(`    Creator: ${pool.creator}`);
        } catch (e) {
          console.log(`    ❌ Creator error: ${e.message}`);
        }
        
        try {
          console.log(`    Predicted Outcome: ${ethers.decodeBytes32String(pool.predictedOutcome)}`);
        } catch (e) {
          console.log(`    ❌ Predicted Outcome error: ${e.message}`);
        }
        
        try {
          console.log(`    Odds: ${pool.odds}`);
        } catch (e) {
          console.log(`    ❌ Odds error: ${e.message}`);
        }
        
        try {
          console.log(`    Creator Stake: ${pool.creatorStake}`);
        } catch (e) {
          console.log(`    ❌ Creator Stake error: ${e.message}`);
        }
        
        try {
          console.log(`    Event Start Time: ${pool.eventStartTime}`);
        } catch (e) {
          console.log(`    ❌ Event Start Time error: ${e.message}`);
        }
        
        try {
          console.log(`    Event End Time: ${pool.eventEndTime}`);
        } catch (e) {
          console.log(`    ❌ Event End Time error: ${e.message}`);
        }
        
        try {
          console.log(`    League: ${pool.league}`);
        } catch (e) {
          console.log(`    ❌ League error: ${e.message}`);
        }
        
        try {
          console.log(`    Category: ${pool.category}`);
        } catch (e) {
          console.log(`    ❌ Category error: ${e.message}`);
        }
        
        try {
          console.log(`    Region: ${pool.region}`);
        } catch (e) {
          console.log(`    ❌ Region error: ${e.message}`);
        }
        
        try {
          console.log(`    Is Private: ${pool.isPrivate}`);
        } catch (e) {
          console.log(`    ❌ Is Private error: ${e.message}`);
        }
        
        try {
          console.log(`    Uses BITR: ${pool.usesBitr}`);
        } catch (e) {
          console.log(`    ❌ Uses BITR error: ${e.message}`);
        }
        
        try {
          console.log(`    Oracle Type: ${pool.oracleType}`);
        } catch (e) {
          console.log(`    ❌ Oracle Type error: ${e.message}`);
        }
        
        try {
          console.log(`    Market ID: ${ethers.decodeBytes32String(pool.marketId)}`);
        } catch (e) {
          console.log(`    ❌ Market ID error: ${e.message}`);
        }
        
        try {
          console.log(`    Settled: ${pool.settled}`);
        } catch (e) {
          console.log(`    ❌ Settled error: ${e.message}`);
        }
        
        try {
          console.log(`    Creator Side Won: ${pool.creatorSideWon}`);
        } catch (e) {
          console.log(`    ❌ Creator Side Won error: ${e.message}`);
        }
        
      } catch (e) {
        console.log(`  ❌ Error reading pool ${i}: ${e.message}`);
      }
    }
    
    // Test recent transactions
    console.log('\n📋 Recent Transaction Analysis:');
    
    try {
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = currentBlock - 10; // Check last 10 blocks
      
      console.log(`Checking blocks ${fromBlock} to ${currentBlock}...`);
      
      for (let blockNum = fromBlock; blockNum <= currentBlock; blockNum++) {
        try {
          const block = await provider.getBlock(blockNum, true);
          
          if (block && block.transactions) {
            const relevantTxs = block.transactions.filter(tx => 
              tx.to && tx.to.toLowerCase() === process.env.BITREDICT_POOL_ADDRESS.toLowerCase()
            );
            
            if (relevantTxs.length > 0) {
              console.log(`\nBlock ${blockNum}:`);
              for (const tx of relevantTxs) {
                console.log(`  TX: ${tx.hash}`);
                console.log(`  From: ${tx.from}`);
                console.log(`  To: ${tx.to}`);
                console.log(`  Status: ${tx.status === 1 ? 'Success' : 'Failed'}`);
                console.log(`  Gas Used: ${tx.gasUsed?.toString() || 'Unknown'}`);
              }
            }
          }
        } catch (e) {
          console.log(`  Error reading block ${blockNum}: ${e.message}`);
        }
      }
      
    } catch (e) {
      console.log(`❌ Error analyzing transactions: ${e.message}`);
    }
    
    // Test if the issue is with the specific transaction
    console.log('\n🔧 Testing Specific Transaction:');
    
    const testTxHash = "0x80c2cee048dd69c405857d3cc97e387e1508282225907f64735ba4d7ad3b4912";
    
    try {
      const receipt = await provider.getTransactionReceipt(testTxHash);
      
      if (receipt) {
        console.log(`Transaction: ${testTxHash}`);
        console.log(`Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
        console.log(`Block: ${receipt.blockNumber}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
        console.log(`Logs: ${receipt.logs.length}`);
        
        // Check if PoolCreated event was emitted
        const poolCreatedEvents = receipt.logs.filter(log => {
          try {
            const parsed = bitredictPool.interface.parseLog(log);
            return parsed.name === 'PoolCreated';
          } catch (e) {
            return false;
          }
        });
        
        console.log(`PoolCreated events: ${poolCreatedEvents.length}`);
        
        for (const event of poolCreatedEvents) {
          try {
            const parsed = bitredictPool.interface.parseLog(event);
            console.log(`  Pool ID: ${parsed.args.poolId}`);
            console.log(`  Creator: ${parsed.args.creator}`);
            console.log(`  Oracle Type: ${parsed.args.oracleType}`);
          } catch (e) {
            console.log(`  Error parsing event: ${e.message}`);
          }
        }
        
      } else {
        console.log(`Transaction not found: ${testTxHash}`);
      }
      
    } catch (e) {
      console.log(`❌ Error checking transaction: ${e.message}`);
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugNetworkIssue();
