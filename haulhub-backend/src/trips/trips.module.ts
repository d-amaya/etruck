import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { IndexSelectorService } from './index-selector.service';
import { AdminModule } from '../admin/admin.module';
import { LorriesModule } from '../lorries/lorries.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [AdminModule, LorriesModule, UsersModule],
  controllers: [TripsController],
  providers: [TripsService, IndexSelectorService],
  exports: [TripsService, IndexSelectorService],
})
export class TripsModule {}
