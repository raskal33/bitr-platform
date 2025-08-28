const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("BitrFaucetModule", (m) => {
  // Get parameters for deployment
  const bitrTokenAddress = m.getParameter("bitrToken");
  
  // Deploy the BitrFaucet contract (simplified - no pool dependency)
  const bitrFaucet = m.contract("BitrFaucet", [
    bitrTokenAddress
  ]);

  return { bitrFaucet };
}); 