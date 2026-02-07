import { Module } from '@nestjs/common';
import { CarrierController } from './carrier.controller';
import { CarrierService } from './carrier.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { TripsModule } from '../trips/trips.module';
import { LorriesModule } from '../lorries/lorries.module';
import { AdminModule } from '../admin/admin.module';

/**
 * Carrier Module
 * 
 * Provides carrier-specific functionality including:
 * - Dashboard metrics and overview
 * - User management (dispatchers, drivers, truck owners)
 * - Asset management (trucks and trailers)
 * 
 * Dependencies:
 * - UsersService: User management operations
 * - TripsService: Trip queries and management
 * - LorriesService: Truck and trailer management
 * - BrokersService: Broker information (from AdminModule)
 */
@Module({
  imports: [
    AuthModule, // Required for JWT validation and authorization
    UsersModule, // User management
    TripsModule, // Trip queries
    LorriesModule, // Asset management
    AdminModule, // Broker service
  ],
  controllers: [CarrierController],
  providers: [CarrierService],
  exports: [CarrierService],
})
export class CarrierModule {}
