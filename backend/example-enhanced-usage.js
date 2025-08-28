/**
 * Example usage of enhanced SportMonks team assignment
 * This demonstrates how to integrate the enhanced logic into existing workflows
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

const SportMonksIntegration = require('./services/sportmonks-integration');

/**
 * Example 1: Replace existing SportMonks service usage
 */
async function enhancedFixtureProcessing() {
  console.log('🔄 Example: Enhanced Fixture Processing\n');
  
  // Initialize the enhanced service
  const sportMonksService = new SportMonksIntegration();
  
  // Mock fixture data (in real usage, this comes from SportMonks API)
  const mockFixtures = [
    {
      id: 12345,
      participants: [
        { id: 1, name: 'Arsenal', meta: { location: 'home' } },
        { id: 2, name: 'Chelsea', meta: { location: 'away' } }
      ],
      odds: [
        { market_id: 1, label: 'Home', value: '2.10', bookmaker: { id: 2, name: 'bet365' } },
        { market_id: 1, label: 'Draw', value: '3.40', bookmaker: { id: 2, name: 'bet365' } },
        { market_id: 1, label: 'Away', value: '3.20', bookmaker: { id: 2, name: 'bet365' } },
        { market_id: 80, label: 'Over', name: '2.5', value: '1.85', bookmaker: { id: 2, name: 'bet365' } },
        { market_id: 80, label: 'Under', name: '2.5', value: '1.95', bookmaker: { id: 2, name: 'bet365' } }
      ],
      league: { id: 8, name: 'Premier League', country: { name: 'England' } },
      starting_at: '2025-01-20T15:00:00Z',
      metadata: { venue: { name: 'Emirates Stadium' } }
    },
    {
      id: 12346,
      participants: [
        { id: 3, name: 'Barcelona' }, // No meta.location - will use array order
        { id: 4, name: 'Real Madrid' }
      ],
      odds: [
        { market_id: 1, label: 'Home', value: '2.50', bookmaker: { id: 2, name: 'bet365' } },
        { market_id: 1, label: 'Draw', value: '3.10', bookmaker: { id: 2, name: 'bet365' } },
        { market_id: 1, label: 'Away', value: '2.80', bookmaker: { id: 2, name: 'bet365' } },
        { market_id: 80, label: 'Over', name: '2.5', value: '1.75', bookmaker: { id: 2, name: 'bet365' } },
        { market_id: 80, label: 'Under', name: '2.5', value: '2.05', bookmaker: { id: 2, name: 'bet365' } }
      ],
      league: { id: 564, name: 'La Liga', country: { name: 'Spain' } },
      starting_at: '2025-01-21T20:00:00Z'
    }
  ];
  
  try {
    // Process fixtures with enhanced validation
    console.log('📥 Processing fixtures with enhanced validation...');
    const processedFixtures = sportMonksService.processFixtures(mockFixtures);
    
    console.log(`✅ Successfully processed ${processedFixtures.length}/${mockFixtures.length} fixtures\n`);
    
    // Display results
    processedFixtures.forEach(fixture => {
      console.log(`🏆 Fixture ${fixture.id}: ${fixture.home_team} vs ${fixture.away_team}`);
      console.log(`   League: ${fixture.league_name}`);
      console.log(`   Date: ${fixture.match_date}`);
      console.log(`   Validation: Teams=${fixture.team_assignment_validated}, Odds=${fixture.odds_mapping_validated}`);
      
      if (fixture.validatedOdds && fixture.validatedOdds.length > 0) {
        console.log(`   Odds Markets: ${fixture.validatedOdds.map(o => o.market).join(', ')}`);
      }
      console.log('');
    });
    
    // Get validation statistics
    const stats = sportMonksService.getValidationStats(processedFixtures);
    console.log('📊 Validation Statistics:');
    console.log(`   Total Fixtures: ${stats.total}`);
    console.log(`   Team Validated: ${stats.teamValidated} (${((stats.teamValidated/stats.total)*100).toFixed(1)}%)`);
    console.log(`   Odds Validated: ${stats.oddsValidated} (${((stats.oddsValidated/stats.total)*100).toFixed(1)}%)`);
    console.log(`   Fully Validated: ${stats.fullyValidated} (${((stats.fullyValidated/stats.total)*100).toFixed(1)}%)`);
    
    if (Object.keys(stats.errorSummary).length > 0) {
      console.log('   Common Errors:', stats.errorSummary);
    }
    
    return processedFixtures;
    
  } catch (error) {
    console.error('❌ Error in enhanced fixture processing:', error.message);
    throw error;
  }
}

/**
 * Example 2: Validate existing fixtures in database
 */
