const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying Oddyssey Contract to Monad Testnet...\n");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📋 Deploying with account:", deployer.address);
  console.log("💰 Account balance:", (await deployer.getBalance()).toString(), "wei");
  console.log("💰 Account balance:", ethers.formatEther(await deployer.getBalance()), "MON\n");

  // Monad-specific gas settings
  const MONAD_BASE_FEE = ethers.parseUnits("50", "gwei"); // 50 gwei base fee on testnet
  const MONAD_MAX_GAS_LIMIT = 30_000_000; // 30M gas per transaction limit
  const MONAD_PRIORITY_FEE = ethers.parseUnits("2", "gwei"); // 2 gwei priority fee
  
  console.log("⚙️ Monad Gas Settings:");
  console.log("   Base Fee:", ethers.formatUnits(MONAD_BASE_FEE, "gwei"), "gwei");
  console.log("   Priority Fee:", ethers.formatUnits(MONAD_PRIORITY_FEE, "gwei"), "gwei");
  console.log("   Max Gas Limit:", MONAD_MAX_GAS_LIMIT.toLocaleString(), "gas");
  console.log("   Block Time: 400ms, Finality: 800ms\n");

  // Contract parameters
  const DEV_WALLET = process.env.DEV_WALLET || deployer.address;
  const ENTRY_FEE = ethers.utils.parseEther("0.5"); // 0.5 MON

  console.log("⚙️ Contract Parameters:");
  console.log("   Dev Wallet:", DEV_WALLET);
  console.log("   Entry Fee:", ethers.utils.formatEther(ENTRY_FEE), "MON\n");

  // Deploy the contract with Monad-optimized gas settings
  console.log("🔨 Deploying Oddyssey contract...");
  const Oddyssey = await ethers.getContractFactory("Oddyssey");
  
  // Estimate gas for deployment
  const deploymentData = Oddyssey.interface.encodeDeploy([DEV_WALLET, ENTRY_FEE]);
  const gasEstimate = await ethers.provider.estimateGas({
    data: deploymentData
  });
  
  // Add 20% buffer but stay within Monad limits
  const gasLimit = Math.min(
    Math.floor(gasEstimate * 1.2), 
    MONAD_MAX_GAS_LIMIT
  );
  
  console.log("⛽ Gas Estimation:");
  console.log("   Estimated:", gasEstimate.toString());
  console.log("   With Buffer:", gasLimit.toLocaleString());
  console.log("   ⚠️  Note: Monad charges gas_limit, not gas_used!");
  
  const oddyssey = await Oddyssey.deploy(DEV_WALLET, ENTRY_FEE, {
    gasLimit: gasLimit,
    maxFeePerGas: MONAD_BASE_FEE + MONAD_PRIORITY_FEE,
    maxPriorityFeePerGas: MONAD_PRIORITY_FEE
  });

  console.log("⏳ Waiting for deployment...");
  await oddyssey.waitForDeployment();

  console.log("✅ Oddyssey deployed successfully!");
  console.log("📍 Contract address:", await oddyssey.getAddress());
  console.log("🔗 Transaction hash:", oddyssey.deploymentTransaction().hash);
  console.log("⛽ Gas Limit Set:", gasLimit.toLocaleString());
  console.log("💸 Total Cost:", ethers.formatEther(BigInt(gasLimit) * (MONAD_BASE_FEE + MONAD_PRIORITY_FEE)), "MON");
  console.log("📊 Monad Advantage: 400ms blocks vs Ethereum's 12s!\n");

  // Verify deployment
  console.log("🔍 Verifying deployment...");
  const entryFee = await oddyssey.entryFee();
  const devWallet = await oddyssey.devWallet();
  const oracle = await oddyssey.oracle();

  console.log("✅ Verification Results:");
  console.log("   Entry Fee:", ethers.formatEther(entryFee), "MON");
  console.log("   Dev Wallet:", devWallet);
  console.log("   Oracle:", oracle);
  console.log("   Current Cycle:", (await oddyssey.getCurrentCycle()).toString());

  // Save deployment info
  const deploymentInfo = {
    network: "monad-testnet",
    chainId: 10143,
    contractName: "Oddyssey",
    contractAddress: await oddyssey.getAddress(),
    deployerAddress: deployer.address,
    devWallet: DEV_WALLET,
    entryFee: ENTRY_FEE.toString(),
    transactionHash: oddyssey.deploymentTransaction().hash,
    blockNumber: oddyssey.deploymentTransaction().blockNumber,
    gasLimit: gasLimit,
    gasLimitUsed: gasLimit, // Monad charges gas_limit, not gas_used
    totalCost: ethers.formatEther(BigInt(gasLimit) * (MONAD_BASE_FEE + MONAD_PRIORITY_FEE)),
    monadBaseFee: ethers.formatUnits(MONAD_BASE_FEE, "gwei") + " gwei",
    monadPriorityFee: ethers.formatUnits(MONAD_PRIORITY_FEE, "gwei") + " gwei",
    deployedAt: new Date().toISOString(),
    features: [
      "Match evaluation with 10 matches per cycle",
      "Prize distribution: 40%/30%/20%/5%/5%",
      "Prize rollover when no winners",
      "Comprehensive user stats tracking",
      "Reputation system integration",
      "Enhanced event emission for indexer",
      "Cycle analytics and leaderboard tracking",
      "MON currency support (0.5 MON entry fee)",
      "Optimized for Monad: 400ms blocks, 800ms finality",
      "Gas-efficient: Charges gas_limit (not gas_used)",
      "High throughput: 10,000 TPS vs Ethereum's ~10 TPS"
    ],
    monadAdvantages: {
      blockTime: "400ms vs Ethereum's 12s",
      finality: "800ms vs Ethereum's 12-18min", 
      throughput: "10,000 TPS vs Ethereum's ~10 TPS",
      gasModel: "Charges gas_limit for DOS prevention",
      compatibility: "100% EVM compatible (Cancun fork)"
    }
  };

  console.log("\n📄 Deployment Summary:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Save to file
  const fs = require('fs');
  const path = require('path');
  
  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const deploymentFile = path.join(deploymentsDir, 'oddyssey-monad-testnet.json');
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`\n💾 Deployment info saved to: ${deploymentFile}`);

  console.log("\n🎉 Deployment completed successfully!");
  console.log("\n📋 Next steps:");
  console.log("1. Update backend configuration with new contract address");
  console.log("2. Update indexer to sync with new contract");
  console.log("3. Set oracle address for match data");
  console.log("4. Test cycle creation and slip placement");
  console.log("5. Verify reputation events are properly indexed");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
