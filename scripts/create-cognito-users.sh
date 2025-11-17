#!/bin/bash

# HaulHub Cognito Users Creation Script
# This script creates Cognito users that match the seeded DynamoDB profiles

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="${AWS_PROFILE:-haul-hub}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
REGION="us-east-1"
DEFAULT_PASSWORD="HaulHub2024!"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}HaulHub Cognito Users Creation${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "AWS Profile: $AWS_PROFILE"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Default Password: $DEFAULT_PASSWORD"
echo ""

# Get Cognito User Pool ID
echo -e "${YELLOW}Getting Cognito User Pool ID...${NC}"
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name HaulHub-Auth-${ENVIRONMENT} \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text \
  --region $REGION \
  --profile $AWS_PROFILE)

if [ -z "$USER_POOL_ID" ]; then
  echo -e "${RED}Error: Could not find Cognito User Pool ID${NC}"
  exit 1
fi

echo -e "${GREEN}✓ User Pool ID: $USER_POOL_ID${NC}"
echo ""

# Function to create a Cognito user
create_cognito_user() {
  local email=$1
  local full_name=$2
  local phone=$3
  local role=$4
  local password=$5
  
  echo -e "${YELLOW}Creating Cognito user: $email ($role)${NC}"
  
  # Check if user already exists
  USER_EXISTS=$(aws cognito-idp admin-get-user \
    --user-pool-id $USER_POOL_ID \
    --username $email \
    --region $REGION \
    --profile $AWS_PROFILE 2>&1 || echo "NOT_FOUND")
  
  if [[ "$USER_EXISTS" != *"NOT_FOUND"* ]] && [[ "$USER_EXISTS" != *"UserNotFoundException"* ]]; then
    echo -e "${YELLOW}⚠ User already exists: $email${NC}"
    echo "   Updating password and ensuring group membership..."
    
    # Set password
    aws cognito-idp admin-set-user-password \
      --user-pool-id $USER_POOL_ID \
      --username $email \
      --password $password \
      --permanent \
      --region $REGION \
      --profile $AWS_PROFILE > /dev/null 2>&1
    
    # Add to group (will fail silently if already in group)
    aws cognito-idp admin-add-user-to-group \
      --user-pool-id $USER_POOL_ID \
      --username $email \
      --group-name $role \
      --region $REGION \
      --profile $AWS_PROFILE > /dev/null 2>&1 || true
    
    echo -e "${GREEN}✓ Updated: $email${NC}"
    return
  fi
  
  # Create user
  aws cognito-idp admin-create-user \
    --user-pool-id $USER_POOL_ID \
    --username $email \
    --user-attributes \
      Name=email,Value=$email \
      Name=email_verified,Value=true \
      Name=name,Value="$full_name" \
      Name=phone_number,Value=$phone \
    --temporary-password $password \
    --message-action SUPPRESS \
    --region $REGION \
    --profile $AWS_PROFILE > /dev/null 2>&1
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to create: $email${NC}"
    return
  fi
  
  # Set permanent password
  aws cognito-idp admin-set-user-password \
    --user-pool-id $USER_POOL_ID \
    --username $email \
    --password $password \
    --permanent \
    --region $REGION \
    --profile $AWS_PROFILE > /dev/null 2>&1
  
  # Add user to group
  aws cognito-idp admin-add-user-to-group \
    --user-pool-id $USER_POOL_ID \
    --username $email \
    --group-name $role \
    --region $REGION \
    --profile $AWS_PROFILE > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Created: $email${NC}"
  else
    echo -e "${YELLOW}⚠ Created user but failed to add to group: $email${NC}"
    echo "   You may need to add the user to the '$role' group manually"
  fi
}

# Create users
echo -e "${BLUE}Creating Cognito users...${NC}"
echo ""

# Admin User
create_cognito_user "admin@haulhub.com" "Admin User" "+15550100" "Admin" "$DEFAULT_PASSWORD"

# Dispatchers
create_cognito_user "dispatcher1@haulhub.com" "John Dispatcher" "+15550101" "Dispatcher" "$DEFAULT_PASSWORD"
create_cognito_user "dispatcher2@haulhub.com" "Sarah Dispatcher" "+15550102" "Dispatcher" "$DEFAULT_PASSWORD"

# Drivers
create_cognito_user "driver1@haulhub.com" "Mike Driver" "+15550201" "Driver" "$DEFAULT_PASSWORD"
create_cognito_user "driver2@haulhub.com" "Lisa Driver" "+15550202" "Driver" "$DEFAULT_PASSWORD"

# Lorry Owners
create_cognito_user "owner1@haulhub.com" "Bob Owner" "+15550301" "LorryOwner" "$DEFAULT_PASSWORD"
create_cognito_user "owner2@haulhub.com" "Emma Owner" "+15550302" "LorryOwner" "$DEFAULT_PASSWORD"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verifying Created Users${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# List all users
echo -e "${YELLOW}Users in Cognito User Pool:${NC}"
aws cognito-idp list-users \
  --user-pool-id $USER_POOL_ID \
  --region $REGION \
  --profile $AWS_PROFILE \
  --query 'Users[].{Username:Username,Email:Attributes[?Name==`email`].Value|[0],Name:Attributes[?Name==`name`].Value|[0],Status:UserStatus}' \
  --output table

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Cognito Users Created!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Test Users Login Credentials:"
echo ""
echo -e "${BLUE}Admin:${NC}"
echo "  Email: admin@haulhub.com"
echo "  Password: $DEFAULT_PASSWORD"
echo ""
echo -e "${BLUE}Dispatchers:${NC}"
echo "  Email: dispatcher1@haulhub.com"
echo "  Password: $DEFAULT_PASSWORD"
echo ""
echo "  Email: dispatcher2@haulhub.com"
echo "  Password: $DEFAULT_PASSWORD"
echo ""
echo -e "${BLUE}Drivers:${NC}"
echo "  Email: driver1@haulhub.com"
echo "  Password: $DEFAULT_PASSWORD"
echo ""
echo "  Email: driver2@haulhub.com"
echo "  Password: $DEFAULT_PASSWORD"
echo ""
echo -e "${BLUE}Lorry Owners:${NC}"
echo "  Email: owner1@haulhub.com"
echo "  Password: $DEFAULT_PASSWORD"
echo ""
echo "  Email: owner2@haulhub.com"
echo "  Password: $DEFAULT_PASSWORD"
echo ""
echo -e "${YELLOW}IMPORTANT NOTES:${NC}"
echo "1. All users have the same password: $DEFAULT_PASSWORD"
echo "2. Users are email verified and can log in immediately"
echo "3. When users log in for the first time, the backend will create/update their DynamoDB profile"
echo "4. The seeded DynamoDB profiles will be overwritten on first login"
echo "5. You may need to manually update verification status in DynamoDB after first login"
echo ""
echo "Frontend URL: https://d23ld7dtwui8dz.cloudfront.net"
echo ""
