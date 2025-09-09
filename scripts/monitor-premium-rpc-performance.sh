#!/bin/bash

# Premium RPC Performance Monitor Script
# Monitors indexer performance after premium ANKR RPC upgrade

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 Premium ANKR RPC Performance Monitor${NC}"
echo "========================================"

# Function to get current block from RPC
get_current_block() {
    curl -s https://rpc.ankr.com/monad_testnet/df5096a95ddedfa5ec32ad231b63250e719aef9ee7edcbbcea32b8539ae47205 \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | \
        jq -r '.result' | \
        xargs printf "%d"
}

# Function to extract indexer stats from logs
get_indexer_stats() {
    flyctl logs --app bitr-backend --since 5m | grep -E "(Processing batch|Lag|blocks/sec|EMERGENCY|WARNING)" | tail -10
}

# Function to calculate performance metrics
calculate_metrics() {
    local current_block=$1
    local last_indexed_block=$2
    local lag=$((current_block - last_indexed_block))
    local lag_seconds=$(echo "scale=1; $lag * 0.4" | bc)
    
    echo -e "${CYAN}📈 Performance Metrics:${NC}"
    echo "   Current Block: $current_block"
    echo "   Last Indexed: $last_indexed_block"
    echo "   Lag: $lag blocks (${lag_seconds}s)"
    
    if [ $lag -le 10 ]; then
        echo -e "   Status: ${GREEN}🟢 EXCELLENT${NC}"
    elif [ $lag -le 25 ]; then
        echo -e "   Status: ${YELLOW}🟡 GOOD${NC}"
    elif [ $lag -le 50 ]; then
        echo -e "   Status: ${YELLOW}⚠️ WARNING${NC}"
    else
        echo -e "   Status: ${RED}🚨 CRITICAL${NC}"
    fi
}

# Main monitoring loop
echo -e "${BLUE}🔍 Starting real-time monitoring...${NC}"
echo "Press Ctrl+C to stop"
echo ""

# Get initial state
echo -e "${CYAN}📊 Initial State Check:${NC}"
current_block=$(get_current_block)
echo "Current blockchain block: $current_block"

# Check if indexer is running
indexer_status=$(flyctl status --app bitr-backend | grep indexer || echo "Not found")
echo "Indexer status: $indexer_status"

echo ""
echo -e "${YELLOW}📋 Recent Indexer Activity:${NC}"
get_indexer_stats

echo ""
echo -e "${BLUE}🔄 Live Monitoring (updates every 30 seconds):${NC}"
echo "=============================================="

# Monitoring loop
counter=0
while true; do
    counter=$((counter + 1))
    
    echo -e "\n${CYAN}📊 Check #$counter - $(date '+%H:%M:%S')${NC}"
    
    # Get current blockchain state
    current_block=$(get_current_block)
    
    # Extract last indexed block from logs
    last_indexed=$(flyctl logs --app bitr-backend --since 2m | grep -o "Saved batch up to block [0-9]*" | tail -1 | grep -o "[0-9]*" || echo "0")
    
    if [ "$last_indexed" = "0" ]; then
        # Try alternative log format
        last_indexed=$(flyctl logs --app bitr-backend --since 2m | grep -o "lastIndexedBlock.*[0-9]*" | tail -1 | grep -o "[0-9]*" || echo "0")
    fi
    
    # Calculate and display metrics
    if [ "$last_indexed" != "0" ]; then
        calculate_metrics $current_block $last_indexed
    else
        echo -e "   ${YELLOW}⚠️ Could not determine last indexed block from logs${NC}"
        echo "   Current Block: $current_block"
    fi
    
    # Check for emergency mode or errors
    emergency_logs=$(flyctl logs --app bitr-backend --since 1m | grep -E "(EMERGENCY|CRITICAL|ERROR)" | tail -3)
    if [ -n "$emergency_logs" ]; then
        echo -e "\n${RED}🚨 Recent Alerts:${NC}"
        echo "$emergency_logs"
    fi
    
    # Show recent performance logs
    recent_perf=$(flyctl logs --app bitr-backend --since 1m | grep -E "(blocks/sec|Processing batch)" | tail -2)
    if [ -n "$recent_perf" ]; then
        echo -e "\n${GREEN}⚡ Recent Performance:${NC}"
        echo "$recent_perf"
    fi
    
    # Wait 30 seconds
    sleep 30
done
