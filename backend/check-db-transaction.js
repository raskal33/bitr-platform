const db = require('./db/db');

async function checkDatabaseTransaction() {
  console.log('🔍 Checking transaction in database...');
  
  const txHash = '0xb61a00f6b4ba6c88231092d2c2e2a9dc6eb322856f7de389a7ea56c6f026ee75';
  
  try {
    // Check in oddyssey_slips table
    const result = await db.query(
      'SELECT * FROM oracle.oddyssey_slips WHERE tx_hash = $1 OR transaction_hash = $1',
      [txHash]
    );
    
    console.log(`Slips found: ${result.rows.length}`);
    
    if (result.rows.length > 0) {
      console.log('✅ Transaction found in database:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    } else {
      console.log('❌ Transaction NOT found in database');
      
      // Check all slips to see what we have
      const allSlips = await db.query('SELECT slip_id, tx_hash, transaction_hash, player_address, cycle_id FROM oracle.oddyssey_slips ORDER BY slip_id DESC LIMIT 10');
      console.log(`\n📋 Recent slips in database (${allSlips.rows.length}):`);
      allSlips.rows.forEach(slip => {
        console.log(`   Slip ${slip.slip_id}: tx_hash=${slip.tx_hash}, transaction_hash=${slip.transaction_hash}, player=${slip.player_address}, cycle=${slip.cycle_id}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  }
}

checkDatabaseTransaction();
