# HaulHub Scripts & Documentation

## 🚀 Quick Start

**For complete testing guide with login credentials and seeded data:**

👉 **See [`TEST-DATA-GUIDE.md`](TEST-DATA-GUIDE.md)**

This comprehensive guide includes:
- Login credentials for all test users
- Complete seeded data reference
- Testing scenarios
- Troubleshooting tips
- Database verification commands

---

## 📁 Available Scripts

### Seeding Scripts

- **`seed-all-tables.sh`** - Seeds users, lorries, and trips tables
- **`seed-brokers.sh`** - Seeds only the brokers table
- **`create-cognito-users.sh`** - Creates Cognito users for authentication

### Testing Scripts

- **`test-api.sh`** - Automated API endpoint testing
- **`verify-deployment.md`** - Detailed API verification guide

### Deployment Scripts

- **`deploy-backend.sh`** - Deploys backend Lambda functions
- **`deploy-frontend.sh`** - Deploys frontend to S3/CloudFront
- **`deploy-infrastructure.sh`** - Deploys AWS infrastructure

---

## 🎯 Quick Reference

**Frontend URL:** https://d23ld7dtwui8dz.cloudfront.net

**Default Password (All Users):** `HaulHub2024!`

**Test Users:**
- admin@haulhub.com (Admin)
- dispatcher1@haulhub.com (Dispatcher)
- driver1@haulhub.com (Driver)
- owner1@haulhub.com (Lorry Owner)

**Full details in [`TEST-DATA-GUIDE.md`](TEST-DATA-GUIDE.md)**

---

## 📊 Seeded Data Summary

- **Users:** 7 (1 Admin, 2 Dispatchers, 2 Drivers, 2 Lorry Owners)
- **Brokers:** 20 major US freight brokers
- **Lorries:** 10 (6 for verified owners, 4 for unverified)
- **Trips:** 30 (15 per dispatcher)

---

## 🔄 Common Tasks

### Seed All Data
```bash
./scripts/seed-all-tables.sh
```

### Create Test Users
```bash
./scripts/create-cognito-users.sh
```

### Test API Endpoints
```bash
./scripts/test-api.sh
```

### Deploy Frontend
```bash
./scripts/deploy-frontend.sh
```

### Deploy Backend
```bash
./scripts/deploy-backend.sh
```

---

## 📚 Documentation

- **[TEST-DATA-GUIDE.md](TEST-DATA-GUIDE.md)** - Complete testing guide (START HERE)
- **[verify-deployment.md](verify-deployment.md)** - API verification procedures
- **[deployment-summary.md](deployment-summary.md)** - Deployment history and status
- **[verification-results.md](verification-results.md)** - Test results tracking

---

## 🆘 Need Help?

See the [Troubleshooting section](TEST-DATA-GUIDE.md#troubleshooting) in the TEST-DATA-GUIDE.md
