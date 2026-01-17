import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { StatusWorkflowService } from './status-workflow.service';
import { IndexSelectorService } from './index-selector.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule],
  controllers: [TripsController],
  providers: [TripsService, StatusWorkflowService, IndexSelectorService],
  exports: [TripsService, StatusWorkflowService, IndexSelectorService],
})
export class TripsModule {}
