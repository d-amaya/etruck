import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { LorriesModule } from './lorries/lorries.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FuelModule } from './fuel/fuel.module';
import { DocumentsModule } from './documents/documents.module';
import { UsersModule } from './users/users.module';
import { CarrierModule } from './carrier/carrier.module';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ConfigModule,
    AuthModule,
    TripsModule,
    LorriesModule,
    AdminModule,
    AnalyticsModule,
    FuelModule,
    DocumentsModule,
    UsersModule,
    CarrierModule,
  ],
})
export class AppModule {}
