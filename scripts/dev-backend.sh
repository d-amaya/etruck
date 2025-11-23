#!/bin/bash

# HaulHub Backend Local Development Script
# This script starts the NestJS backend in development mode with hot-reload

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BACKEND_DIR="haulhub-backend"
SHARED_DIR="haulhub-shared"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}HaulHub Backend - Development Mode${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if backend directory exists
if [ ! -d "$BACKEND_DIR" ]; then
    echo -e "${RED}Error: Backend directory not found${NC}"
    exit 1
fi

# Build shared package first to ensure latest changes
echo -e "${YELLOW}Building shared package...${NC}"
cd $SHARED_DIR
npm run build
cd ..
echo ""

# Navigate to backend directory
cd $BACKEND_DIR

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Creating .env from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "Please update .env with your AWS resource IDs"
    else
        echo "Please create a .env file with required environment variables"
    fi
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
echo "API will be available at: http://localhost:3000"
echo "Press Ctrl+C to stop"
echo ""

npm run start:dev
