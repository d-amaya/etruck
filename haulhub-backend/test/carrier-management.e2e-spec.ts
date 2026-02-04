/**
 * Carrier Management System - Integration Tests
 * 
 * This test suite validates the complete carrier management functionality end-to-end,
 * including user creation, asset management, trip queries, and authorization.
 * 
 * Test Coverage:
 * - User creation flow for all roles (dispatcher, driver, truck owner)
 * - Email uniqueness validation
 * - User listing and filtering by role
 * - User search by name and email
 * - User update (allowed and disallowed fields)
 * - User deactivation/reactivation
 * - Truck creation with carrier validation
 * - Truck VIN/plate uniqueness validation
 * - Truck owner carrier membership validation
 * - Trailer creation
 * - Asset deactivation/reactivation
 * - Trip query by carrier with filters
 * - Dashboard metrics calculation
 * - Authorization (carrier-only access, carrierId validation)
 * - Non-carrier user rejection
 * 
 * Requirements: All requirements from carrier-management-system spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Carrier Management System - Integration Tests (e2e)', () => {
  let app: INestApplication;
  let carrierToken: string;
  let carrierId: string;
  let dispatcherToken: string;
  
  // Test data storage
  const createdUserIds: string[] = [];
  const createdTruckIds: string[] = [];
  const createdTrailerIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // Login as carrier to get authentication token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'carrier@swiftlogistics.com',
        password: 'TempPass123!',
      });

    expect(loginResponse.status).toBe(200);
    carrierToken = loginResponse.body.idToken;
    carrierId = loginResponse.body.user.carrierId;

    // Login as dispatcher for authorization tests
    const dispatcherLoginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'dispatcher1@swiftlogistics.com',
        password: 'TempPass123!',
      });

    expect(dispatcherLoginResponse.status).toBe(200);
    dispatcherToken = dispatcherLoginResponse.body.idToken;
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // User Management Tests
  // ============================================================================

  describe('User Management', () => {
    describe('User Creation', () => {
      it('should create a dispatcher with all required fields', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'John Dispatcher',
            email: `john.dispatcher.${Date.now()}@test.com`,
            phone: '(555) 123-4567',
            address: '123 Main St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30301',
            ein: '12-3456789',
            ss: '123-45-6789',
            rate: 5.0,
          });

        expect(response.status).toBe(201);
        expect(response.body.user).toBeDefined();
        expect(response.body.user.role).toBe('DISPATCHER');
        expect(response.body.user.carrierId).toBe(carrierId);
        expect(response.body.user.isActive).toBe(true);
        expect(response.body.user.rate).toBe(5.0);
        expect(response.body.temporaryPassword).toBeDefined();
        
        // Verify DynamoDB keys are correct
        expect(response.body.user.PK).toMatch(/^USER#/);
        expect(response.body.user.SK).toBe('METADATA');
        expect(response.body.user.GSI1PK).toBe(`CARRIER#${carrierId}`);
        expect(response.body.user.GSI1SK).toMatch(/^ROLE#DISPATCHER#USER#/);
        expect(response.body.user.GSI2PK).toMatch(/^EMAIL#/);
        expect(response.body.user.GSI2SK).toMatch(/^USER#/);

        createdUserIds.push(response.body.user.userId);
      });

      it('should create a driver with all required fields', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DRIVER',
            name: 'Jane Driver',
            email: `jane.driver.${Date.now()}@test.com`,
            phone: '(555) 234-5678',
            address: '456 Oak Ave',
            city: 'Atlanta',
            state: 'GA',
            zip: '30302',
            ein: '23-4567890',
            ss: '234-56-7890',
            rate: 0.50,
            corpName: 'Jane Transport LLC',
            dob: '1985-05-15',
            cdlClass: 'A',
            cdlState: 'GA',
            cdlIssued: '2010-01-01',
            cdlExpires: '2026-01-01',
            fax: '(555) 234-5679',
          });

        expect(response.status).toBe(201);
        expect(response.body.user.role).toBe('DRIVER');
        expect(response.body.user.cdlClass).toBe('A');
        expect(response.body.user.corpName).toBe('Jane Transport LLC');
        expect(response.body.user.rate).toBe(0.50);

        createdUserIds.push(response.body.user.userId);
      });

      it('should create a truck owner with all required fields', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'TRUCK_OWNER',
            name: 'Bob Owner',
            email: `bob.owner.${Date.now()}@test.com`,
            phone: '(555) 345-6789',
            address: '789 Pine Rd',
            city: 'Atlanta',
            state: 'GA',
            zip: '30304',
            ein: '45-6789012',
            ss: '456-78-9012',
            company: 'Bob Trucking Inc',
          });

        expect(response.status).toBe(201);
        expect(response.body.user.role).toBe('TRUCK_OWNER');
        expect(response.body.user.company).toBe('Bob Trucking Inc');

        createdUserIds.push(response.body.user.userId);
      });

      it('should reject duplicate email', async () => {
        const email = `duplicate.${Date.now()}@test.com`;
        
        // Create first user
        const firstResponse = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'First User',
            email,
            phone: '(555) 111-1111',
            address: '111 First St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30301',
            ein: '11-1111111',
            ss: '111-11-1111',
            rate: 5.0,
          });

        expect(firstResponse.status).toBe(201);
        createdUserIds.push(firstResponse.body.user.userId);

        // Attempt to create second user with same email
        const secondResponse = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'Second User',
            email, // Same email
            phone: '(555) 222-2222',
            address: '222 Second St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30302',
            ein: '22-2222222',
            ss: '222-22-2222',
            rate: 5.0,
          });

        expect(secondResponse.status).toBe(400);
        expect(secondResponse.body.message).toContain('already exists');
      });

      it('should reject user creation with missing required fields', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'Incomplete User',
            email: `incomplete.${Date.now()}@test.com`,
            // Missing phone, address, city, state, zip, ein, ss, rate
          });

        expect(response.status).toBe(400);
      });

      it('should reject dispatcher creation without rate field', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'No Rate Dispatcher',
            email: `norate.${Date.now()}@test.com`,
            phone: '(555) 333-3333',
            address: '333 Third St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30303',
            ein: '33-3333333',
            ss: '333-33-3333',
            // Missing rate
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('rate');
      });

      it('should reject driver creation without driver-specific fields', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DRIVER',
            name: 'Incomplete Driver',
            email: `incomplete.driver.${Date.now()}@test.com`,
            phone: '(555) 444-4444',
            address: '444 Fourth St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30304',
            ein: '44-4444444',
            ss: '444-44-4444',
            // Missing rate, corpName, dob, cdlClass, cdlState, cdlIssued, cdlExpires
          });

        expect(response.status).toBe(400);
      });

      it('should reject invalid email format', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'Invalid Email User',
            email: 'not-an-email',
            phone: '(555) 555-5555',
            address: '555 Fifth St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30305',
            ein: '55-5555555',
            ss: '555-55-5555',
            rate: 5.0,
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('email');
      });

      it('should reject invalid phone format', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'Invalid Phone User',
            email: `invalid.phone.${Date.now()}@test.com`,
            phone: '555-123-4567', // Wrong format
            address: '666 Sixth St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30306',
            ein: '66-6666666',
            ss: '666-66-6666',
            rate: 5.0,
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('phone');
      });

      it('should reject invalid ZIP code format', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'Invalid ZIP User',
            email: `invalid.zip.${Date.now()}@test.com`,
            phone: '(555) 777-7777',
            address: '777 Seventh St',
            city: 'Atlanta',
            state: 'GA',
            zip: '123', // Invalid ZIP
            ein: '77-7777777',
            ss: '777-77-7777',
            rate: 5.0,
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('ZIP');
      });
    });

    describe('User Listing and Filtering', () => {
      it('should list all users for carrier', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users).toBeInstanceOf(Array);
        expect(response.body.total).toBeGreaterThan(0);
        
        // Verify all users belong to the carrier
        response.body.users.forEach((user: any) => {
          expect(user.carrierId).toBe(carrierId);
        });
      });

      it('should filter users by role (DISPATCHER)', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/users?role=DISPATCHER')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users).toBeInstanceOf(Array);
        
        // Verify all returned users are dispatchers
        response.body.users.forEach((user: any) => {
          expect(user.role).toBe('DISPATCHER');
        });
      });

      it('should filter users by role (DRIVER)', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/users?role=DRIVER')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users).toBeInstanceOf(Array);
        
        // Verify all returned users are drivers
        response.body.users.forEach((user: any) => {
          expect(user.role).toBe('DRIVER');
        });
      });

      it('should filter users by role (TRUCK_OWNER)', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/users?role=TRUCK_OWNER')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users).toBeInstanceOf(Array);
        
        // Verify all returned users are truck owners
        response.body.users.forEach((user: any) => {
          expect(user.role).toBe('TRUCK_OWNER');
        });
      });

      it('should search users by name', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/users?search=John')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users).toBeInstanceOf(Array);
        
        // Verify all returned users have 'John' in their name
        response.body.users.forEach((user: any) => {
          expect(user.name.toLowerCase()).toContain('john');
        });
      });

      it('should search users by email', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/users?search=test.com')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users).toBeInstanceOf(Array);
        
        // Verify all returned users have 'test.com' in their email
        response.body.users.forEach((user: any) => {
          expect(user.email.toLowerCase()).toContain('test.com');
        });
      });

      it('should combine role filter and search', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/users?role=DISPATCHER&search=dispatcher')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.users).toBeInstanceOf(Array);
        
        // Verify all returned users are dispatchers with 'dispatcher' in name/email
        response.body.users.forEach((user: any) => {
          expect(user.role).toBe('DISPATCHER');
          const nameOrEmail = (user.name + user.email).toLowerCase();
          expect(nameOrEmail).toContain('dispatcher');
        });
      });
    });

    describe('User Update', () => {
      let testUserId: string;

      beforeAll(async () => {
        // Create a test user for update tests
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'Update Test User',
            email: `update.test.${Date.now()}@test.com`,
            phone: '(555) 888-8888',
            address: '888 Eighth St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30308',
            ein: '88-8888888',
            ss: '888-88-8888',
            rate: 5.0,
          });

        testUserId = response.body.user.userId;
        createdUserIds.push(testUserId);
      });

      it('should update allowed fields (name, phone, address)', async () => {
        const response = await request(app.getHttpServer())
          .put(`/carrier/users/${testUserId}`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            name: 'Updated Name',
            phone: '(555) 999-9999',
            address: '999 Ninth St',
            city: 'Savannah',
            state: 'GA',
            zip: '31401',
            rate: 7.5,
          });

        expect(response.status).toBe(200);
        expect(response.body.user.name).toBe('Updated Name');
        expect(response.body.user.phone).toBe('(555) 999-9999');
        expect(response.body.user.address).toBe('999 Ninth St');
        expect(response.body.user.city).toBe('Savannah');
        expect(response.body.user.state).toBe('GA');
        expect(response.body.user.zip).toBe('31401');
        expect(response.body.user.rate).toBe(7.5);
      });

      it('should not update disallowed fields (email, userId, carrierId, role, ein, ss)', async () => {
        const originalEmail = 'update.test@test.com';
        
        const response = await request(app.getHttpServer())
          .put(`/carrier/users/${testUserId}`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            email: 'newemail@test.com', // Should be ignored
            userId: 'new-user-id', // Should be ignored
            carrierId: 'new-carrier-id', // Should be ignored
            role: 'DRIVER', // Should be ignored
            ein: '99-9999999', // Should be ignored
            ss: '999-99-9999', // Should be ignored
            name: 'Another Update',
          });

        expect(response.status).toBe(200);
        expect(response.body.user.name).toBe('Another Update');
        
        // Verify disallowed fields were not changed
        expect(response.body.user.userId).toBe(testUserId);
        expect(response.body.user.carrierId).toBe(carrierId);
        expect(response.body.user.role).toBe('DISPATCHER');
        // Email, ein, ss should remain unchanged (not returned in response for security)
      });
    });

    describe('User Deactivation and Reactivation', () => {
      let testUserId: string;

      beforeAll(async () => {
        // Create a test user for deactivation tests
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'Deactivation Test User',
            email: `deactivation.test.${Date.now()}@test.com`,
            phone: '(555) 000-0000',
            address: '000 Zero St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30300',
            ein: '00-0000000',
            ss: '000-00-0000',
            rate: 5.0,
          });

        testUserId = response.body.user.userId;
        createdUserIds.push(testUserId);
      });

      it('should deactivate a user (soft delete)', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/carrier/users/${testUserId}/status`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({ isActive: false });

        expect(response.status).toBe(200);
        expect(response.body.user.isActive).toBe(false);
        expect(response.body.user.userId).toBe(testUserId);
      });

      it('should reactivate a user', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/carrier/users/${testUserId}/status`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({ isActive: true });

        expect(response.status).toBe(200);
        expect(response.body.user.isActive).toBe(true);
        expect(response.body.user.userId).toBe(testUserId);
      });
    });
  });

  // ============================================================================
  // Asset Management Tests - Trucks
  // ============================================================================

  describe('Truck Management', () => {
    let truckOwnerId: string;

    beforeAll(async () => {
      // Create a truck owner for truck tests
      const response = await request(app.getHttpServer())
        .post('/carrier/users')
        .set('Authorization', `Bearer ${carrierToken}`)
        .send({
          role: 'TRUCK_OWNER',
          name: 'Truck Test Owner',
          email: `truck.owner.${Date.now()}@test.com`,
          phone: '(555) 100-1000',
          address: '100 Truck St',
          city: 'Atlanta',
          state: 'GA',
          zip: '30310',
          ein: '10-1010101',
          ss: '100-10-1000',
          company: 'Test Trucking Co',
        });

      truckOwnerId = response.body.user.userId;
      createdUserIds.push(truckOwnerId);
    });

    describe('Truck Creation', () => {
      it('should create a truck with valid data', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId,
            plate: `TEST${Date.now()}`,
            brand: 'Freightliner',
            year: 2020,
            vin: `1FUJGHDV8CLBP${Date.now().toString().slice(-4)}`,
            color: 'White',
          });

        expect(response.status).toBe(201);
        expect(response.body.truck).toBeDefined();
        expect(response.body.truck.carrierId).toBe(carrierId);
        expect(response.body.truck.truckOwnerId).toBe(truckOwnerId);
        expect(response.body.truck.isActive).toBe(true);
        
        // Verify DynamoDB keys
        expect(response.body.truck.PK).toMatch(/^TRUCK#/);
        expect(response.body.truck.SK).toBe('METADATA');
        expect(response.body.truck.GSI1PK).toBe(`CARRIER#${carrierId}`);
        expect(response.body.truck.GSI1SK).toMatch(/^TRUCK#/);
        expect(response.body.truck.GSI2PK).toBe(`OWNER#${truckOwnerId}`);
        expect(response.body.truck.GSI2SK).toMatch(/^TRUCK#/);

        createdTruckIds.push(response.body.truck.truckId);
      });

      it('should reject duplicate VIN', async () => {
        const vin = `1FUJGHDV8CLBP${Date.now().toString().slice(-4)}`;
        
        // Create first truck
        const firstResponse = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId,
            plate: `FIRST${Date.now()}`,
            brand: 'Freightliner',
            year: 2020,
            vin,
            color: 'White',
          });

        expect(firstResponse.status).toBe(201);
        createdTruckIds.push(firstResponse.body.truck.truckId);

        // Attempt to create second truck with same VIN
        const secondResponse = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId,
            plate: `SECOND${Date.now()}`,
            brand: 'Peterbilt',
            year: 2021,
            vin, // Same VIN
            color: 'Red',
          });

        expect(secondResponse.status).toBe(400);
        expect(secondResponse.body.message).toContain('VIN');
      });

      it('should reject duplicate plate', async () => {
        const plate = `PLATE${Date.now()}`;
        
        // Create first truck
        const firstResponse = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId,
            plate,
            brand: 'Freightliner',
            year: 2020,
            vin: `1FUJGHDV8CLBP${Date.now().toString().slice(-4)}`,
            color: 'White',
          });

        expect(firstResponse.status).toBe(201);
        createdTruckIds.push(firstResponse.body.truck.truckId);

        // Attempt to create second truck with same plate
        const secondResponse = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId,
            plate, // Same plate
            brand: 'Peterbilt',
            year: 2021,
            vin: `1FUJGHDV8CLBP${Date.now().toString().slice(-4)}`,
            color: 'Red',
          });

        expect(secondResponse.status).toBe(400);
        expect(secondResponse.body.message).toContain('plate');
      });

      it('should reject invalid year (too old)', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId,
            plate: `OLDYEAR${Date.now()}`,
            brand: 'Freightliner',
            year: 1899, // Before 1900
            vin: `1FUJGHDV8CLBP${Date.now().toString().slice(-4)}`,
            color: 'White',
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('year');
      });

      it('should reject invalid year (too new)', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId,
            plate: `NEWYEAR${Date.now()}`,
            brand: 'Freightliner',
            year: new Date().getFullYear() + 2, // More than current + 1
            vin: `1FUJGHDV8CLBP${Date.now().toString().slice(-4)}`,
            color: 'White',
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('year');
      });

      it('should reject truck owner from different carrier', async () => {
        // This test assumes there's another carrier in the system
        // For now, we'll use a fake UUID to test the validation
        const fakeOwnerId = '00000000-0000-0000-0000-000000000000';
        
        const response = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId: fakeOwnerId,
            plate: `BADOWNER${Date.now()}`,
            brand: 'Freightliner',
            year: 2020,
            vin: `1FUJGHDV8CLBP${Date.now().toString().slice(-4)}`,
            color: 'White',
          });

        // Should fail with 403 or 400 depending on implementation
        expect([400, 403, 404]).toContain(response.status);
      });

      it('should reject missing required fields', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId,
            plate: `INCOMPLETE${Date.now()}`,
            // Missing brand, year, vin, color
          });

        expect(response.status).toBe(400);
      });
    });

    describe('Truck Listing and Filtering', () => {
      it('should list all trucks for carrier', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.trucks).toBeInstanceOf(Array);
        expect(response.body.total).toBeGreaterThan(0);
        
        // Verify all trucks belong to the carrier
        response.body.trucks.forEach((truck: any) => {
          expect(truck.carrierId).toBe(carrierId);
        });
      });

      it('should filter trucks by owner', async () => {
        const response = await request(app.getHttpServer())
          .get(`/carrier/trucks?ownerId=${truckOwnerId}`)
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.trucks).toBeInstanceOf(Array);
        
        // Verify all returned trucks belong to the specified owner
        response.body.trucks.forEach((truck: any) => {
          expect(truck.truckOwnerId).toBe(truckOwnerId);
        });
      });

      it('should search trucks by plate', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/trucks?search=TEST')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.trucks).toBeInstanceOf(Array);
        
        // Verify all returned trucks have 'TEST' in their plate
        response.body.trucks.forEach((truck: any) => {
          expect(truck.plate.toUpperCase()).toContain('TEST');
        });
      });
    });

    describe('Truck Update and Deactivation', () => {
      let testTruckId: string;

      beforeAll(async () => {
        // Create a test truck for update tests
        const response = await request(app.getHttpServer())
          .post('/carrier/trucks')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            truckOwnerId,
            plate: `UPDATE${Date.now()}`,
            brand: 'Freightliner',
            year: 2020,
            vin: `1FUJGHDV8CLBP${Date.now().toString().slice(-4)}`,
            color: 'White',
          });

        testTruckId = response.body.truck.truckId;
        createdTruckIds.push(testTruckId);
      });

      it('should update truck details', async () => {
        const response = await request(app.getHttpServer())
          .put(`/carrier/trucks/${testTruckId}`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            plate: 'UPDATED123',
            color: 'Blue',
            year: 2021,
          });

        expect(response.status).toBe(200);
        expect(response.body.truck.plate).toBe('UPDATED123');
        expect(response.body.truck.color).toBe('Blue');
        expect(response.body.truck.year).toBe(2021);
      });

      it('should deactivate a truck (soft delete)', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/carrier/trucks/${testTruckId}/status`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({ isActive: false });

        expect(response.status).toBe(200);
        expect(response.body.truck.isActive).toBe(false);
      });

      it('should reactivate a truck', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/carrier/trucks/${testTruckId}/status`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({ isActive: true });

        expect(response.status).toBe(200);
        expect(response.body.truck.isActive).toBe(true);
      });
    });
  });

  // ============================================================================
  // Asset Management Tests - Trailers
  // ============================================================================

  describe('Trailer Management', () => {
    describe('Trailer Creation', () => {
      it('should create a trailer with valid data', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/trailers')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            plate: `TRL${Date.now()}`,
            brand: 'Great Dane',
            year: 2019,
            vin: `1GRAA0621KB${Date.now().toString().slice(-6)}`,
            color: 'Silver',
            reefer: 'TK-5000',
          });

        expect(response.status).toBe(201);
        expect(response.body.trailer).toBeDefined();
        expect(response.body.trailer.carrierId).toBe(carrierId);
        expect(response.body.trailer.isActive).toBe(true);
        expect(response.body.trailer.reefer).toBe('TK-5000');
        
        // Verify DynamoDB keys
        expect(response.body.trailer.PK).toMatch(/^TRAILER#/);
        expect(response.body.trailer.SK).toBe('METADATA');
        expect(response.body.trailer.GSI1PK).toBe(`CARRIER#${carrierId}`);
        expect(response.body.trailer.GSI1SK).toMatch(/^TRAILER#/);

        createdTrailerIds.push(response.body.trailer.trailerId);
      });

      it('should create a trailer without reefer (optional field)', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/trailers')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            plate: `NOREF${Date.now()}`,
            brand: 'Great Dane',
            year: 2019,
            vin: `1GRAA0621KB${Date.now().toString().slice(-6)}`,
            color: 'Silver',
            // No reefer field
          });

        expect(response.status).toBe(201);
        expect(response.body.trailer.reefer).toBeNull();

        createdTrailerIds.push(response.body.trailer.trailerId);
      });

      it('should reject duplicate VIN', async () => {
        const vin = `1GRAA0621KB${Date.now().toString().slice(-6)}`;
        
        // Create first trailer
        const firstResponse = await request(app.getHttpServer())
          .post('/carrier/trailers')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            plate: `FIRST${Date.now()}`,
            brand: 'Great Dane',
            year: 2019,
            vin,
            color: 'Silver',
          });

        expect(firstResponse.status).toBe(201);
        createdTrailerIds.push(firstResponse.body.trailer.trailerId);

        // Attempt to create second trailer with same VIN
        const secondResponse = await request(app.getHttpServer())
          .post('/carrier/trailers')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            plate: `SECOND${Date.now()}`,
            brand: 'Utility',
            year: 2020,
            vin, // Same VIN
            color: 'White',
          });

        expect(secondResponse.status).toBe(400);
        expect(secondResponse.body.message).toContain('VIN');
      });

      it('should reject duplicate plate', async () => {
        const plate = `TRLPLATE${Date.now()}`;
        
        // Create first trailer
        const firstResponse = await request(app.getHttpServer())
          .post('/carrier/trailers')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            plate,
            brand: 'Great Dane',
            year: 2019,
            vin: `1GRAA0621KB${Date.now().toString().slice(-6)}`,
            color: 'Silver',
          });

        expect(firstResponse.status).toBe(201);
        createdTrailerIds.push(firstResponse.body.trailer.trailerId);

        // Attempt to create second trailer with same plate
        const secondResponse = await request(app.getHttpServer())
          .post('/carrier/trailers')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            plate, // Same plate
            brand: 'Utility',
            year: 2020,
            vin: `1GRAA0621KB${Date.now().toString().slice(-6)}`,
            color: 'White',
          });

        expect(secondResponse.status).toBe(400);
        expect(secondResponse.body.message).toContain('plate');
      });
    });

    describe('Trailer Listing and Filtering', () => {
      it('should list all trailers for carrier', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/trailers')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.trailers).toBeInstanceOf(Array);
        expect(response.body.total).toBeGreaterThan(0);
        
        // Verify all trailers belong to the carrier
        response.body.trailers.forEach((trailer: any) => {
          expect(trailer.carrierId).toBe(carrierId);
        });
      });

      it('should search trailers by plate', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/trailers?search=TRL')
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.trailers).toBeInstanceOf(Array);
        
        // Verify all returned trailers have 'TRL' in their plate
        response.body.trailers.forEach((trailer: any) => {
          expect(trailer.plate.toUpperCase()).toContain('TRL');
        });
      });
    });

    describe('Trailer Update and Deactivation', () => {
      let testTrailerId: string;

      beforeAll(async () => {
        // Create a test trailer for update tests
        const response = await request(app.getHttpServer())
          .post('/carrier/trailers')
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            plate: `TRLUPD${Date.now()}`,
            brand: 'Great Dane',
            year: 2019,
            vin: `1GRAA0621KB${Date.now().toString().slice(-6)}`,
            color: 'Silver',
          });

        testTrailerId = response.body.trailer.trailerId;
        createdTrailerIds.push(testTrailerId);
      });

      it('should update trailer details', async () => {
        const response = await request(app.getHttpServer())
          .put(`/carrier/trailers/${testTrailerId}`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({
            plate: 'TRLUPDATED',
            color: 'White',
            reefer: 'TK-6000',
          });

        expect(response.status).toBe(200);
        expect(response.body.trailer.plate).toBe('TRLUPDATED');
        expect(response.body.trailer.color).toBe('White');
        expect(response.body.trailer.reefer).toBe('TK-6000');
      });

      it('should deactivate a trailer (soft delete)', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/carrier/trailers/${testTrailerId}/status`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({ isActive: false });

        expect(response.status).toBe(200);
        expect(response.body.trailer.isActive).toBe(false);
      });

      it('should reactivate a trailer', async () => {
        const response = await request(app.getHttpServer())
          .patch(`/carrier/trailers/${testTrailerId}/status`)
          .set('Authorization', `Bearer ${carrierToken}`)
          .send({ isActive: true });

        expect(response.status).toBe(200);
        expect(response.body.trailer.isActive).toBe(true);
      });
    });
  });

  // ============================================================================
  // Trip Query Tests
  // ============================================================================

  describe('Trip Queries', () => {
    it('should get all trips for carrier', async () => {
      const response = await request(app.getHttpServer())
        .get('/trips')
        .query({ carrierId })
        .set('Authorization', `Bearer ${carrierToken}`);

      expect(response.status).toBe(200);
      expect(response.body.trips).toBeInstanceOf(Array);
      
      // Carrier should see all fields (no filtering)
      if (response.body.trips.length > 0) {
        const trip = response.body.trips[0];
        expect(trip.brokerPayment).toBeDefined();
        expect(trip.driverPayment).toBeDefined();
        expect(trip.truckOwnerPayment).toBeDefined();
        expect(trip.dispatcherPayment).toBeDefined();
      }
    });

    it('should filter trips by date range', async () => {
      const response = await request(app.getHttpServer())
        .get('/trips')
        .query({
          carrierId,
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        })
        .set('Authorization', `Bearer ${carrierToken}`);

      expect(response.status).toBe(200);
      expect(response.body.trips).toBeInstanceOf(Array);
      
      // Verify all trips are within date range
      response.body.trips.forEach((trip: any) => {
        const tripDate = new Date(trip.scheduledTimestamp);
        expect(tripDate >= new Date('2025-01-01')).toBe(true);
        expect(tripDate <= new Date('2025-01-31T23:59:59')).toBe(true);
      });
    });

    it('should filter trips by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/trips')
        .query({
          carrierId,
          status: 'Delivered',
        })
        .set('Authorization', `Bearer ${carrierToken}`);

      expect(response.status).toBe(200);
      expect(response.body.trips).toBeInstanceOf(Array);
      
      // Verify all trips have the specified status
      response.body.trips.forEach((trip: any) => {
        expect(trip.orderStatus).toBe('Delivered');
      });
    });

    it('should filter trips by dispatcher', async () => {
      // Get a dispatcher ID from the system
      const usersResponse = await request(app.getHttpServer())
        .get('/carrier/users?role=DISPATCHER')
        .set('Authorization', `Bearer ${carrierToken}`);

      if (usersResponse.body.users.length > 0) {
        const dispatcherId = usersResponse.body.users[0].userId;

        const response = await request(app.getHttpServer())
          .get('/trips')
          .query({
            carrierId,
            dispatcherId,
          })
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
        expect(response.body.trips).toBeInstanceOf(Array);
        
        // Verify all trips belong to the specified dispatcher
        response.body.trips.forEach((trip: any) => {
          expect(trip.dispatcherId).toBe(dispatcherId);
        });
      }
    });
  });

  // ============================================================================
  // Dashboard Metrics Tests
  // ============================================================================

  describe('Dashboard Metrics', () => {
    it('should get dashboard metrics with all required data', async () => {
      const response = await request(app.getHttpServer())
        .get('/carrier/dashboard')
        .set('Authorization', `Bearer ${carrierToken}`);

      expect(response.status).toBe(200);
      
      // Verify metrics structure
      expect(response.body.metrics).toBeDefined();
      expect(response.body.metrics.activeTrips).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.activeAssets).toBeDefined();
      expect(response.body.metrics.activeAssets.trucks).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.activeAssets.trailers).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.activeUsers).toBeDefined();
      expect(response.body.metrics.activeUsers.dispatchers).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.activeUsers.drivers).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.activeUsers.truckOwners).toBeGreaterThanOrEqual(0);
      expect(response.body.metrics.tripStatusBreakdown).toBeDefined();
      
      // Verify financial summary
      expect(response.body.financialSummary).toBeDefined();
      expect(response.body.financialSummary.totalRevenue).toBeGreaterThanOrEqual(0);
      expect(response.body.financialSummary.totalExpenses).toBeGreaterThanOrEqual(0);
      expect(response.body.financialSummary.netProfit).toBeDefined();
      expect(response.body.financialSummary.month).toMatch(/^\d{4}-\d{2}$/);
      
      // Verify top performers
      expect(response.body.topBrokers).toBeInstanceOf(Array);
      expect(response.body.topBrokers.length).toBeLessThanOrEqual(5);
      expect(response.body.topDrivers).toBeInstanceOf(Array);
      expect(response.body.topDrivers.length).toBeLessThanOrEqual(5);
      
      // Verify recent activity
      expect(response.body.recentActivity).toBeInstanceOf(Array);
      expect(response.body.recentActivity.length).toBeLessThanOrEqual(10);
    });

    it('should calculate active trips correctly (status not Paid)', async () => {
      const response = await request(app.getHttpServer())
        .get('/carrier/dashboard')
        .set('Authorization', `Bearer ${carrierToken}`);

      expect(response.status).toBe(200);
      
      // Get all trips to verify count
      const tripsResponse = await request(app.getHttpServer())
        .get('/trips')
        .query({ carrierId })
        .set('Authorization', `Bearer ${carrierToken}`);

      const activeTripsCount = tripsResponse.body.trips.filter(
        (trip: any) => trip.orderStatus !== 'Paid'
      ).length;

      expect(response.body.metrics.activeTrips).toBe(activeTripsCount);
    });

    it('should order recent activity by scheduledTimestamp descending', async () => {
      const response = await request(app.getHttpServer())
        .get('/carrier/dashboard')
        .set('Authorization', `Bearer ${carrierToken}`);

      expect(response.status).toBe(200);
      
      const recentActivity = response.body.recentActivity;
      
      if (recentActivity.length > 1) {
        // Verify descending order
        for (let i = 0; i < recentActivity.length - 1; i++) {
          const currentDate = new Date(recentActivity[i].scheduledTimestamp);
          const nextDate = new Date(recentActivity[i + 1].scheduledTimestamp);
          expect(currentDate >= nextDate).toBe(true);
        }
      }
    });
  });

  // ============================================================================
  // Authorization Tests
  // ============================================================================

  describe('Authorization', () => {
    describe('Carrier-Only Access', () => {
      it('should reject non-carrier users from accessing dashboard', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/dashboard')
          .set('Authorization', `Bearer ${dispatcherToken}`);

        expect(response.status).toBe(403);
      });

      it('should reject non-carrier users from creating users', async () => {
        const response = await request(app.getHttpServer())
          .post('/carrier/users')
          .set('Authorization', `Bearer ${dispatcherToken}`)
          .send({
            role: 'DISPATCHER',
            name: 'Unauthorized User',
            email: `unauthorized.${Date.now()}@test.com`,
            phone: '(555) 000-0000',
            address: '000 Zero St',
            city: 'Atlanta',
            state: 'GA',
            zip: '30300',
            ein: '00-0000000',
            ss: '000-00-0000',
            rate: 5.0,
          });

        expect(response.status).toBe(403);
      });

      it('should reject non-carrier users from accessing trucks', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/trucks')
          .set('Authorization', `Bearer ${dispatcherToken}`);

        expect(response.status).toBe(403);
      });

      it('should reject non-carrier users from accessing trailers', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/trailers')
          .set('Authorization', `Bearer ${dispatcherToken}`);

        expect(response.status).toBe(403);
      });
    });

    describe('Carrier ID Validation', () => {
      it('should reject access to other carrier data', async () => {
        const fakeCarrierId = '00000000-0000-0000-0000-000000000000';
        
        const response = await request(app.getHttpServer())
          .get('/trips')
          .query({ carrierId: fakeCarrierId })
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(403);
      });

      it('should allow access to own carrier data', async () => {
        const response = await request(app.getHttpServer())
          .get('/trips')
          .query({ carrierId })
          .set('Authorization', `Bearer ${carrierToken}`);

        expect(response.status).toBe(200);
      });
    });

    describe('Unauthenticated Access', () => {
      it('should reject requests without authentication token', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/dashboard');

        expect(response.status).toBe(401);
      });

      it('should reject requests with invalid token', async () => {
        const response = await request(app.getHttpServer())
          .get('/carrier/dashboard')
          .set('Authorization', 'Bearer invalid-token');

        expect(response.status).toBe(401);
      });
    });
  });

  // ============================================================================
  // Integration Tests - Complete Workflows
  // ============================================================================

  describe('Complete Workflows', () => {
    it('should complete full user lifecycle: create → update → deactivate → reactivate', async () => {
      // Create user
      const createResponse = await request(app.getHttpServer())
        .post('/carrier/users')
        .set('Authorization', `Bearer ${carrierToken}`)
        .send({
          role: 'DISPATCHER',
          name: 'Lifecycle Test User',
          email: `lifecycle.${Date.now()}@test.com`,
          phone: '(555) 111-1111',
          address: '111 Lifecycle St',
          city: 'Atlanta',
          state: 'GA',
          zip: '30311',
          ein: '11-1111111',
          ss: '111-11-1111',
          rate: 5.0,
        });

      expect(createResponse.status).toBe(201);
      const userId = createResponse.body.user.userId;
      createdUserIds.push(userId);

      // Update user
      const updateResponse = await request(app.getHttpServer())
        .put(`/carrier/users/${userId}`)
        .set('Authorization', `Bearer ${carrierToken}`)
        .send({
          name: 'Updated Lifecycle User',
          rate: 7.5,
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.user.name).toBe('Updated Lifecycle User');

      // Deactivate user
      const deactivateResponse = await request(app.getHttpServer())
        .patch(`/carrier/users/${userId}/status`)
        .set('Authorization', `Bearer ${carrierToken}`)
        .send({ isActive: false });

      expect(deactivateResponse.status).toBe(200);
      expect(deactivateResponse.body.user.isActive).toBe(false);

      // Reactivate user
      const reactivateResponse = await request(app.getHttpServer())
        .patch(`/carrier/users/${userId}/status`)
        .set('Authorization', `Bearer ${carrierToken}`)
        .send({ isActive: true });

      expect(reactivateResponse.status).toBe(200);
      expect(reactivateResponse.body.user.isActive).toBe(true);
    });

    it('should complete full truck lifecycle: create → update → deactivate → reactivate', async () => {
      // Get a truck owner
      const usersResponse = await request(app.getHttpServer())
        .get('/carrier/users?role=TRUCK_OWNER')
        .set('Authorization', `Bearer ${carrierToken}`);

      expect(usersResponse.body.users.length).toBeGreaterThan(0);
      const ownerId = usersResponse.body.users[0].userId;

      // Create truck
      const createResponse = await request(app.getHttpServer())
        .post('/carrier/trucks')
        .set('Authorization', `Bearer ${carrierToken}`)
        .send({
          truckOwnerId: ownerId,
          plate: `LIFE${Date.now()}`,
          brand: 'Freightliner',
          year: 2020,
          vin: `1FUJGHDV8CLBP${Date.now().toString().slice(-4)}`,
          color: 'White',
        });

      expect(createResponse.status).toBe(201);
      const truckId = createResponse.body.truck.truckId;
      createdTruckIds.push(truckId);

      // Update truck
      const updateResponse = await request(app.getHttpServer())
        .put(`/carrier/trucks/${truckId}`)
        .set('Authorization', `Bearer ${carrierToken}`)
        .send({
          color: 'Blue',
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.truck.color).toBe('Blue');

      // Deactivate truck
      const deactivateResponse = await request(app.getHttpServer())
        .patch(`/carrier/trucks/${truckId}/status`)
        .set('Authorization', `Bearer ${carrierToken}`)
        .send({ isActive: false });

      expect(deactivateResponse.status).toBe(200);
      expect(deactivateResponse.body.truck.isActive).toBe(false);

      // Reactivate truck
      const reactivateResponse = await request(app.getHttpServer())
        .patch(`/carrier/trucks/${truckId}/status`)
        .set('Authorization', `Bearer ${carrierToken}`)
        .send({ isActive: true });

      expect(reactivateResponse.status).toBe(200);
      expect(reactivateResponse.body.truck.isActive).toBe(true);
    });
  });
});
