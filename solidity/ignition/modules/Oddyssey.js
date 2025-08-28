const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("OddysseyModule", (m) => {
  // Deploy the Oddyssey contract (STT is native, no token contract needed)
  const devWallet = m.getAccount("devWallet");
  const initialEntryFee = m.getParameter("initialEntryFee", "500000000000000000"); // 0.5 STT in wei

  const oddyssey = m.contract("Oddyssey", [
    devWallet,
    initialEntryFee
  ]);

  return {
    oddyssey
  };
}); 