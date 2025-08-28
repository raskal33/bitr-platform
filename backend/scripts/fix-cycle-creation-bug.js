const db = require('../db/db');

class CycleCreationFixer {
  constructor() {
    this.issues = [];
  }

  async analyzeCycleCreationIssues() {
    console.log('🔍 Analyzing cycle creation issues...');
    
    try {
      // 1. Check time window logic
      await this.checkTimeWindowLogic();
      
      // 2. Check for duplicate cron jobs
      await this.checkDuplicateCronJobs();
      
      // 3. Check date/timezone issues
      await this.checkDateTimeIssues();
      
      // 4. Check for failed transactions
      await this.checkFailedTransactions();
      
      // 5. Generate fix recommendations
      this.generateFixRecommendations();
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      throw error;
    }
  }

  async checkTimeWindowLogic() {
    console.log('\n🕐 Checking time window logic...');
    
    // The current logic: if (hour < 0 || hour > 1)
    // This is problematic because:
    // - hour < 0 is never true (hours are 0-23)
    // - hour > 1 means only hours 0 and 1 are allowed
    // - But cron runs at 00:04 UTC, so hour = 0, which should work
    
    const issue = {
      type: 'time_window_logic',
      severity: 'warning',
      description: 'Time window condition `hour < 0 || hour > 1` is confusing but should work for 00:04 UTC',
      recommendation: 'Clarify the time window logic to be more explicit'
    };
    
    this.issues.push(issue);
    console.log(`   ⚠️  ${issue.description}`);
  }

  async checkDuplicateCronJobs() {
    console.log('\n🔄 Checking for duplicate cron jobs...');
    
    // Check if there are multiple cycle creation jobs running
    const result = await db.query(`
      SELECT 
        cycle_id,
        created_at,
        EXTRACT(HOUR FROM created_at) as hour_created,
        EXTRACT(MINUTE FROM created_at) as minute_created,
        COUNT(*) OVER (PARTITION BY DATE(created_at)) as cycles_per_day
      FROM oracle.oddyssey_cycles 
      ORDER BY created_at
    `);

    const duplicateDays = result.rows.filter(row => row.cycles_per_day > 1);
    
    if (duplicateDays.length > 0) {
      const issue = {
        type: 'duplicate_cycles',
        severity: 'error',
        description: `Found ${duplicateDays.length} days with multiple cycles created`,
        details: duplicateDays.map(row => `Cycle ${row.cycle_id} on ${row.created_at.split('T')[0]} at ${row.hour_created}:${row.minute_created}`),
        recommendation: 'Investigate duplicate cron jobs or manual interventions'
      };
      
      this.issues.push(issue);
      console.log(`   ❌ ${issue.description}`);
    } else {
      console.log('   ✅ No duplicate cycles found');
    }
  }

  async checkDateTimeIssues() {
    console.log('\n📅 Checking date/timezone issues...');
    
    // Check for cycles created at unusual times
    const result = await db.query(`
      SELECT 
        cycle_id,
        created_at,
        EXTRACT(HOUR FROM created_at) as hour_created,
        EXTRACT(MINUTE FROM created_at) as minute_created,
        DATE(created_at) as date_created
      FROM oracle.oddyssey_cycles 
      WHERE EXTRACT(HOUR FROM created_at) NOT BETWEEN 0 AND 2
      ORDER BY created_at
    `);

    if (result.rows.length > 0) {
      const issue = {
        type: 'off_schedule_creation',
        severity: 'warning',
        description: `Found ${result.rows.length} cycles created outside normal hours (00:00-02:00 UTC)`,
        details: result.rows.map(row => `Cycle ${row.cycle_id} at ${row.hour_created}:${row.minute_created} on ${row.date_created}`),
        recommendation: 'Review cron job timing and manual interventions'
      };
      
      this.issues.push(issue);
      console.log(`   ⚠️  ${issue.description}`);
    } else {
      console.log('   ✅ All cycles created within normal hours');
    }
  }

