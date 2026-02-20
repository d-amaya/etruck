import { Module } from '@nestjs/common';
import { CarrierController } from './carrier.controller';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';
import { AssetsModule } from '../assets/assets.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AuthModule, UsersModule, OrdersModule, AssetsModule, AdminModule],
  controllers: [CarrierController],
})
export class CarrierModule {}
