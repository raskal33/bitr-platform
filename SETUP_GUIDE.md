# 🚀 Bitredict Project Setup Guide

This guide will help you set up the Bitredict project on your new PC.

## 📋 Prerequisites

- **Node.js** (v18 or higher) ✅ Already installed
- **npm** (v8 or higher) ✅ Already installed
- **Docker** (for database and Redis) ✅ Already installed
- **Git** (for version control) ✅ Already installed

## 🔧 Step-by-Step Setup

### 1. Environment Configuration

The project uses environment variables for configuration. A `.env.example` file has been created with all required variables.

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your specific values
nano .env
```

**Required Environment Variables:**
- `PRIVATE_KEY`: Your Ethereum private key for blockchain interactions
- `ORACLE_SIGNER_PRIVATE_KEY`: Private key for oracle outcome submissions
- `SPORTS_API_KEY`: SportMonks API key (optional for development)
- `CRYPTO_API_KEY`: Crypto API key (optional for development)

### 2. Database Setup

You have several options for setting up PostgreSQL:

#### Option A: Using Docker (Recommended)
```bash
# Start PostgreSQL and Redis using Docker Compose
docker-compose -f docker-compose.dev.yml up -d

# Check if services are running
docker-compose -f docker-compose.dev.yml ps
```

#### Option B: Local Installation
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql
CREATE DATABASE bitredict;
CREATE USER bitredict WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE bitredict TO bitredict;
\q
```

#### Option C: Cloud Database
You can use a cloud PostgreSQL service like:
- Neon.tech (free tier available)
- Supabase (free tier available)
- Railway
- Heroku Postgres

### 3. Redis Setup (Optional but Recommended)

#### Using Docker (Recommended)
```bash
# Redis is included in docker-compose.dev.yml
docker-compose -f docker-compose.dev.yml up -d redis
```

#### Local Installation
```bash
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### 4. Smart Contract Setup

```bash
# Navigate to the solidity directory
cd solidity

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Deploy contracts (requires private key in .env)
npx hardhat deploy:somnia
```

### 5. Database Schema Setup

```bash
# Navigate back to project root
cd ..

# Set up database schema
npm run db:setup
```

### 6. Start Development Services

```bash
# Start all backend services
npm run all:start

# Or start individual services:
npm run backend:dev      # API server
npm run indexer:start    # Blockchain indexer
npm run oracle:start     # Oracle service
npm run evaluator:start  # Evaluator service
```

## 🐳 Docker Commands

### Start Services
```bash
# Start database and Redis
docker-compose -f docker-compose.dev.yml up -d

# Start all services (production-like)
docker-compose up -d
```

### Stop Services
```bash
# Stop development services
docker-compose -f docker-compose.dev.yml down

# Stop all services
docker-compose down
```

### View Logs
```bash
# View logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f postgres
```

## 🔍 Troubleshooting

### Docker Issues
If Docker daemon is not running:
```bash
# Start Docker daemon
sudo dockerd &

# Or install Docker Desktop for Windows
# Download from: https://www.docker.com/products/docker-desktop
```

### Database Connection Issues
1. Check if PostgreSQL is running
2. Verify connection credentials in `.env`
3. Ensure database exists
4. Check firewall settings

### Smart Contract Issues
1. Verify private key in `.env`
2. Check RPC URL connectivity
3. Ensure sufficient gas balance
4. Verify contract addresses after deployment

### Node.js Issues
1. Check Node.js version: `node --version`
2. Clear npm cache: `npm cache clean --force`
3. Delete node_modules and reinstall: `rm -rf node_modules && npm install`

## 📁 Project Structure

```
bitredict/
├── backend/          # API server, oracle, indexer
├── solidity/         # Smart contracts
├── docs/             # Documentation
├── bot/              # Oracle bots
├── scripts/          # Utility scripts
├── .env.example      # Environment template
├── setup.sh          # Setup script
└── docker-compose.yml # Docker services
```

## 🚀 Quick Start Commands

```bash
# 1. Run setup script
./setup.sh

# 2. Start database and Redis
docker-compose -f docker-compose.dev.yml up -d

# 3. Compile contracts
cd solidity && npx hardhat compile && cd ..

# 4. Start backend services
npm run backend:dev
```

## 📚 Additional Resources

- [Backend README](./backend/README.md)
- [Smart Contract Documentation](./solidity/README.md)
- [API Documentation](./docs/)
- [Deployment Guide](./ODDYSSEY_DEPLOYMENT_GUIDE.md)

## 🆘 Getting Help

If you encounter issues:
1. Check the logs: `tail -f logs/app.log`
2. Verify configuration in `.env`
3. Check service status: `docker-compose ps`
4. Review the troubleshooting section above
5. Check the project documentation

---

**Happy coding! 🎉**
