import { Module } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { MigrationService } from './migration.service';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';

@Module({
  imports: [ConfigModule],
  providers: [
    MigrationService,
    {
      provide: DynamoDBClient,
      useFactory: (configService: ConfigService) => {
        return new DynamoDBClient({
          region: configService.awsRegion,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [MigrationService],
})
export class MigrationModule {}
