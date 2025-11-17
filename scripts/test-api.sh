#!/bin/bash

# HaulHub API Testing Script
# This script helps automate API endpoint testing after deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AWS_PROFILE="haul-hub"
ENVIRONMENT="dev"
REGION="us-east-1"
STACK_NAME="HaulHub-Api-${ENVIRONMENT}"

echo -e "${YELLOW}HaulHub API Testing Script${NC}"
echo "================================"
echo ""

# Get API endpoint from CloudFormation
echo "Fetching API endpoint..."
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text \
  --region us-east-1 \
  --profile ${AWS_PROFILE})

if [ -z "$API_ENDPOINT" ]; then
  echo -e "${RED}Error: Could not retrieve API endpoint${NC}"
  exit 1
fi

echo -e "${GREEN}API Endpoint: ${API_ENDPOINT}${NC}"
echo ""

# Check if access token is provided
if [ -z "$ACCESS_TOKEN" ]; then
  echo -e "${YELLOW}Warning: ACCESS_TOKEN environment variable not set${NC}"
  echo "Please set it with: export ACCESS_TOKEN='your_token_here'"
  echo ""
  echo "You can get a token by:"
  echo "1. Logging into the frontend application"
  echo "2. Opening browser developer tools"
  echo "3. Checking localStorage for the access token"
  echo ""
  read -p "Enter your access token now (or press Enter to skip): " TOKEN_INPUT
  if [ -n "$TOKEN_INPUT" ]; then
    ACCESS_TOKEN="$TOKEN_INPUT"
  else
    echo -e "${RED}Skipping authenticated tests${NC}"
  fi
fi

echo ""
echo "================================"
echo "Starting API Tests"
echo "================================"
echo ""

# Test 1: Health Check (if available)
echo -e "${YELLOW}Test 1: API Health Check${NC}"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${API_ENDPOINT}/health" || echo "000")
if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "404" ]; then
  echo -e "${GREEN}✓ API is reachable${NC}"
else
  echo -e "${RED}✗ API health check failed (HTTP $RESPONSE)${NC}"
fi
echo ""

# Test 2: Get Brokers (Admin endpoint)
if [ -n "$ACCESS_TOKEN" ]; then
  echo -e "${YELLOW}Test 2: Get All Brokers${NC}"
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "${API_ENDPOINT}/admin/brokers")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Successfully retrieved brokers${NC}"
    echo "Response: $BODY" | head -c 200
    echo "..."
  else
    echo -e "${RED}✗ Failed to retrieve brokers (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
  fi
  echo ""
  
  # Test 3: Get Trips
  echo -e "${YELLOW}Test 3: Get Trips${NC}"
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "${API_ENDPOINT}/trips")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Successfully retrieved trips${NC}"
    echo "Response: $BODY" | head -c 200
    echo "..."
  else
    echo -e "${RED}✗ Failed to retrieve trips (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
  fi
  echo ""
  
  # Test 4: Get User Profile
  echo -e "${YELLOW}Test 4: Get User Profile${NC}"
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "${API_ENDPOINT}/users/profile")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Successfully retrieved user profile${NC}"
    echo "Response: $BODY" | head -c 200
    echo "..."
  else
    echo -e "${RED}✗ Failed to retrieve user profile (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
  fi
  echo ""
  
  # Test 5: Create Trip (requires dispatcher role)
  echo -e "${YELLOW}Test 5: Create Trip (Dispatcher only)${NC}"
  TRIP_DATA='{
    "pickupLocation": "Test Pickup Location",
    "dropoffLocation": "Test Dropoff Location",
    "scheduledPickupDatetime": "2024-12-25T10:00:00Z",
    "brokerId": "broker-001",
    "brokerPayment": 1500,
    "lorryId": "TEST-123",
    "driverId": "DL-TEST",
    "driverName": "Test Driver",
    "lorryOwnerPayment": 800,
    "driverPayment": 500
  }'
  
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$TRIP_DATA" \
    "${API_ENDPOINT}/trips")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')
  
  if [ "$HTTP_CODE" = "201" ]; then
    echo -e "${GREEN}✓ Successfully created trip${NC}"
    echo "Response: $BODY"
    
    # Extract trip ID for further tests
    TRIP_ID=$(echo "$BODY" | grep -o '"tripId":"[^"]*' | cut -d'"' -f4)
    if [ -n "$TRIP_ID" ]; then
      echo -e "${GREEN}Trip ID: $TRIP_ID${NC}"
      
      # Test 6: Get Trip by ID
      echo ""
      echo -e "${YELLOW}Test 6: Get Trip by ID${NC}"
      RESPONSE=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        "${API_ENDPOINT}/trips/${TRIP_ID}")
      
      HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
      BODY=$(echo "$RESPONSE" | sed '$d')
      
      if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Successfully retrieved trip by ID${NC}"
        echo "Response: $BODY" | head -c 200
        echo "..."
      else
        echo -e "${RED}✗ Failed to retrieve trip by ID (HTTP $HTTP_CODE)${NC}"
        echo "Response: $BODY"
      fi
      
      # Test 7: Update Trip Status
      echo ""
      echo -e "${YELLOW}Test 7: Update Trip Status${NC}"
      STATUS_DATA='{"status": "Picked Up"}'
      
      RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X PATCH \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$STATUS_DATA" \
        "${API_ENDPOINT}/trips/${TRIP_ID}/status")
      
      HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
      BODY=$(echo "$RESPONSE" | sed '$d')
      
      if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Successfully updated trip status${NC}"
        echo "Response: $BODY" | head -c 200
        echo "..."
      else
        echo -e "${RED}✗ Failed to update trip status (HTTP $HTTP_CODE)${NC}"
        echo "Response: $BODY"
      fi
    fi
  elif [ "$HTTP_CODE" = "403" ]; then
    echo -e "${YELLOW}⚠ User does not have Dispatcher role (HTTP $HTTP_CODE)${NC}"
    echo "This is expected if testing with a non-Dispatcher user"
  else
    echo -e "${RED}✗ Failed to create trip (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
  fi
  echo ""
