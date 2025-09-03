const ContractToDbSync = require('./sync-contract-matches-to-db.js');

async function fixCycle4() {
  try {
    console.log('🔧 Fixing cycle 4 sync...');
    
    const syncer = new ContractToDbSync();
    await syncer.syncSpecificCycle(4);
    
    console.log('✅ Cycle 4 sync completed!');
  } catch (error) {
    console.error('❌ Failed to fix cycle 4:', error);
  }
}

fixCycle4();
