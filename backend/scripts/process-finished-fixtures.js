#!/usr/bin/env node

const ComprehensiveResultsProcessor = require('../services/comprehensive-results-processor');

/**
 * Manual script to process finished fixtures and save results
 */
class ProcessFinishedFixtures {
  constructor() {
    this.processor = new ComprehensiveResultsProcessor();
  }

  async run() {
    console.log('🚀 Starting manual finished fixtures processing...');
    
    try {
      // Process finished fixtures
      const result = await this.processor.processFinishedFixtures();
      
      console.log('\n🎉 Processing completed!');
      console.log(`✅ Processed: ${result.processed} fixtures`);
      console.log(`❌ Errors: ${result.errors} fixtures`);
      
      if (result.processed > 0) {
        console.log('\n📊 Results have been saved to:');
        console.log('   - oracle.fixture_results');
        console.log('   - oracle.match_results');
        console.log('   - oracle.fixtures.result_info (updated)');
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Processing failed:', error);
      throw error;
    }
  }
}

// Run the script
if (require.main === module) {
  const processor = new ProcessFinishedFixtures();
  processor.run().catch(console.error);
}

module.exports = ProcessFinishedFixtures;
