const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying BitredictPool contract to Monad Testnet...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const provider = ethers.provider;
  
  console.log("📝 Deploying contracts with account:", deployerAddress);
  console.log("💰 Account balance:", ethers.formatEther(await provider.getBalance(deployerAddress)), "MON");

  // Check if we're on the correct network
  const network = await provider.getNetwork();
  console.log("🌐 Network:", network.name, "(Chain ID:", network.chainId, ")");

  // Contract parameters - these should match your existing deployed contracts
  console.log("\n📊 Contract parameters:");
  console.log("  - Deployer as fee collector");
  console.log("  - Deployer as oracle bot initially");
  console.log("  - Using existing BITR token and oracles");

  // Get existing contract addresses (you'll need to update these with your actual addresses)
  // For now, we'll use placeholder addresses that you should replace
  const BITR_TOKEN_ADDRESS = process.env.BITR_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";
  const GUIDED_ORACLE_ADDRESS = process.env.GUIDED_ORACLE_ADDRESS || "0x0000000000000000000000000000000000000000";
  const OPTIMISTIC_ORACLE_ADDRESS = process.env.OPTIMISTIC_ORACLE_ADDRESS || "0x0000000000000000000000000000000000000000";
  
  console.log("\n🔗 Existing contract addresses:");
  console.log("  - BITR Token:", BITR_TOKEN_ADDRESS);
  console.log("  - Guided Oracle:", GUIDED_ORACLE_ADDRESS);
  console.log("  - Optimistic Oracle:", OPTIMISTIC_ORACLE_ADDRESS);

  // Validate addresses
  if (BITR_TOKEN_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("❌ Error: BITR_TOKEN_ADDRESS not set in environment variables");
    console.log("💡 Please set the BITR_TOKEN_ADDRESS environment variable to your deployed BitredictToken address");
    process.exit(1);
  }

  if (GUIDED_ORACLE_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("❌ Error: GUIDED_ORACLE_ADDRESS not set in environment variables");
    console.log("💡 Please set the GUIDED_ORACLE_ADDRESS environment variable to your deployed GuidedOracle address");
    process.exit(1);
  }

  // Deploy the BitredictPool contract
  console.log("\n📦 Deploying BitredictPool...");
  const BitredictPool = await ethers.getContractFactory("BitredictPool");
  
  const bitredictPool = await BitredictPool.deploy(
    BITR_TOKEN_ADDRESS,           // _bitrToken
    deployerAddress,              // _feeCollector
    GUIDED_ORACLE_ADDRESS,        // _guidedOracle
    OPTIMISTIC_ORACLE_ADDRESS     // _optimisticOracle (can be zero address if not deployed yet)
  );

  await bitredictPool.waitForDeployment();
  
  const deployedAddress = await bitredictPool.getAddress();
  console.log("✅ BitredictPool deployed to:", deployedAddress);

  // Verify deployment by checking contract state
  console.log("\n🔍 Verifying deployment...");
  
  const deployedBitrToken = await bitredictPool.bitrToken();
  const deployedFeeCollector = await bitredictPool.feeCollector();
  const deployedGuidedOracle = await bitredictPool.guidedOracle();
  const deployedOptimisticOracle = await bitredictPool.optimisticOracle();
  const poolCount = await bitredictPool.poolCount();
  const creationFeeMON = await bitredictPool.creationFeeMON();
  const creationFeeBITR = await bitredictPool.creationFeeBITR();
  const minPoolStakeMON = await bitredictPool.minPoolStakeMON();
  const minPoolStakeBITR = await bitredictPool.minPoolStakeBITR();

  console.log("📋 Deployment verification:");
  console.log("  - BITR Token:", deployedBitrToken);
  console.log("  - Fee Collector:", deployedFeeCollector);
  console.log("  - Guided Oracle:", deployedGuidedOracle);
  console.log("  - Optimistic Oracle:", deployedOptimisticOracle);
  console.log("  - Pool Count:", poolCount.toString());
  console.log("  - Creation Fee MON:", ethers.formatEther(creationFeeMON), "MON");
  console.log("  - Creation Fee BITR:", ethers.formatEther(creationFeeBITR), "BITR");
  console.log("  - Min Pool Stake MON:", ethers.formatEther(minPoolStakeMON), "MON");
  console.log("  - Min Pool Stake BITR:", ethers.formatEther(minPoolStakeBITR), "BITR");

  // Save deployment info
  const deploymentInfo = {
    contract: "BitredictPool",
    address: deployedAddress,
    network: network.name,
    chainId: network.chainId,
    deployer: deployerAddress,
    bitrToken: BITR_TOKEN_ADDRESS,
    feeCollector: deployerAddress,
    guidedOracle: GUIDED_ORACLE_ADDRESS,
    optimisticOracle: OPTIMISTIC_ORACLE_ADDRESS,
    creationFeeMON: ethers.formatEther(creationFeeMON),
    creationFeeBITR: ethers.formatEther(creationFeeBITR),
    minPoolStakeMON: ethers.formatEther(minPoolStakeMON),
    minPoolStakeBITR: ethers.formatEther(minPoolStakeBITR),
    deploymentTime: new Date().toISOString(),
    constructorArgs: [
      BITR_TOKEN_ADDRESS,
      deployerAddress,
      GUIDED_ORACLE_ADDRESS,
      OPTIMISTIC_ORACLE_ADDRESS
    ]
  };

  console.log("\n📄 Deployment info saved to bitredictpool-deployment-info.json");
  require('fs').writeFileSync(
    'bitredictpool-deployment-info.json',
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n🎉 BitredictPool deployment completed successfully!");
  console.log("📝 Contract address:", deployedAddress);
  console.log("🔗 Network:", network.name);
  console.log("⛓️  Chain ID:", network.chainId);
  
  console.log("\n📋 Next Steps:");
  console.log("1. Update your backend .env file with the new contract address");
  console.log("2. Update your frontend configuration");
  console.log("3. Test pool creation with the new minimum stakes and fees");
  console.log("4. Verify odds validation (1.01 to 100.00) works correctly");
  console.log("5. Test guided market resolution and settlement");
  
  return {
    bitredictPool: deployedAddress,
    deploymentInfo
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
