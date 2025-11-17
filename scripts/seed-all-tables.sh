#!/bin/bash

# HaulHub Complete Database Seeding Script
# This script seeds all tables with test data including users, lorries, and trips

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

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}HaulHub Complete Database Seeding${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "AWS Profile: $AWS_PROFILE"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""

# Get current timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ============================================
# SEED USERS TABLE
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}1. Seeding Users Table${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

USERS_TABLE="HaulHub-UsersTable-${ENVIRONMENT}"

# Function to add a user
add_user() {
  local user_id=$1
  local email=$2
  local full_name=$3
  local phone=$4
  local role=$5
  local verification_status=$6
  
  echo -e "${YELLOW}Adding user: $full_name ($role)${NC}"
  
  aws dynamodb put-item \
    --table-name $USERS_TABLE \
    --item "{
      \"PK\": {\"S\": \"USER#${user_id}\"},
      \"SK\": {\"S\": \"PROFILE\"},
      \"userId\": {\"S\": \"${user_id}\"},
      \"email\": {\"S\": \"${email}\"},
      \"fullName\": {\"S\": \"${full_name}\"},
      \"phoneNumber\": {\"S\": \"${phone}\"},
      \"role\": {\"S\": \"${role}\"},
      \"verificationStatus\": {\"S\": \"${verification_status}\"},
      \"createdAt\": {\"S\": \"${TIMESTAMP}\"},
      \"updatedAt\": {\"S\": \"${TIMESTAMP}\"}
    }" \
    --region $REGION \
    --profile $AWS_PROFILE > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Added: $full_name${NC}"
  else
    echo -e "${RED}✗ Failed to add: $full_name${NC}"
  fi
}

# Admin User (You)
add_user "admin-001" "admin@haulhub.com" "Admin User" "+1-555-0100" "Admin" "Verified"

# Dispatchers (2)
add_user "dispatcher-001" "dispatcher1@haulhub.com" "John Dispatcher" "+1-555-0101" "Dispatcher" "Verified"
add_user "dispatcher-002" "dispatcher2@haulhub.com" "Sarah Dispatcher" "+1-555-0102" "Dispatcher" "Verified"

# Drivers (2 verified + 8 unverified for trips)
add_user "driver-001" "driver1@haulhub.com" "Mike Driver" "+1-555-0201" "Driver" "Verified"
add_user "driver-002" "driver2@haulhub.com" "Lisa Driver" "+1-555-0202" "Driver" "Verified"

# Lorry Owners (2 verified)
add_user "owner-001" "owner1@haulhub.com" "Bob Owner" "+1-555-0301" "LorryOwner" "Verified"
add_user "owner-002" "owner2@haulhub.com" "Emma Owner" "+1-555-0302" "LorryOwner" "Verified"

echo ""
echo -e "${GREEN}✓ Users seeded: 7 total (1 Admin, 2 Dispatchers, 2 Drivers, 2 Lorry Owners)${NC}"
echo ""

# ============================================
# SEED LORRIES TABLE
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}2. Seeding Lorries Table${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

LORRIES_TABLE="HaulHub-LorriesTable-${ENVIRONMENT}"

# Function to add a lorry
add_lorry() {
  local owner_id=$1
  local lorry_id=$2
  local make=$3
  local model=$4
  local year=$5
  local status=$6
  
  echo -e "${YELLOW}Adding lorry: $lorry_id ($make $model)${NC}"
  
  aws dynamodb put-item \
    --table-name $LORRIES_TABLE \
    --item "{
      \"PK\": {\"S\": \"LORRY_OWNER#${owner_id}\"},
      \"SK\": {\"S\": \"LORRY#${lorry_id}\"},
      \"lorryId\": {\"S\": \"${lorry_id}\"},
      \"ownerId\": {\"S\": \"${owner_id}\"},
      \"make\": {\"S\": \"${make}\"},
      \"model\": {\"S\": \"${model}\"},
      \"year\": {\"N\": \"${year}\"},
      \"verificationStatus\": {\"S\": \"${status}\"},
      \"GSI1PK\": {\"S\": \"LORRY_STATUS#${status}\"},
      \"GSI1SK\": {\"S\": \"LORRY#${lorry_id}\"},
      \"createdAt\": {\"S\": \"${TIMESTAMP}\"},
      \"updatedAt\": {\"S\": \"${TIMESTAMP}\"}
    }" \
    --region $REGION \
    --profile $AWS_PROFILE > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Added: $lorry_id${NC}"
  else
    echo -e "${RED}✗ Failed to add: $lorry_id${NC}"
  fi
}

