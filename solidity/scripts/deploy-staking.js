const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying BitredictStaking Contract...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Get contract factory
  const BitredictStaking = await ethers.getContractFactory("BitredictStaking");
  
  // Deploy with BITR token address (you'll need to provide this)
  const bitrTokenAddress = process.env.BITR_TOKEN_ADDRESS;
  
  if (!bitrTokenAddress) {
    console.error("❌ BITR_TOKEN_ADDRESS not set in environment variables");
    console.log("Please set BITR_TOKEN_ADDRESS in your .env file");
    process.exit(1);
  }

  console.log("BITR Token Address:", bitrTokenAddress);

  const staking = await BitredictStaking.deploy(bitrTokenAddress);
  await staking.waitForDeployment();

  const stakingAddress = await staking.getAddress();
  console.log("✅ BitredictStaking deployed to:", stakingAddress);

  // Verify deployment
  console.log("\n📋 Contract Details:");
  console.log("Contract Address:", stakingAddress);
  console.log("BITR Token:", await staking.bitrToken());
  console.log("Owner:", await staking.owner());
  console.log("Total Staked:", await staking.totalStaked());

  // Get tier information
  const tiers = await staking.getTiers();
  console.log("\n🏆 Staking Tiers:");
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    console.log(`Tier ${i}: ${Number(tier.baseAPY)/100}% APY, ${ethers.formatEther(tier.minStake)} BITR min, ${Number(tier.revenueShareRate)/100}% revenue share`);
  }

  // Get duration options
  const durations = await staking.getDurationOptions();
  console.log("\n⏰ Duration Options:");
  for (let i = 0; i < durations.length; i++) {
    const days = Number(durations[i]) / (24 * 60 * 60);
    console.log(`Option ${i}: ${days} days`);
  }

  // Save deployment info
  const deploymentInfo = {
    contract: "BitredictStaking",
    address: stakingAddress,
    bitrToken: bitrTokenAddress,
    deployer: deployer.address,
    network: (await ethers.provider.getNetwork()).name,
    timestamp: new Date().toISOString(),
    tiers: tiers.map(tier => ({
      baseAPY: tier.baseAPY.toString(),
      minStake: tier.minStake.toString(),
      revenueShareRate: tier.revenueShareRate.toString()
    })),
    durations: durations.map(duration => duration.toString())
  };

  console.log("\n📄 Deployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  console.log("\n🎯 Next Steps:");
  console.log("1. Set STAKING_CONTRACT_ADDRESS in your .env files");
  console.log("2. Update backend config with new address");
  console.log("3. Update frontend contract integration");
  console.log("4. Test staking functionality");

  return stakingAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }); 