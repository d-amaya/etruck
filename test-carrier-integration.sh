#!/bin/bash

# Carrier Management System Integration Test Script
# This script tests the frontend-backend integration for all carrier management flows

set -e

BASE_URL="http://localhost:3000"
CARRIER_ID="550e8400-e29b-41d4-a716-446655440000"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to print test results
print_test_result() {
    local test_name=$1
    local status=$2
    local details=$3
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        echo -e "  ${YELLOW}Details:${NC} $details"
        ((TESTS_FAILED++))
    fi
}

# Helper function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local temp_file=$(mktemp)
    
    if [ -z "$data" ]; then
        curl -s -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer mock-carrier-token" \
            -w "\n%{http_code}" > "$temp_file"
    else
        curl -s -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer mock-carrier-token" \
            -d "$data" \
            -w "\n%{http_code}" > "$temp_file"
    fi
    
    cat "$temp_file"
    rm "$temp_file"
}

echo "=========================================="
echo "Carrier Management Integration Tests"
echo "=========================================="
echo ""

# Test 1: Dashboard Metrics
echo "Test 1: Dashboard Metrics"
response=$(api_call GET "/carrier/dashboard")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    # Check if response contains expected fields
    if echo "$body" | grep -q "totalTrips" && echo "$body" | grep -q "totalAssets"; then
        print_test_result "Dashboard returns metrics" "PASS"
    else
        print_test_result "Dashboard returns metrics" "FAIL" "Missing expected fields in response"
    fi
else
    print_test_result "Dashboard returns metrics" "FAIL" "HTTP $http_code"
fi
echo ""

# Test 2: List Users
echo "Test 2: List Users"
response=$(api_call GET "/carrier/users")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    if echo "$body" | grep -q "userId"; then
        print_test_result "List users endpoint" "PASS"
    else
        print_test_result "List users endpoint" "FAIL" "Response doesn't contain user data"
    fi
else
    print_test_result "List users endpoint" "FAIL" "HTTP $http_code"
fi
echo ""

# Test 3: Create User (Dispatcher)
echo "Test 3: Create User (Dispatcher)"
user_data='{
  "name": "Test Dispatcher",
  "email": "test.dispatcher@example.com",
  "phone": "555-0100",
  "address": "123 Test St",
  "city": "Test City",
  "state": "CA",
  "zip": "90001",
  "ein": "12-3456789",
  "ss": "123-45-6789",
  "role": "DISPATCHER",
  "rate": 0.05
}'

response=$(api_call POST "/carrier/users" "$user_data")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
    if echo "$body" | grep -q "userId"; then
        print_test_result "Create dispatcher user" "PASS"
        CREATED_USER_ID=$(echo "$body" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
    else
        print_test_result "Create dispatcher user" "FAIL" "No userId in response"
    fi
else
    print_test_result "Create dispatcher user" "FAIL" "HTTP $http_code - $body"
fi
echo ""

# Test 4: List Trucks
echo "Test 4: List Trucks"
response=$(api_call GET "/carrier/trucks")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    if echo "$body" | grep -q "truckId" || echo "$body" | grep -q "\[\]"; then
        print_test_result "List trucks endpoint" "PASS"
    else
        print_test_result "List trucks endpoint" "FAIL" "Unexpected response format"
    fi
else
    print_test_result "List trucks endpoint" "FAIL" "HTTP $http_code"
fi
echo ""

# Test 5: Create Truck (requires truck owner)
echo "Test 5: Create Truck"
# First create a truck owner
owner_data='{
  "name": "Test Owner",
  "email": "test.owner@example.com",
  "phone": "555-0101",
  "address": "456 Owner St",
  "city": "Test City",
  "state": "CA",
  "zip": "90001",
  "ein": "98-7654321",
  "ss": "987-65-4321",
  "role": "TRUCK_OWNER",
  "company": "Test Trucking Co"
}'

response=$(api_call POST "/carrier/users" "$owner_data")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
    OWNER_ID=$(echo "$body" | grep -o '"userId":"[^"]*"' | cut -d'"' -f4)
    
    # Now create truck
    truck_data="{
      \"plate\": \"TEST123\",
      \"brand\": \"Freightliner\",
      \"year\": 2020,
      \"vin\": \"1FUJGHDV8CLBP1234\",
      \"color\": \"White\",
      \"truckOwnerId\": \"$OWNER_ID\"
    }"
    
    response=$(api_call POST "/carrier/trucks" "$truck_data")
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
        if echo "$body" | grep -q "truckId"; then
            print_test_result "Create truck" "PASS"
            CREATED_TRUCK_ID=$(echo "$body" | grep -o '"truckId":"[^"]*"' | cut -d'"' -f4)
        else
            print_test_result "Create truck" "FAIL" "No truckId in response"
        fi
    else
        print_test_result "Create truck" "FAIL" "HTTP $http_code - $body"
    fi