# Lorries for owner-001 (3 lorries)
add_lorry "owner-001" "TX-ABC-1234" "Freightliner" "Cascadia" "2022" "Approved"
add_lorry "owner-001" "TX-ABC-1235" "Kenworth" "T680" "2021" "Approved"
add_lorry "owner-001" "TX-ABC-1236" "Peterbilt" "579" "2023" "Approved"

# Lorries for owner-002 (3 lorries)
add_lorry "owner-002" "CA-XYZ-5678" "Volvo" "VNL 860" "2022" "Approved"
add_lorry "owner-002" "CA-XYZ-5679" "Mack" "Anthem" "2021" "Approved"
add_lorry "owner-002" "CA-XYZ-5680" "International" "LT Series" "2023" "Approved"

# Lorries for unverified owners (4 lorries for trips)
add_lorry "owner-003" "FL-DEF-9012" "Freightliner" "Cascadia" "2020" "Approved"
add_lorry "owner-004" "NY-GHI-3456" "Kenworth" "W900" "2021" "Approved"
add_lorry "owner-005" "IL-JKL-7890" "Peterbilt" "389" "2022" "Approved"
add_lorry "owner-006" "OH-MNO-2345" "Volvo" "VNL 760" "2021" "Approved"

echo ""
echo -e "${GREEN}✓ Lorries seeded: 10 total (6 for verified owners, 4 for unverified owners)${NC}"
echo ""

# ============================================
# SEED TRIPS TABLE
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}3. Seeding Trips Table${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

TRIPS_TABLE="HaulHub-TripsTable-${ENVIRONMENT}"

# Broker name mapping
declare -A BROKER_NAMES
BROKER_NAMES["broker-001"]="C.H. Robinson"
BROKER_NAMES["broker-002"]="XPO Logistics"
BROKER_NAMES["broker-003"]="TQL (Total Quality Logistics)"
BROKER_NAMES["broker-004"]="Coyote Logistics"
BROKER_NAMES["broker-005"]="Echo Global Logistics"
BROKER_NAMES["broker-006"]="Landstar System"
BROKER_NAMES["broker-007"]="J.B. Hunt Transport Services"
BROKER_NAMES["broker-008"]="Schneider National"
BROKER_NAMES["broker-009"]="Werner Enterprises"
BROKER_NAMES["broker-010"]="Knight-Swift Transportation"
BROKER_NAMES["broker-011"]="Hub Group"
BROKER_NAMES["broker-012"]="Transplace"
BROKER_NAMES["broker-013"]="Arrive Logistics"
BROKER_NAMES["broker-014"]="GlobalTranz"
BROKER_NAMES["broker-015"]="Convoy"
BROKER_NAMES["broker-016"]="Uber Freight"
BROKER_NAMES["broker-017"]="Loadsmart"
BROKER_NAMES["broker-018"]="Freightos"
BROKER_NAMES["broker-019"]="Flexport"
BROKER_NAMES["broker-020"]="Redwood Logistics"

# Function to add a trip
add_trip() {
  local trip_id=$1
  local dispatcher_id=$2
  local pickup=$3
  local dropoff=$4
  local date=$5
  local broker_id=$6
  local broker_payment=$7
  local lorry_id=$8
  local owner_id=$9
  local driver_id=${10}
  local driver_name=${11}
  local owner_payment=${12}
  local driver_payment=${13}
  local status=${14}
  
  # Get broker name from mapping
  local broker_name="${BROKER_NAMES[$broker_id]}"
  
  echo -e "${YELLOW}Adding trip: $trip_id ($pickup → $dropoff)${NC}"
  
  aws dynamodb put-item \
    --table-name $TRIPS_TABLE \
    --item "{
      \"PK\": {\"S\": \"TRIP#${trip_id}\"},
      \"SK\": {\"S\": \"METADATA\"},
      \"tripId\": {\"S\": \"${trip_id}\"},
      \"dispatcherId\": {\"S\": \"${dispatcher_id}\"},
      \"pickupLocation\": {\"S\": \"${pickup}\"},
      \"dropoffLocation\": {\"S\": \"${dropoff}\"},
      \"scheduledPickupDatetime\": {\"S\": \"${date}\"},
      \"brokerId\": {\"S\": \"${broker_id}\"},
      \"brokerName\": {\"S\": \"${broker_name}\"},
      \"brokerPayment\": {\"N\": \"${broker_payment}\"},
      \"lorryId\": {\"S\": \"${lorry_id}\"},
      \"ownerId\": {\"S\": \"${owner_id}\"},
      \"driverId\": {\"S\": \"${driver_id}\"},
      \"driverName\": {\"S\": \"${driver_name}\"},
      \"lorryOwnerPayment\": {\"N\": \"${owner_payment}\"},
      \"driverPayment\": {\"N\": \"${driver_payment}\"},
      \"status\": {\"S\": \"${status}\"},
      \"GSI1PK\": {\"S\": \"DISPATCHER#${dispatcher_id}\"},
      \"GSI1SK\": {\"S\": \"${date}#${trip_id}\"},
      \"GSI2PK\": {\"S\": \"OWNER#${owner_id}\"},
      \"GSI2SK\": {\"S\": \"${date}#${lorry_id}#${trip_id}\"},
      \"GSI3PK\": {\"S\": \"DRIVER#${driver_id}\"},
      \"GSI3SK\": {\"S\": \"${date}#${trip_id}\"},
      \"createdAt\": {\"S\": \"${TIMESTAMP}\"},
      \"updatedAt\": {\"S\": \"${TIMESTAMP}\"}
    }" \
    --region $REGION \
    --profile $AWS_PROFILE > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Added: $trip_id${NC}"
  else
    echo -e "${RED}✗ Failed to add: $trip_id${NC}"
  fi
}

