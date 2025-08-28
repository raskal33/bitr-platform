const db = require('../db/db');

class CycleDetector {
  constructor() {
    this.missingCycles = [];
  }

  async detectMissingCycles() {
    try {
      console.log('🔍 Detecting missing cycles...');
      
      // Get all cycles ordered by cycle_id
      const result = await db.query(`
        SELECT cycle_id, created_at, DATE(created_at) as date_created 
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id
      `);

      if (result.rows.length === 0) {
        console.log('ℹ️ No cycles found in database');
        return { missingCycles: [], totalCycles: 0 };
      }

      const cycles = result.rows;
      const missingCycles = [];
      
      // Check for gaps in cycle sequence
      for (let i = 0; i < cycles.length - 1; i++) {
        const currentCycle = parseInt(cycles[i].cycle_id);
        const nextCycle = parseInt(cycles[i + 1].cycle_id);
        
        if (nextCycle - currentCycle > 1) {
          // Found a gap
          for (let missing = currentCycle + 1; missing < nextCycle; missing++) {
            missingCycles.push({
              cycleId: missing,
              expectedDate: this.calculateExpectedDate(cycles[i].date_created, missing - currentCycle),
              gapSize: nextCycle - currentCycle - 1
            });
          }
        }
      }

      // Check if we have cycles starting from 0 or 1
      const firstCycle = parseInt(cycles[0].cycle_id);
      if (firstCycle > 0) {
        // Missing cycles at the beginning
        for (let missing = 0; missing < firstCycle; missing++) {
          missingCycles.push({
            cycleId: missing,
            expectedDate: 'Unknown (before first recorded cycle)',
            gapSize: firstCycle
          });
        }
      }

      this.missingCycles = missingCycles;

      console.log(`📊 Cycle Analysis:`);
      console.log(`   Total cycles found: ${cycles.length}`);
      console.log(`   Missing cycles: ${missingCycles.length}`);
      
      if (missingCycles.length > 0) {
        console.log(`   Missing cycle IDs: ${missingCycles.map(c => c.cycleId).join(', ')}`);
        console.log(`   ⚠️  WARNING: Cycle sequence is incomplete!`);
      } else {
        console.log(`   ✅ Cycle sequence is complete`);
      }

      return {
        missingCycles: missingCycles,
        totalCycles: cycles.length,
        cycles: cycles
      };

    } catch (error) {
      console.error('❌ Error detecting missing cycles:', error);
      throw error;
    }
  }

  calculateExpectedDate(baseDate, daysOffset) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
  }

  async getCycleCreationLogs() {
    try {
      console.log('📋 Checking cycle creation patterns...');
      
      const result = await db.query(`
        SELECT 
          cycle_id,
          created_at,
          DATE(created_at) as date_created,
          EXTRACT(HOUR FROM created_at) as hour_created,
          EXTRACT(MINUTE FROM created_at) as minute_created
        FROM oracle.oddyssey_cycles 
        ORDER BY cycle_id
      `);

      console.log('📅 Cycle Creation Pattern:');
      result.rows.forEach(cycle => {
        const timeStr = `${cycle.hour_created.toString().padStart(2, '0')}:${cycle.minute_created.toString().padStart(2, '0')}`;
        console.log(`   Cycle ${cycle.cycle_id}: ${cycle.date_created} at ${timeStr} UTC`);
      });

      return result.rows;
    } catch (error) {
      console.error('❌ Error getting cycle creation logs:', error);
      throw error;
    }
  }

  async suggestFix() {
    if (this.missingCycles.length === 0) {
      console.log('✅ No fixes needed - cycle sequence is complete');
      return;
    }

    console.log('\n🔧 Suggested Fixes:');
    console.log('1. Check cron job logs for the missing dates');
    console.log('2. Verify if cycles were created manually or failed');
    console.log('3. Consider the following options:');
    
    this.missingCycles.forEach(missing => {
      console.log(`   - Cycle ${missing.cycleId}: Expected ${missing.expectedDate}`);
    });

    console.log('\n⚠️  IMPORTANT: Missing cycles may indicate:');
    console.log('   - Cron job failures');
    console.log('   - Manual cycle creation');
    console.log('   - Database inconsistencies');
    console.log('   - Contract state issues');
  }
}

// Run detection if called directly
if (require.main === module) {
  const detector = new CycleDetector();
  
  detector.detectMissingCycles()
    .then(async (result) => {
      await detector.getCycleCreationLogs();
      detector.suggestFix();
      
      if (result.missingCycles.length > 0) {
        process.exit(1); // Exit with error code if missing cycles found
      } else {
        process.exit(0); // Exit successfully if no issues
      }
    })
    .catch(error => {
      console.error('❌ Detection failed:', error);
      process.exit(1);
    });
}

module.exports = CycleDetector;
