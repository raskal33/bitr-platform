const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying BitredictPool contract to Somnia Network (Low Gas)...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const provider = ethers.provider;
  
  console.log("📝 Deploying contracts with account:", deployerAddress);
  console.log("💰 Account balance:", ethers.formatEther(await provider.getBalance(deployerAddress)), "STT");

  // Check if we're on the correct network
  const network = await provider.getNetwork();
  console.log("🌐 Network:", network.name, "(Chain ID:", network.chainId, ")");

  // Contract parameters
  const BITR_TOKEN_ADDRESS = "0x4b10fBFFDEE97C42E29899F47A2ECD30a38dBf2C";
  const GUIDED_ORACLE_ADDRESS = "0x2103cCfc9a15F2876765487F594481D5f8EC160a";
  const OPTIMISTIC_ORACLE_ADDRESS = "0x9E53d44aD3f614BA53F3B21EDF9fcE79a72238b2";
  
  console.log("\n🔗 Contract addresses:");
  console.log("  - BITR Token:", BITR_TOKEN_ADDRESS);
  console.log("  - Guided Oracle:", GUIDED_ORACLE_ADDRESS);
  console.log("  - Optimistic Oracle:", OPTIMISTIC_ORACLE_ADDRESS);

  // Deploy the BitredictPool contract with lower gas price
  console.log("\n📦 Deploying BitredictPool...");
  const BitredictPool = await ethers.getContractFactory("BitredictPool");
  
  // Use a lower gas price to avoid insufficient balance
  const gasPrice = ethers.parseUnits("5", "gwei"); // 5 gwei instead of 20 gwei
  console.log("⛽ Using gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  
  const bitredictPool = await BitredictPool.deploy(
    BITR_TOKEN_ADDRESS,           // _bitrToken
    deployerAddress,              // _feeCollector
    GUIDED_ORACLE_ADDRESS,        // _guidedOracle
    OPTIMISTIC_ORACLE_ADDRESS     // _optimisticOracle
  );

  // Wait for deployment with custom gas settings
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
  const creationFeeSTT = await bitredictPool.creationFeeSTT();
  const creationFeeBITR = await bitredictPool.creationFeeBITR();
  const minPoolStakeSTT = await bitredictPool.minPoolStakeSTT();
  const minPoolStakeBITR = await bitredictPool.minPoolStakeBITR();

  console.log("📋 Deployment verification:");
  console.log("  - BITR Token:", deployedBitrToken);
  console.log("  - Fee Collector:", deployedFeeCollector);
  console.log("  - Guided Oracle:", deployedGuidedOracle);
  console.log("  - Optimistic Oracle:", deployedOptimisticOracle);
  console.log("  - Pool Count:", poolCount.toString());
  console.log("  - Creation Fee STT:", ethers.formatEther(creationFeeSTT), "STT");
  console.log("  - Creation Fee BITR:", ethers.formatEther(creationFeeBITR), "BITR");
  console.log("  - Min Pool Stake STT:", ethers.formatEther(minPoolStakeSTT), "STT");
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
    creationFeeSTT: ethers.formatEther(creationFeeSTT),
    creationFeeBITR: ethers.formatEther(creationFeeBITR),
    minPoolStakeSTT: ethers.formatEther(minPoolStakeSTT),
    minPoolStakeBITR: ethers.formatEther(minPoolStakeBITR),
    deploymentTime: new Date().toISOString(),
    gasPrice: ethers.formatUnits(gasPrice, "gwei") + " gwei",
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
