const { ethers } = require('ethers');
const config = require('./config');

async function analyzeTransactionEvents() {
  console.log('🔍 Analyzing all events in transaction...');
  
  const txHash = '0xb61a00f6b4ba6c88231092d2c2e2a9dc6eb322856f7de389a7ea56c6f026ee75';
  
  try {
    const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      console.log('❌ Transaction not found on blockchain');
      return;
    }
    
    console.log(`✅ Transaction found in block: ${receipt.blockNumber}`);
    console.log(`✅ Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
    console.log(`✅ Logs count: ${receipt.logs.length}`);
    
    // Get the transaction details
    const tx = await provider.getTransaction(txHash);
    console.log(`\n📋 Transaction details:`);
    console.log(`   To: ${tx.to}`);
    console.log(`   From: ${tx.from}`);
    console.log(`   Value: ${ethers.formatEther(tx.value)} ETH`);
    console.log(`   Data length: ${tx.data.length} bytes`);
    
    // Check if it's calling the Oddyssey contract
    if (tx.to === config.blockchain.contractAddresses.oddyssey) {
      console.log(`✅ Transaction is calling Oddyssey contract`);
      
      // Try to decode the function call
      const OddysseyABI = [
        "function placeSlip(tuple(uint256 matchId, uint8 betType, bytes32 selection, uint32 selectedOdd)[10] _predictions) external payable",
        "function evaluateSlip(uint256 _slipId) external",
        "function startCycle() external",
        "function resolveCycle() external"
      ];
      
      const oddysseyContract = new ethers.Contract(config.blockchain.contractAddresses.oddyssey, OddysseyABI, provider);
      
      try {
        const decodedData = oddysseyContract.interface.parseTransaction({ data: tx.data, value: tx.value });
        console.log(`✅ Function called: ${decodedData.name}`);
        console.log(`   Args: ${JSON.stringify(decodedData.args, null, 2)}`);
      } catch (error) {
        console.log(`❌ Could not decode function call: ${error.message}`);
        console.log(`   Raw data: ${tx.data}`);
      }
    } else {
      console.log(`❌ Transaction is NOT calling Oddyssey contract`);
      console.log(`   Expected: ${config.blockchain.contractAddresses.oddyssey}`);
      console.log(`   Actual: ${tx.to}`);
      
      // Try to decode what function it's calling
      console.log(`\n🔍 Trying to decode function call to ${tx.to}:`);
      console.log(`   Function signature: ${tx.data.substring(0, 10)}`);
      
      // Common function signatures
      const commonSignatures = {
        '0xa9059cbb': 'transfer(address,uint256)',
        '0x23b872dd': 'transferFrom(address,address,uint256)',
        '0x095ea7b3': 'approve(address,uint256)',
        '0x40c10f19': 'mint(address,uint256)',
        '0x42966c68': 'burn(uint256)',
        '0x44dac555': 'placeSlip(tuple[10])'
      };
      
      const signature = tx.data.substring(0, 10);
      if (commonSignatures[signature]) {
        console.log(`   Likely function: ${commonSignatures[signature]}`);
      } else {
        console.log(`   Unknown function signature: ${signature}`);
      }
    }
    
    // Analyze all logs
    console.log(`\n📋 All logs in transaction:`);
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      console.log(`\n   Log ${i}:`);
      console.log(`     Address: ${log.address}`);
      console.log(`     Topics: ${log.topics.join(', ')}`);
      console.log(`     Data: ${log.data}`);
      
      // Try to decode as SlipPlaced event
      try {
        const OddysseyABI = [
          "event SlipPlaced(uint256 indexed cycleId, address indexed player, uint256 indexed slipId)"
        ];
        const oddysseyContract = new ethers.Contract(log.address, OddysseyABI, provider);
        const parsed = oddysseyContract.interface.parseLog(log);
        if (parsed && parsed.name === 'SlipPlaced') {
          console.log(`     ✅ Decoded as SlipPlaced event:`);
          console.log(`        Cycle: ${parsed.args.cycleId}`);
          console.log(`        Player: ${parsed.args.player}`);
          console.log(`        Slip: ${parsed.args.slipId}`);
        }
      } catch (error) {
        console.log(`     ❌ Not a SlipPlaced event`);
        
        // Try to decode as Transfer event
        try {
          const ERC20ABI = [
            "event Transfer(address indexed from, address indexed to, uint256 value)"
          ];
          const erc20Contract = new ethers.Contract(log.address, ERC20ABI, provider);
          const parsed = erc20Contract.interface.parseLog(log);
          if (parsed && parsed.name === 'Transfer') {
            console.log(`     ✅ Decoded as Transfer event:`);
            console.log(`        From: ${parsed.args.from}`);
            console.log(`        To: ${parsed.args.to}`);
            console.log(`        Value: ${ethers.formatUnits(parsed.args.value, 18)} tokens`);
          }
        } catch (error2) {
          console.log(`     ❌ Not a Transfer event either`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error analyzing transaction:', error.message);
  }
}

analyzeTransactionEvents();
