const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting Bitredict Production Deployment on Somnia Network");
  
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const provider = ethers.provider;
  console.log("Deploying contracts with account:", deployerAddress);
  console.log("Account balance:", ethers.formatEther(await provider.getBalance(deployerAddress)), "STT");

  // Step 1: Deploy BITR Token (100M supply)
  console.log("\n📦 Step 1: Deploying BitredictToken...");
  const BitredictToken = await ethers.getContractFactory("BitredictToken");
  const bitrToken = await BitredictToken.deploy();
  await bitrToken.waitForDeployment();
  console.log("✅ BitredictToken deployed to:", await bitrToken.getAddress());
  console.log("💰 Total supply:", ethers.formatEther(await bitrToken.totalSupply()), "BITR");

  // Step 2: Deploy GuidedOracle
  console.log("\n📦 Step 2: Deploying GuidedOracle...");
  const GuidedOracle = await ethers.getContractFactory("GuidedOracle");
  const guidedOracle = await GuidedOracle.deploy(deployerAddress); // deployer as oracle bot initially
  await guidedOracle.waitForDeployment();
  console.log("✅ GuidedOracle deployed to:", await guidedOracle.getAddress());

  // Step 3: Deploy BitredictPool with placeholder OptimisticOracle
  console.log("\n📦 Step 3: Deploying BitredictPool...");
  const BitredictPool = await ethers.getContractFactory("BitredictPool");
  const bitredictPool = await BitredictPool.deploy(
    await bitrToken.getAddress(),
    deployerAddress, // fee collector
    await guidedOracle.getAddress(),
    ethers.ZeroAddress // placeholder for OptimisticOracle
  );
  await bitredictPool.waitForDeployment();
  console.log("✅ BitredictPool deployed to:", await bitredictPool.getAddress());

  // Step 4: Deploy ReputationSystem
  console.log("\n📦 Step 4: Deploying ReputationSystem...");
  const ReputationSystem = await ethers.getContractFactory("ReputationSystem");
  const reputationSystem = await ReputationSystem.deploy(deployerAddress);
  await reputationSystem.waitForDeployment();
  console.log("✅ ReputationSystem deployed to:", await reputationSystem.getAddress());
  console.log("📊 Min open pool reputation:", await reputationSystem.MIN_OPEN_POOL_REPUTATION());

  // Step 5: Deploy OptimisticOracle
  console.log("\n📦 Step 5: Deploying OptimisticOracle...");
  const OptimisticOracle = await ethers.getContractFactory("OptimisticOracle");
  const optimisticOracle = await OptimisticOracle.deploy(
    await bitrToken.getAddress(),
    await bitredictPool.getAddress()
  );
  await optimisticOracle.waitForDeployment();
  console.log("✅ OptimisticOracle deployed to:", await optimisticOracle.getAddress());

  // Step 6: Deploy BitrFaucet
  console.log("\n📦 Step 6: Deploying BitrFaucet...");
  const BitrFaucet = await ethers.getContractFactory("BitrFaucet");
  const bitrFaucet = await BitrFaucet.deploy(await bitrToken.getAddress());
  await bitrFaucet.waitForDeployment();
  console.log("✅ BitrFaucet deployed to:", await bitrFaucet.getAddress());

  // Step 7: Deploy BitredictStaking
  console.log("\n📦 Step 7: Deploying BitredictStaking...");
  const BitredictStaking = await ethers.getContractFactory("BitredictStaking");
  const bitredictStaking = await BitredictStaking.deploy(await bitrToken.getAddress());
  await bitredictStaking.waitForDeployment();
  console.log("✅ BitredictStaking deployed to:", await bitredictStaking.getAddress());

  // Step 8: Deploy Oddyssey
  console.log("\n📦 Step 8: Deploying Oddyssey...");
  const Oddyssey = await ethers.getContractFactory("Oddyssey");
  const oddyssey = await Oddyssey.deploy(
    deployerAddress, // dev wallet
    ethers.parseEther("10") // 10 STT entry fee
  );
  await oddyssey.waitForDeployment();
  console.log("✅ Oddyssey deployed to:", await oddyssey.getAddress());

  // Step 9: Configure contracts with ReputationSystem and OptimisticOracle
  console.log("\n🔧 Step 9: Configuring contracts...");
  
  // Configure BitredictPool with OptimisticOracle and ReputationSystem
  await bitredictPool.setOptimisticOracle(await optimisticOracle.getAddress());
  console.log("✅ BitredictPool updated with OptimisticOracle address");
  
  await bitredictPool.setReputationSystem(await reputationSystem.getAddress());
  console.log("✅ BitredictPool updated with ReputationSystem address");
  
  // Configure OptimisticOracle with ReputationSystem
  await optimisticOracle.setReputationSystem(await reputationSystem.getAddress());
  console.log("✅ OptimisticOracle updated with ReputationSystem address");
  
  // Authorize deployer as reputation updater
  await reputationSystem.setAuthorizedUpdater(deployerAddress, true);
  console.log("✅ Deployer authorized as reputation updater");

  // Step 10: Fund the Faucet
  console.log("\n💰 Step 10: Funding BitrFaucet...");
  const faucetAmount = ethers.parseEther("20000000"); // 20M BITR for faucet
  await bitrToken.transfer(await bitrFaucet.getAddress(), faucetAmount);
  console.log("✅ Funded faucet with", ethers.formatEther(faucetAmount), "BITR");

  // Step 11: Verify faucet balance
  const faucetBalance = await bitrToken.balanceOf(await bitrFaucet.getAddress());
  console.log("💰 Faucet balance:", ethers.formatEther(faucetBalance), "BITR");

  // Step 12: Print deployment summary
  console.log("\n🎉 DEPLOYMENT COMPLETE!");
  console.log("==========================================");
  console.log("Contract Addresses:");
  console.log("BitredictToken:", await bitrToken.getAddress());
  console.log("GuidedOracle:", await guidedOracle.getAddress());
  console.log("BitredictPool:", await bitredictPool.getAddress());
  console.log("ReputationSystem:", await reputationSystem.getAddress());
  console.log("OptimisticOracle:", await optimisticOracle.getAddress());
  console.log("BitrFaucet:", await bitrFaucet.getAddress());
  console.log("BitredictStaking:", await bitredictStaking.getAddress());
  console.log("Oddyssey:", await oddyssey.getAddress());
  console.log("==========================================");
  console.log("\n📋 Next Steps:");
  console.log("1. Update environment variables with contract addresses");
  console.log("2. Deploy backend to Fly.io");
  console.log("3. Test faucet functionality");
  console.log("4. Monitor airdrop tracking");

  // Save deployment info to file
  const deploymentInfo = {
    network: "somnia",
    deployer: deployerAddress,
    contracts: {
      bitrToken: await bitrToken.getAddress(),
      guidedOracle: await guidedOracle.getAddress(),
      bitredictPool: await bitredictPool.getAddress(),
      reputationSystem: await reputationSystem.getAddress(),
      optimisticOracle: await optimisticOracle.getAddress(),
      bitrFaucet: await bitrFaucet.getAddress(),
      bitredictStaking: await bitredictStaking.getAddress(),
      oddyssey: await oddyssey.getAddress()
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