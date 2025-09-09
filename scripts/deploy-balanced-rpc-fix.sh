#!/bin/bash

# Deploy Balanced Premium RPC Fix
# Fixes the critical indexer bug and optimizes settings for balanced performance

set -e

echo "🚀 Deploying Balanced Premium RPC Fix..."
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

echo -e "${BLUE}🔧 Setting balanced RPC environment variables...${NC}"

# Set balanced indexer settings (conservative but effective)
flyctl secrets set \
  POLL_INTERVAL="800" \
  RPC_DELAY="50" \
  BATCH_SIZE="50" \
  MAX_RETRIES="5" \
  MAX_CONCURRENT_REQUESTS="4" \
  MAX_CONCURRENT_BATCHES="2" \
  CONFIRMATION_BLOCKS="2" \
  --app bitr-backend

echo -e "${GREEN}✅ Balanced settings configured${NC}"

# Set reasonable lag prevention thresholds
echo -e "${BLUE}⚠️ Setting balanced lag prevention...${NC}"

flyctl secrets set \
  MAX_LAG_THRESHOLD="100" \
  LAG_ALERT_THRESHOLD="50" \
  EMERGENCY_BATCH_SIZE="100" \
  EMERGENCY_POLL_INTERVAL="200" \
  --app bitr-backend

echo -e "${GREEN}✅ Balanced lag prevention configured${NC}"

# Deploy the bug fix
echo -e "${BLUE}🚀 Deploying indexer bug fix...${NC}"

flyctl deploy --app bitr-backend

echo -e "${GREEN}✅ Bug fix deployment completed${NC}"

# Restart indexer machine to apply fixes immediately
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

echo ""
echo -e "${GREEN}🎉 Balanced Premium RPC Fix Deployment Complete!${NC}"
echo ""
echo -e "${YELLOW}📊 Balanced Performance Settings:${NC}"
echo "   • Polling: 800ms (balanced - faster than block time)"
echo "   • Batch Size: 50 blocks (reasonable throughput)"
echo "   • RPC Delay: 50ms (conservative rate limiting)"
echo "   • Lag Threshold: 100 blocks max (40 seconds)"
echo "   • Emergency Mode: 200 blocks (80 seconds)"
echo ""
echo -e "${BLUE}🔍 Monitor with:${NC}"
echo "   flyctl logs --app bitr-backend"
echo ""
echo -e "${YELLOW}⚠️ Expected behavior:${NC}"
echo "   • No more 'currentBlock is not defined' errors"
echo "   • Steady processing of 10-50 blocks at a time"
echo "   • Lag should stay under 50 blocks (20 seconds)"
echo "   • Emergency mode only activates if lag exceeds 100 blocks"
echo "   • Conservative quota usage while preventing lag"
echo ""
echo -e "${GREEN}✅ Deployment successful! Indexer should now work reliably.${NC}"
