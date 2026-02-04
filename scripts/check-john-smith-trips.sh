#!/bin/bash

# Script to check John Smith's trips in DynamoDB
# This will help identify if one trip has the wrong carrierId

echo "Checking John Smith's trips for broker-001..."
echo ""

# First, get John Smith's userId
echo "1. Finding John Smith's userId..."
aws dynamodb scan \
  --table-name eTrucky-Users \
  --filter-expression "contains(#name, :name)" \
  --expression-attribute-names '{"#name":"name"}' \
  --expression-attribute-values '{":name":{"S":"John Smith"}}' \
  --profile haul-hub \
  --region us-east-1 \
  --output json | jq -r '.Items[] | {userId: .userId.S, name: .name.S, role: .role.S, carrierId: .carrierId.S}'

echo ""
echo "2. Now manually set John Smith's userId and query his trips..."
echo "   Replace JOHN_SMITH_USER_ID below with the actual userId from above"
echo ""

# Query trips by dispatcher (GSI2)
JOHN_SMITH_USER_ID="REPLACE_WITH_ACTUAL_ID"

echo "Querying trips by dispatcher using GSI2..."
aws dynamodb query \
  --table-name eTrucky-Trips \
  --index-name GSI2 \
  --key-condition-expression "GSI2PK = :pk" \
  --expression-attribute-values "{\":pk\":{\"S\":\"DISPATCHER#${JOHN_SMITH_USER_ID}\"}}" \
  --profile haul-hub \
  --region us-east-1 \
  --output json | jq -r '.Items[] | select(.brokerId.S == "broker-001") | {tripId: .tripId.S, carrierId: .carrierId.S, dispatcherId: .dispatcherId.S, brokerId: .brokerId.S, scheduledTimestamp: .scheduledTimestamp.S, GSI1PK: .GSI1PK.S}'

echo ""
echo "3. Check if all trips have the correct GSI1PK (should be CARRIER#34c864f8-c051-7001-629f-bbae799b099f)"
