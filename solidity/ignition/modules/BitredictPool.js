const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("BitredictPoolModule", (m) => {
  // Use the real BitredictToken contract (deployed separately)
  const bitrToken = m.getParameter("bitrToken", "0x0000000000000000000000000000000000000000"); // Replace with actual BitredictToken address
  
  // Use the real GuidedOracle contract (deployed separately)
  const guidedOracle = m.getParameter("guidedOracle", "0x0000000000000000000000000000000000000000"); // Replace with actual GuidedOracle address
  
  // For optimistic oracle, use a placeholder address for initial deployment
  // The actual OptimisticOracle will be deployed separately and connected later
  const optimisticOracle = m.getParameter("optimisticOracle", "0x0000000000000000000000000000000000000000");
  
  // Deploy the main BitredictPool contract (STT is native, no token contract needed)
  const feeCollector = m.getParameter("feeCollector", "0x0000000000000000000000000000000000000000"); // Replace with actual fee collector address
  
  const bitredictPool = m.contract("BitredictPool", [
    bitrToken,
    feeCollector,
    guidedOracle,
    optimisticOracle
  ]);

  return { 
    bitrToken, 
    guidedOracle,
    optimisticOracle,
    bitredictPool 
  };
}); 