/**
 * Analyze Cron Conflicts Script
 * 
 * This script analyzes all cron jobs to identify conflicts, overlaps, and issues
 * in the result fetching, parsing, and processing system.
 */
class CronConflictAnalyzer {
  constructor() {
    this.cronJobs = {
      // Results fetching jobs
      results_fetcher_cron: {
        schedule: '15 */30 * * *', // Every 30 minutes at :15
        description: 'Results Fetcher (SportMonks API)',
        file: 'backend/cron/results-fetcher-cron.js'
      },
      coordinated_results_scheduler: {
        schedule: '*/30 * * * *', // Every 30 minutes
        description: 'Coordinated Results Scheduler',
        file: 'backend/cron/coordinated-results-scheduler.js'
      },
      football_scheduler_results: {
        schedule: '10 */30 * * *', // Every 30 minutes at :10
        description: 'Football Scheduler (includes results)',
        file: 'backend/cron/football-scheduler.js'
      },
      
      // Status update jobs
      fixture_status_updater: {
        schedule: '*/10 * * * *', // Every 10 minutes
        description: 'Fixture Status Updater',
        file: 'backend/cron/fixture-status-updater.js'
      },
      football_oracle_bot: {
        schedule: '5000ms', // Every 5 seconds
        description: 'Football Oracle Bot (continuous)',
        file: 'backend/services/football-oracle-bot.js'
      },
      
      // Resolution jobs
      results_resolver: {
        schedule: '20 */15 * * *', // Every 15 minutes at :20
        description: 'Results Resolver',
        file: 'backend/cron/consolidated-workers.js'
      },
      coordinated_results_resolution: {
        schedule: '*/15 * * * *', // Every 15 minutes
        description: 'Coordinated Results Resolution',
        file: 'backend/cron/coordinated-results-scheduler.js'
      },
      
      // Other overlapping jobs
      oracle_cron: {
        schedule: '15 */30 * * *', // Every 30 minutes at :15
        description: 'Oracle Cron Job',
        file: 'backend/cron/consolidated-workers.js'
      }
    };
  }

  analyze() {
    console.log('🔍 Analyzing Cron Job Conflicts...\n');
    
    // 1. Identify overlapping schedules
    console.log('📊 SCHEDULE OVERLAPS:');
    const overlaps = this.findOverlaps();
    overlaps.forEach(overlap => {
      console.log(`   ⚠️ ${overlap.time}: ${overlap.jobs.join(', ')}`);
    });
    
    // 2. Identify duplicate functionality
    console.log('\n🔄 DUPLICATE FUNCTIONALITY:');
    console.log('   📥 Results Fetching:');
    console.log('      • results_fetcher_cron (every 30 min)');
    console.log('      • coordinated_results_scheduler (every 30 min)');
    console.log('      • football_scheduler_results (every 30 min)');
    console.log('      • football_oracle_bot (every 5 seconds)');
    
    console.log('\n   🔄 Status Updates:');
    console.log('      • fixture_status_updater (every 10 min)');
    console.log('      • football_oracle_bot (every 5 seconds)');
    
    console.log('\n   🎯 Results Resolution:');
    console.log('      • results_resolver (every 15 min)');
    console.log('      • coordinated_results_resolution (every 15 min)');
    
    // 3. Identify conflicts
    console.log('\n❌ CONFLICTS IDENTIFIED:');
    console.log('   1. Multiple results fetching jobs running simultaneously');
    console.log('   2. Multiple status update jobs running simultaneously');
    console.log('   3. Multiple resolution jobs running simultaneously');
    console.log('   4. Football Oracle Bot running every 5 seconds (too frequent)');
    console.log('   5. No coordination between jobs');
    
    // 4. Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('   1. Consolidate all results fetching into ONE job');
    console.log('   2. Consolidate all status updates into ONE job');
    console.log('   3. Consolidate all resolution into ONE job');
    console.log('   4. Use proper coordination between jobs');
    console.log('   5. Implement proper error handling and retry logic');
    console.log('   6. Add monitoring and health checks');
    
    return {
      overlaps,
      conflicts: this.identifyConflicts(),
      recommendations: this.getRecommendations()
    };
  }

  findOverlaps() {
    const overlaps = [];
    
    // Check for jobs running at the same time
    const schedules = {
      'every_30_min': ['results_fetcher_cron', 'coordinated_results_scheduler', 'football_scheduler_results'],
      'every_15_min': ['results_resolver', 'coordinated_results_resolution'],
      'every_10_min': ['fixture_status_updater'],
      'continuous': ['football_oracle_bot']
    };
    
    Object.entries(schedules).forEach(([frequency, jobs]) => {
      if (jobs.length > 1) {
        overlaps.push({
          time: frequency,
          jobs: jobs
        });
      }
    });
    
    return overlaps;
  }

  identifyConflicts() {
    return [
      'Multiple results fetching jobs',
      'Multiple status update jobs', 
      'Multiple resolution jobs',
      'Too frequent updates (5 seconds)',
      'No coordination between jobs'
    ];
  }

  getRecommendations() {
    return [
      'Consolidate results fetching into single coordinated job',
      'Consolidate status updates into single job',
      'Consolidate resolution into single job',
      'Implement proper job coordination',
      'Add monitoring and health checks',
      'Implement proper error handling'
    ];
  }
}

// Run the analysis if this script is executed directly
if (require.main === module) {
  const analyzer = new CronConflictAnalyzer();
  analyzer.analyze();
}

module.exports = CronConflictAnalyzer;
