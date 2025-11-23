#!/bin/bash

# HaulHub Frontend Local Development Script
# This script starts the Angular frontend in development mode with hot-reload

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FRONTEND_DIR="haulhub-frontend"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}HaulHub Frontend - Development Mode${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}Error: Frontend directory not found${NC}"
    exit 1
fi

# Navigate to frontend directory
cd $FRONTEND_DIR

# Check if environment file exists
if [ ! -f "src/environments/environment.development.ts" ]; then
    echo -e "${YELLOW}Warning: Development environment file not found${NC}"
    echo "Please ensure src/environments/environment.development.ts exists"
    echo ""
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo ""
fi

# Start development server
echo -e "${GREEN}Starting development server...${NC}"
echo "Application will be available at: http://localhost:4200"
echo "Press Ctrl+C to stop"
echo ""

npm start
