#!/usr/bin/env bash

# Script to add brokerName field to existing trips in DynamoDB

set -e

# Configuration
AWS_PROFILE="${AWS_PROFILE:-haul-hub}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
REGION="us-east-1"

echo "========================================="
echo "Fixing Broker Names in Trips"
echo "========================================="
echo ""
echo "AWS Profile: $AWS_PROFILE"
echo "Environment: $ENVIRONMENT"
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

# Get all trips
echo "Fetching all trips..."
TRIPS=$(aws dynamodb scan \
  --table-name $TRIPS_TABLE \
  --region $REGION \
  --profile $AWS_PROFILE \
  --output json)

# Extract trip IDs and broker IDs
TRIP_COUNT=$(echo "$TRIPS" | jq -r '.Items | length')
echo "Found $TRIP_COUNT trips to update"
echo ""

# Update each trip
UPDATED=0
FAILED=0

for i in $(seq 0 $((TRIP_COUNT - 1)) 2>/dev/null || echo 0); do
  TRIP_ID=$(echo "$TRIPS" | jq -r ".Items[$i].tripId.S")
  BROKER_ID=$(echo "$TRIPS" | jq -r ".Items[$i].brokerId.S")
  
  # Get broker name from mapping
  BROKER_NAME="${BROKER_NAMES[$BROKER_ID]}"
  
  if [ -z "$BROKER_NAME" ]; then
    echo "⚠ Warning: No broker name found for $BROKER_ID in trip $TRIP_ID"
    ((FAILED++))
    continue
  fi
  
  echo "Updating trip $TRIP_ID with broker: $BROKER_NAME"
  
  # Update the trip with broker name
  aws dynamodb update-item \
    --table-name $TRIPS_TABLE \
    --key "{\"PK\": {\"S\": \"TRIP#${TRIP_ID}\"}, \"SK\": {\"S\": \"METADATA\"}}" \
    --update-expression "SET brokerName = :brokerName" \
    --expression-attribute-values "{\":brokerName\": {\"S\": \"${BROKER_NAME}\"}}" \
    --region $REGION \
    --profile $AWS_PROFILE > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    echo "✓ Updated: $TRIP_ID"
    ((UPDATED++))
  else
    echo "✗ Failed: $TRIP_ID"
    ((FAILED++))
  fi
done

echo ""
echo "========================================="
echo "Update Complete!"
echo "========================================="
echo "Updated: $UPDATED trips"
echo "Failed: $FAILED trips"
echo ""
