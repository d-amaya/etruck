#!/bin/bash

# Fix the GSI1PK for trip 95d33dd1-5b81-4be1-94de-b157084cffce
# Current: CARRIER#24a8f418-5081-7096-7405-a20cb657307d (dispatcher ID)
# Should be: CARRIER#34c864f8-c051-7001-629f-bbae799b099f (carrier ID)

TRIP_ID="95d33dd1-5b81-4be1-94de-b157084cffce"
CORRECT_CARRIER_ID="34c864f8-c051-7001-629f-bbae799b099f"
SCHEDULED_TIMESTAMP="2026-02-02T05:45:00Z"

echo "Fixing GSI1PK for trip ${TRIP_ID}..."

aws dynamodb update-item \
  --table-name eTrucky-Trips \
  --key "{\"PK\":{\"S\":\"TRIP#${TRIP_ID}\"},\"SK\":{\"S\":\"METADATA\"}}" \
  --update-expression "SET GSI1PK = :gsi1pk, GSI1SK = :gsi1sk" \
  --expression-attribute-values "{\":gsi1pk\":{\"S\":\"CARRIER#${CORRECT_CARRIER_ID}\"},\":gsi1sk\":{\"S\":\"${SCHEDULED_TIMESTAMP}#${TRIP_ID}\"}}" \
  --profile haul-hub \
  --region us-east-1

echo ""
echo "Done! Verifying the fix..."
echo ""

aws dynamodb get-item \
  --table-name eTrucky-Trips \
  --key "{\"PK\":{\"S\":\"TRIP#${TRIP_ID}\"},\"SK\":{\"S\":\"METADATA\"}}" \
  --profile haul-hub \
  --region us-east-1 \
  --output json | jq -r '{tripId: .Item.tripId.S, carrierId: .Item.carrierId.S, GSI1PK: .Item.GSI1PK.S, GSI1SK: .Item.GSI1SK.S}'
