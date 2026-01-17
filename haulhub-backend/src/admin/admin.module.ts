import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { BrokersController } from './brokers.controller';
import { BrokersService } from './brokers.service';

@Module({
  controllers: [AdminController, BrokersController],
  providers: [AdminService, BrokersService],
  exports: [BrokersService],  // Only BrokersService is used by TripsService
})
export class AdminModule {}
