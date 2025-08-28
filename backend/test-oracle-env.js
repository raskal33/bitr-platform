#!/usr/bin/env node

/**
 * Test Oracle Environment Variables
 * 
 * This script tests if the Oracle environment variables are being loaded correctly.
 */

require('dotenv').config();

console.log('🔍 Testing Oracle Environment Variables...');

// Check Oracle private keys
console.log('\n📋 Oracle Private Keys:');
console.log(`ORACLE_SIGNER_PRIVATE_KEY: ${process.env.ORACLE_SIGNER_PRIVATE_KEY ? 'SET' : 'NOT SET'}`);
console.log(`ORACLE_PRIVATE_KEY: ${process.env.ORACLE_PRIVATE_KEY ? 'SET' : 'NOT SET'}`);

// Check other important environment variables
console.log('\n📋 Other Important Variables:');
console.log(`PRIVATE_KEY: ${process.env.PRIVATE_KEY ? 'SET' : 'NOT SET'}`);
console.log(`BOT_PRIVATE_KEY: ${process.env.BOT_PRIVATE_KEY ? 'SET' : 'NOT SET'}`);
console.log(`ODDYSSEY_ADDRESS: ${process.env.ODDYSSEY_ADDRESS ? 'SET' : 'NOT SET'}`);
console.log(`RPC_URL: ${process.env.RPC_URL ? 'SET' : 'NOT SET'}`);

// Test the Oracle Cron Job check
console.log('\n🔍 Oracle Cron Job Check:');
if (!process.env.ORACLE_SIGNER_PRIVATE_KEY) {
  console.log('❌ Oracle private key not configured, Oracle Cron Job will not start');
} else {
  console.log('✅ Oracle private key configured, Oracle Cron Job will run as scheduled');
}

console.log('\n🎯 Environment test completed!');
