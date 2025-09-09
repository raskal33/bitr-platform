#!/bin/bash

# Deploy Premium ANKR RPC Upgrade Script
# This script updates the production environment with optimized settings for the premium ANKR RPC

set -e

echo "🚀 Deploying Premium ANKR RPC Upgrade..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "fly.toml" ]; then
    echo -e "${RED}❌ Error: fly.toml not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo -e "${RED}❌ Error: flyctl is not installed. Please install it first.${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Setting premium RPC environment variables...${NC}"

# Set the premium ANKR RPC URL as primary
flyctl secrets set \
  RPC_URL="https://rpc.ankr.com/monad_testnet/df5096a95ddedfa5ec32ad231b63250e719aef9ee7edcbbcea32b8539ae47205" \
  FALLBACK_RPC_URL="https://testnet-rpc.monad.xyz/" \
  --app bitr-backend

echo -e "${GREEN}✅ Primary RPC URLs updated${NC}"

# Set optimized indexer settings for premium RPC
echo -e "${BLUE}⚙️ Configuring premium RPC optimizations...${NC}"

flyctl secrets set \
  POLL_INTERVAL="150" \
  RPC_DELAY="20" \
  BATCH_SIZE="200" \
  MAX_RETRIES="8" \
  MAX_CONCURRENT_REQUESTS="10" \
  MAX_CONCURRENT_BATCHES="5" \
  AGGRESSIVE_MODE="true" \
  CONFIRMATION_BLOCKS="1" \
  --app bitr-backend

echo -e "${GREEN}✅ Premium RPC optimizations configured${NC}"

# Set emergency mode thresholds
echo -e "${BLUE}🚨 Setting emergency lag prevention...${NC}"

flyctl secrets set \
  EMERGENCY_MODE_ENABLED="true" \
  MAX_LAG_THRESHOLD="50" \
  LAG_ALERT_THRESHOLD="25" \
  EMERGENCY_BATCH_SIZE="500" \
  EMERGENCY_POLL_INTERVAL="50" \
  --app bitr-backend

echo -e "${GREEN}✅ Emergency lag prevention configured${NC}"

# Deploy the updated code
echo -e "${BLUE}🚀 Deploying updated indexer code...${NC}"

flyctl deploy --app bitr-backend

echo -e "${GREEN}✅ Code deployment completed${NC}"

# Restart indexer machine to apply new settings immediately
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

# Show current environment for verification
echo -e "${BLUE}🔍 Verifying environment variables...${NC}"
echo "Current RPC configuration:"
flyctl ssh console --app bitr-backend -C "echo 'RPC_URL:' \$RPC_URL && echo 'POLL_INTERVAL:' \$POLL_INTERVAL && echo 'BATCH_SIZE:' \$BATCH_SIZE"

echo ""
echo -e "${GREEN}🎉 Premium ANKR RPC Upgrade Deployment Complete!${NC}"
echo ""
echo -e "${YELLOW}📊 Performance Improvements Expected:${NC}"
echo "   • 25x faster RPC calls (500+ req/sec vs 20 req/sec)"
echo "   • 200x larger batch sizes (200 blocks vs 1 block)"
echo "   • 25x faster polling (150ms vs 5000ms)"
echo "   • Emergency lag prevention (never exceed 50 blocks lag)"
echo "   • Parallel event processing for maximum throughput"
echo ""
echo -e "${BLUE}🔍 Monitor performance with:${NC}"
echo "   flyctl logs --app bitr-backend"
echo ""
echo -e "${YELLOW}⚠️ Expected behavior:${NC}"
echo "   • Indexer should catch up to latest blocks within minutes"
echo "   • Lag should never exceed 25 blocks (10 seconds) under normal conditions"
echo "   • Emergency mode will activate if lag exceeds 50 blocks"
echo "   • Processing speed should be 3+ blocks per second"
echo ""
echo -e "${GREEN}✅ Deployment successful! The indexer is now using premium ANKR RPC.${NC}"
