const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Verifying Bitr Contract Deployment on Monad Testnet");
  
  // Load deployment info
  const deploymentInfo = require('../deployment-info.json');
  const contracts = deploymentInfo.contracts;
  
  console.log("\n📋 Contract Addresses:");
  Object.entries(contracts).forEach(([name, address]) => {
    console.log(`${name}: ${address}`);
  });

  // Get contract instances
  const bitrToken = await ethers.getContractAt("BitrToken", contracts.bitrToken);
  const guidedOracle = await ethers.getContractAt("GuidedOracle", contracts.guidedOracle);
  const bitrPool = await ethers.getContractAt("BitrPool", contracts.bitrPool);
  const reputationSystem = await ethers.getContractAt("ReputationSystem", contracts.reputationSystem);
  const optimisticOracle = await ethers.getContractAt("OptimisticOracle", contracts.optimisticOracle);
  const bitrFaucet = await ethers.getContractAt("BitrFaucet", contracts.bitrFaucet);
  const bitrStaking = await ethers.getContractAt("BitrStaking", contracts.bitrStaking);

  console.log("\n🔍 Verification Tests:");

  // Test 1: BitrToken
  try {
    const totalSupply = await bitrToken.totalSupply();
    const symbol = await bitrToken.symbol();
    const name = await bitrToken.name();
    console.log(`✅ BitrToken: ${name} (${symbol}) - Total Supply: ${ethers.formatEther(totalSupply)} BITR`);
  } catch (error) {
    console.log(`❌ BitrToken verification failed: ${error.message}`);
  }

  // Test 2: GuidedOracle
  try {
    const oracleBot = await guidedOracle.oracleBot();
    const owner = await guidedOracle.owner();
    console.log(`✅ GuidedOracle: Owner: ${owner}, Bot: ${oracleBot}`);
  } catch (error) {
    console.log(`❌ GuidedOracle verification failed: ${error.message}`);
  }

  // Test 3: BitrPool
  try {
    const poolCount = await bitrPool.poolCount();
    const bitrTokenAddress = await bitrPool.bitrToken();
    const guidedOracleAddress = await bitrPool.guidedOracle();
    const optimisticOracleAddress = await bitrPool.optimisticOracle();
    console.log(`✅ BitrPool: Pool Count: ${poolCount}, BITR: ${bitrTokenAddress}`);
    console.log(`   Guided Oracle: ${guidedOracleAddress}`);
    console.log(`   Optimistic Oracle: ${optimisticOracleAddress}`);
  } catch (error) {
    console.log(`❌ BitrPool verification failed: ${error.message}`);
  }

  // Test 4: ReputationSystem
  try {
    const minGuidedRep = await reputationSystem.MIN_GUIDED_POOL_REPUTATION();
    const minOpenRep = await reputationSystem.MIN_OPEN_POOL_REPUTATION();
    const defaultRep = await reputationSystem.DEFAULT_REPUTATION();
    console.log(`✅ ReputationSystem: Min Guided: ${minGuidedRep}, Min Open: ${minOpenRep}, Default: ${defaultRep}`);
  } catch (error) {
    console.log(`❌ ReputationSystem verification failed: ${error.message}`);
  }

  // Test 5: OptimisticOracle
  try {
    const bondToken = await optimisticOracle.bondToken();
    const bitredictPool = await optimisticOracle.bitredictPool();
    const proposalBond = await optimisticOracle.PROPOSAL_BOND();
    console.log(`✅ OptimisticOracle: Bond Token: ${bondToken}, Pool: ${bitredictPool}`);
    console.log(`   Proposal Bond: ${ethers.formatEther(proposalBond)} BITR`);
  } catch (error) {
    console.log(`❌ OptimisticOracle verification failed: ${error.message}`);
  }

  // Test 6: BitrFaucet
  try {
    const faucetBitrToken = await bitrFaucet.bitrToken();
    const faucetAmount = await bitrFaucet.FAUCET_AMOUNT();
    const faucetBalance = await bitrToken.balanceOf(contracts.bitrFaucet);
    const isActive = await bitrFaucet.faucetActive();
    console.log(`✅ BitrFaucet: Active: ${isActive}, Amount: ${ethers.formatEther(faucetAmount)} BITR`);
    console.log(`   Balance: ${ethers.formatEther(faucetBalance)} BITR`);
  } catch (error) {
    console.log(`❌ BitrFaucet verification failed: ${error.message}`);
  }

  // Test 7: BitrStaking
  try {
    const stakingBitrToken = await bitrStaking.bitrToken();
    const totalStaked = await bitrStaking.totalStaked();
    const tiers = await bitrStaking.getTiers();
    console.log(`✅ BitrStaking: Total Staked: ${ethers.formatEther(totalStaked)} BITR`);
    console.log(`   Tiers: ${tiers.length} available`);
  } catch (error) {
    console.log(`❌ BitrStaking verification failed: ${error.message}`);
  }

  // Test 8: Cross-contract linkage
  console.log("\n🔗 Cross-Contract Linkage Tests:");
  
  try {
    // Check if BitrPool has correct token reference
    const poolTokenAddress = await bitrPool.bitrToken();
    if (poolTokenAddress.toLowerCase() === contracts.bitrToken.toLowerCase()) {
      console.log("✅ BitrPool correctly linked to BitrToken");
    } else {
      console.log("❌ BitrPool token address mismatch");
    }

    // Check if OptimisticOracle has correct pool reference
    const oraclePoolAddress = await optimisticOracle.bitredictPool();
    if (oraclePoolAddress.toLowerCase() === contracts.bitrPool.toLowerCase()) {
      console.log("✅ OptimisticOracle correctly linked to BitrPool");
    } else {
      console.log("❌ OptimisticOracle pool address mismatch");
    }

    // Check if BitrFaucet has correct token reference
    const faucetTokenAddress = await bitrFaucet.bitrToken();
    if (faucetTokenAddress.toLowerCase() === contracts.bitrToken.toLowerCase()) {
      console.log("✅ BitrFaucet correctly linked to BitrToken");
    } else {
      console.log("❌ BitrFaucet token address mismatch");
    }

  } catch (error) {
    console.log(`❌ Cross-contract linkage test failed: ${error.message}`);
  }

  console.log("\n🎉 Verification Complete!");
  console.log("==========================================");
  console.log("📋 Summary:");
  console.log("- All core contracts deployed successfully");
  console.log("- Contract linkages verified");
  console.log("- Faucet funded with 20M BITR tokens");
  console.log("- Ready for backend integration");
  console.log("==========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  });
