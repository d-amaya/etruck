import { Module } from '@nestjs/common';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { TripsModule } from '../trips/trips.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TripsModule, UsersModule],
  controllers: [FinancialController],
  providers: [FinancialService],
  exports: [FinancialService],
})
export class FinancialModule {}