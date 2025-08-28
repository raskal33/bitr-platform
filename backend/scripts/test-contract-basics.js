#!/usr/bin/env node

/**
 * Test Contract Basics
 * 
 * This script tests basic contract functionality to ensure it's working
 */

const { ethers } = require('ethers');
require('dotenv').config();

async function testContractBasics() {
  console.log('🧪 Testing Contract Basics...');
  
  try {
    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://dream-rpc.somnia.network/');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Wallet: ${wallet.address}`);
    console.log(`BitredictPool Address: ${process.env.BITREDICT_POOL_ADDRESS}`);
    
    // Load contract ABI
    const BitredictPoolABI = require('../../solidity/artifacts/contracts/BitredictPool.sol/BitredictPool.json').abi;
    
    // Initialize contract
    const bitredictPool = new ethers.Contract(process.env.BITREDICT_POOL_ADDRESS, BitredictPoolABI, wallet);
    
    console.log('\n📋 Testing Basic Functions:');
    
    // Test poolCount
    try {
      const poolCount = await bitredictPool.poolCount();
      console.log(`✅ poolCount: ${poolCount}`);
    } catch (e) {
      console.log(`❌ poolCount failed: ${e.message}`);
    }
    
    // Test creationFee
    try {
      const creationFee = await bitredictPool.creationFee();
      console.log(`✅ creationFee: ${ethers.formatEther(creationFee)}`);
    } catch (e) {
      console.log(`❌ creationFee failed: ${e.message}`);
    }
    
    // Test minPoolStake
    try {
      const minPoolStake = await bitredictPool.minPoolStake();
      console.log(`✅ minPoolStake: ${ethers.formatEther(minPoolStake)}`);
    } catch (e) {
      console.log(`❌ minPoolStake failed: ${e.message}`);
    }
    
    // Test bitrToken
    try {
      const bitrToken = await bitredictPool.bitrToken();
      console.log(`✅ bitrToken: ${bitrToken}`);
    } catch (e) {
      console.log(`❌ bitrToken failed: ${e.message}`);
    }
    
    // Test guidedOracle
    try {
      const guidedOracle = await bitredictPool.guidedOracle();
      console.log(`✅ guidedOracle: ${guidedOracle}`);
    } catch (e) {
      console.log(`❌ guidedOracle failed: ${e.message}`);
    }
    
    // Test optimisticOracle
    try {
      const optimisticOracle = await bitredictPool.optimisticOracle();
      console.log(`✅ optimisticOracle: ${optimisticOracle}`);
    } catch (e) {
      console.log(`❌ optimisticOracle failed: ${e.message}`);
    }
    
    // Test if we can call a non-existent function to see if the contract responds
    console.log('\n🔧 Testing Non-existent Function:');
    try {
      await bitredictPool.nonExistentFunction();
      console.log('❌ This should have failed');
    } catch (e) {
      console.log(`✅ Correctly failed: ${e.message}`);
    }
    
    // Test function encoding
    console.log('\n🔧 Testing Function Encoding:');
    try {
      const encodedData = bitredictPool.interface.encodeFunctionData('createPool', [
        ethers.encodeBytes32String("YES"),
        300,
        ethers.parseEther("20"),
        Math.floor(Date.now() / 1000) + 300,
        Math.floor(Date.now() / 1000) + 3600,
        "Test League",
        "football",
        "Test",
        false,
        ethers.parseEther("100"),
        true,
        0,
        ethers.encodeBytes32String("TEST")
      ]);
      
      console.log(`✅ Function encoding successful`);
      console.log(`   Encoded data length: ${encodedData.length}`);
      console.log(`   Function selector: ${encodedData.substring(0, 10)}`);
      
      // Test if we can make a call to the contract with this data
      console.log('\n🔧 Testing Raw Call:');
      try {
        const result = await provider.call({
          to: process.env.BITREDICT_POOL_ADDRESS,
          data: encodedData,
          from: wallet.address
        });
        console.log(`✅ Raw call successful: ${result}`);
      } catch (e) {
        console.log(`❌ Raw call failed: ${e.message}`);
      }
      
    } catch (e) {
      console.log(`❌ Function encoding failed: ${e.message}`);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testContractBasics();
