const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting Bitr Production Deployment on Monad Testnet");
  
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const provider = ethers.provider;
  console.log("Deploying contracts with account:", deployerAddress);
  console.log("Account balance:", ethers.formatEther(await provider.getBalance(deployerAddress)), "MON");

  // Step 1: Deploy BITR Token (100M supply)
  console.log("\n📦 Step 1: Deploying BitrToken...");
  const BitrToken = await ethers.getContractFactory("BitrToken");
  const bitrToken = await BitrToken.deploy();
  await bitrToken.waitForDeployment();
  console.log("✅ BitrToken deployed to:", await bitrToken.getAddress());
  console.log("💰 Total supply:", ethers.formatEther(await bitrToken.totalSupply()), "BITR");

  // Step 2: Deploy GuidedOracle
  console.log("\n📦 Step 2: Deploying GuidedOracle...");
  const GuidedOracle = await ethers.getContractFactory("GuidedOracle");
  const guidedOracle = await GuidedOracle.deploy(deployerAddress); // deployer as oracle bot initially
  await guidedOracle.waitForDeployment();
  console.log("✅ GuidedOracle deployed to:", await guidedOracle.getAddress());

  // Step 3: Deploy OptimisticOracle first (needed for BitrPool constructor)
  console.log("\n📦 Step 3: Deploying OptimisticOracle...");
  const OptimisticOracle = await ethers.getContractFactory("OptimisticOracle");
  // Deploy with placeholder BitrPool address first
  const optimisticOracle = await OptimisticOracle.deploy(
    await bitrToken.getAddress(),
    ethers.ZeroAddress // placeholder for BitrPool
  );
  await optimisticOracle.waitForDeployment();
  console.log("✅ OptimisticOracle deployed to:", await optimisticOracle.getAddress());

  // Step 4: Deploy BitrPool with all required addresses
  console.log("\n📦 Step 4: Deploying BitrPool...");
  const BitrPool = await ethers.getContractFactory("BitrPool");
  const bitrPool = await BitrPool.deploy(
    await bitrToken.getAddress(),
    deployerAddress, // fee collector
    await guidedOracle.getAddress(),
    await optimisticOracle.getAddress()
  );
  await bitrPool.waitForDeployment();
  console.log("✅ BitrPool deployed to:", await bitrPool.getAddress());

  // Step 5: Deploy ReputationSystem
  console.log("\n📦 Step 5: Deploying ReputationSystem...");
  const ReputationSystem = await ethers.getContractFactory("ReputationSystem");
  const reputationSystem = await ReputationSystem.deploy(deployerAddress);
  await reputationSystem.waitForDeployment();
  console.log("✅ ReputationSystem deployed to:", await reputationSystem.getAddress());
  console.log("📊 Min open pool reputation:", await reputationSystem.MIN_OPEN_POOL_REPUTATION());

  // Step 6: Deploy BitrFaucet (using placeholder for Oddyssey - will update later)
  console.log("\n📦 Step 6: Deploying BitrFaucet...");
  const BitrFaucet = await ethers.getContractFactory("BitrFaucet");
  const bitrFaucet = await BitrFaucet.deploy(
    await bitrToken.getAddress(),
    deployerAddress // placeholder for Oddyssey address - will be updated later
  );
  await bitrFaucet.waitForDeployment();
  console.log("✅ BitrFaucet deployed to:", await bitrFaucet.getAddress());
  console.log("⚠️  Note: Oddyssey address is placeholder - will need to be updated later");

  // Step 7: Deploy BitrStaking
  console.log("\n📦 Step 7: Deploying BitrStaking...");
  const BitrStaking = await ethers.getContractFactory("BitrStaking");
  const bitrStaking = await BitrStaking.deploy(await bitrToken.getAddress());
  await bitrStaking.waitForDeployment();
  console.log("✅ BitrStaking deployed to:", await bitrStaking.getAddress());

  // Step 8: Configure contracts with ReputationSystem
  console.log("\n🔧 Step 8: Configuring contracts...");
  
  // Configure BitrPool with ReputationSystem (OptimisticOracle is set in constructor)
  await bitrPool.setReputationSystem(await reputationSystem.getAddress());
  console.log("✅ BitrPool updated with ReputationSystem address");
  
  // Configure OptimisticOracle with ReputationSystem
  await optimisticOracle.setReputationSystem(await reputationSystem.getAddress());
  console.log("✅ OptimisticOracle updated with ReputationSystem address");
  
  // Authorize deployer as reputation updater
  await reputationSystem.setAuthorizedUpdater(deployerAddress, true);
  console.log("✅ Deployer authorized as reputation updater");

  // Step 9: Fund the Faucet
  console.log("\n💰 Step 9: Funding BitrFaucet...");
  const faucetAmount = ethers.parseEther("20000000"); // 20M BITR for faucet
  await bitrToken.transfer(await bitrFaucet.getAddress(), faucetAmount);
  console.log("✅ Funded faucet with", ethers.formatEther(faucetAmount), "BITR");

  // Step 10: Verify faucet balance
  const faucetBalance = await bitrToken.balanceOf(await bitrFaucet.getAddress());
  console.log("💰 Faucet balance:", ethers.formatEther(faucetBalance), "BITR");

  // Step 11: Print deployment summary
  console.log("\n🎉 DEPLOYMENT COMPLETE!");
  console.log("==========================================");
  console.log("Contract Addresses:");
  console.log("BitrToken:", await bitrToken.getAddress());
  console.log("GuidedOracle:", await guidedOracle.getAddress());
  console.log("BitrPool:", await bitrPool.getAddress());
  console.log("ReputationSystem:", await reputationSystem.getAddress());
  console.log("OptimisticOracle:", await optimisticOracle.getAddress());
  console.log("BitrFaucet:", await bitrFaucet.getAddress());
  console.log("BitrStaking:", await bitrStaking.getAddress());
  console.log("==========================================");
  console.log("\n📋 Next Steps:");
  console.log("1. Update environment variables with contract addresses");
  console.log("2. Deploy backend to Fly.io");
  console.log("3. Test faucet functionality");
  console.log("4. Monitor airdrop tracking");

  // Save deployment info to file
  const deploymentInfo = {
    network: "monad",
    deployer: deployerAddress,
    contracts: {
      bitrToken: await bitrToken.getAddress(),
      guidedOracle: await guidedOracle.getAddress(),
      bitrPool: await bitrPool.getAddress(),
      reputationSystem: await reputationSystem.getAddress(),
      optimisticOracle: await optimisticOracle.getAddress(),
      bitrFaucet: await bitrFaucet.getAddress(),
      bitrStaking: await bitrStaking.getAddress()
    },
    faucetBalance: faucetBalance.toString(),
    deploymentTime: new Date().toISOString()
  };

  const fs = require('fs');
  fs.writeFileSync('deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 Deployment info saved to deployment-info.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }); 