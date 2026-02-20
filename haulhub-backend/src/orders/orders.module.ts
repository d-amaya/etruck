import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { IndexSelectorService } from './index-selector.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, IndexSelectorService],
  exports: [OrdersService],
})
export class OrdersModule {}
