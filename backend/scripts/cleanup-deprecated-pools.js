const db = require('../db/db');

/**
 * Cleanup Deprecated Pools Script
 * 
 * This script removes all prediction pools from the database that belong to
 * the deprecated BitredictPool contract after redeployment.
 */
class DeprecatedPoolsCleanup {
  constructor() {
    this.stats = {
      oraclePoolsRemoved: 0,
      predictionPoolsRemoved: 0,
      analyticsPoolsRemoved: 0,
      relatedBetsRemoved: 0,
      errors: 0
    };
  }

  async run() {
    console.log('🧹 Starting Deprecated Pools Cleanup...\n');
    console.log('⚠️  WARNING: This will permanently delete all pools from the old contract!');
    console.log('📋 This includes:');
    console.log('   • oracle.pools');
    console.log('   • prediction.pools'); 
    console.log('   • analytics.pools');
    console.log('   • Related bets and data');
    console.log('');

    try {
      // Step 1: Show current pool counts
      await this.showCurrentPoolCounts();

      // Step 2: Clean up oracle.pools
      await this.cleanupOraclePools();

      // Step 3: Clean up prediction.pools
      await this.cleanupPredictionPools();

      // Step 4: Clean up analytics.pools
      await this.cleanupAnalyticsPools();

      // Step 5: Show final statistics
      await this.showFinalStatistics();

      console.log('\n🎉 Deprecated pools cleanup completed successfully!');
      console.log('✅ All pools from the old contract have been removed');
      console.log('✅ Database is now clean and ready for the new contract');

    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      this.stats.errors++;
    }
  }

  async showCurrentPoolCounts() {
    console.log('📊 CURRENT POOL COUNTS:');
    
    try {
      const oracleResult = await db.query('SELECT COUNT(*) as count FROM oracle.pools');
      const predictionResult = await db.query('SELECT COUNT(*) as count FROM prediction.pools');
      const analyticsResult = await db.query('SELECT COUNT(*) as count FROM analytics.pools');
      
      console.log(`   • oracle.pools: ${oracleResult.rows[0].count}`);
      console.log(`   • prediction.pools: ${predictionResult.rows[0].count}`);
      console.log(`   • analytics.pools: ${analyticsResult.rows[0].count}`);
      console.log('');

      // Show some sample pools for verification
      if (predictionResult.rows[0].count > 0) {
        const samplePools = await db.query('SELECT pool_id, creator_address, created_at FROM prediction.pools LIMIT 3');
        console.log('📋 Sample pools to be removed:');
        samplePools.rows.forEach(pool => {
          console.log(`   • ${pool.pool_id} (${pool.creator_address}) - ${pool.created_at}`);
        });
        console.log('');
      }

    } catch (error) {
      console.error('❌ Error getting pool counts:', error.message);
    }
  }

  async cleanupOraclePools() {
    console.log('🗑️  Cleaning up oracle.pools...');
    
    try {
      // First, remove related pool_bets
      const betsResult = await db.query('DELETE FROM oracle.pool_bets');
      console.log(`   • Removed ${betsResult.rowCount} related bets`);

      // Then remove the pools
      const poolsResult = await db.query('DELETE FROM oracle.pools');
      this.stats.oraclePoolsRemoved = poolsResult.rowCount;
      console.log(`   • Removed ${poolsResult.rowCount} oracle pools`);
      console.log('   ✅ oracle.pools cleanup completed');

    } catch (error) {
      console.error(`   ❌ Error cleaning oracle.pools: ${error.message}`);
      this.stats.errors++;
    }
  }

  async cleanupPredictionPools() {
    console.log('🗑️  Cleaning up prediction.pools...');
    
    try {
      // First, remove related bets
      const betsResult = await db.query('DELETE FROM prediction.bets');
      this.stats.relatedBetsRemoved += betsResult.rowCount;
      console.log(`   • Removed ${betsResult.rowCount} related bets`);

      // Then remove the pools
      const poolsResult = await db.query('DELETE FROM prediction.pools');
      this.stats.predictionPoolsRemoved = poolsResult.rowCount;
      console.log(`   • Removed ${poolsResult.rowCount} prediction pools`);
      console.log('   ✅ prediction.pools cleanup completed');

    } catch (error) {
      console.error(`   ❌ Error cleaning prediction.pools: ${error.message}`);
      this.stats.errors++;
    }
  }

