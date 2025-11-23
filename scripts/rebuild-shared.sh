#!/bin/bash

# HaulHub Shared Package Rebuild Script
# Run this script whenever you modify the shared package to update all dependents

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Rebuilding Shared Package${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Build shared package
echo -e "${YELLOW}Building shared package...${NC}"
cd haulhub-shared
npm run build
cd ..
echo ""

# Reinstall in backend to clear cache
echo -e "${YELLOW}Updating backend dependencies...${NC}"
cd haulhub-backend
rm -rf node_modules/@haulhub
npm install
cd ..
echo ""

# Reinstall in frontend to clear cache
echo -e "${YELLOW}Updating frontend dependencies...${NC}"
cd haulhub-frontend
rm -rf node_modules/@haulhub
npm install
cd ..
echo ""

echo -e "${GREEN}✓ Shared package rebuilt and dependencies updated${NC}"
echo -e "${YELLOW}Note: Restart your dev servers to pick up the changes${NC}"
