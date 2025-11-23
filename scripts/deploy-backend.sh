#!/bin/bash

# HaulHub Backend Deployment Script
# This script builds and deploys the NestJS backend to AWS Lambda

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="${AWS_PROFILE:-haul-hub}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
BACKEND_DIR="haulhub-backend"
INFRASTRUCTURE_DIR="haulhub-infrastructure"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}HaulHub Backend Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "AWS Profile: $AWS_PROFILE"
echo "Environment: $ENVIRONMENT"
echo ""

# Check if backend directory exists
if [ ! -d "$BACKEND_DIR" ]; then
    echo -e "${RED}Error: Backend directory not found${NC}"
    exit 1
fi

# Build shared package first
echo -e "${YELLOW}Building shared package...${NC}"
cd haulhub-shared
npm run build
cd ..

# Navigate to backend directory
cd $BACKEND_DIR

# Clean previous build
echo -e "${YELLOW}Cleaning previous build...${NC}"
rm -rf .lambda-package dist

# Install dependencies
echo -e "${YELLOW}Installing backend dependencies...${NC}"
npm install

# Build backend for Lambda
echo -e "${YELLOW}Building backend for Lambda...${NC}"
npm run build

# Run tests (AFTER build to ensure tests pass before deployment)
echo -e "${YELLOW}Running tests...${NC}"
npm test

echo -e "${GREEN}✓ All tests passed!${NC}"
echo ""

# Create Lambda deployment package
echo -e "${YELLOW}Creating Lambda deployment package...${NC}"
mkdir -p .lambda-package

# Copy compiled backend code to root of package
cp -r dist/haulhub-backend/src/* .lambda-package/

# Copy package.json and remove local workspace dependency
cp package.json .lambda-package/
cd .lambda-package

# Remove @haulhub/shared from dependencies since we bundle it directly
node -e "const pkg = require('./package.json'); delete pkg.dependencies['@haulhub/shared']; require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));"

# Install production dependencies
echo -e "${YELLOW}Installing production dependencies for Lambda...${NC}"
npm install --omit=dev --ignore-scripts --silent

# Copy @haulhub/shared as a proper npm package into node_modules
mkdir -p node_modules/@haulhub/shared
cp -r ../../haulhub-shared/dist/* node_modules/@haulhub/shared/
cp ../../haulhub-shared/package.json node_modules/@haulhub/shared/

cd ..

# Navigate to infrastructure directory
cd ../$INFRASTRUCTURE_DIR

# Deploy API stack (which includes Lambda function)
echo ""
echo -e "${YELLOW}Deploying API stack with Lambda function...${NC}"
echo -e "${YELLOW}This may take a few minutes...${NC}"
echo ""

npx cdk deploy HaulHub-Api-$ENVIRONMENT \
    --profile $AWS_PROFILE \
    -c environment=$ENVIRONMENT \
    --require-approval never

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Backend Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get API URL
API_URL=$(aws cloudformation describe-stacks \
    --stack-name HaulHub-Api-$ENVIRONMENT \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
    --output text \
    --region us-east-1 \
    --profile $AWS_PROFILE)

echo "API URL: $API_URL"
echo ""
echo -e "${GREEN}Test the API:${NC}"
echo "curl $API_URL/health"
echo ""
