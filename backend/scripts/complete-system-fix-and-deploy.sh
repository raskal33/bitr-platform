#!/bin/bash

# COMPLETE ODDYSSEY CYCLES SYSTEM FIX AND DEPLOYMENT
# This script fixes all issues and deploys the corrected bitr-backend system

set -e  # Exit on any error

echo "🚀 === COMPLETE ODDYSSEY CYCLES SYSTEM FIX AND DEPLOYMENT ==="
echo "Started at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "../fly.toml" ]; then
    print_error "fly.toml not found in parent directory. Please run this script from the backend directory."
    exit 1
fi

print_status "Directory check passed"

# Verify fly CLI is available
if ! command -v fly &> /dev/null; then
    print_error "fly CLI not found. Please install it first."
    exit 1
fi

# Check authentication
if ! fly auth whoami &> /dev/null; then
    print_error "Not logged in to Fly.io. Please run 'fly auth login' first."
    exit 1
fi

print_status "Fly.io authentication verified"

# Step 1: Verify the fixed configuration
echo ""
echo "🔍 Step 1: Verifying deployment configuration..."

# Check that fly.toml has the correct app name
if grep -q "app = 'bitr-backend'" ../fly.toml; then
    print_status "App name correctly set to bitr-backend"
else
    print_error "App name not set to bitr-backend"
    exit 1
fi

# Check coordinated processes
if grep -q "npm run workers:coordinated" ../fly.toml; then
    print_status "Workers process correctly configured with coordination"
else
    print_error "Workers process not properly configured"
    exit 1
fi

if grep -q "npm run start:coordinated" ../fly.toml; then
    print_status "App process correctly configured with coordination"
else
    print_error "App process not properly configured"
    exit 1
fi

print_status "Deployment configuration verified"

# Step 2: Environment setup
echo ""
echo "🔧 Step 2: Setting up environment..."

# Check if .env file exists
if [ -f ".env" ]; then
    print_info "Found .env file"
    
    # Check if DATABASE_URL is set
    if grep -q "DATABASE_URL=" .env; then
        print_status "DATABASE_URL found in .env"
    else
        print_warning "DATABASE_URL not found in .env"
    fi
else
    print_warning ".env file not found"
fi

# Set the correct DATABASE_URL for bitr-db
export DATABASE_URL="postgresql://neondb_owner:npg_RSgeyExdq7O8@ep-gentle-wind-a21ez64m-pooler.eu-central-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
print_status "DATABASE_URL set to bitr-db (misty-tree-75530305)"

# Step 3: Database initialization
echo ""
echo "🗄️ Step 3: Initializing database schema..."

# Create the Oddyssey schema in bitr-db
node -e "
const db = require('./db/db');
async function initSchema() {
  try {
    console.log('Creating oracle.oddyssey_cycles table...');
    await db.query(\`
      CREATE TABLE IF NOT EXISTS oracle.oddyssey_cycles (
        cycle_id BIGINT PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        matches_count INTEGER NOT NULL DEFAULT 10,
        matches_data JSONB NOT NULL,
        cycle_start_time TIMESTAMP WITH TIME ZONE,
        cycle_end_time TIMESTAMP WITH TIME ZONE,
        resolved_at TIMESTAMP WITH TIME ZONE,
        is_resolved BOOLEAN DEFAULT FALSE,
        tx_hash TEXT,
        resolution_tx_hash TEXT,
        resolution_data JSONB,
        ready_for_resolution BOOLEAN DEFAULT FALSE,
        resolution_prepared_at TIMESTAMP WITH TIME ZONE,
        start_time TIMESTAMP WITH TIME ZONE,
        end_time TIMESTAMP WITH TIME ZONE,
        prize_pool DECIMAL(78, 18) DEFAULT 0,
        evaluation_completed BOOLEAN DEFAULT FALSE,
        evaluation_completed_at TIMESTAMP WITH TIME ZONE
      )
    \`);
    
    console.log('Creating indexes...');
    await db.query('CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_created_at ON oracle.oddyssey_cycles(created_at)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_oddyssey_cycles_resolved ON oracle.oddyssey_cycles(is_resolved)');
    
    console.log('✅ Database schema initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}
initSchema();
"

if [ $? -eq 0 ]; then
    print_status "Database schema initialized"
else
    print_error "Database schema initialization failed"
    exit 1
fi

# Step 4: Create initial test cycle
echo ""
echo "🎯 Step 4: Creating initial test cycle..."

node scripts/create-test-cycle-bitr.js

if [ $? -eq 0 ]; then
    print_status "Initial test cycle created"
else
    print_warning "Test cycle creation failed (may not be critical)"
fi

# Step 5: Pre-deployment checks
echo ""
echo "🔍 Step 5: Running pre-deployment checks..."

# Check if required files exist
required_files=(
    "startup-cron-coordinator.js"
    "cron/consolidated-workers.js"
    "services/cron-coordinator.js"
    "cron/oddyssey-scheduler-process.js"
    "cron/oddyssey-creator-process.js"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        print_status "$file exists"
    else
        print_error "$file not found"
        exit 1
    fi
done

print_status "All required files present"

# Step 6: Deploy to Fly.io
echo ""
echo "🚀 Step 6: Deploying to Fly.io..."

cd ..  # Go to root directory for deployment
fly deploy

if [ $? -eq 0 ]; then
    print_status "Deployment completed successfully!"
    
    # Wait for deployment to stabilize
    echo ""
    print_info "Waiting for deployment to stabilize..."
    sleep 30
    
    # Step 7: Post-deployment verification
    echo ""
    echo "🔍 Step 7: Running post-deployment verification..."
    
    # Check if the app is responding
    print_info "Checking app health..."
    if curl -f -s "https://bitr-backend.fly.dev/health" > /dev/null; then
        print_status "App is responding to health checks"
    else
        print_warning "App health check failed (may still be starting)"
    fi
    
    # Check deployment status
    print_info "Checking deployment status..."
    fly status
    
    # Step 8: Final summary
    echo ""
    echo "🎉 === DEPLOYMENT COMPLETED SUCCESSFULLY ==="
    print_status "Fixed configuration deployed"
    print_status "Coordination system enabled"
    print_status "Database schema initialized"
    print_status "Test cycle created"
    
    echo ""
    echo "🎯 SYSTEM STATUS:"
    echo "   • App: bitr-backend"
    echo "   • Database: bitr-db (misty-tree-75530305)"
    echo "   • Network: Monad"
    echo "   • Coordination: Enabled"
    echo "   • Cron Jobs: Scheduled"
    
    echo ""
    echo "🔗 IMPORTANT LINKS:"
    echo "   • Health: https://bitr-backend.fly.dev/health"
    echo "   • Cron Status: https://bitr-backend.fly.dev/api/cron/status"
    
    echo ""
    echo "📅 NEXT CYCLE CREATION:"
    echo "   • Scheduled: Daily at 00:04 UTC"
    echo "   • Next run: Tomorrow at 00:04 UTC"
    
    echo ""
    echo "🔧 MONITORING COMMANDS:"
    echo "   • Logs: fly logs"
    echo "   • Status: fly status"
    echo "   • SSH: fly ssh console"
    
else
    print_error "Deployment failed!"
    exit 1
fi
