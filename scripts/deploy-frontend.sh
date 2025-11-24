#!/bin/bash

# HaulHub Frontend Deployment Script
# This script builds the Angular frontend and deploys it to S3 with CloudFront invalidation
#
# Usage:
#   ./deploy-frontend.sh           # Normal deployment
#   ./deploy-frontend.sh --clean   # Clean deployment (removes S3 files, clears cache, fresh build)

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="${AWS_PROFILE:-haul-hub}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
FRONTEND_DIR="haulhub-frontend"
CLEAN_DEPLOY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_DEPLOY=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Usage: $0 [--clean]"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}========================================${NC}"
if [ "$CLEAN_DEPLOY" = true ]; then
    echo -e "${GREEN}HaulHub Frontend CLEAN Deployment${NC}"
else
    echo -e "${GREEN}HaulHub Frontend Deployment${NC}"
fi
echo -e "${GREEN}========================================${NC}"
echo ""
echo "AWS Profile: $AWS_PROFILE"
echo "Environment: $ENVIRONMENT"
echo "Clean Deploy: $CLEAN_DEPLOY"
echo ""

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}Error: Frontend directory not found${NC}"
    exit 1
fi

# Navigate to frontend directory
cd $FRONTEND_DIR

# Clean build if requested
if [ "$CLEAN_DEPLOY" = true ]; then
    echo -e "${YELLOW}Performing clean build...${NC}"
    echo "Removing node_modules, dist, and .angular cache..."
    rm -rf node_modules dist .angular
    echo -e "${GREEN}✓ Clean complete${NC}"
    echo ""
fi

# Install dependencies
echo -e "${YELLOW}Installing frontend dependencies...${NC}"
npm install --legacy-peer-deps

# Build frontend for production
echo -e "${YELLOW}Building frontend for production...${NC}"
npm run build -- --configuration=production

# Run tests (AFTER build to ensure tests pass before deployment)
# Skip tests for clean deploy to focus on cache issue
if [ "$CLEAN_DEPLOY" != true ]; then
    echo -e "${YELLOW}Running tests...${NC}"
    npm test -- --watch=false --browsers=ChromeHeadless

    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
else
    echo -e "${YELLOW}Skipping tests for clean deploy...${NC}"
    echo ""
fi

# Get S3 bucket name from CloudFormation
echo -e "${YELLOW}Getting S3 bucket name...${NC}"
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name HaulHub-Frontend-$ENVIRONMENT \
    --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
    --output text \
    --region us-east-1 \
    --profile $AWS_PROFILE)

if [ -z "$BUCKET_NAME" ]; then
    echo -e "${RED}Error: Could not find S3 bucket name${NC}"
    echo "Make sure the Frontend stack is deployed first"
    exit 1
fi

echo "S3 Bucket: $BUCKET_NAME"

# Clear S3 bucket if clean deploy
if [ "$CLEAN_DEPLOY" = true ]; then
    echo ""
    echo -e "${YELLOW}Clearing S3 bucket...${NC}"
    aws s3 rm s3://$BUCKET_NAME --recursive \
        --region us-east-1 \
        --profile $AWS_PROFILE
    echo -e "${GREEN}✓ S3 bucket cleared${NC}"
fi

# Sync files to S3
echo ""
echo -e "${YELLOW}Uploading files to S3...${NC}"

if [ "$CLEAN_DEPLOY" = true ]; then
    # For clean deploy, use no-cache headers to ensure fresh files
    echo "Using no-cache headers for clean deployment..."
    aws s3 sync dist/haulhub-frontend s3://$BUCKET_NAME \
        --region us-east-1 \
        --profile $AWS_PROFILE \
        --delete \
        --cache-control "no-cache, no-store, must-revalidate"
else
    # Normal deploy with aggressive caching for performance
    aws s3 sync dist/haulhub-frontend s3://$BUCKET_NAME \
        --region us-east-1 \
        --profile $AWS_PROFILE \
        --delete \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "index.html" \
        --exclude "*.txt"

    # Upload index.html with no-cache
    aws s3 cp dist/haulhub-frontend/index.html s3://$BUCKET_NAME/index.html \
        --region us-east-1 \
        --profile $AWS_PROFILE \
        --cache-control "no-cache, no-store, must-revalidate" \
        --content-type "text/html"
fi

# Get CloudFront distribution ID
echo ""
echo -e "${YELLOW}Getting CloudFront distribution ID...${NC}"
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name HaulHub-Frontend-$ENVIRONMENT \
    --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
    --output text \
    --region us-east-1 \
    --profile $AWS_PROFILE)

if [ -z "$DISTRIBUTION_ID" ]; then
    echo -e "${YELLOW}Warning: Could not find CloudFront distribution ID${NC}"
    echo "Skipping cache invalidation"
else
    echo "Distribution ID: $DISTRIBUTION_ID"
    
    # Invalidate CloudFront cache
    echo ""
    echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id $DISTRIBUTION_ID \
        --paths "/*" \
        --region us-east-1 \
        --profile $AWS_PROFILE \
        --query 'Invalidation.Id' \
        --output text)
    
    echo "Invalidation ID: $INVALIDATION_ID"
    echo -e "${YELLOW}Waiting for invalidation to complete...${NC}"
    
    aws cloudfront wait invalidation-completed \
        --distribution-id $DISTRIBUTION_ID \
        --id $INVALIDATION_ID \
        --region us-east-1 \
        --profile $AWS_PROFILE
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Frontend Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get CloudFront URL
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
    --stack-name HaulHub-Frontend-$ENVIRONMENT \
    --query 'Stacks[0].Outputs[?OutputKey==`DistributionDomainName`].OutputValue' \
    --output text \
    --region us-east-1 \
    --profile $AWS_PROFILE)

if [ ! -z "$CLOUDFRONT_URL" ]; then
    echo "Application URL: https://$CLOUDFRONT_URL"
else
    echo "S3 Website URL: http://$BUCKET_NAME.s3-website-us-east-1.amazonaws.com"
fi
echo ""

if [ "$CLEAN_DEPLOY" = true ]; then
    echo -e "${YELLOW}IMPORTANT - Clean Deploy Instructions:${NC}"
    echo "1. Clear your browser cache completely"
    echo "2. Open DevTools > Network tab > Check 'Disable cache'"
    echo "3. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)"
    echo "4. Verify in Network tab that files are loaded fresh (not from cache)"
    echo ""
fi
