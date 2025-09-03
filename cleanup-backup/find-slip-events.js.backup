#!/usr/bin/env node

/**
 * Find SlipPlaced Events
 * 
 * This script searches for SlipPlaced events in a wider range of blocks
 * to find our placed slips.
 */

const { ethers } = require('ethers');
const config = require('./config');

async function findSlipEvents() {
  console.log('🔍 Searching for SlipPlaced Events...');
  
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const currentBlock = await provider.getBlockNumber();
    console.log(`✅ Current block: ${currentBlock}`);
    
    const oddysseyABI = [
      "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)"
    ];
    
    const oddysseyContract = new ethers.Contract(
      config.blockchain.contractAddresses.oddyssey,
      oddysseyABI,
      provider
    );
    
    // Search in different ranges
    const searchRanges = [
      { name: 'Last 1000 blocks', from: currentBlock - 1000, to: currentBlock },
      { name: 'Last 5000 blocks', from: currentBlock - 5000, to: currentBlock },
      { name: 'Last 10000 blocks', from: currentBlock - 10000, to: currentBlock },
      { name: 'Last 50000 blocks', from: currentBlock - 50000, to: currentBlock },
      { name: 'Last 100000 blocks', from: currentBlock - 100000, to: currentBlock }
    ];
    
    for (const range of searchRanges) {
      console.log(`\n🔍 Searching ${range.name} (${range.from} to ${range.to})...`);
      
      try {
        const events = await oddysseyContract.queryFilter('SlipPlaced', range.from, range.to);
        console.log(`✅ Found ${events.length} SlipPlaced events`);
        
        if (events.length > 0) {
          console.log('\n📝 SlipPlaced Events:');
          events.forEach((event, index) => {
            const { cycleId, player, slipId } = event.args;
            const blockNumber = event.blockNumber;
            console.log(`   ${index + 1}. Block: ${blockNumber}, Cycle: ${cycleId}, Player: ${player}, Slip: ${slipId}`);
          });
          
          // If we found events, we can stop searching
          break;
        }
      } catch (error) {
        console.log(`⚠️ Error searching ${range.name}: ${error.message}`);
      }
    }
    
    // Also check specific blocks where we know we placed slips
    console.log('\n🎯 Checking Specific Blocks...');
    
    // From our previous test, we know we placed slips around these transaction hashes:
    const knownTxHashes = [
      '0x35f176dd514f2b4cd4c45115f420a26494b6740481ff3eaaee5d19029984a822' // From our wagmi-style test
    ];
    
    for (const txHash of knownTxHashes) {
      try {
        console.log(`\n🔍 Checking transaction: ${txHash}`);
        const receipt = await provider.getTransactionReceipt(txHash);
        
        if (receipt) {
          console.log(`✅ Transaction found in block: ${receipt.blockNumber}`);
          console.log(`✅ Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
          console.log(`✅ Logs count: ${receipt.logs.length}`);
          
          // Check if this transaction has SlipPlaced events
          const slipEvents = receipt.logs.filter(log => {
            try {
              const parsed = oddysseyContract.interface.parseLog(log);
              return parsed && parsed.name === 'SlipPlaced';
            } catch {
              return false;
            }
          });
          
          if (slipEvents.length > 0) {
            console.log(`✅ Found ${slipEvents.length} SlipPlaced events in this transaction`);
            slipEvents.forEach((log, index) => {
              const parsed = oddysseyContract.interface.parseLog(log);
              const { cycleId, player, slipId } = parsed.args;
              console.log(`   ${index + 1}. Cycle: ${cycleId}, Player: ${player}, Slip: ${slipId}`);
            });
          } else {
            console.log(`❌ No SlipPlaced events found in this transaction`);
          }
        } else {
          console.log(`❌ Transaction not found`);
        }
      } catch (error) {
        console.log(`❌ Error checking transaction: ${error.message}`);
      }
    }
    
    console.log('\n🎯 SlipPlaced events search completed!');
    
  } catch (error) {
    console.error('❌ Search failed:', error.message);
  }
}

findSlipEvents();