async function validateExistingFixtures() {
  console.log('🔍 Example: Validate Existing Fixtures\n');
  
  const sportMonksService = new SportMonksIntegration();
  
  // This would typically query existing fixtures from database
  // For demo purposes, we'll use mock data
  const existingFixtures = [
    {
      id: 98765,
      home_team: 'Liverpool',
      away_team: 'Manchester City',
      participants: [
        { id: 5, name: 'Liverpool', meta: { location: 'home' } },
        { id: 6, name: 'Manchester City', meta: { location: 'away' } }
      ],
      odds: [], // No odds - should fail validation
      league: { id: 8, name: 'Premier League' }
    }
  ];
  
  console.log('🔄 Validating existing fixtures...');
  
  existingFixtures.forEach(fixture => {
    const isValid = sportMonksService.validateFixtureStructure(fixture);
    console.log(`${isValid ? '✅' : '❌'} Fixture ${fixture.id}: ${fixture.home_team} vs ${fixture.away_team} - ${isValid ? 'Valid' : 'Invalid'}`);
  });
}

/**
 * Example 3: Test different API response formats
 */
async function testAPIResponseFormats() {
  console.log('🧪 Example: Test API Response Formats\n');
  
  const sportMonksService = new SportMonksIntegration();
  
  // Run the built-in test suite
  const testResults = sportMonksService.testTeamAssignmentFormats();
  
  console.log('Test Results:');
  testResults.forEach((result, index) => {
    const status = result.isValid ? '✅' : '❌';
    console.log(`${index + 1}. ${status} ${result.testCase}`);
    console.log(`   Method: ${result.method}, Confidence: ${result.confidence}`);
    console.log(`   Teams: ${result.homeTeam} vs ${result.awayTeam}`);
    
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.join(', ')}`);
    }
    if (result.warnings.length > 0) {
      console.log(`   Warnings: ${result.warnings.join(', ')}`);
    }
    console.log('');
  });
}

/**
 * Example 4: Integration with existing cron jobs
 */
async function integrateWithCronJob() {
  console.log('⏰ Example: Integration with Cron Job\n');
  
  // This shows how to modify existing cron jobs to use enhanced validation
  const sportMonksService = new SportMonksIntegration();
  
  console.log('📅 Simulating daily fixture fetch and processing...');
  
  try {
    // 1. Fetch fixtures (this would be actual API call)
    console.log('1. Fetching fixtures from SportMonks API...');
    // const fixtures = await sportMonksService.fetchUpcomingFixtures(startDate, endDate);
    
    // 2. Process with enhanced validation
    console.log('2. Processing fixtures with enhanced validation...');
    // const processedFixtures = sportMonksService.processFixtures(fixtures);
    
    // 3. Save to database (existing logic)
    console.log('3. Saving validated fixtures to database...');
    // await sportMonksService.saveFixtures(processedFixtures);
    
    // 4. Log validation results
    console.log('4. Logging validation statistics...');
    // const stats = sportMonksService.getValidationStats(processedFixtures);
    // console.log('Daily processing stats:', stats);
    
    console.log('✅ Cron job integration example completed');
    
  } catch (error) {
    console.error('❌ Cron job integration failed:', error.message);
  }
}

/**
 * Main example runner
 */
async function runExamples() {
  console.log('🚀 SportMonks Enhanced Team Assignment Examples\n');
  console.log('=' .repeat(60));
  
  try {
    // Run all examples
    await enhancedFixtureProcessing();
    console.log('\n' + '=' .repeat(60));
    
    await validateExistingFixtures();
    console.log('\n' + '=' .repeat(60));
    
    await testAPIResponseFormats();
    console.log('\n' + '=' .repeat(60));
    
    await integrateWithCronJob();
    console.log('\n' + '=' .repeat(60));
    
    console.log('\n🎉 All examples completed successfully!');
    
    // Usage instructions
    console.log('\n📋 Integration Instructions:');
    console.log('1. Run database migration: node backend/run-team-validation-migration.js');
    console.log('2. Replace existing SportMonks service imports:');
    console.log('   const SportMonksService = require("./services/sportmonks-integration");');
    console.log('3. Use enhanced validation in cron jobs and API endpoints');
    console.log('4. Monitor validation statistics for data quality');
    console.log('5. Review processing_errors JSONB column for debugging');
    
  } catch (error) {
    console.error('\n❌ Examples failed:', error.message);
  }
}

// Export for potential use
module.exports = {
  enhancedFixtureProcessing,
  validateExistingFixtures,
  testAPIResponseFormats,
  integrateWithCronJob,
  runExamples
};

// Run examples if script is executed directly
if (require.main === module) {
  runExamples();
}