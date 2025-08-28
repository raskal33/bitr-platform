#!/bin/bash

# Fix machine regions script
# Forces all machines to be in the correct region (fra)

set -e

echo "🔧 Fixing machine regions for Bitredict Backend..."

# Check if logged in to Fly.io
if ! fly auth whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Fly.io. Please run 'fly auth login' first."
    exit 1
fi

echo "✅ Fly.io authentication verified"

# Get current machines
echo "📋 Current machines:"
fly machines list

# Stop all machines
echo "🛑 Stopping all machines..."
fly machines stop --all

# Wait for machines to stop
echo "⏳ Waiting for machines to stop..."
sleep 15

# Destroy and recreate machines in correct region
echo "🚀 Recreating machines in fra region..."

# Stop all machines first
echo "🛑 Stopping all machines..."
fly machines stop --all

# Wait for machines to stop
echo "⏳ Waiting for machines to stop..."
sleep 20

# Destroy machines in wrong region
echo "🗑️ Destroying machines in wrong region..."
fly machines destroy --all --force

# Wait for destruction
echo "⏳ Waiting for machine destruction..."
sleep 10

# Deploy again to create machines in correct region
echo "🚀 Redeploying to create machines in fra region..."
fly deploy

# Wait for machines to start
echo "⏳ Waiting for machines to start..."
sleep 20

# Show final status
echo "📊 Final machine status:"
fly machines list

echo "✅ Machine regions fixed!"
echo "📋 All machines should now be in fra region" 