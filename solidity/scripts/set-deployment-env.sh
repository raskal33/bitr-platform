#!/bin/bash

# BitredictPool Deployment Environment Setup Script
# This script helps you set the required environment variables for deploying BitredictPool

echo "🔧 BitredictPool Deployment Environment Setup"
echo "=============================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create one first."
    echo "💡 You can copy from .env.example if available"
    exit 1
fi

echo "📝 Please provide the addresses of your existing deployed contracts:"
echo ""

# Get BITR Token address
read -p "Enter BITR Token address: " BITR_TOKEN_ADDRESS
if [ -z "$BITR_TOKEN_ADDRESS" ]; then
    echo "❌ BITR Token address is required"
    exit 1
fi

# Get Guided Oracle address
read -p "Enter Guided Oracle address: " GUIDED_ORACLE_ADDRESS
if [ -z "$GUIDED_ORACLE_ADDRESS" ]; then
    echo "❌ Guided Oracle address is required"
    exit 1
fi

# Get Optimistic Oracle address (optional)
read -p "Enter Optimistic Oracle address (or press Enter to skip): " OPTIMISTIC_ORACLE_ADDRESS
if [ -z "$OPTIMISTIC_ORACLE_ADDRESS" ]; then
    OPTIMISTIC_ORACLE_ADDRESS="0x0000000000000000000000000000000000000000"
    echo "⚠️  Using zero address for Optimistic Oracle (can be updated later)"
fi

# Validate addresses format
if [[ ! $BITR_TOKEN_ADDRESS =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    echo "❌ Invalid BITR Token address format"
    exit 1
fi

if [[ ! $GUIDED_ORACLE_ADDRESS =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    echo "❌ Invalid Guided Oracle address format"
    exit 1
fi

if [[ ! $OPTIMISTIC_ORACLE_ADDRESS =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    echo "❌ Invalid Optimistic Oracle address format"
    exit 1
fi

# Update .env file
echo ""
echo "📝 Updating .env file..."

# Remove existing entries if they exist
sed -i '/^BITR_TOKEN_ADDRESS=/d' .env
sed -i '/^GUIDED_ORACLE_ADDRESS=/d' .env
sed -i '/^OPTIMISTIC_ORACLE_ADDRESS=/d' .env

# Add new entries
echo "BITR_TOKEN_ADDRESS=$BITR_TOKEN_ADDRESS" >> .env
echo "GUIDED_ORACLE_ADDRESS=$GUIDED_ORACLE_ADDRESS" >> .env
echo "OPTIMISTIC_ORACLE_ADDRESS=$OPTIMISTIC_ORACLE_ADDRESS" >> .env

echo "✅ Environment variables set successfully!"
echo ""
echo "📋 Contract addresses configured:"
echo "  - BITR Token: $BITR_TOKEN_ADDRESS"
echo "  - Guided Oracle: $GUIDED_ORACLE_ADDRESS"
echo "  - Optimistic Oracle: $OPTIMISTIC_ORACLE_ADDRESS"
echo ""
echo "🚀 You can now run the deployment script:"
echo "   npx hardhat run scripts/deploy-bitredictpool.js --network monad-testnet"
echo ""
echo "💡 Make sure you have:"
echo "   1. Sufficient MON balance for deployment"
echo "   2. Correct network configuration in hardhat.config.js"
echo "   3. Private key configured in .env"
