const { ethers } = require("hardhat");

async function main() {
  console.log("🔍 Estimating gas cost for BitredictPool deployment...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  
  console.log("📝 Deploying contracts with account:", deployerAddress);
  console.log("💰 Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployerAddress)), "STT");

  // Contract parameters
  const BITR_TOKEN_ADDRESS = "0x4b10fBFFDEE97C42E29899F47A2ECD30a38dBf2C";
  const GUIDED_ORACLE_ADDRESS = "0x2103cCfc9a15F2876765487F594481D5f8EC160a";
  const OPTIMISTIC_ORACLE_ADDRESS = "0x9E53d44aD3f614BA53F3B21EDF9fcE79a72238b2";

  console.log("\n🔗 Contract addresses:");
  console.log("  - BITR Token:", BITR_TOKEN_ADDRESS);
  console.log("  - Guided Oracle:", GUIDED_ORACLE_ADDRESS);
  console.log("  - Optimistic Oracle:", OPTIMISTIC_ORACLE_ADDRESS);

  // Get contract factory
  const BitredictPool = await ethers.getContractFactory("BitredictPool");
  
  // Estimate gas
  console.log("\n⛽ Estimating gas cost...");
  const deploymentData = BitredictPool.interface.encodeDeploy([
    BITR_TOKEN_ADDRESS,
    deployerAddress,
    GUIDED_ORACLE_ADDRESS,
    OPTIMISTIC_ORACLE_ADDRESS
  ]);

  const gasEstimate = await ethers.provider.estimateGas({
    from: deployerAddress,
    data: deploymentData
  });

  console.log("📊 Gas estimation results:");
  console.log("  - Estimated gas:", gasEstimate.toString());
  
  // Calculate cost with current gas price
  const gasPrice = await ethers.provider.getFeeData();
  const gasCost = gasEstimate * gasPrice.gasPrice;
  const gasCostInSTT = ethers.formatEther(gasCost);
  
  console.log("  - Gas price:", ethers.formatUnits(gasPrice.gasPrice, "gwei"), "gwei");
  console.log("  - Estimated cost:", gasCostInSTT, "STT");
  
  // Check if we have enough balance
  const balance = await ethers.provider.getBalance(deployerAddress);
  const balanceInSTT = ethers.formatEther(balance);
  
  console.log("\n💰 Balance check:");
  console.log("  - Current balance:", balanceInSTT, "STT");
  console.log("  - Required cost:", gasCostInSTT, "STT");
  
  if (balance > gasCost) {
    console.log("✅ Sufficient balance for deployment");
  } else {
    console.log("❌ Insufficient balance for deployment");
    const shortfall = gasCost - balance;
    console.log("  - Shortfall:", ethers.formatEther(shortfall), "STT");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Gas estimation failed:", error);
    process.exit(1);
  });
