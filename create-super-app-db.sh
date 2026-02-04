#!/bin/bash

echo "🗄️  Creating super_app Database with postgres User"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if postgres user exists
echo "1. Checking if postgres user exists..."
POSTGRES_EXISTS=$(psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='postgres';" 2>/dev/null)

if [ "$POSTGRES_EXISTS" = "1" ]; then
    echo -e "${GREEN}✓ postgres user already exists${NC}"
else
    echo -e "${YELLOW}⚠ postgres user does not exist, creating...${NC}"
    psql -d postgres -c "CREATE USER postgres WITH SUPERUSER PASSWORD 'postgres';" 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ postgres user created${NC}"
    else
        echo -e "${RED}✗ Failed to create postgres user${NC}"
        exit 1
    fi
fi

echo ""

# Check if super_app database exists
echo "2. Checking if super_app database exists..."
DB_EXISTS=$(psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='super_app';" 2>/dev/null)

if [ "$DB_EXISTS" = "1" ]; then
    echo -e "${YELLOW}⚠ super_app database already exists${NC}"
    read -p "Do you want to drop and recreate it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Dropping existing database..."
        psql -d postgres -c "DROP DATABASE super_app;" 2>&1
        echo -e "${GREEN}✓ Database dropped${NC}"
    else
        echo -e "${YELLOW}Skipping database creation${NC}"
        exit 0
    fi
fi

echo ""

# Create super_app database
echo "3. Creating super_app database..."
psql -d postgres -c "CREATE DATABASE super_app OWNER postgres;" 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ super_app database created${NC}"
else
    echo -e "${RED}✗ Failed to create database${NC}"
    exit 1
fi

echo ""

# Grant privileges
echo "4. Granting privileges..."
psql -d super_app -c "GRANT ALL PRIVILEGES ON DATABASE super_app TO postgres;" 2>&1
echo -e "${GREEN}✓ Privileges granted${NC}"

echo ""
echo "=================================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=================================================="
echo ""
echo "Database Details:"
echo "  Database: super_app"
echo "  User: postgres"
echo "  Password: postgres (change this!)"
echo ""
echo "Update your .env file:"
echo "  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/super_app"
echo ""
echo "Test connection:"
echo "  psql -U postgres -d super_app -c 'SELECT version();'"
echo ""