else
  echo -e "${YELLOW}Skipping authenticated tests (no access token provided)${NC}"
  echo ""
fi

# Test DynamoDB Tables
echo "================================"
echo "Verifying DynamoDB Tables"
echo "================================"
echo ""

echo -e "${YELLOW}Checking Trips Table${NC}"
TRIPS_TABLE=$(aws dynamodb describe-table \
  --table-name "HaulHub-TripsTable-${ENVIRONMENT}" \
  --query 'Table.TableName' \
  --output text \
  --region ${REGION} \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "NOT_FOUND")

if [ "$TRIPS_TABLE" != "NOT_FOUND" ]; then
  echo -e "${GREEN}✓ Trips table exists${NC}"
  ITEM_COUNT=$(aws dynamodb scan \
    --table-name "HaulHub-TripsTable-${ENVIRONMENT}" \
    --select COUNT \
    --query 'Count' \
    --output text \
    --region ${REGION} \
    --profile ${AWS_PROFILE})
  echo "  Items in table: $ITEM_COUNT"
else
  echo -e "${RED}✗ Trips table not found${NC}"
fi
echo ""

echo -e "${YELLOW}Checking Brokers Table${NC}"
BROKERS_TABLE=$(aws dynamodb describe-table \
  --table-name "HaulHub-BrokersTable-${ENVIRONMENT}" \
  --query 'Table.TableName' \
  --output text \
  --region ${REGION} \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "NOT_FOUND")

if [ "$BROKERS_TABLE" != "NOT_FOUND" ]; then
  echo -e "${GREEN}✓ Brokers table exists (seeded with 20 brokers)${NC}"
  ITEM_COUNT=$(aws dynamodb scan \
    --table-name "HaulHub-BrokersTable-${ENVIRONMENT}" \
    --select COUNT \
    --query 'Count' \
    --output text \
    --region ${REGION} \
    --profile ${AWS_PROFILE})
  echo "  Items in table: $ITEM_COUNT"
else
  echo -e "${RED}✗ Brokers table not found${NC}"
fi
echo ""

echo -e "${YELLOW}Checking Lorries Table${NC}"
LORRIES_TABLE=$(aws dynamodb describe-table \
  --table-name "HaulHub-LorriesTable-${ENVIRONMENT}" \
  --query 'Table.TableName' \
  --output text \
  --region ${REGION} \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "NOT_FOUND")

if [ "$LORRIES_TABLE" != "NOT_FOUND" ]; then
  echo -e "${GREEN}✓ Lorries table exists${NC}"
  ITEM_COUNT=$(aws dynamodb scan \
    --table-name "HaulHub-LorriesTable-${ENVIRONMENT}" \
    --select COUNT \
    --query 'Count' \
    --output text \
    --region ${REGION} \
    --profile ${AWS_PROFILE})
  echo "  Items in table: $ITEM_COUNT"
else
  echo -e "${RED}✗ Lorries table not found${NC}"
fi
echo ""

echo -e "${YELLOW}Checking Users Table${NC}"
USERS_TABLE=$(aws dynamodb describe-table \
  --table-name "HaulHub-UsersTable-${ENVIRONMENT}" \
  --query 'Table.TableName' \
  --output text \
  --region ${REGION} \
  --profile ${AWS_PROFILE} 2>/dev/null || echo "NOT_FOUND")

if [ "$USERS_TABLE" != "NOT_FOUND" ]; then
  echo -e "${GREEN}✓ Users table exists${NC}"
  ITEM_COUNT=$(aws dynamodb scan \
    --table-name "HaulHub-UsersTable-${ENVIRONMENT}" \
    --select COUNT \
    --query 'Count' \
    --output text \
    --region ${REGION} \
    --profile ${AWS_PROFILE})
  echo "  Items in table: $ITEM_COUNT"
else
  echo -e "${RED}✗ Users table not found${NC}"
fi
echo ""

echo "================================"
echo "Testing Complete"
echo "================================"
echo ""
echo "For detailed manual testing, see: scripts/verify-deployment.md"
echo ""
