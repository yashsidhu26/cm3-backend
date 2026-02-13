#!/bin/bash

# Quick script to fix model names in .env file for Vertex AI

echo "🔧 Fixing .env model names for Vertex AI..."

if [ ! -f .env ]; then
    echo "❌ No .env file found!"
    exit 1
fi

# Backup .env
cp .env .env.backup
echo "✅ Backed up .env to .env.backup"

# Fix model names (remove "models/" prefix and update to correct Vertex AI names)
sed -i '' 's|GEMINI_MODEL=models/gemini-3-flash-preview|GEMINI_MODEL=gemini-3-flash-preview-lite|g' .env
sed -i '' 's|GEMINI_MODEL_THINKING=models/gemini-3-flash-preview|GEMINI_MODEL_THINKING=gemini-3-flash-preview-lite|g' .env

# Also fix if they have other variants
sed -i '' 's|GEMINI_MODEL=models/|GEMINI_MODEL=|g' .env
sed -i '' 's|GEMINI_MODEL_THINKING=models/|GEMINI_MODEL_THINKING=|g' .env

echo "✅ Fixed model names in .env"
echo ""
echo "Changes made:"
grep "GEMINI_MODEL" .env
echo ""
echo "🚀 You can now restart your server: bun dev"