  async cleanupAnalyticsPools() {
    console.log('🗑️  Cleaning up analytics.pools...');
    
    try {
      // Remove analytics pools
      const poolsResult = await db.query('DELETE FROM analytics.pools');
      this.stats.analyticsPoolsRemoved = poolsResult.rowCount;
      console.log(`   • Removed ${poolsResult.rowCount} analytics pools`);
      console.log('   ✅ analytics.pools cleanup completed');

    } catch (error) {
      console.error(`   ❌ Error cleaning analytics.pools: ${error.message}`);
      this.stats.errors++;
    }
  }

  async showFinalStatistics() {
    console.log('\n📊 CLEANUP STATISTICS:');
    console.log(`   • Oracle pools removed: ${this.stats.oraclePoolsRemoved}`);
    console.log(`   • Prediction pools removed: ${this.stats.predictionPoolsRemoved}`);
    console.log(`   • Analytics pools removed: ${this.stats.analyticsPoolsRemoved}`);
    console.log(`   • Related bets removed: ${this.stats.relatedBetsRemoved}`);
    console.log(`   • Errors encountered: ${this.stats.errors}`);

    // Verify cleanup
    console.log('\n🔍 VERIFICATION:');
    try {
      const oracleResult = await db.query('SELECT COUNT(*) as count FROM oracle.pools');
      const predictionResult = await db.query('SELECT COUNT(*) as count FROM prediction.pools');
      const analyticsResult = await db.query('SELECT COUNT(*) as count FROM analytics.pools');
      
      console.log(`   • oracle.pools remaining: ${oracleResult.rows[0].count}`);
      console.log(`   • prediction.pools remaining: ${predictionResult.rows[0].count}`);
      console.log(`   • analytics.pools remaining: ${analyticsResult.rows[0].count}`);

      const totalRemaining = oracleResult.rows[0].count + predictionResult.rows[0].count + analyticsResult.rows[0].count;
      if (totalRemaining === 0) {
        console.log('   ✅ All pools successfully removed!');
      } else {
        console.log(`   ⚠️  ${totalRemaining} pools still remain`);
      }

    } catch (error) {
      console.error(`   ❌ Error during verification: ${error.message}`);
    }
  }

  /**
   * Dry run mode - shows what would be deleted without actually deleting
   */
  async dryRun() {
    console.log('🧪 DRY RUN MODE - No data will be deleted\n');
    
    try {
      await this.showCurrentPoolCounts();
      
      // Show what would be deleted
      console.log('📋 WOULD DELETE:');
      
      const oraclePools = await db.query('SELECT COUNT(*) as count FROM oracle.pools');
      const predictionPools = await db.query('SELECT COUNT(*) as count FROM prediction.pools');
      const analyticsPools = await db.query('SELECT COUNT(*) as count FROM analytics.pools');
      const predictionBets = await db.query('SELECT COUNT(*) as count FROM prediction.bets');
      const oracleBets = await db.query('SELECT COUNT(*) as count FROM oracle.pool_bets');
      
      console.log(`   • ${oraclePools.rows[0].count} oracle pools`);
      console.log(`   • ${predictionPools.rows[0].count} prediction pools`);
      console.log(`   • ${analyticsPools.rows[0].count} analytics pools`);
      console.log(`   • ${predictionBets.rows[0].count} prediction bets`);
      console.log(`   • ${oracleBets.rows[0].count} oracle bets`);
      
      console.log('\n✅ Dry run completed - no data was deleted');

    } catch (error) {
      console.error('❌ Error during dry run:', error);
    }
  }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
  const cleanup = new DeprecatedPoolsCleanup();
  
  // Check if dry run mode is requested
  const isDryRun = process.argv.includes('--dry-run');
  
  if (isDryRun) {
    cleanup.dryRun()
      .then(() => {
        console.log('\n✅ Dry run completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Dry run failed:', error);
        process.exit(1);
      });
  } else {
    cleanup.run()
      .then(() => {
        console.log('\n✅ Cleanup completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
      });
  }
}

module.exports = DeprecatedPoolsCleanup;