else
    print_test_result "Create truck" "FAIL" "Could not create truck owner: HTTP $http_code"
fi
echo ""

# Test 6: List Trailers
echo "Test 6: List Trailers"
response=$(api_call GET "/carrier/trailers")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
    if echo "$body" | grep -q "trailerId" || echo "$body" | grep -q "\[\]"; then
        print_test_result "List trailers endpoint" "PASS"
    else
        print_test_result "List trailers endpoint" "FAIL" "Unexpected response format"
    fi
else
    print_test_result "List trailers endpoint" "FAIL" "HTTP $http_code"
fi
echo ""

# Test 7: Create Trailer
echo "Test 7: Create Trailer"
trailer_data='{
  "plate": "TRL456",
  "brand": "Great Dane",
  "year": 2019,
  "vin": "1GRAA0621KB123456",
  "color": "Silver",
  "reefer": "TK-5000"
}'

response=$(api_call POST "/carrier/trailers" "$trailer_data")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
    if echo "$body" | grep -q "trailerId"; then
        print_test_result "Create trailer" "PASS"
        CREATED_TRAILER_ID=$(echo "$body" | grep -o '"trailerId":"[^"]*"' | cut -d'"' -f4)
    else
        print_test_result "Create trailer" "FAIL" "No trailerId in response"
    fi
else
    print_test_result "Create trailer" "FAIL" "HTTP $http_code - $body"
fi
echo ""

# Test 8: Update User Status
if [ ! -z "$CREATED_USER_ID" ]; then
    echo "Test 8: Update User Status"
    response=$(api_call PATCH "/carrier/users/$CREATED_USER_ID/status" '{"isActive": false}')
    http_code=$(echo "$response" | tail -1)
    
    if [ "$http_code" = "200" ]; then
        print_test_result "Deactivate user" "PASS"
    else
        print_test_result "Deactivate user" "FAIL" "HTTP $http_code"
    fi
    echo ""
fi

# Test 9: Update Truck Status
if [ ! -z "$CREATED_TRUCK_ID" ]; then
    echo "Test 9: Update Truck Status"
    response=$(api_call PATCH "/carrier/trucks/$CREATED_TRUCK_ID/status" '{"isActive": false}')
    http_code=$(echo "$response" | tail -1)
    
    if [ "$http_code" = "200" ]; then
        print_test_result "Deactivate truck" "PASS"
    else
        print_test_result "Deactivate truck" "FAIL" "HTTP $http_code"
    fi
    echo ""
fi

# Test 10: Update Trailer Status
if [ ! -z "$CREATED_TRAILER_ID" ]; then
    echo "Test 10: Update Trailer Status"
    response=$(api_call PATCH "/carrier/trailers/$CREATED_TRAILER_ID/status" '{"isActive": false}')
    http_code=$(echo "$response" | tail -1)
    
    if [ "$http_code" = "200" ]; then
        print_test_result "Deactivate trailer" "PASS"
    else
        print_test_result "Deactivate trailer" "FAIL" "HTTP $http_code"
    fi
    echo ""
fi

# Test 11: Error Handling - Duplicate Email
echo "Test 11: Error Handling - Duplicate Email"
duplicate_user='{
  "name": "Duplicate User",
  "email": "test.dispatcher@example.com",
  "phone": "555-0102",
  "address": "789 Test St",
  "city": "Test City",
  "state": "CA",
  "zip": "90001",
  "ein": "11-2233445",
  "ss": "111-22-3344",
  "role": "DISPATCHER",
  "rate": 0.05
}'

response=$(api_call POST "/carrier/users" "$duplicate_user")
http_code=$(echo "$response" | tail -1)

if [ "$http_code" = "400" ] || [ "$http_code" = "409" ]; then
    print_test_result "Duplicate email validation" "PASS"
else
    print_test_result "Duplicate email validation" "FAIL" "Expected 400/409, got HTTP $http_code"
fi
echo ""

# Test 12: Error Handling - Invalid Data
echo "Test 12: Error Handling - Invalid Data"
invalid_user='{
  "name": "Invalid User",
  "email": "not-an-email",
  "phone": "555-0103",
  "role": "DISPATCHER"
}'

response=$(api_call POST "/carrier/users" "$invalid_user")
http_code=$(echo "$response" | tail -1)

if [ "$http_code" = "400" ]; then
    print_test_result "Invalid data validation" "PASS"
else
    print_test_result "Invalid data validation" "FAIL" "Expected 400, got HTTP $http_code"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo "Total: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
