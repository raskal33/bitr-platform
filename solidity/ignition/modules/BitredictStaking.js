const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("BitredictStakingModule", (m) => {
  // Get BITR token address from parameters
  const bitrToken = m.getParameter("bitrToken", "0x0000000000000000000000000000000000000000"); // Replace with actual BITR token address
  
  // Deploy the BitredictStaking contract
  const bitredictStaking = m.contract("BitredictStaking", [
    bitrToken
  ]);

  return { bitredictStaking };
}); 