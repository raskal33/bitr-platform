const { ethers } = require('ethers');
const config = require('./config');

async function checkTransaction() {
  console.log('🔍 Checking transaction on blockchain...');
  
  const txHash = '0x2f31036cff49912a66ade71290cb1da96ae75d35f082339bdce5581aadccb137';
  
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Load Oddyssey ABI
    const OddysseyABI = [
      "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)",
      "function getSlip(uint256 slipId) external view returns (address player, uint256 cycleId, uint256 placedAt, tuple(uint256 matchId, uint8 betType, bytes32 selection, uint32 selectedOdd)[] predictions, uint256 finalScore, uint8 correctCount, bool isEvaluated)",
      "function slipCount() external view returns (uint256)"
    ];
    
    const oddysseyContract = new ethers.Contract(config.blockchain.contractAddresses.oddyssey, OddysseyABI, provider);
    
    console.log(`🔍 Analyzing transaction: ${txHash}`);
    
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      console.log('❌ Transaction not found on blockchain');
      return;
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
          slipEvents.push({ cycleId, player, slipId });
        }
      } catch (error) {
        // Not a SlipPlaced event, continue
      }
    }
    
    if (slipEvents.length === 0) {
      console.log('❌ No SlipPlaced events found in this transaction');
    } else {
      console.log(`✅ Found ${slipEvents.length} SlipPlaced events:`);
      slipEvents.forEach((event, index) => {
        console.log(`   ${index + 1}. Cycle: ${event.cycleId}, Player: ${event.player}, Slip: ${event.slipId}`);
      });
    }
    
    // Check if slip exists in contract
    if (slipEvents.length > 0) {
      const slipId = slipEvents[0].slipId;
      try {
        const slipData = await oddysseyContract.getSlip(slipId);
        console.log(`✅ Slip ${slipId} exists in contract:`);
        console.log(`   Player: ${slipData[0]}`);
        console.log(`   Cycle: ${slipData[1]}`);
        console.log(`   Placed at: ${new Date(Number(slipData[2]) * 1000)}`);
        console.log(`   Predictions count: ${slipData[3].length}`);
        console.log(`   Is evaluated: ${slipData[6]}`);
      } catch (error) {
        console.log(`❌ Error getting slip data: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking transaction:', error.message);
  }
}

checkTransaction();

