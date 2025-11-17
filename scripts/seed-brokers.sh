#!/bin/bash

# HaulHub Brokers Table Seeding Script
# This script populates the brokers table with initial broker data

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="${AWS_PROFILE:-haul-hub}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
TABLE_NAME="HaulHub-BrokersTable-${ENVIRONMENT}"
REGION="us-east-1"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}HaulHub Brokers Table Seeding${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "AWS Profile: $AWS_PROFILE"
echo "Environment: $ENVIRONMENT"
echo "Table Name: $TABLE_NAME"
echo "Region: $REGION"
echo ""

# Check if table exists
echo -e "${YELLOW}Checking if table exists...${NC}"
TABLE_STATUS=$(aws dynamodb describe-table \
  --table-name $TABLE_NAME \
  --query 'Table.TableStatus' \
  --output text \
  --region $REGION \
  --profile $AWS_PROFILE 2>/dev/null || echo "NOT_FOUND")

if [ "$TABLE_STATUS" = "NOT_FOUND" ]; then
  echo -e "${RED}Error: Table $TABLE_NAME not found${NC}"
  echo "Please deploy the infrastructure first"
  exit 1
fi

echo -e "${GREEN}✓ Table exists (Status: $TABLE_STATUS)${NC}"
echo ""

# Check current item count
echo -e "${YELLOW}Checking current broker count...${NC}"
CURRENT_COUNT=$(aws dynamodb scan \
  --table-name $TABLE_NAME \
  --select COUNT \
  --query 'Count' \
  --output text \
  --region $REGION \
  --profile $AWS_PROFILE)

echo "Current brokers in table: $CURRENT_COUNT"
echo ""

if [ "$CURRENT_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}Warning: Table already contains $CURRENT_COUNT broker(s)${NC}"
  read -p "Do you want to add more brokers? (y/n): " CONTINUE
  if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
    echo "Seeding cancelled"
    exit 0
  fi
  echo ""
fi

# Function to add a broker
add_broker() {
  local broker_id=$1
  local broker_name=$2
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  echo -e "${YELLOW}Adding broker: $broker_name (ID: $broker_id)${NC}"
  
  aws dynamodb put-item \
    --table-name $TABLE_NAME \
    --item "{
      \"PK\": {\"S\": \"BROKER#${broker_id}\"},
      \"SK\": {\"S\": \"METADATA\"},
      \"brokerId\": {\"S\": \"${broker_id}\"},
      \"brokerName\": {\"S\": \"${broker_name}\"},
      \"isActive\": {\"BOOL\": true},
      \"createdAt\": {\"S\": \"${timestamp}\"},
      \"updatedAt\": {\"S\": \"${timestamp}\"}
    }" \
    --region $REGION \
    --profile $AWS_PROFILE \
    --return-consumed-capacity TOTAL > /dev/null
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Added: $broker_name${NC}"
  else
    echo -e "${RED}✗ Failed to add: $broker_name${NC}"
  fi
}

# Seed brokers
echo -e "${YELLOW}Seeding brokers...${NC}"
echo ""

# Major US Freight Brokers
add_broker "broker-001" "C.H. Robinson"
add_broker "broker-002" "XPO Logistics"
add_broker "broker-003" "TQL (Total Quality Logistics)"
add_broker "broker-004" "Coyote Logistics"
add_broker "broker-005" "Echo Global Logistics"
add_broker "broker-006" "Landstar System"
add_broker "broker-007" "J.B. Hunt Transport Services"
add_broker "broker-008" "Schneider National"
add_broker "broker-009" "Werner Enterprises"
add_broker "broker-010" "Knight-Swift Transportation"
add_broker "broker-011" "Hub Group"
add_broker "broker-012" "Transplace"
add_broker "broker-013" "Arrive Logistics"
add_broker "broker-014" "GlobalTranz"
add_broker "broker-015" "Convoy"
add_broker "broker-016" "Uber Freight"
add_broker "broker-017" "Loadsmart"
add_broker "broker-018" "Freightos"
add_broker "broker-019" "Flexport"
add_broker "broker-020" "Redwood Logistics"

echo ""
echo -e "${YELLOW}Verifying seeded data...${NC}"

# Get final count
FINAL_COUNT=$(aws dynamodb scan \
  --table-name $TABLE_NAME \
  --select COUNT \
  --query 'Count' \
  --output text \
  --region $REGION \
  --profile $AWS_PROFILE)

echo "Total brokers in table: $FINAL_COUNT"
echo ""

# List all brokers
echo -e "${YELLOW}Current brokers in table:${NC}"
aws dynamodb scan \
  --table-name $TABLE_NAME \
  --projection-expression "brokerId, brokerName, isActive" \
  --region $REGION \
  --profile $AWS_PROFILE \
  --output table

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Seeding Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Added brokers: $((FINAL_COUNT - CURRENT_COUNT))"
echo "Total brokers: $FINAL_COUNT"
echo ""
echo "You can now use these brokers in the frontend dropdown."
echo ""
