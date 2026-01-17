import { Module } from '@nestjs/common';
import { FuelService } from './fuel.service';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [TripsModule],
  providers: [FuelService],
  // FuelService not exported - only used internally by FuelModule
})
export class FuelModule {}