require('dotenv').config();
const { ethers } = require('ethers');

async function testRPCConnection() {
  console.log('🔍 Testing RPC connection...');
  
  const rpcUrls = [
    'https://rpc.somnia.network/',
    'https://dream-rpc.somnia.network/',
    'https://somnia-rpc.dwellir.com/',
    'https://somnia-rpc.publicnode.com/'
  ];

  for (const rpcUrl of rpcUrls) {
    try {
      console.log(`\n📡 Testing: ${rpcUrl}`);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Test basic connection
      const blockNumber = await provider.getBlockNumber();
      console.log(`✅ Connected! Current block: ${blockNumber}`);
      
      // Test network info
      const network = await provider.getNetwork();
      console.log(`🌐 Network: ${network.name} (Chain ID: ${network.chainId})`);
      
      // Test if this is the correct network
      if (network.chainId === 50312) {
        console.log(`🎯 Perfect! This is the correct Somnia network`);
        console.log(`\n💡 Recommended RPC URL: ${rpcUrl}`);
        return rpcUrl;
      } else {
        console.log(`⚠️ Wrong network (expected 50312, got ${network.chainId})`);
      }
      
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
  }
  
  console.log('\n❌ No working RPC endpoints found');
  return null;
}

async function main() {
  const workingRpc = await testRPCConnection();
  
  if (workingRpc) {
    console.log(`\n📝 To fix the connection, update your .env file:`);
    console.log(`RPC_URL=${workingRpc}`);
    console.log(`PROVIDER_URL=${workingRpc}`);
  }
}

main().catch(console.error);