# Trips for dispatcher-001 (15 trips)
# Trips with verified drivers and owners (6 trips)
add_trip "trip-001" "dispatcher-001" "New York, NY" "Boston, MA" "2024-12-20T08:00:00Z" "broker-001" "1500" "TX-ABC-1234" "owner-001" "driver-001" "Mike Driver" "800" "500" "Scheduled"
add_trip "trip-002" "dispatcher-001" "Los Angeles, CA" "San Francisco, CA" "2024-12-21T09:00:00Z" "broker-002" "1200" "TX-ABC-1235" "owner-001" "driver-002" "Lisa Driver" "650" "400" "PickedUp"
add_trip "trip-003" "dispatcher-001" "Chicago, IL" "Detroit, MI" "2024-12-22T10:00:00Z" "broker-003" "900" "CA-XYZ-5678" "owner-002" "driver-001" "Mike Driver" "500" "300" "InTransit"
add_trip "trip-004" "dispatcher-001" "Houston, TX" "Dallas, TX" "2024-12-23T11:00:00Z" "broker-004" "800" "CA-XYZ-5679" "owner-002" "driver-002" "Lisa Driver" "450" "250" "Delivered"
add_trip "trip-005" "dispatcher-001" "Miami, FL" "Atlanta, GA" "2024-12-24T12:00:00Z" "broker-005" "1100" "TX-ABC-1236" "owner-001" "driver-001" "Mike Driver" "600" "350" "Scheduled"
add_trip "trip-006" "dispatcher-001" "Seattle, WA" "Portland, OR" "2024-12-25T13:00:00Z" "broker-006" "700" "CA-XYZ-5680" "owner-002" "driver-002" "Lisa Driver" "400" "250" "Scheduled"

