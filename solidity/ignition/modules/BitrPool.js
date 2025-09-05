const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("BitrPoolModule", (m) => {
  // Use the real BitrToken contract (deployed separately)
  const bitrToken = m.getParameter("bitrToken", "0x0000000000000000000000000000000000000000"); // Replace with actual BitrToken address
  
  // Use the real GuidedOracle contract (deployed separately)
  const guidedOracle = m.getParameter("guidedOracle", "0x0000000000000000000000000000000000000000"); // Replace with actual GuidedOracle address
  
  // For optimistic oracle, use a placeholder address for initial deployment
  // The actual OptimisticOracle will be deployed separately and connected later
  const optimisticOracle = m.getParameter("optimisticOracle", "0x0000000000000000000000000000000000000000");
  
  // Deploy the main BitrPool contract (MON is native, no token contract needed)
  const feeCollector = m.getParameter("feeCollector", "0x0000000000000000000000000000000000000000"); // Replace with actual fee collector address
  
  const bitrPool = m.contract("BitrPool", [
    bitrToken,
    feeCollector,
    guidedOracle,
    optimisticOracle
  ]);

  return { 
    bitrToken, 
    guidedOracle,
    optimisticOracle,
    bitrPool 
  };
}); 