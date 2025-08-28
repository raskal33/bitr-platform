#!/usr/bin/env node

/**
 * Fix Indexer Block Size Issues
 * 
 * This script fixes the "block range too large" issues in the indexers
 * and checks the results fetcher configuration.
 */

const fs = require('fs');
const path = require('path');

class IndexerBlockSizeFixer {
  constructor() {
    this.indexerFiles = [
      './backend/indexer.js',
      './backend/indexer_oddyssey.js',
      './backend/services/pool-settlement-service.js'
    ];
  }

  async fixBlockSizeIssues() {
    console.log('🔧 Fixing Indexer Block Size Issues...');
    
    for (const filePath of this.indexerFiles) {
      await this.fixFile(filePath);
    }
  }

  async fixFile(filePath) {
    try {
      console.log(`📝 Fixing ${filePath}...`);
      
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;

      // Fix block range checks - reduce from 50 to 20 blocks
      if (content.includes('toBlock - fromBlock > 50')) {
        content = content.replace(/toBlock - fromBlock > 50/g, 'toBlock - fromBlock > 20');
        modified = true;
        console.log(`   ✅ Fixed block range check (50 → 20)`);
      }

      // Fix chunk size - reduce from 10 to 5 blocks
      if (content.includes('const chunkSize = 10')) {
        content = content.replace(/const chunkSize = 10/g, 'const chunkSize = 5');
        modified = true;
        console.log(`   ✅ Fixed chunk size (10 → 5)`);
      }

      // Fix batch size in config references
      if (content.includes('batchSize = 100')) {
        content = content.replace(/batchSize = 100/g, 'batchSize = 20');
        modified = true;
        console.log(`   ✅ Fixed batch size (100 → 20)`);
      }

      // Fix historical processing chunk size
      if (content.includes('const chunkSize = 500')) {
        content = content.replace(/const chunkSize = 500/g, 'const chunkSize = 100');
        modified = true;
        console.log(`   ✅ Fixed historical chunk size (500 → 100)`);
      }

      if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`   ✅ File updated successfully`);
      } else {
        console.log(`   ℹ️ No changes needed`);
      }

    } catch (error) {
      console.error(`   ❌ Error fixing ${filePath}:`, error.message);
    }
  }

  async updateConfigFile() {
    console.log('📝 Updating config.js...');
    
    try {
      const configPath = './backend/config.js';
      let content = fs.readFileSync(configPath, 'utf8');
      let modified = false;

      // Update batch size from 10 to 5
      if (content.includes('batchSize: process.env.BATCH_SIZE || 10')) {
        content = content.replace(
          'batchSize: process.env.BATCH_SIZE || 10',
          'batchSize: process.env.BATCH_SIZE || 5'
        );
        modified = true;
        console.log('   ✅ Updated batch size (10 → 5)');
      }

      // Update poll interval for faster processing
      if (content.includes('pollInterval: process.env.POLL_INTERVAL || 2000')) {
        content = content.replace(
          'pollInterval: process.env.POLL_INTERVAL || 2000',
          'pollInterval: process.env.POLL_INTERVAL || 1000'
        );
        modified = true;
        console.log('   ✅ Updated poll interval (2000ms → 1000ms)');
      }

      if (modified) {
        fs.writeFileSync(configPath, content);
        console.log('   ✅ Config file updated successfully');
      } else {
        console.log('   ℹ️ No config changes needed');
      }

    } catch (error) {
      console.error('   ❌ Error updating config:', error.message);
    }
  }

  async checkResultsFetcher() {
    console.log('🔍 Checking Results Fetcher Configuration...');
    
    try {
      // Check if results fetcher service exists
      const resultsFetcherPath = './backend/services/results-fetcher-service.js';
      if (fs.existsSync(resultsFetcherPath)) {
        console.log('   ✅ Results fetcher service exists');
        
        const content = fs.readFileSync(resultsFetcherPath, 'utf8');
        
        // Check for key methods
        if (content.includes('fetchAndSaveResults')) {
          console.log('   ✅ fetchAndSaveResults method found');
        } else {
          console.log('   ❌ fetchAndSaveResults method missing');
        }
        
        if (content.includes('getCompletedMatchesWithoutResults')) {
          console.log('   ✅ getCompletedMatchesWithoutResults method found');
        } else {
          console.log('   ❌ getCompletedMatchesWithoutResults method missing');
        }
        
      } else {
        console.log('   ❌ Results fetcher service not found');
      }

      // Check cron job configuration
      const cronPath = './backend/cron/results-fetcher-cron.js';
      if (fs.existsSync(cronPath)) {
        console.log('   ✅ Results fetcher cron job exists');
        
        const content = fs.readFileSync(cronPath, 'utf8');
        
        // Check scheduling
        if (content.includes("'15 * * * *'")) {
          console.log('   ✅ Hourly cron job scheduled (minute 15)');
        }
        
        if (content.includes("'*/30 * * * *'")) {
          console.log('   ✅ 30-minute cron job scheduled');
        }
        
      } else {
        console.log('   ❌ Results fetcher cron job not found');
      }

    } catch (error) {
      console.error('   ❌ Error checking results fetcher:', error.message);
    }
  }

  async createTestResultsFetcher() {
    console.log('🧪 Creating Test Results Fetcher...');
    
    const testScript = `
#!/usr/bin/env node

/**
 * Test Results Fetcher
 * 
 * This script tests the results fetcher functionality.
 */

const ResultsFetcherService = require('./backend/services/results-fetcher-service');

async function testResultsFetcher() {
  console.log('🧪 Testing Results Fetcher...');
  
  try {
    const resultsFetcher = new ResultsFetcherService();
    
    console.log('1️⃣ Testing fetchAndSaveResults...');
    const result = await resultsFetcher.fetchAndSaveResults();
    
    console.log('📊 Results:', result);
    
    if (result.status === 'success') {
      console.log('✅ Results fetcher test passed!');
    } else {
      console.log('⚠️ Results fetcher test completed with status:', result.status);
    }
    
  } catch (error) {
    console.error('❌ Results fetcher test failed:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testResultsFetcher().catch(console.error);
}

module.exports = testResultsFetcher;
    `;
    
    fs.writeFileSync('./test-results-fetcher.js', testScript);
    console.log('   ✅ Test script created: test-results-fetcher.js');
  }

  async run() {
    console.log('🚀 Starting Indexer Block Size Fix...');
    console.log('');
    
    await this.fixBlockSizeIssues();
    console.log('');
    
    await this.updateConfigFile();
    console.log('');
    
    await this.checkResultsFetcher();
    console.log('');
    
    await this.createTestResultsFetcher();
    console.log('');
    
    console.log('✅ Indexer Block Size Fix completed!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Restart the indexer services');
    console.log('2. Monitor logs for block range issues');
    console.log('3. Test results fetcher: node test-results-fetcher.js');
    console.log('4. Check if results are being fetched properly');
  }
}

// Run the fixer
if (require.main === module) {
  const fixer = new IndexerBlockSizeFixer();
  fixer.run().catch(console.error);
}

module.exports = IndexerBlockSizeFixer;
