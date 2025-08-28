const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("OptimisticOracleModule", (m) => {
  // Get dependencies from parameters (deployed in previous steps)
  // Use BITR as bond token since STT is native coin
  const bitrToken = m.getParameter("bitrToken");
  const bitredictPoolAddress = m.getParameter("bitredictPoolAddress");
  
  // Deploy the OptimisticOracle with BITR as bond token
  const optimisticOracle = m.contract("OptimisticOracle", [
    bitrToken,
    bitredictPoolAddress
  ]);

  return { optimisticOracle };
}); 