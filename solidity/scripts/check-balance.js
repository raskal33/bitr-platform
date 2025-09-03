const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const provider = ethers.provider;
  
  console.log("📝 Deployer account:", deployerAddress);
  console.log("💰 Account balance:", ethers.formatEther(await provider.getBalance(deployerAddress)), "STT");

  // Check if we're on the correct network
  const network = await provider.getNetwork();
  console.log("🌐 Network:", network.name, "(Chain ID:", network.chainId, ")");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
