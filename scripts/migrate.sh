#!/bin/bash

# Find the latest migration file
LATEST_MIGRATION=$(ls -t drizzle/*.sql 2>/dev/null | head -1)

if [ -z "$LATEST_MIGRATION" ]; then
    echo "❌ No migration files found in drizzle/ directory"
    echo "Run 'bun run db:generate' first"
    exit 1
fi

echo "📦 Running migration: $(basename $LATEST_MIGRATION)"
psql -U postgres -d super_app -f "$LATEST_MIGRATION"

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully"
else
    echo "❌ Migration failed"
    exit 1
fi
