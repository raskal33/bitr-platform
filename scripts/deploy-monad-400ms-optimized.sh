#!/bin/bash

# Deploy Monad 400ms Block Optimized Indexer with Neon Database Branch
# Optimizes indexer for Monad's 400ms block time and ensures proper database connection

set -e

echo "🚀 Deploying Monad 400ms Optimized Indexer..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "fly.toml" ]; then
    echo -e "${RED}❌ Error: fly.toml not found. Please run this script from the project root.${NC}"
    exit 1
fi

echo -e "${CYAN}🗄️ Setting Neon Database Branch Configuration...${NC}"

# Set the specific Neon database branch
flyctl secrets set \
  DATABASE_URL="postgresql://neondb_owner:npg_2pLqJrLnJPJWjXxNqHdBNNLHrxKD@ep-proud-unit-a2nqswvi.us-east-2.aws.neon.tech/neondb?sslmode=require" \
  DB_HOST="ep-proud-unit-a2nqswvi.us-east-2.aws.neon.tech" \
  DB_NAME="neondb" \
  DB_USER="neondb_owner" \
  --app bitr-backend

echo -e "${GREEN}✅ Neon database branch configured (br-wild-mountain-a2wqdszo)${NC}"

echo -e "${BLUE}⚡ Setting Monad 400ms Block Optimized Settings...${NC}"

# Set optimized settings for 400ms block time
flyctl secrets set \
  POLL_INTERVAL="300" \
  RPC_DELAY="30" \
  BATCH_SIZE="25" \
  MAX_RETRIES="5" \
  MAX_CONCURRENT_REQUESTS="6" \
  MAX_CONCURRENT_BATCHES="3" \
  CONFIRMATION_BLOCKS="1" \
  RETRY_DELAY="500" \
  --app bitr-backend

echo -e "${GREEN}✅ Monad 400ms optimized settings configured${NC}"

# Set strict lag prevention for fast blocks
echo -e "${BLUE}🚨 Setting Strict Lag Prevention for 400ms Blocks...${NC}"

flyctl secrets set \
  MAX_LAG_THRESHOLD="25" \
  LAG_ALERT_THRESHOLD="15" \
  EMERGENCY_BATCH_SIZE="75" \
  EMERGENCY_POLL_INTERVAL="100" \
  MONAD_BLOCK_TIME="400" \
  MONAD_FINALITY="800" \
  --app bitr-backend

echo -e "${GREEN}✅ Strict lag prevention configured for 400ms blocks${NC}"

# Deploy the optimized code
echo -e "${BLUE}🚀 Deploying Monad-optimized indexer...${NC}"

flyctl deploy --app bitr-backend

echo -e "${GREEN}✅ Deployment completed${NC}"

# Restart indexer machine for immediate effect
echo -e "${BLUE}🔄 Restarting indexer machine...${NC}"

# Get the indexer machine ID
INDEXER_MACHINE=$(flyctl machines list --app bitr-backend --json | jq -r '.[] | select(.config.processes[]? == "indexer") | .id' | head -1)

if [ -n "$INDEXER_MACHINE" ]; then
    echo -e "${YELLOW}🔄 Restarting indexer machine: $INDEXER_MACHINE${NC}"
    flyctl machine restart $INDEXER_MACHINE --app bitr-backend
    echo -e "${GREEN}✅ Indexer machine restarted${NC}"
else
    echo -e "${YELLOW}⚠️ Could not find indexer machine, restarting all machines...${NC}"
    flyctl machines restart --app bitr-backend
fi

# Wait for services to be healthy
echo -e "${BLUE}⏳ Waiting for services to be healthy...${NC}"
sleep 30

# Check health status
echo -e "${BLUE}🏥 Checking service health...${NC}"
flyctl status --app bitr-backend

# Verify database connection
echo -e "${BLUE}🔍 Verifying database connection...${NC}"
flyctl ssh console --app bitr-backend -C "node -e \"
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
pool.query('SELECT NOW() as current_time, version() as db_version')
  .then(result => {
    console.log('✅ Database connected successfully');
    console.log('📊 Current time:', result.rows[0].current_time);
    console.log('🗄️ Database version:', result.rows[0].db_version.split(' ')[0]);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });
\""

echo ""
echo -e "${GREEN}🎉 Monad 400ms Optimized Deployment Complete!${NC}"
echo ""
echo -e "${CYAN}📊 Monad 400ms Block Optimizations:${NC}"
echo "   • Block Time: 400ms (new block every 0.4 seconds)"
echo "   • Polling: 300ms (faster than block time for real-time)"
echo "   • Batch Size: 25 blocks (10 seconds of blocks)"
echo "   • Max Lag: 25 blocks (10 seconds maximum lag)"
echo "   • Emergency Mode: Activates at 25+ blocks lag"
echo "   • Ultra-fast Emergency: 100ms polling when lagging"
echo ""
echo -e "${YELLOW}🗄️ Database Configuration:${NC}"
echo "   • Neon Branch: br-wild-mountain-a2wqdszo"
echo "   • Compute: ep-proud-unit-a2nqswvi (Primary Active)"
echo "   • Connection: Optimized for fast indexing"
echo ""
echo -e "${BLUE}🔍 Monitor Performance:${NC}"
echo "   flyctl logs --app bitr-backend | grep -E '(lag|blocks|Emergency|Processing)'"
echo ""
echo -e "${YELLOW}⚠️ Expected Performance for 400ms Blocks:${NC}"
echo "   • Processing Speed: 2.5+ blocks per second"
echo "   • Real-time Lag: 0-5 blocks (0-2 seconds)"
echo "   • Maximum Lag: Never exceed 25 blocks (10 seconds)"
echo "   • Emergency Response: Activates within 10 seconds"
echo "   • Block Processing: 25 blocks every 10 seconds"
echo ""
echo -e "${GREEN}✅ Indexer optimized for Monad's 400ms block speed!${NC}"
echo -e "${CYAN}🚀 Should now keep up with real-time blockchain activity!${NC}"
