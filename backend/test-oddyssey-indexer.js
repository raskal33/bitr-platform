#!/usr/bin/env node

/**
 * Test Oddyssey Indexer
 * 
 * This script tests if the Oddyssey indexer can connect and start properly.
 */

const { ethers } = require('ethers');
const config = require('./config');
const db = require('./db/db');

async function testOddysseyIndexer() {
  console.log('🧪 Testing Oddyssey Indexer...');
  
  try {
    // Test 1: Check configuration
    console.log('\n📋 Test 1: Checking Configuration...');
    console.log(`✅ RPC URL: ${config.blockchain.rpcUrl}`);
    console.log(`✅ Oddyssey Address: ${config.blockchain.contractAddresses.oddyssey}`);
    console.log(`✅ Indexer Config:`, config.indexer);
    
    // Test 2: Test provider connection
    console.log('\n🔗 Test 2: Testing Provider Connection...');
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    const currentBlock = await provider.getBlockNumber();
    console.log(`✅ Connected to blockchain. Current block: ${currentBlock}`);
    
    // Test 3: Test database connection
    console.log('\n🗄️ Test 3: Testing Database Connection...');
    const dbResult = await db.query('SELECT NOW() as current_time');
    console.log(`✅ Database connected. Current time: ${dbResult.rows[0].current_time}`);
    
    // Test 4: Test Oddyssey contract connection
    console.log('\n📜 Test 4: Testing Oddyssey Contract Connection...');
    const oddysseyABI = [
      "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)"
    ];
    
    const oddysseyContract = new ethers.Contract(
      config.blockchain.contractAddresses.oddyssey,
      oddysseyABI,
      provider
    );
    
    console.log(`✅ Oddyssey contract initialized: ${config.blockchain.contractAddresses.oddyssey}`);
    
    // Test 5: Check for recent SlipPlaced events
    console.log('\n🔍 Test 5: Checking for Recent SlipPlaced Events...');
    const fromBlock = currentBlock - 1000; // Last 1000 blocks
    const toBlock = currentBlock;
    
    try {
      const events = await oddysseyContract.queryFilter('SlipPlaced', fromBlock, toBlock);
      console.log(`✅ Found ${events.length} SlipPlaced events in last 1000 blocks`);
      
      if (events.length > 0) {
        console.log('\n📝 Recent SlipPlaced Events:');
        events.forEach((event, index) => {
          const { cycleId, player, slipId } = event.args;
          console.log(`   ${index + 1}. Cycle: ${cycleId}, Player: ${player}, Slip: ${slipId}`);
        });
      }
    } catch (error) {
      console.log(`⚠️ Error querying events: ${error.message}`);
    }
    
    // Test 6: Check database tables
    console.log('\n📊 Test 6: Checking Database Tables...');
    try {
      const tablesResult = await db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'oracle' 
        AND table_name LIKE '%oddyssey%'
        ORDER BY table_name
      `);
      
      console.log(`✅ Found ${tablesResult.rows.length} Oddyssey tables in oracle schema:`);
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
      
      // Check if oddyssey_slips table has data
      const slipsResult = await db.query('SELECT COUNT(*) as count FROM oracle.oddyssey_slips');
      console.log(`✅ oddyssey_slips table has ${slipsResult.rows[0].count} records`);
      
    } catch (error) {
      console.log(`❌ Database table check failed: ${error.message}`);
    }
    
    console.log('\n🎯 Oddyssey Indexer test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testOddysseyIndexer();
