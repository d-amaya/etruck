import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { LorriesModule } from './lorries/lorries.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FinancialModule } from './financial/financial.module';
import { FuelModule } from './fuel/fuel.module';
import { FeesModule } from './fees/fees.module';
import { NotesModule } from './notes/notes.module';
import { DocumentsModule } from './documents/documents.module';
import { BulkModule } from './bulk/bulk.module';
import { MigrationModule } from './migration/migration.module';

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
    VehiclesModule,
    UsersModule,
    AdminModule,
    AnalyticsModule,
    FinancialModule,
    FuelModule,
    FeesModule,
    NotesModule,
    DocumentsModule,
    BulkModule,
    MigrationModule,
  ],
})
export class AppModule {}
