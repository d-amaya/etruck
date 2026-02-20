import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';
import { AssetsModule } from './assets/assets.module';
import { AdminModule } from './admin/admin.module';
import { DocumentsModule } from './documents/documents.module';
import { UsersModule } from './users/users.module';
import { CarrierModule } from './carrier/carrier.module';

@Module({
  imports: [
    NestConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ConfigModule,
    AuthModule,
    OrdersModule,
    AssetsModule,
    AdminModule,
    DocumentsModule,
    UsersModule,
    CarrierModule,
  ],
})
export class AppModule {}
