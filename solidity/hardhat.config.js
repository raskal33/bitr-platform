require("@nomicfoundation/hardhat-toolbox");
require("dotenv/config");
require("hardhat-contract-sizer");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20", 
    settings: {
      optimizer: {
        enabled: true,
        runs: 1, // Lower runs for smaller contract size
      },
      viaIR: true,
    },
  },
  networks: {
    monad: {
      url: "https://testnet-rpc.monad.xyz/",
      chainId: 10143,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Monad-specific gas settings
      gasPrice: 52000000000, // 52 gwei (50 base + 2 priority)
      gas: 30000000, // 30M gas limit per transaction
      blockGasLimit: 150000000, // 150M gas per block
      timeout: 60000, // 60s timeout for faster blocks
    },
    "monad-testnet": {
      url: "https://testnet-rpc.monad.xyz/",
      chainId: 10143,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Monad-specific gas settings  
      gasPrice: 52000000000, // 52 gwei (50 base + 2 priority)
      gas: 30000000, // 30M gas limit per transaction
      blockGasLimit: 150000000, // 150M gas per block
      timeout: 60000, // 60s timeout for faster blocks
      // EIP-1559 settings
      maxFeePerGas: 52000000000, // 52 gwei
      maxPriorityFeePerGas: 2000000000, // 2 gwei
    },
  },
  etherscan: {
    apiKey: {
      monad: "no-api-key-needed"
    },
    customChains: [
      {
        network: "monad",
        chainId: 10143,
        urls: {
          apiURL: "https://testnet.monadexplorer.com/api",
          browserURL: "https://testnet.monadexplorer.com"
        }
      }
    ]
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: false,
    only: [':Oddyssey$', ':BitrPool$'],
  }
};
