import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { LorriesModule } from './lorries/lorries.module';
import { DriversModule } from './drivers/drivers.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FinancialModule } from './financial/financial.module';
import { FuelModule } from './fuel/fuel.module';
import { DocumentsModule } from './documents/documents.module';

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
    DriversModule,
    AdminModule,
    AnalyticsModule,
    FinancialModule,
    FuelModule,
    DocumentsModule,
  ],
})
export class AppModule {}
