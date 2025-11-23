#!/bin/bash

# HaulHub Infrastructure Deployment Script
# This script deploys all AWS CDK stacks for the HaulHub application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="${AWS_PROFILE:-haul-hub}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
INFRASTRUCTURE_DIR="haulhub-infrastructure"
DOMAIN_NAME="${DOMAIN_NAME:-}"
CREATE_HOSTED_ZONE="${CREATE_HOSTED_ZONE:-true}"
HOSTED_ZONE_ID="${HOSTED_ZONE_ID:-}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}HaulHub Infrastructure Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "AWS Profile: $AWS_PROFILE"
echo "Environment: $ENVIRONMENT"

if [ ! -z "$DOMAIN_NAME" ]; then
    echo "Custom Domain: $DOMAIN_NAME"
    echo "Create Hosted Zone: $CREATE_HOSTED_ZONE"
    if [ ! -z "$HOSTED_ZONE_ID" ]; then
        echo "Hosted Zone ID: $HOSTED_ZONE_ID"
    fi
else
    echo "Custom Domain: Not configured (will use CloudFront URL)"
fi

echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    echo -e "${RED}Error: AWS CDK is not installed${NC}"
    echo "Please install CDK: npm install -g aws-cdk"
    exit 1
fi

# Check if AWS profile exists
if ! aws configure list --profile $AWS_PROFILE &> /dev/null; then
    echo -e "${RED}Error: AWS profile '$AWS_PROFILE' not found${NC}"
    echo "Please configure AWS CLI with: aws configure --profile $AWS_PROFILE"
    exit 1
fi

# Navigate to infrastructure directory
if [ ! -d "$INFRASTRUCTURE_DIR" ]; then
    echo -e "${RED}Error: Infrastructure directory not found${NC}"
    exit 1
fi

cd $INFRASTRUCTURE_DIR

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install

# Build TypeScript
echo -e "${YELLOW}Building TypeScript...${NC}"
npm run build

# Run tests (AFTER build to ensure tests pass before deployment)
echo -e "${YELLOW}Running tests...${NC}"
npm test

echo -e "${GREEN}✓ All tests passed!${NC}"
echo ""

# Synthesize CloudFormation templates
echo -e "${YELLOW}Synthesizing CloudFormation templates...${NC}"
npm run synth -- -c environment=$ENVIRONMENT

# Check if CDK is bootstrapped
echo -e "${YELLOW}Checking CDK bootstrap status...${NC}"
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --profile $AWS_PROFILE &> /dev/null; then
    echo -e "${YELLOW}CDK not bootstrapped. Running bootstrap...${NC}"
    npx cdk bootstrap --profile $AWS_PROFILE
else
    echo -e "${GREEN}CDK already bootstrapped${NC}"
fi

# Build context flags
CONTEXT_FLAGS="-c environment=$ENVIRONMENT"

if [ ! -z "$DOMAIN_NAME" ]; then
    CONTEXT_FLAGS="$CONTEXT_FLAGS -c domainName=$DOMAIN_NAME"
    CONTEXT_FLAGS="$CONTEXT_FLAGS -c createHostedZone=$CREATE_HOSTED_ZONE"
    
    if [ ! -z "$HOSTED_ZONE_ID" ]; then
        CONTEXT_FLAGS="$CONTEXT_FLAGS -c hostedZoneId=$HOSTED_ZONE_ID"
    fi
fi

# Deploy all stacks
echo ""
echo -e "${YELLOW}Deploying all stacks...${NC}"
echo -e "${YELLOW}This may take several minutes...${NC}"
echo ""

npx cdk deploy --all \
    --profile $AWS_PROFILE \
    $CONTEXT_FLAGS \
    --require-approval never

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Stack outputs:"
aws cloudformation describe-stacks \
    --profile $AWS_PROFILE \
    --query 'Stacks[?starts_with(StackName, `HaulHub`)].{Name:StackName, Outputs:Outputs}' \
    --output table

echo ""

# Show nameservers if DNS stack was deployed with new hosted zone
if [ ! -z "$DOMAIN_NAME" ] && [ "$CREATE_HOSTED_ZONE" = "true" ]; then
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}IMPORTANT: Update Domain Nameservers${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
    
    NAMESERVERS=$(aws cloudformation describe-stacks \
        --stack-name HaulHub-DNS-$ENVIRONMENT \
        --query 'Stacks[0].Outputs[?OutputKey==`NameServers`].OutputValue' \
        --output text \
        --region us-east-1 \
        --profile $AWS_PROFILE 2>/dev/null || echo "")
    
    if [ ! -z "$NAMESERVERS" ]; then
        echo "Update your domain registrar with these nameservers:"
        echo "$NAMESERVERS" | tr ',' '\n' | sed 's/^/  /'
        echo ""
        echo "DNS propagation may take 5-60 minutes after updating nameservers."
        echo ""
    fi
fi

echo -e "${GREEN}Next steps:${NC}"
echo "1. Deploy backend: ./scripts/deploy-backend.sh"
echo "2. Seed broker data: cd haulhub-backend && npm run seed:brokers"
echo "3. Deploy frontend: ./scripts/deploy-frontend.sh"

if [ ! -z "$DOMAIN_NAME" ]; then
    echo ""
    echo "After deployment, your app will be available at:"
    echo "  https://$DOMAIN_NAME"
    echo "  https://www.$DOMAIN_NAME"
fi

echo ""
