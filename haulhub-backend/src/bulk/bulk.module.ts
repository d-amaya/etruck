import { Module } from '@nestjs/common';
import { BulkController } from './bulk.controller';
import { BulkService } from './bulk.service';
import { TripsModule } from '../trips/trips.module';
import { DocumentsModule } from '../documents/documents.module';
import { FinancialModule } from '../financial/financial.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    ConfigModule,
    TripsModule,
    DocumentsModule,
    FinancialModule,
  ],
  controllers: [BulkController],
  providers: [BulkService],
  exports: [BulkService],
})
export class BulkModule {}
