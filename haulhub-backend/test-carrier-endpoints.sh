#!/bin/bash

# Carrier Management System - Manual Testing Script
# Task 5: Checkpoint - Backend Foundation Complete
#
# This script tests the following flows:
# 1. User creation flow (dispatcher, driver, truck owner)
# 2. Truck/trailer creation flow
# 3. Trip query by carrier
#
# Prerequisites:
# - Backend server running on http://localhost:3000
# - Test data seeded in DynamoDB
# - Carrier user exists: carrier@swiftlogistics.com / TempPass123!

set -e

API_URL="http://localhost:3000/api"
CARRIER_EMAIL="carrier@swiftlogistics.com"
CARRIER_PASSWORD="TempPass123!"

echo "=========================================="
echo "Carrier Management System - Manual Tests"
echo "=========================================="
echo ""

# Step 1: Login as carrier
echo "Step 1: Logging in as carrier..."
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${CARRIER_EMAIL}\",
    \"password\": \"${CARRIER_PASSWORD}\"
  }")

# Extract token and carrierId
TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.idToken')
CARRIER_ID=$(echo $LOGIN_RESPONSE | jq -r '.user.carrierId')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful"
echo "   Carrier ID: $CARRIER_ID"
echo ""

# Step 2: Test user creation - Dispatcher
echo "Step 2: Creating a dispatcher..."
DISPATCHER_RESPONSE=$(curl -s -X POST "${API_URL}/carrier/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"role\": \"DISPATCHER\",
    \"name\": \"Test Dispatcher $(date +%s)\",
    \"email\": \"test.dispatcher.$(date +%s)@test.com\",
    \"phone\": \"(555) 123-4567\",
    \"address\": \"123 Test St\",
    \"city\": \"Atlanta\",
    \"state\": \"GA\",
    \"zip\": \"30301\",
    \"ein\": \"12-3456789\",
    \"ss\": \"123-45-6789\",
    \"rate\": 5.0
  }")

DISPATCHER_ID=$(echo $DISPATCHER_RESPONSE | jq -r '.user.userId')
TEMP_PASSWORD=$(echo $DISPATCHER_RESPONSE | jq -r '.temporaryPassword')

if [ "$DISPATCHER_ID" == "null" ] || [ -z "$DISPATCHER_ID" ]; then
  echo "❌ Dispatcher creation failed!"
  echo "Response: $DISPATCHER_RESPONSE"
  exit 1
fi

echo "✅ Dispatcher created successfully"
echo "   User ID: $DISPATCHER_ID"
echo "   Temp Password: $TEMP_PASSWORD"
echo ""

# Step 3: Test user creation - Driver
echo "Step 3: Creating a driver..."
DRIVER_RESPONSE=$(curl -s -X POST "${API_URL}/carrier/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"role\": \"DRIVER\",
    \"name\": \"Test Driver $(date +%s)\",
    \"email\": \"test.driver.$(date +%s)@test.com\",
    \"phone\": \"(555) 234-5678\",
    \"address\": \"456 Test Ave\",
    \"city\": \"Atlanta\",
    \"state\": \"GA\",
    \"zip\": \"30302\",
    \"ein\": \"23-4567890\",
    \"ss\": \"234-56-7890\",
    \"rate\": 0.50,
    \"corpName\": \"Test Transport LLC\",
    \"dob\": \"1985-05-15\",
    \"cdlClass\": \"A\",
    \"cdlState\": \"GA\",
    \"cdlIssued\": \"2010-01-01\",
    \"cdlExpires\": \"2026-01-01\",
    \"fax\": \"(555) 234-5679\"
  }")

DRIVER_ID=$(echo $DRIVER_RESPONSE | jq -r '.user.userId')

if [ "$DRIVER_ID" == "null" ] || [ -z "$DRIVER_ID" ]; then
  echo "❌ Driver creation failed!"
  echo "Response: $DRIVER_RESPONSE"
  exit 1
fi

echo "✅ Driver created successfully"
echo "   User ID: $DRIVER_ID"
echo ""

