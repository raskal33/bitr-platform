#!/bin/bash

# ODDYSSEY CYCLES SYSTEM DEPLOYMENT FIX
# This script ensures the corrected configuration is deployed properly

set -e  # Exit on any error

echo "🚀 === DEPLOYING FIXED ODDYSSEY CYCLES SYSTEM ==="
echo "Started at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"

# Check if we're in the right directory
if [ ! -f "fly.toml" ]; then
    echo "❌ Error: fly.toml not found. Please run this script from the backend directory."
    exit 1
fi

# Verify fly CLI is available
if ! command -v fly &> /dev/null; then
    echo "❌ Error: fly CLI not found. Please install it first."
    exit 1
fi

# Check authentication
if ! fly auth whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Fly.io. Please run 'fly auth login' first."
    exit 1
fi

echo "✅ Fly.io authentication verified"

# Verify the fixed configuration
echo "🔍 Verifying deployment configuration..."

# Check that fly.toml has the correct process definitions
if grep -q "npm run workers:coordinated" fly.toml; then
    echo "✅ Workers process correctly configured with coordination"
else
    echo "❌ Error: Workers process not properly configured"
    echo "Expected: npm run workers:coordinated"
    echo "Please ensure fly.toml is properly updated"
    exit 1
fi

if grep -q "npm run start:coordinated" fly.toml; then
    echo "✅ App process correctly configured with coordination"
else
    echo "❌ Error: App process not properly configured"
    echo "Expected: npm run start:coordinated"
    echo "Please ensure fly.toml is properly updated"
    exit 1
fi

# Load environment variables
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Environment variables loaded"
else
    echo "⚠️ Warning: .env file not found"
fi

# Verify required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is required"
    exit 1
fi

echo "✅ Environment variables verified"

# Pre-deployment checks
echo "🔍 Running pre-deployment checks..."

# Check if the fix script exists
if [ -f "scripts/fix-oddyssey-cycles-system.js" ]; then
    echo "✅ System fix script available"
else
    echo "❌ Error: System fix script not found"
    exit 1
fi

# Check if startup coordinator exists
if [ -f "startup-cron-coordinator.js" ]; then
    echo "✅ Startup coordinator available"
else
    echo "❌ Error: Startup coordinator not found"
    exit 1
fi

# Check if consolidated workers exist
if [ -f "cron/consolidated-workers.js" ]; then
    echo "✅ Consolidated workers available"
else
    echo "❌ Error: Consolidated workers not found"
    exit 1
fi

echo "✅ Pre-deployment checks passed"

# Deploy to Fly.io
echo "🚀 Deploying to Fly.io..."
fly deploy

if [ $? -eq 0 ]; then
    echo "✅ Deployment completed successfully!"
    
    # Wait for deployment to stabilize
    echo "⏳ Waiting for deployment to stabilize..."
    sleep 30
    
    # Run post-deployment verification
    echo "🔍 Running post-deployment verification..."
    
    # Check if the app is responding
    echo "📡 Checking app health..."
    if curl -f -s "https://bitredict-backend.fly.dev/health" > /dev/null; then
        echo "✅ App is responding to health checks"
    else
        echo "⚠️ Warning: App health check failed (may still be starting)"
    fi
    
    # Run the system fix script
    echo "🔧 Running system fix script..."
    if node scripts/fix-oddyssey-cycles-system.js; then
        echo "✅ System fix completed successfully"
    else
        echo "⚠️ Warning: System fix encountered issues"
    fi
    
    # Final status check
    echo "📊 Final deployment status:"
    fly status
    
    echo ""
    echo "🎉 === DEPLOYMENT COMPLETED ==="
    echo "✅ Fixed configuration deployed"
    echo "✅ Coordination system enabled"
    echo "✅ System fix executed"
    echo ""
    echo "🎯 NEXT STEPS:"
    echo "1. Monitor logs: fly logs"
    echo "2. Check cron jobs: fly ssh console -C 'ps aux | grep cron'"
    echo "3. Verify cycle creation at 00:04 UTC daily"
    echo "4. Monitor system health endpoint"
    echo ""
    echo "📅 Next cycle creation: Tomorrow at 00:04 UTC"
    echo "🔗 Health endpoint: https://bitredict-backend.fly.dev/health"
    echo "🔗 Cron status: https://bitredict-backend.fly.dev/api/cron/status"
    
else
    echo "❌ Deployment failed!"
    exit 1
fi
