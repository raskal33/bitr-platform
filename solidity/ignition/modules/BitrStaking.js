const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("BitrStakingModule", (m) => {
  // Get BITR token address from parameters
  const bitrToken = m.getParameter("bitrToken", "0x0000000000000000000000000000000000000000"); // Replace with actual BITR token address
  
  // Deploy the BitrStaking contract
  const bitrStaking = m.contract("BitrStaking", [
    bitrToken
  ]);

  return { bitrStaking };
}); 