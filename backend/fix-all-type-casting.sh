#!/bin/bash

# COMPREHENSIVE TYPE CASTING FIX
# This script fixes ALL bigint = character varying type mismatch issues

echo "🔧 Fixing ALL type casting issues across the entire backend..."

# Fix f.id = fixture_id patterns (43 instances)
echo "1️⃣ Fixing f.id = fixture_id patterns..."
find . -name "*.js" -type f -exec sed -i 's/f\.id = fo\.fixture_id/f.id::VARCHAR = fo.fixture_id/g' {} \;
find . -name "*.js" -type f -exec sed -i 's/f\.id = fr\.fixture_id/f.id::VARCHAR = fr.fixture_id/g' {} \;
find . -name "*.js" -type f -exec sed -i 's/f\.id = r\.fixture_id/f.id::VARCHAR = r.fixture_id/g' {} \;
find . -name "*.js" -type f -exec sed -i 's/f\.id = o\.fixture_id/f.id::VARCHAR = o.fixture_id/g' {} \;
find . -name "*.js" -type f -exec sed -i 's/f\.id = ft\.fixture_id/f.id::VARCHAR = ft.fixture_id/g' {} \;
find . -name "*.js" -type f -exec sed -i 's/f\.id = ou\.fixture_id/f.id::VARCHAR = ou.fixture_id/g' {} \;
find . -name "*.js" -type f -exec sed -i 's/f\.id = bt\.fixture_id/f.id::VARCHAR = bt.fixture_id/g' {} \;

# Fix SQL files too
echo "2️⃣ Fixing SQL schema files..."
find . -name "*.sql" -type f -exec sed -i 's/f\.id = fo\.fixture_id/f.id::VARCHAR = fo.fixture_id/g' {} \;
find . -name "*.sql" -type f -exec sed -i 's/f\.id = fr\.fixture_id/f.id::VARCHAR = fr.fixture_id/g' {} \;
find . -name "*.sql" -type f -exec sed -i 's/f\.id = r\.fixture_id/f.id::VARCHAR = r.fixture_id/g' {} \;
find . -name "*.sql" -type f -exec sed -i 's/f\.id = o\.fixture_id/f.id::VARCHAR = o.fixture_id/g' {} \;

# Fix any remaining generic f.id = *_id patterns
echo "3️⃣ Fixing remaining f.id patterns..."
find . -name "*.js" -type f -exec sed -i 's/ON f\.id = \([a-zA-Z_]*\)\.fixture_id\([^:]\)/ON f.id::VARCHAR = \1.fixture_id\2/g' {} \;
find . -name "*.sql" -type f -exec sed -i 's/ON f\.id = \([a-zA-Z_]*\)\.fixture_id\([^:]\)/ON f.id::VARCHAR = \1.fixture_id\2/g' {} \;

echo "✅ Type casting fix applied to ALL files!"
echo "📊 Files processed:"
echo "   - JavaScript files: $(find . -name "*.js" -type f | wc -l)"
echo "   - SQL files: $(find . -name "*.sql" -type f | wc -l)"
