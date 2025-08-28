const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("GuidedOracleModule", (m) => {
  // Get oracle bot address from parameters
  const oracleBot = m.getParameter("oracleBot", "0x0000000000000000000000000000000000000000"); // Replace with actual oracle bot address
  
  // Deploy the real GuidedOracle contract
  const guidedOracle = m.contract("GuidedOracle", [
    oracleBot
  ]);

  return { guidedOracle };
}); 