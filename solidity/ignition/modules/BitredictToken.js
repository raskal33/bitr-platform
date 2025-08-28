const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("BitredictTokenModule", (m) => {
  // Deploy the real BitredictToken contract (100M supply)
  const bitrToken = m.contract("BitredictToken");
 
  return { bitrToken };
}); 