# Trips with unverified drivers and owners (9 trips)
add_trip "trip-007" "dispatcher-001" "Phoenix, AZ" "Las Vegas, NV" "2024-12-26T08:00:00Z" "broker-007" "1000" "FL-DEF-9012" "owner-003" "DL-123456" "Tom Unverified" "550" "350" "Scheduled"
add_trip "trip-008" "dispatcher-001" "Denver, CO" "Salt Lake City, UT" "2024-12-27T09:00:00Z" "broker-008" "1300" "NY-GHI-3456" "owner-004" "DL-234567" "Jane Unverified" "700" "450" "Scheduled"
add_trip "trip-009" "dispatcher-001" "Philadelphia, PA" "Washington, DC" "2024-12-28T10:00:00Z" "broker-009" "850" "IL-JKL-7890" "owner-005" "DL-345678" "Bob Unverified" "475" "275" "Scheduled"
add_trip "trip-010" "dispatcher-001" "San Diego, CA" "Phoenix, AZ" "2024-12-29T11:00:00Z" "broker-010" "950" "OH-MNO-2345" "owner-006" "DL-456789" "Alice Unverified" "525" "325" "Scheduled"
add_trip "trip-011" "dispatcher-001" "Minneapolis, MN" "Milwaukee, WI" "2024-12-30T12:00:00Z" "broker-011" "750" "FL-DEF-9012" "owner-003" "DL-567890" "Charlie Unverified" "425" "250" "Scheduled"
add_trip "trip-012" "dispatcher-001" "Nashville, TN" "Memphis, TN" "2024-12-31T13:00:00Z" "broker-012" "650" "NY-GHI-3456" "owner-004" "DL-678901" "Diana Unverified" "375" "225" "Scheduled"
add_trip "trip-013" "dispatcher-001" "Charlotte, NC" "Raleigh, NC" "2025-01-01T08:00:00Z" "broker-013" "600" "IL-JKL-7890" "owner-005" "DL-789012" "Eric Unverified" "350" "200" "Scheduled"
add_trip "trip-014" "dispatcher-001" "Indianapolis, IN" "Columbus, OH" "2025-01-02T09:00:00Z" "broker-014" "700" "OH-MNO-2345" "owner-006" "DL-890123" "Fiona Unverified" "400" "250" "Scheduled"
add_trip "trip-015" "dispatcher-001" "Kansas City, MO" "St. Louis, MO" "2025-01-03T10:00:00Z" "broker-015" "650" "FL-DEF-9012" "owner-003" "DL-901234" "George Unverified" "375" "225" "Scheduled"

# Trips for dispatcher-002 (15 trips)
# Trips with verified drivers and owners (6 trips)
add_trip "trip-016" "dispatcher-002" "Portland, ME" "Burlington, VT" "2024-12-20T08:00:00Z" "broker-016" "800" "TX-ABC-1234" "owner-001" "driver-001" "Mike Driver" "450" "275" "Scheduled"
add_trip "trip-017" "dispatcher-002" "Sacramento, CA" "Reno, NV" "2024-12-21T09:00:00Z" "broker-017" "900" "TX-ABC-1235" "owner-001" "driver-002" "Lisa Driver" "500" "300" "Scheduled"
add_trip "trip-018" "dispatcher-002" "Cleveland, OH" "Pittsburgh, PA" "2024-12-22T10:00:00Z" "broker-018" "750" "CA-XYZ-5678" "owner-002" "driver-001" "Mike Driver" "425" "250" "Scheduled"
add_trip "trip-019" "dispatcher-002" "Austin, TX" "San Antonio, TX" "2024-12-23T11:00:00Z" "broker-019" "700" "CA-XYZ-5679" "owner-002" "driver-002" "Lisa Driver" "400" "250" "Scheduled"
add_trip "trip-020" "dispatcher-002" "Tampa, FL" "Jacksonville, FL" "2024-12-24T12:00:00Z" "broker-020" "850" "TX-ABC-1236" "owner-001" "driver-001" "Mike Driver" "475" "300" "Scheduled"
add_trip "trip-021" "dispatcher-002" "Spokane, WA" "Boise, ID" "2024-12-25T13:00:00Z" "broker-001" "950" "CA-XYZ-5680" "owner-002" "driver-002" "Lisa Driver" "525" "325" "Scheduled"

