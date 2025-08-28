# 🎯 Bitredict - Decentralized Prediction Markets

**Bitredict** is a next-generation decentralized prediction market platform built on the high-performance Somnia EVM network. We combine guided and open prediction markets with gamified daily contests and a sophisticated reputation system.

## 🏗️ Project Structure

```
bitredict/
├── backend/          # API server, oracle bot, and indexer services
├── solidity/         # Smart contracts and deployment scripts  
├── docs/             # Documentation site (Docusaurus)
├── bot/              # Oracle and automation bots
└── frontend/         # Web3 React application (seperate directory)
```

## 🚀 Quick Start

### Backend Services
```bash
cd backend
npm install
npm run dev
```

### Smart Contracts  
```bash
cd solidity
npx hardhat compile
npx hardhat test
```

### Documentation
```bash
cd docs
npm install
npm start  # Local dev server at localhost:3000
```

## 📚 Documentation

Comprehensive documentation is available at our **Docusaurus site**:

- **Local Development**: Run `cd docs && npm start`
- **Production**: [docs.bitredict.io](https://docs.bitredict.io) *(coming soon)*

### Documentation Covers:
- 🎯 **Platform Overview** - What is Bitredict and why it matters
- 🏗️ **Architecture** - Technical system overview  
- 📊 **Prediction Markets** - Guided vs Open markets
- 🎮 **Oddyssey Game** - Daily parlay contest mechanics
- 💎 **BITR Tokenomics** - Utility token economics
- 🏆 **Reputation System** - Trust-based access control
- 🔧 **Smart Contracts** - Technical contract documentation
- 🔗 **API Reference** - Developer integration guides

## 🎯 Core Features

### 📊 **Dual Prediction Markets**
- **Guided Markets**: Automated outcomes via SportMonks/CoinGecko APIs
- **Open Markets**: Community consensus via optimistic oracle
- **Real-time Settlement**: Instant payouts when events resolve

### 🎮 **Oddyssey Daily Contest**  
- **Daily Parlay Game**: 10 curated sports matches
- **Gamified Scoring**: Multipliers based on slip size
- **Prize Pools**: Daily STT and BITR rewards

### 🏆 **Reputation System**
- **Dynamic Scoring**: 0-150 points based on accuracy
- **Access Levels**: Limited → Elementary → Trusted → Verified
- **Enhanced Privileges**: Better fees and features for higher reputation

### 💎 **BITR Token Utility**
- **Fee Discounts**: Up to 50% off platform fees
- **Staking Rewards**: 30% revenue share for stakers
- **Governance Rights**: Vote on protocol decisions
- **Premium Access**: Exclusive features and analytics

## 🛠️ Technology Stack

- **Blockchain**: Somnia EVM (400,000+ TPS, sub-second finality)
- **Smart Contracts**: Solidity ^0.8.20
- **Backend**: Node.js with Express API
- **Database**: Neon.tech PostgreSQL (4-schema architecture)
- **Oracle Data**: SportMonks API, CoinGecko API
- **Infrastructure**: Fly.io, BunnyCDN
- **Documentation**: Docusaurus with TypeScript

## 🔮 Oracle Architecture

### Guided Oracle
- **Automated data feeds** from SportMonks and CoinGecko
- **Real-time fetching** every 30 seconds during events
- **Cross-validation** across multiple data sources
- **Instant settlement** when outcomes are available

### Optimistic Oracle  
- **Community proposals** with economic bonding
- **Challenge mechanisms** for dispute resolution
- **24-48 hour** resolution timeframes
- **Reputation-weighted** consensus

## 💰 Tokenomics

**BITR Token (ERC-20 on Somnia)**
- **Total Supply**: 100,000,000 BITR (fixed, no inflation)
- **Distribution**: 40% community rewards, 20% team, 15% development
- **Utility**: Fee discounts, staking rewards, governance, premium access
- **Revenue Sharing**: 30% of platform fees to stakers

## 🏛️ Database Architecture  

**4-Schema PostgreSQL Design:**
- **Core**: Users, reputation, achievements
- **Oracle**: Match data, crypto prices, external APIs
- **Prediction**: Pools, bets, liquidity provision  
- **Oddyssey**: Daily games, slips, leaderboards

## 🚀 Getting Started

1. **Explore Documentation**: Visit `/docs` folder or run the dev server
2. **Review Smart Contracts**: Check `/solidity/contracts/`
3. **Run Backend Services**: Start with `/backend/api/server.js`
4. **Test Contracts**: Use Hardhat in `/solidity/`
5. **Join Community**: Discord, Twitter, GitHub discussions

## 📞 Support & Community

- **Documentation**: [/docs](./docs) folder (Docusaurus site)
- **GitHub Issues**: [Issues](https://github.com/bitredict/bitredict/issues)
- **Discord**: [discord.gg/bitredict](https://discord.gg/bitredict)
- **Twitter**: [@bitredict](https://twitter.com/bitredict)

---

*Built with ❤️ on Somnia - The future of prediction markets is here.* 