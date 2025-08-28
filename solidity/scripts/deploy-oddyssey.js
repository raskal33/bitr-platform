const { ethers } = require("hardhat");

async function main() {
  console.log("�� Deploying Oddyssey contract...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying contracts with account:", deployer.address);
  console.log("💰 Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Contract parameters
  const initialEntryFee = ethers.parseEther("0.5"); // 0.5 STT
  const devWallet = deployer.address; // Change this to your dev wallet

  console.log("📊 Contract parameters:");
  console.log("  - Entry Fee: 0.5 STT");
  console.log("  - Dev Wallet:", devWallet);

  // Deploy the Oddyssey contract
  const Oddyssey = await ethers.getContractFactory("Oddyssey");
  const oddyssey = await Oddyssey.deploy(
    devWallet,
    initialEntryFee
  );

  await oddyssey.waitForDeployment();
  
  const deployedAddress = await oddyssey.getAddress();
  console.log("✅ Oddyssey deployed to:", deployedAddress);

  // Verify deployment
  console.log("🔍 Verifying deployment...");
  
  const deployedEntryFee = await oddyssey.entryFee();
  const deployedDevWallet = await oddyssey.devWallet();
  const deployedOracle = await oddyssey.oracle();

  console.log("📋 Deployment verification:");
  console.log("  - Entry Fee:", ethers.formatEther(deployedEntryFee), "STT");
  console.log("  - Dev Wallet:", deployedDevWallet);
  console.log("  - Oracle:", deployedOracle);

  // Set the oracle (deployer as oracle for now)
  console.log("🔧 Setting oracle...");
  const setOracleTx = await oddyssey.setOracle(deployer.address);
  await setOracleTx.wait();
  console.log("✅ Oracle set to:", deployer.address);

  // Save deployment info
  const deploymentInfo = {
    contract: "Oddyssey",
    address: deployedAddress,
    network: (await ethers.provider.getNetwork()).name,
    deployer: deployer.address,
    oracle: deployer.address,
    devWallet: devWallet,
    entryFee: ethers.formatEther(initialEntryFee),
    deploymentTime: new Date().toISOString(),
    constructorArgs: [
      devWallet,
      ethers.formatEther(initialEntryFee)
    ]
  };

  console.log("📄 Deployment info saved to deployment-info.json");
  require('fs').writeFileSync(
    'deployment-info.json',
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("🎉 Oddyssey deployment completed successfully!");
  console.log("📝 Contract address:", oddyssey.address);
  console.log("🔗 Network:", deploymentInfo.network);
  
  return {
    oddyssey: oddyssey.address,
    deploymentInfo
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }); 