# Trips with unverified drivers and owners (9 trips)
add_trip "trip-022" "dispatcher-002" "Tucson, AZ" "Albuquerque, NM" "2024-12-26T08:00:00Z" "broker-002" "1100" "FL-DEF-9012" "owner-003" "DL-012345" "Helen Unverified" "600" "375" "Scheduled"
add_trip "trip-023" "dispatcher-002" "Colorado Springs, CO" "Cheyenne, WY" "2024-12-27T09:00:00Z" "broker-003" "800" "NY-GHI-3456" "owner-004" "DL-123450" "Ivan Unverified" "450" "275" "Scheduled"
add_trip "trip-024" "dispatcher-002" "Baltimore, MD" "Richmond, VA" "2024-12-28T10:00:00Z" "broker-004" "750" "IL-JKL-7890" "owner-005" "DL-234501" "Julia Unverified" "425" "250" "Scheduled"
add_trip "trip-025" "dispatcher-002" "Fresno, CA" "Bakersfield, CA" "2024-12-29T11:00:00Z" "broker-005" "650" "OH-MNO-2345" "owner-006" "DL-345012" "Kevin Unverified" "375" "225" "Scheduled"
add_trip "trip-026" "dispatcher-002" "Omaha, NE" "Des Moines, IA" "2024-12-30T12:00:00Z" "broker-006" "700" "FL-DEF-9012" "owner-003" "DL-450123" "Laura Unverified" "400" "250" "Scheduled"
add_trip "trip-027" "dispatcher-002" "Louisville, KY" "Cincinnati, OH" "2024-12-31T13:00:00Z" "broker-007" "650" "NY-GHI-3456" "owner-004" "DL-501234" "Mark Unverified" "375" "225" "Scheduled"
add_trip "trip-028" "dispatcher-002" "Greensboro, NC" "Charleston, SC" "2025-01-01T08:00:00Z" "broker-008" "900" "IL-JKL-7890" "owner-005" "DL-612345" "Nancy Unverified" "500" "300" "Scheduled"
add_trip "trip-029" "dispatcher-002" "Fort Wayne, IN" "Toledo, OH" "2025-01-02T09:00:00Z" "broker-009" "600" "OH-MNO-2345" "owner-006" "DL-723456" "Oscar Unverified" "350" "200" "Scheduled"
add_trip "trip-030" "dispatcher-002" "Wichita, KS" "Tulsa, OK" "2025-01-03T10:00:00Z" "broker-010" "800" "FL-DEF-9012" "owner-003" "DL-834567" "Paula Unverified" "450" "275" "Scheduled"

echo ""
echo -e "${GREEN}✓ Trips seeded: 30 total (15 per dispatcher)${NC}"
echo -e "${GREEN}  - 12 trips with verified drivers/owners${NC}"
echo -e "${GREEN}  - 18 trips with unverified drivers/owners${NC}"
echo ""

# ============================================
# SUMMARY
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Seeding Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Count items in each table
echo -e "${YELLOW}Verifying seeded data...${NC}"
echo ""

USERS_COUNT=$(aws dynamodb scan --table-name $USERS_TABLE --select COUNT --query 'Count' --output text --region $REGION --profile $AWS_PROFILE)
echo "Users Table: $USERS_COUNT items"

LORRIES_COUNT=$(aws dynamodb scan --table-name $LORRIES_TABLE --select COUNT --query 'Count' --output text --region $REGION --profile $AWS_PROFILE)
echo "Lorries Table: $LORRIES_COUNT items"

TRIPS_COUNT=$(aws dynamodb scan --table-name $TRIPS_TABLE --select COUNT --query 'Count' --output text --region $REGION --profile $AWS_PROFILE)
echo "Trips Table: $TRIPS_COUNT items"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Seeding Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Test Users Created:"
echo "  - 1 Admin: admin@haulhub.com"
echo "  - 2 Dispatchers: dispatcher1@haulhub.com, dispatcher2@haulhub.com"
echo "  - 2 Drivers: driver1@haulhub.com, driver2@haulhub.com"
echo "  - 2 Lorry Owners: owner1@haulhub.com, owner2@haulhub.com"
echo ""
echo "Lorries Created:"
echo "  - 6 lorries for verified owners (3 each)"
echo "  - 4 lorries for unverified owners"
echo ""
echo "Trips Created:"
echo "  - 30 trips total (15 per dispatcher)"
echo "  - 12 trips with verified drivers/owners"
echo "  - 18 trips with unverified drivers/owners"
echo ""
echo "All users are verified and ready for testing!"
echo ""
