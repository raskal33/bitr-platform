const { ethers } = require("hardhat");

async function main() {
  console.log("🔧 Setting ReputationSystem address in BitredictPool contract...");

  // Contract addresses
  const BITREDITCT_POOL_ADDRESS = "0xBe9ad7A4CA367d45E61Fc20BbC5C44230e83E9f3";
  const REPUTATION_SYSTEM_ADDRESS = "0x94DBC95350AaCcC9DeAbdd9cf60B189a149636C7";

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  
  console.log("📝 Using account:", deployerAddress);
  console.log("🔗 BitredictPool address:", BITREDITCT_POOL_ADDRESS);
  console.log("🔗 ReputationSystem address:", REPUTATION_SYSTEM_ADDRESS);

  // Get the BitredictPool contract
  const BitredictPool = await ethers.getContractFactory("BitredictPool");
  const bitredictPool = BitredictPool.attach(BITREDITCT_POOL_ADDRESS);

  // Check current reputation system address
  const currentReputationSystem = await bitredictPool.reputationSystem();
  console.log("📋 Current ReputationSystem address:", currentReputationSystem);

  if (currentReputationSystem === REPUTATION_SYSTEM_ADDRESS) {
    console.log("✅ ReputationSystem address is already set correctly!");
    return;
  }

  // Set the ReputationSystem address
  console.log("\n🔧 Setting ReputationSystem address...");
  const tx = await bitredictPool.setReputationSystem(REPUTATION_SYSTEM_ADDRESS);
  console.log("📝 Transaction hash:", tx.hash);
  
  await tx.wait();
  console.log("✅ ReputationSystem address set successfully!");

  // Verify the change
  const newReputationSystem = await bitredictPool.reputationSystem();
  console.log("📋 New ReputationSystem address:", newReputationSystem);

  if (newReputationSystem === REPUTATION_SYSTEM_ADDRESS) {
    console.log("✅ Verification successful! ReputationSystem address is now set correctly.");
  } else {
    console.log("❌ Verification failed! ReputationSystem address was not set correctly.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
