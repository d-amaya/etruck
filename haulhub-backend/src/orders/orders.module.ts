import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { IndexSelectorService } from './index-selector.service';
import { AssetsModule } from '../assets/assets.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [AssetsModule, UsersModule],
  controllers: [OrdersController],
  providers: [OrdersService, IndexSelectorService],
  exports: [OrdersService],
})
export class OrdersModule {}