# Step 4: Test user creation - Truck Owner
echo "Step 4: Creating a truck owner..."
OWNER_RESPONSE=$(curl -s -X POST "${API_URL}/carrier/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"role\": \"TRUCK_OWNER\",
    \"name\": \"Test Owner $(date +%s)\",
    \"email\": \"test.owner.$(date +%s)@test.com\",
    \"phone\": \"(555) 345-6789\",
    \"address\": \"789 Test Rd\",
    \"city\": \"Atlanta\",
    \"state\": \"GA\",
    \"zip\": \"30304\",
    \"ein\": \"45-6789012\",
    \"ss\": \"456-78-9012\",
    \"company\": \"Test Trucking Inc\"
  }")

OWNER_ID=$(echo $OWNER_RESPONSE | jq -r '.user.userId')

if [ "$OWNER_ID" == "null" ] || [ -z "$OWNER_ID" ]; then
  echo "❌ Truck owner creation failed!"
  echo "Response: $OWNER_RESPONSE"
  exit 1
fi

echo "✅ Truck owner created successfully"
echo "   User ID: $OWNER_ID"
echo ""

# Step 5: Test truck creation
echo "Step 5: Creating a truck..."
TRUCK_RESPONSE=$(curl -s -X POST "${API_URL}/carrier/trucks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"truckOwnerId\": \"${OWNER_ID}\",
    \"plate\": \"TEST$(date +%s)\",
    \"brand\": \"Freightliner\",
    \"year\": 2020,
    \"vin\": \"1FUJGHDV8CLBP$(date +%s | tail -c 5)\",
    \"color\": \"White\"
  }")

TRUCK_ID=$(echo $TRUCK_RESPONSE | jq -r '.truck.truckId')

if [ "$TRUCK_ID" == "null" ] || [ -z "$TRUCK_ID" ]; then
  echo "❌ Truck creation failed!"
  echo "Response: $TRUCK_RESPONSE"
  exit 1
fi

echo "✅ Truck created successfully"
echo "   Truck ID: $TRUCK_ID"
echo ""

# Step 6: Test trailer creation
echo "Step 6: Creating a trailer..."
TRAILER_RESPONSE=$(curl -s -X POST "${API_URL}/carrier/trailers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"plate\": \"TRL$(date +%s)\",
    \"brand\": \"Great Dane\",
    \"year\": 2019,
    \"vin\": \"1GRAA0621KB$(date +%s | tail -c 6)\",
    \"color\": \"Silver\",
    \"reefer\": \"TK-5000\"
  }")

TRAILER_ID=$(echo $TRAILER_RESPONSE | jq -r '.trailer.trailerId')

if [ "$TRAILER_ID" == "null" ] || [ -z "$TRAILER_ID" ]; then
  echo "❌ Trailer creation failed!"
  echo "Response: $TRAILER_RESPONSE"
  exit 1
fi

echo "✅ Trailer created successfully"
echo "   Trailer ID: $TRAILER_ID"
echo ""

# Step 7: Test trip query by carrier
echo "Step 7: Querying trips by carrier..."
TRIPS_RESPONSE=$(curl -s -X GET "${API_URL}/trips?carrierId=${CARRIER_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

TRIP_COUNT=$(echo $TRIPS_RESPONSE | jq -r '.total')

if [ "$TRIP_COUNT" == "null" ]; then
  echo "❌ Trip query failed!"
  echo "Response: $TRIPS_RESPONSE"
  exit 1
fi

echo "✅ Trip query successful"
echo "   Total trips: $TRIP_COUNT"
echo ""

# Step 8: Test dashboard metrics
echo "Step 8: Fetching dashboard metrics..."
DASHBOARD_RESPONSE=$(curl -s -X GET "${API_URL}/carrier/dashboard" \
  -H "Authorization: Bearer ${TOKEN}")

ACTIVE_TRIPS=$(echo $DASHBOARD_RESPONSE | jq -r '.metrics.activeTrips')

if [ "$ACTIVE_TRIPS" == "null" ]; then
  echo "❌ Dashboard query failed!"
  echo "Response: $DASHBOARD_RESPONSE"
  exit 1
fi

echo "✅ Dashboard metrics retrieved successfully"
echo "   Active trips: $ACTIVE_TRIPS"
echo ""

# Summary
echo "=========================================="
echo "✅ All manual tests passed successfully!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - User creation: ✅ (Dispatcher, Driver, Truck Owner)"
echo "  - Truck creation: ✅"
echo "  - Trailer creation: ✅"
echo "  - Trip query: ✅ ($TRIP_COUNT trips found)"
echo "  - Dashboard metrics: ✅"
echo ""
echo "Backend foundation is complete and functional!"
