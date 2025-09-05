const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("BitrTokenModule", (m) => {
  // Deploy the real BitrToken contract (100M supply)
  const bitrToken = m.contract("BitrToken");
 
  return { bitrToken };
}); 