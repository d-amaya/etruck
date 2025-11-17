#!/usr/bin/env python3

import boto3
import sys

# Configuration
AWS_PROFILE = "haul-hub"
ENVIRONMENT = "dev"
REGION = "us-east-1"

# Broker name mapping
BROKER_NAMES = {
    "broker-001": "C.H. Robinson",
    "broker-002": "XPO Logistics",
    "broker-003": "TQL (Total Quality Logistics)",
    "broker-004": "Coyote Logistics",
    "broker-005": "Echo Global Logistics",
    "broker-006": "Landstar System",
    "broker-007": "J.B. Hunt Transport Services",
    "broker-008": "Schneider National",
    "broker-009": "Werner Enterprises",
    "broker-010": "Knight-Swift Transportation",
    "broker-011": "Hub Group",
    "broker-012": "Transplace",
    "broker-013": "Arrive Logistics",
    "broker-014": "GlobalTranz",
    "broker-015": "Convoy",
    "broker-016": "Uber Freight",
    "broker-017": "Loadsmart",
    "broker-018": "Freightos",
    "broker-019": "Flexport",
    "broker-020": "Redwood Logistics",
}

print("=========================================")
print("Fixing Broker Names in Trips")
print("=========================================")
print()
print(f"AWS Profile: {AWS_PROFILE}")
print(f"Environment: {ENVIRONMENT}")
print()

# Initialize boto3 session
session = boto3.Session(profile_name=AWS_PROFILE, region_name=REGION)
dynamodb = session.client('dynamodb')

TRIPS_TABLE = f"HaulHub-TripsTable-{ENVIRONMENT}"

# Scan all trips
print("Fetching all trips...")
response = dynamodb.scan(TableName=TRIPS_TABLE)
trips = response['Items']

print(f"Found {len(trips)} trips to update")
print()

updated = 0
failed = 0

for trip in trips:
    trip_id = trip['tripId']['S']
    broker_id = trip['brokerId']['S']
    
    # Get broker name from mapping
    broker_name = BROKER_NAMES.get(broker_id)
    
    if not broker_name:
        print(f"⚠ Warning: No broker name found for {broker_id} in trip {trip_id}")
        failed += 1
        continue
    
    print(f"Updating trip {trip_id} with broker: {broker_name}")
    
    try:
        # Update the trip with broker name
        dynamodb.update_item(
            TableName=TRIPS_TABLE,
            Key={
                'PK': {'S': f"TRIP#{trip_id}"},
                'SK': {'S': 'METADATA'}
            },
            UpdateExpression='SET brokerName = :brokerName',
            ExpressionAttributeValues={
                ':brokerName': {'S': broker_name}
            }
        )
        print(f"✓ Updated: {trip_id}")
        updated += 1
    except Exception as e:
        print(f"✗ Failed: {trip_id} - {str(e)}")
        failed += 1

print()
print("=========================================")
print("Update Complete!")
print("=========================================")
print(f"Updated: {updated} trips")
print(f"Failed: {failed} trips")
print()
