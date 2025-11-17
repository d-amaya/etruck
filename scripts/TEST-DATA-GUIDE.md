# 🚀 HaulHub Test Data & Login Guide

Complete guide for testing the HaulHub application with seeded data.

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Login Credentials](#login-credentials)
3. [Seeded Data Overview](#seeded-data-overview)
4. [Test User Accounts](#test-user-accounts)
5. [Testing Scenarios](#testing-scenarios)
6. [Troubleshooting](#troubleshooting)
7. [Database Verification](#database-verification)
8. [Re-seeding Instructions](#re-seeding-instructions)

---

## 🎯 Quick Start

**Frontend URL:** https://d23ld7dtwui8dz.cloudfront.net

**Default Password (All Users):** `HaulHub2024!`

**Quick Test:**
1. Go to the frontend URL
2. Login with any email from the table below
3. Use password: `HaulHub2024!`
4. Explore the features for that role

---

## 🔐 Login Credentials

| Role | Email | Password | Expected Data |
|------|-------|----------|---------------|
| **Admin** | admin@haulhub.com | HaulHub2024! | Full system access |
| **Dispatcher 1** | dispatcher1@haulhub.com | HaulHub2024! | 15 trips, create trips |
| **Dispatcher 2** | dispatcher2@haulhub.com | HaulHub2024! | 15 trips, create trips |
| **Driver 1** | driver1@haulhub.com | HaulHub2024! | 6 assigned trips |
| **Driver 2** | driver2@haulhub.com | HaulHub2024! | 6 assigned trips |
| **Owner 1** | owner1@haulhub.com | HaulHub2024! | 3 lorries, 6 trips |
| **Owner 2** | owner2@haulhub.com | HaulHub2024! | 3 lorries, 6 trips |

---

## 📊 Seeded Data Overview

### Summary

- **Users:** 7 (1 Admin, 2 Dispatchers, 2 Drivers, 2 Lorry Owners)
- **Brokers:** 20 major US freight brokers
- **Lorries:** 10 (6 for verified owners, 4 for unverified owners)
- **Trips:** 30 (15 per dispatcher, mix of verified and unverified drivers/owners)

### Database Tables

- **Users Table:** `HaulHub-UsersTable-dev` (7 items)
- **Brokers Table:** `HaulHub-BrokersTable-dev` (20 items)
- **Lorries Table:** `HaulHub-LorriesTable-dev` (10 items)
- **Trips Table:** `HaulHub-TripsTable-dev` (30 items)


### Brokers (20 items)

All brokers are active and available in the dropdown when creating trips:

1. C.H. Robinson (broker-001)
2. XPO Logistics (broker-002)
3. TQL - Total Quality Logistics (broker-003)
4. Coyote Logistics (broker-004)
5. Echo Global Logistics (broker-005)
6. Landstar System (broker-006)
7. J.B. Hunt Transport Services (broker-007)
8. Schneider National (broker-008)
9. Werner Enterprises (broker-009)
10. Knight-Swift Transportation (broker-010)
11. Hub Group (broker-011)
12. Transplace (broker-012)
13. Arrive Logistics (broker-013)
14. GlobalTranz (broker-014)
15. Convoy (broker-015)
16. Uber Freight (broker-016)
17. Loadsmart (broker-017)
18. Freightos (broker-018)
19. Flexport (broker-019)
20. Redwood Logistics (broker-020)

### Lorries (10 items)

**For Owner 1 (Bob Owner - owner-001):**
- TX-ABC-1234: Freightliner Cascadia 2022 (Approved)
- TX-ABC-1235: Kenworth T680 2021 (Approved)
- TX-ABC-1236: Peterbilt 579 2023 (Approved)

**For Owner 2 (Emma Owner - owner-002):**
- CA-XYZ-5678: Volvo VNL 860 2022 (Approved)
- CA-XYZ-5679: Mack Anthem 2021 (Approved)
- CA-XYZ-5680: International LT Series 2023 (Approved)

**For Unverified Owners (used in trips):**
- FL-DEF-9012: Freightliner Cascadia 2020 (owner-003)
- NY-GHI-3456: Kenworth W900 2021 (owner-004)
- IL-JKL-7890: Peterbilt 389 2022 (owner-005)
- OH-MNO-2345: Volvo VNL 760 2021 (owner-006)

### Trips (30 items)

**Dispatcher 1 (John Dispatcher) - 15 trips:**
- 6 trips with verified drivers/owners (trip-001 to trip-006)
- 9 trips with unverified drivers/owners (trip-007 to trip-015)
- Various statuses: Scheduled, Picked Up, In Transit, Delivered

**Dispatcher 2 (Sarah Dispatcher) - 15 trips:**
- 6 trips with verified drivers/owners (trip-016 to trip-021)
- 9 trips with unverified drivers/owners (trip-022 to trip-030)
- All scheduled status

---

## 👥 Test User Accounts

### 🔧 Admin User

**Email:** admin@haulhub.com  
**Password:** HaulHub2024!  
**Role:** Admin  
**Name:** Admin User

**What you can test:**
- View all users and their verification status
- Verify lorry registrations (approve/reject)
- Manage broker list (add/edit/delete brokers)
- View system-wide data
- User verification workflow

**Expected Results:**
- Can access all admin features
- Can see all 20 brokers
- Can manage user verifications
- Full system access


### 📋 Dispatcher 1 (John Dispatcher)

**Email:** dispatcher1@haulhub.com  
**Password:** HaulHub2024!  
**Role:** Dispatcher  
**User ID:** dispatcher-001

**What you can test:**
- View 15 trips created by this dispatcher
- Create new trips (brokers dropdown populated with 20 brokers)
- Edit existing trips
- Update trip status
- View payment reports and profit margins
- Filter trips by date, broker, lorry, driver, status

**Expected Data:**
- 15 trips visible (trip-001 through trip-015)
- Can create new trips
- Can see profit: broker payment - owner payment - driver payment
- Mix of trip statuses

**Sample Trips:**
- trip-001: New York → Boston ($1500 broker, $800 owner, $500 driver)
- trip-002: Los Angeles → San Francisco (Status: PickedUp)
- trip-003: Chicago → Detroit (Status: InTransit)
- trip-004: Houston → Dallas (Status: Delivered)

---

### 📋 Dispatcher 2 (Sarah Dispatcher)

**Email:** dispatcher2@haulhub.com  
**Password:** HaulHub2024!  
**Role:** Dispatcher  
**User ID:** dispatcher-002

**What you can test:**
- View 15 trips created by this dispatcher
- Create new trips
- Edit existing trips
- Update trip status
- View payment reports
- Filter trips

**Expected Data:**
- 15 trips visible (trip-016 through trip-030)
- All trips in Scheduled status
- Can create new trips with broker selection

---

### 🚚 Driver 1 (Mike Driver)

**Email:** driver1@haulhub.com  
**Password:** HaulHub2024!  
**Role:** Driver  
**User ID:** driver-001

**What you can test:**
- View 6 assigned trips (only trips where driver-001 is assigned)
- Update trip status (Picked Up, In Transit, Delivered)
- View payment details for each trip
- Filter trips by date, lorry, dispatcher
- View total earnings across trips

**Expected Data:**
- 6 trips visible from both dispatchers
- Can update trip status
- Can see driver payment for each trip

**Trips visible:**
- trip-001: New York → Boston ($500 payment)
- trip-003: Chicago → Detroit ($300 payment)
- trip-005: Miami → Atlanta ($350 payment)
- trip-016: Portland → Burlington ($275 payment)
- trip-018: Cleveland → Pittsburgh ($250 payment)
- trip-020: Tampa → Jacksonville ($300 payment)

**Total Expected Earnings:** $1,975


### 🚚 Driver 2 (Lisa Driver)

**Email:** driver2@haulhub.com  
**Password:** HaulHub2024!  
**Role:** Driver  
**User ID:** driver-002

**What you can test:**
- View 6 assigned trips
- Update trip status
- View payment details
- Filter trips
- View total earnings

**Expected Data:**
- 6 trips visible from both dispatchers

**Trips visible:**
- trip-002: Los Angeles → San Francisco ($400 payment)
- trip-004: Houston → Dallas ($250 payment)
- trip-006: Seattle → Portland ($250 payment)
- trip-017: Sacramento → Reno ($300 payment)
- trip-019: Austin → San Antonio ($250 payment)
- trip-021: Spokane → Boise ($325 payment)

**Total Expected Earnings:** $1,775

---

### 🚛 Lorry Owner 1 (Bob Owner)

**Email:** owner1@haulhub.com  
**Password:** HaulHub2024!  
**Role:** Lorry Owner  
**User ID:** owner-001

**What you can test:**
- View 3 registered lorries
- View 6 trips using their lorries
- Register new lorries
- Upload verification documents
- View payment reports by lorry
- Filter trips by lorry, date, dispatcher, broker

**Expected Data:**
- 3 approved lorries
- 6 trips using these lorries
- Payment details for each trip

**Lorries:**
- TX-ABC-1234: Freightliner Cascadia 2022
- TX-ABC-1235: Kenworth T680 2021
- TX-ABC-1236: Peterbilt 579 2023

**Trips visible:**
- trip-001: Using TX-ABC-1234 ($800 payment)
- trip-002: Using TX-ABC-1235 ($650 payment)
- trip-005: Using TX-ABC-1236 ($600 payment)
- trip-016: Using TX-ABC-1234 ($450 payment)
- trip-017: Using TX-ABC-1235 ($500 payment)
- trip-020: Using TX-ABC-1236 ($475 payment)

**Total Expected Earnings:** $3,475

---

### 🚛 Lorry Owner 2 (Emma Owner)

**Email:** owner2@haulhub.com  
**Password:** HaulHub2024!  
**Role:** Lorry Owner  
**User ID:** owner-002

**What you can test:**
- View 3 registered lorries
- View 6 trips using their lorries
- Register new lorries
- View payment reports
- Filter trips

**Expected Data:**
- 3 approved lorries
- 6 trips using these lorries

**Lorries:**
- CA-XYZ-5678: Volvo VNL 860 2022
- CA-XYZ-5679: Mack Anthem 2021
- CA-XYZ-5680: International LT Series 2023

**Trips visible:**
- trip-003: Using CA-XYZ-5678 ($500 payment)
- trip-004: Using CA-XYZ-5679 ($450 payment)
- trip-006: Using CA-XYZ-5680 ($400 payment)
- trip-018: Using CA-XYZ-5678 ($425 payment)
- trip-019: Using CA-XYZ-5679 ($400 payment)
- trip-021: Using CA-XYZ-5680 ($525 payment)

**Total Expected Earnings:** $2,700


---

## 🧪 Testing Scenarios

### Scenario 1: Complete Trip Lifecycle (Dispatcher)

**Login as:** dispatcher1@haulhub.com

**Steps:**
1. View trips list (should see 15 trips)
2. Click "Create Trip"
3. Fill in trip details:
   - Pickup: "Denver, CO"
   - Dropoff: "Phoenix, AZ"
   - Date: Select future date
   - Broker: Select from dropdown (20 available)
   - Lorry: TX-ABC-1234
   - Driver: driver-001 (Mike Driver)
   - Broker Payment: $1200
   - Owner Payment: $650
   - Driver Payment: $400
4. Save the trip
5. View the new trip in the list
6. Click "Edit" and update details
7. Update trip status to "Picked Up"
8. View payment report to see profit margin ($150)

**Expected Results:**
- Trip created successfully
- Broker dropdown populated with 20 brokers
- Trip appears in list
- Can edit and update status
- Payment report shows correct profit

---

### Scenario 2: Driver Tracking Trips

**Login as:** driver1@haulhub.com

**Steps:**
1. View trips list (should see 6 trips)
2. Filter trips by date range
3. Select trip-001 (New York → Boston)
4. Update status to "Picked Up"
5. Update status to "In Transit"
6. Update status to "Delivered"
7. View payment report
8. Check total earnings ($1,975 across all trips)

**Expected Results:**
- Only 6 assigned trips visible
- Can update trip status
- Payment details visible for each trip
- Total earnings calculated correctly

---

### Scenario 3: Lorry Owner Monitoring

**Login as:** owner1@haulhub.com

**Steps:**
1. View lorries list (should see 3 lorries)
2. View trips for your lorries (should see 6 trips)
3. Filter trips by lorry TX-ABC-1234
4. View payment report by lorry
5. Check total earnings ($3,475 across all trips)
6. (Optional) Register a new lorry
7. (Optional) Upload verification document

**Expected Results:**
- 3 lorries visible, all approved
- 6 trips visible using these lorries
- Can filter by specific lorry
- Payment report shows earnings by lorry
- Can register new lorries

---

### Scenario 4: Admin Verification Workflow

**Login as:** admin@haulhub.com

**Steps:**
1. View broker list (should see 20 brokers)
2. Add a new broker:
   - Name: "Test Broker LLC"
3. View the new broker in the list
4. Edit the broker name
5. View pending lorry verifications (none currently)
6. View user list
7. Check user verification statuses

**Expected Results:**
- Can view all 20 brokers
- Can add new broker
- Can edit existing brokers
- Can view all users
- Can manage verifications


---

## ⚠️ Troubleshooting

### Issue: Can't see trips as Dispatcher/Driver/Owner

**Problem:** Users log in but see no trips.

**Cause:** The seeded trips use hardcoded user IDs (dispatcher-001, driver-001, owner-001), but Cognito generates new UUIDs when creating users. The user IDs don't match.

**Solution - Run the Fix Script:**

```bash
./scripts/fix-trip-user-ids.sh
```

This script will:
- Get the actual Cognito user IDs for all test users
- Update all 30 trips to use the correct user IDs
- Update all GSI keys for proper querying
- Verify the updates

After running this script, all users will see their trips correctly.

**Manual Option - Update Individual Trips:**
If you prefer to update trips manually:

```bash
# Get the actual user ID from Cognito
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_yoiMUn0Q8 \
  --username driver1@haulhub.com \
  --region us-east-1 \
  --profile haul-hub \
  --query 'UserAttributes[?Name==`sub`].Value' \
  --output text

# Update trip with actual user ID
aws dynamodb update-item \
  --table-name HaulHub-TripsTable-dev \
  --key '{"PK":{"S":"TRIP#trip-001"},"SK":{"S":"METADATA"}}' \
  --update-expression "SET driverId = :id, GSI3PK = :gsi3pk" \
  --expression-attribute-values '{":id":{"S":"<actual-uuid>"},":gsi3pk":{"S":"DRIVER#<actual-uuid>"}}' \
  --region us-east-1 \
  --profile haul-hub
```

---

### Issue: Broker dropdown is empty

**Problem:** When creating a trip, the broker dropdown is empty.

**Solution:**

Check if brokers were seeded:
```bash
aws dynamodb scan \
  --table-name HaulHub-BrokersTable-dev \
  --select COUNT \
  --region us-east-1 \
  --profile haul-hub
```

If count is 0, run the seeding script:
```bash
./scripts/seed-brokers.sh
```

---

### Issue: User verification status is "Pending"

**Problem:** After first login, user verification status shows as "Pending" instead of "Verified".

**Cause:** When users log in for the first time, the backend creates/updates their profile in DynamoDB with default "Pending" status.

**Solution:**

**Option 1 - Via Admin UI:**
Login as admin and verify the user through the UI.

**Option 2 - Via AWS CLI:**
```bash
# Get the user's actual UUID from Cognito
USER_ID=$(aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_yoiMUn0Q8 \
  --username driver1@haulhub.com \
  --region us-east-1 \
  --profile haul-hub \
  --query 'UserAttributes[?Name==`sub`].Value' \
  --output text)

# Update verification status
aws dynamodb update-item \
  --table-name HaulHub-UsersTable-dev \
  --key "{\"PK\":{\"S\":\"USER#${USER_ID}\"},\"SK\":{\"S\":\"PROFILE\"}}" \
  --update-expression "SET verificationStatus = :status" \
  --expression-attribute-values '{":status":{"S":"Verified"}}' \
  --region us-east-1 \
  --profile haul-hub
```

---

### Issue: User not in correct role group

**Problem:** User has wrong permissions or can't access role-specific features.

**Solution:**

Add user to the correct Cognito group:
```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id us-east-1_yoiMUn0Q8 \
  --username user@email.com \
  --group-name Dispatcher \
  --region us-east-1 \
  --profile haul-hub
```

Available groups: Admin, Dispatcher, Driver, LorryOwner

---

### Issue: Need to reset password

**Solution:**

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_yoiMUn0Q8 \
  --username user@email.com \
  --password NewPassword123! \
  --permanent \
  --region us-east-1 \
  --profile haul-hub
```


---

## 🔍 Database Verification

### Check Seeded Data

**Count items in each table:**

```bash
# Users
aws dynamodb scan --table-name HaulHub-UsersTable-dev --select COUNT --region us-east-1 --profile haul-hub

# Brokers
aws dynamodb scan --table-name HaulHub-BrokersTable-dev --select COUNT --region us-east-1 --profile haul-hub

# Lorries
aws dynamodb scan --table-name HaulHub-LorriesTable-dev --select COUNT --region us-east-1 --profile haul-hub

# Trips
aws dynamodb scan --table-name HaulHub-TripsTable-dev --select COUNT --region us-east-1 --profile haul-hub
```

**Expected counts:**
- Users: 7
- Brokers: 20
- Lorries: 10
- Trips: 30

---

### Query Trips by Role

**Trips for Dispatcher 1:**
```bash
aws dynamodb query \
  --table-name HaulHub-TripsTable-dev \
  --index-name GSI1 \
  --key-condition-expression "GSI1PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"DISPATCHER#dispatcher-001"}}' \
  --select COUNT \
  --region us-east-1 \
  --profile haul-hub
```
Expected: 15 trips

**Trips for Driver 1:**
```bash
aws dynamodb query \
  --table-name HaulHub-TripsTable-dev \
  --index-name GSI3 \
  --key-condition-expression "GSI3PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"DRIVER#driver-001"}}' \
  --select COUNT \
  --region us-east-1 \
  --profile haul-hub
```
Expected: 6 trips

**Trips for Owner 1:**
```bash
aws dynamodb query \
  --table-name HaulHub-TripsTable-dev \
  --index-name GSI2 \
  --key-condition-expression "GSI2PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"OWNER#owner-001"}}' \
  --select COUNT \
  --region us-east-1 \
  --profile haul-hub
```
Expected: 6 trips

---

### View Sample Data

**View a specific trip:**
```bash
aws dynamodb get-item \
  --table-name HaulHub-TripsTable-dev \
  --key '{"PK":{"S":"TRIP#trip-001"},"SK":{"S":"METADATA"}}' \
  --region us-east-1 \
  --profile haul-hub
```

**View a specific broker:**
```bash
aws dynamodb get-item \
  --table-name HaulHub-BrokersTable-dev \
  --key '{"PK":{"S":"BROKER#broker-001"},"SK":{"S":"METADATA"}}' \
  --region us-east-1 \
  --profile haul-hub
```

**View a specific lorry:**
```bash
aws dynamodb query \
  --table-name HaulHub-LorriesTable-dev \
  --key-condition-expression "PK = :pk AND SK = :sk" \
  --expression-attribute-values '{":pk":{"S":"LORRY_OWNER#owner-001"},":sk":{"S":"LORRY#TX-ABC-1234"}}' \
  --region us-east-1 \
  --profile haul-hub
```

---

### List Cognito Users

```bash
aws cognito-idp list-users \
  --user-pool-id us-east-1_yoiMUn0Q8 \
  --region us-east-1 \
  --profile haul-hub \
  --query 'Users[].{Username:Username,Email:Attributes[?Name==`email`].Value|[0],Name:Attributes[?Name==`name`].Value|[0],Status:UserStatus}' \
  --output table
```


---

## 🔄 Re-seeding Instructions

### Seed All Tables

To seed all tables (users, brokers, lorries, trips):

```bash
./scripts/seed-all-tables.sh
```

**Note:** This will add data to existing tables. It won't clear existing data first.

---

### Seed Only Brokers

To seed only the brokers table:

```bash
./scripts/seed-brokers.sh
```

---

### Create Cognito Users

To create/update Cognito users:

```bash
./scripts/create-cognito-users.sh
```

This script will:
- Create users if they don't exist
- Update passwords if users already exist
- Add users to correct role groups
- Set email as verified

---

### Clear and Re-seed (Manual Process)

If you need to completely clear and re-seed:

**1. Clear DynamoDB tables:**
```bash
# Delete all items from each table (requires scanning and deleting each item)
# Or delete and recreate tables via CloudFormation

# Redeploy infrastructure to recreate tables
cd haulhub-infrastructure
npm run deploy
```

**2. Re-seed data:**
```bash
./scripts/seed-all-tables.sh
```

**3. Recreate Cognito users:**
```bash
./scripts/create-cognito-users.sh
```

---

## 📊 Expected Results Summary

| User | Trips Visible | Lorries Visible | Can Create Trips | Can Update Status | Total Earnings |
|------|---------------|-----------------|------------------|-------------------|----------------|
| Admin | All (30) | All (10) | No | No | N/A |
| Dispatcher 1 | 15 (own) | All (10) | Yes | Yes | N/A |
| Dispatcher 2 | 15 (own) | All (10) | Yes | Yes | N/A |
| Driver 1 | 6 (assigned) | N/A | No | Yes | $1,975 |
| Driver 2 | 6 (assigned) | N/A | No | Yes | $1,775 |
| Owner 1 | 6 (own lorries) | 3 (own) | No | No | $3,475 |
| Owner 2 | 6 (own lorries) | 3 (own) | No | No | $2,700 |

---

## 🎯 Success Criteria

The database refactoring is successful if:

- ✅ All 4 new tables exist and are populated
- ✅ GSI queries return correct results
- ✅ Dispatchers can view only their trips (15 each)
- ✅ Drivers can view only their assigned trips (6 each)
- ✅ Lorry owners can view only trips for their lorries (6 each)
- ✅ Brokers dropdown is populated with 20 brokers
- ✅ All CRUD operations work correctly
- ✅ Frontend displays data correctly
- ✅ Role-based access control works
- ✅ Payment calculations are accurate

---

## 📚 Related Scripts

- **`scripts/seed-all-tables.sh`** - Seeds users, lorries, and trips
- **`scripts/seed-brokers.sh`** - Seeds only brokers table
- **`scripts/create-cognito-users.sh`** - Creates Cognito users for authentication
- **`scripts/test-api.sh`** - Automated API testing script
- **`scripts/verify-deployment.md`** - Detailed API verification guide

---

## 🎉 You're Ready to Test!

All data is seeded and users are created. Start testing at:

**https://d23ld7dtwui8dz.cloudfront.net**

Use any email from the [Login Credentials](#login-credentials) section with password: `HaulHub2024!`

Happy testing! 🚀


---

### Issue: Broker names not showing in payment reports

**Problem:** Payment reports show broker data but the broker name column is empty.

**Cause:** Trips were created without the `brokerName` field (only `brokerId` was stored). This happens when trips are manually seeded or created before the broker name lookup was implemented.

**Solution:**

Run the broker name fix script:
```bash
python3 scripts/fix-broker-names.py
```

This script will:
- Scan all trips in the trips table
- Look up the broker name for each trip's brokerId from the brokers table
- Update each trip with the correct brokerName field

**Note:** The seed script (`seed-all-tables.sh`) has been updated to include broker names automatically for new trips.