  async checkFailedTransactions() {
    console.log('\n💥 Checking for failed transactions...');
    
    // Check for cycles with missing transaction hashes
    const result = await db.query(`
      SELECT cycle_id, created_at, tx_hash
      FROM oracle.oddyssey_cycles 
      WHERE tx_hash IS NULL OR tx_hash = ''
      ORDER BY created_at
    `);

    if (result.rows.length > 0) {
      const issue = {
        type: 'missing_tx_hash',
        severity: 'error',
        description: `Found ${result.rows.length} cycles without transaction hashes`,
        details: result.rows.map(row => `Cycle ${row.cycle_id} created at ${row.created_at}`),
        recommendation: 'Investigate failed blockchain transactions'
      };
      
      this.issues.push(issue);
      console.log(`   ❌ ${issue.description}`);
    } else {
      console.log('   ✅ All cycles have transaction hashes');
    }
  }

  generateFixRecommendations() {
    console.log('\n🔧 Fix Recommendations:');
    
    const fixes = [
      {
        file: 'backend/services/oddyssey-oracle-bot.js',
        line: 105,
        issue: 'Confusing time window logic',
        fix: 'Replace `if (hour < 0 || hour > 1)` with `if (hour !== 0)` or `if (hour < 0 || hour > 1)` with better comments'
      },
      {
        file: 'backend/cron/consolidated-workers.js',
        issue: 'Ensure only one cycle creation job runs',
        fix: 'Verify that only `oddyssey_creator` at 00:04 UTC is active, disable other cycle creation jobs'
      },
      {
        file: 'backend/services/oddyssey-oracle-bot.js',
        issue: 'Add better error handling and logging',
        fix: 'Add detailed logging for cycle creation attempts, failures, and time window checks'
      },
      {
        file: 'backend/scripts/cycle-health-monitor.js',
        issue: 'Add proactive monitoring',
        fix: 'Use the health monitor to detect missing cycles and alert immediately'
      }
    ];

    fixes.forEach((fix, index) => {
      console.log(`   ${index + 1}. ${fix.file}: ${fix.issue}`);
      console.log(`      Fix: ${fix.fix}`);
    });
  }

  async createFixedTimeWindowLogic() {
    console.log('\n🛠️  Creating fixed time window logic...');
    
    const fixedCode = `
  // FIXED: Clear time window logic for cycle creation
  // Cron job runs at 00:04 UTC, so we expect hour = 0
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  
  // Only allow cycle creation at exactly 00:04 UTC (when cron runs)
  // Add 5-minute buffer for potential delays
  if (hour !== 0 || minute < 0 || minute > 9) {
    console.log(\`ℹ️ Outside cycle creation window (\${hour}:\${minute} UTC), expected 00:00-00:09 UTC\`);
    return;
  }
    `;
    
    console.log('   📝 Fixed time window logic:');
    console.log(fixedCode);
    
    return fixedCode;
  }

  async suggestImmediateActions() {
    console.log('\n🚨 Immediate Actions Required:');
    
    const actions = [
      '1. Fix the time window logic in oddyssey-oracle-bot.js',
      '2. Verify only one cycle creation cron job is active',
      '3. Add comprehensive logging to track cycle creation attempts',
      '4. Set up alerts for missing cycles',
      '5. Monitor the next cycle creation (2025-08-23) closely'
    ];
    
    actions.forEach(action => {
      console.log(`   ${action}`);
    });
  }
}

// Run analysis if called directly
if (require.main === module) {
  const fixer = new CycleCreationFixer();
  
  fixer.analyzeCycleCreationIssues()
    .then(async () => {
      await fixer.createFixedTimeWindowLogic();
      fixer.suggestImmediateActions();
      
      if (fixer.issues.some(issue => issue.severity === 'error')) {
        process.exit(1); // Exit with error if critical issues found
      } else {
        process.exit(0); // Exit successfully for warnings only
      }
    })
    .catch(error => {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    });
}

module.exports = CycleCreationFixer;
