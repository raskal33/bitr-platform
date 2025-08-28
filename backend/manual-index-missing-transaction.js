const { ethers } = require('ethers');
const config = require('./config');
const db = require('./db/db');

async function manualIndexMissingTransaction() {
  console.log('🔧 Manually indexing missing transaction...');
  
  // Transaction details
  const txHash = '0xb61a00f6b4ba6c88231092d2c2e2a9dc6eb322856f7de389a7ea56c6f026ee75';
  
  try {
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Load Oddyssey ABI
    const OddysseyABI = [
      "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)",
      "function getSlip(uint256 slipId) external view returns (address player, uint256 cycleId, uint256 placedAt, tuple(uint256 matchId, uint8 betType, bytes32 selection, uint32 selectedOdd)[10] predictions, uint256 finalScore, uint8 correctCount, bool isEvaluated)"
    ];
    
    const oddysseyContract = new ethers.Contract(config.blockchain.contractAddresses.oddyssey, OddysseyABI, provider);
    
    console.log(`🔍 Analyzing transaction: ${txHash}`);
    
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      throw new Error('Transaction not found');
    }
    
    console.log(`✅ Transaction found in block: ${receipt.blockNumber}`);
    console.log(`✅ Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
    console.log(`✅ Logs count: ${receipt.logs.length}`);
    
    // Find SlipPlaced events in the transaction
    const slipEvents = [];
    for (const log of receipt.logs) {
      try {
        const parsed = oddysseyContract.interface.parseLog(log);
        if (parsed && parsed.name === 'SlipPlaced') {
          const { cycleId, player, slipId } = parsed.args;
          slipEvents.push({ cycleId, player, slipId, log });
        }
      } catch (error) {
        // Not a SlipPlaced event, continue
      }
    }
    
    if (slipEvents.length === 0) {
      console.log('❌ No SlipPlaced events found in this transaction');
      return;
    }
    
    console.log(`✅ Found ${slipEvents.length} SlipPlaced events`);
    
    // Process each slip event
    for (const { cycleId, player, slipId, log } of slipEvents) {
      console.log(`\n📝 Processing SlipPlaced: Cycle ${cycleId}, Player ${player}, Slip ${slipId}`);
      
      // Check if slip already exists
      const existingSlip = await db.query(
        'SELECT slip_id FROM oracle.oddyssey_slips WHERE slip_id = $1',
        [slipId.toString()]
      );
      
      if (existingSlip.rows.length > 0) {
        console.log(`⚠️ Slip ${slipId} already exists in database`);
        continue;
      }
      
      // Get block timestamp
      const block = await provider.getBlock(receipt.blockNumber);
      
      // Get slip data from contract
      let slipData;
      try {
        slipData = await oddysseyContract.getSlip(slipId);
        console.log(`✅ Retrieved slip data from contract`);
        
        // Convert BigInt values to strings for JSON serialization
        if (slipData && slipData.predictions) {
          slipData.predictions = slipData.predictions.map(pred => ({
            matchId: pred.matchId.toString(),
            betType: pred.betType.toString(),
            selection: pred.selection,
            selectedOdd: pred.selectedOdd.toString()
          }));
        }
      } catch (error) {
        console.log(`⚠️ Could not retrieve slip data from contract: ${error.message}`);
        slipData = null;
      }
      
      // Insert slip into database
      try {
        await db.query(`
          INSERT INTO oracle.oddyssey_slips (
            slip_id, 
            cycle_id, 
            player_address, 
            placed_at, 
            predictions,
            final_score,
            correct_count,
            is_evaluated,
            tx_hash,
            creator_address,
            transaction_hash,
            category,
            uses_bitr,
            creator_stake,
            odds,
            pool_id,
            notification_type,
            message,
            is_read
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $3, $9, 'oddyssey', FALSE, 0.5, 1.0, $1, 'slip_placed', 'Your Oddyssey slip has been placed successfully', FALSE)
        `, [
          slipId.toString(),
          cycleId.toString(),
          player,
          new Date(block.timestamp * 1000),
          slipData ? JSON.stringify(slipData.predictions, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value
          ) : JSON.stringify([]),
          0, // final_score
          0, // correct_count
          false, // is_evaluated
          txHash
        ]);
        
        console.log(`✅ Successfully indexed slip ${slipId}`);
        
        // Store the event
        await db.query(`
          INSERT INTO oracle.blockchain_events (
            block_number, transaction_hash, log_index, event_type, 
            contract_address, event_data, processed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (block_number, transaction_hash, log_index, event_type) DO NOTHING
        `, [
          receipt.blockNumber,
          txHash,
          log.logIndex,
          'SlipPlaced',
          log.address,
          JSON.stringify({ cycleId: cycleId.toString(), player, slipId: slipId.toString() })
        ]);
        
        console.log(`✅ Stored SlipPlaced event`);
        
      } catch (error) {
        console.log(`❌ Failed to index slip ${slipId}: ${error.message}`);
      }
    }
    
    // Verify the slip is now in the database
    console.log('\n🔍 Verifying indexed slips...');
    const slipsResult = await db.query(
      'SELECT slip_id, cycle_id, player_address, tx_hash FROM oracle.oddyssey_slips WHERE tx_hash = $1',
      [txHash]
    );
    
    console.log(`✅ Found ${slipsResult.rows.length} slips in database for this transaction`);
    slipsResult.rows.forEach(slip => {
      console.log(`   Slip ${slip.slip_id}: Cycle ${slip.cycle_id}, Player ${slip.player_address}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit();
  }
}

manualIndexMissingTransaction();
