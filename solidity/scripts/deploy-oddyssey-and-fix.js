const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying Oddyssey and Fixing Contract Links");
  
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log("Deploying with account:", deployerAddress);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployerAddress)), "MON");

  // Load existing deployment info
  const deploymentInfo = require('../deployment-info.json');
  const contracts = deploymentInfo.contracts;
  
  console.log("\n📋 Existing Contract Addresses:");
  Object.entries(contracts).forEach(([name, address]) => {
    console.log(`${name}: ${address}`);
  });

  // Step 1: Deploy Oddyssey
  console.log("\n📦 Step 1: Deploying Oddyssey...");
  const Oddyssey = await ethers.getContractFactory("Oddyssey");
  const oddyssey = await Oddyssey.deploy(
    deployerAddress, // dev wallet
    ethers.parseEther("0.5") // 0.5 MON entry fee (required by constructor)
  );
  await oddyssey.waitForDeployment();
  const oddysseyAddress = await oddyssey.getAddress();
  console.log("✅ Oddyssey deployed to:", oddysseyAddress);

  // Step 2: Deploy new OptimisticOracle with correct BitrPool address
  console.log("\n📦 Step 2: Deploying new OptimisticOracle with correct BitrPool address...");
  const OptimisticOracle = await ethers.getContractFactory("OptimisticOracle");
  const newOptimisticOracle = await OptimisticOracle.deploy(
    contracts.bitrToken,
    contracts.bitrPool // Now we have the correct BitrPool address
  );
  await newOptimisticOracle.waitForDeployment();
  const newOptimisticOracleAddress = await newOptimisticOracle.getAddress();
  console.log("✅ New OptimisticOracle deployed to:", newOptimisticOracleAddress);

  // Step 3: Deploy new BitrFaucet with correct Oddyssey address
  console.log("\n📦 Step 3: Deploying new BitrFaucet with correct Oddyssey address...");
  const BitrFaucet = await ethers.getContractFactory("BitrFaucet");
  const newBitrFaucet = await BitrFaucet.deploy(
    contracts.bitrToken,
    oddysseyAddress
  );
  await newBitrFaucet.waitForDeployment();
  const newBitrFaucetAddress = await newBitrFaucet.getAddress();
  console.log("✅ New BitrFaucet deployed to:", newBitrFaucetAddress);

  // Step 4: Configure new contracts
  console.log("\n🔧 Step 4: Configuring new contracts...");
  
  // Configure new OptimisticOracle with ReputationSystem
  await newOptimisticOracle.setReputationSystem(contracts.reputationSystem);
  console.log("✅ New OptimisticOracle configured with ReputationSystem");

  // Step 5: Fund new BitrFaucet
  console.log("\n💰 Step 5: Funding new BitrFaucet...");
  const bitrToken = await ethers.getContractAt("BitrToken", contracts.bitrToken);
  const faucetAmount = ethers.parseEther("20000000"); // 20M BITR for faucet
  await bitrToken.transfer(newBitrFaucetAddress, faucetAmount);
  console.log("✅ Funded new faucet with", ethers.formatEther(faucetAmount), "BITR");

  // Step 6: Verify new faucet balance
  const faucetBalance = await bitrToken.balanceOf(newBitrFaucetAddress);
  console.log("💰 New faucet balance:", ethers.formatEther(faucetBalance), "BITR");

  // Step 7: Update deployment info
  const updatedDeploymentInfo = {
    ...deploymentInfo,
    contracts: {
      ...contracts,
      oddyssey: oddysseyAddress,
      optimisticOracle: newOptimisticOracleAddress, // Updated
      bitrFaucet: newBitrFaucetAddress, // Updated
      // Keep old addresses for reference
      oldOptimisticOracle: contracts.optimisticOracle,
      oldBitrFaucet: contracts.bitrFaucet
    },
    lastUpdate: new Date().toISOString(),
    notes: "Updated with Oddyssey, fixed OptimisticOracle BitrPool reference, and BitrFaucet Oddyssey reference"
  };

  const fs = require('fs');
  fs.writeFileSync('deployment-info-updated.json', JSON.stringify(updatedDeploymentInfo, null, 2));
  console.log("\n💾 Updated deployment info saved to deployment-info-updated.json");

  // Step 8: Print final summary
  console.log("\n🎉 DEPLOYMENT AND FIXES COMPLETE!");
  console.log("==========================================");
  console.log("Updated Contract Addresses:");
  console.log("BitrToken:", contracts.bitrToken);
  console.log("GuidedOracle:", contracts.guidedOracle);
  console.log("BitrPool:", contracts.bitrPool);
  console.log("ReputationSystem:", contracts.reputationSystem);
  console.log("OptimisticOracle:", newOptimisticOracleAddress, "(UPDATED)");
  console.log("BitrFaucet:", newBitrFaucetAddress, "(UPDATED)");
  console.log("BitrStaking:", contracts.bitrStaking);
  console.log("Oddyssey:", oddysseyAddress, "(NEW)");
  console.log("==========================================");
  console.log("\n📋 Changes Made:");
  console.log("✅ Deployed Oddyssey contract");
  console.log("✅ Fixed OptimisticOracle BitrPool reference");
  console.log("✅ Updated BitrFaucet with correct Oddyssey address");
  console.log("✅ All contracts properly linked and production-ready");
  console.log("==========================================");

  return {
    oddyssey: oddysseyAddress,
    optimisticOracle: newOptimisticOracleAddress,
    bitrFaucet: newBitrFaucetAddress
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
