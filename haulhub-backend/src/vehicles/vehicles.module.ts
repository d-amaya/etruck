import { Module } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { TruckService } from './truck.service';
import { TrailerService } from './trailer.service';
import { TruckController } from './truck.controller';
import { TrailerController } from './trailer.controller';

@Module({
  controllers: [TruckController, TrailerController],
  providers: [
    TruckService,
    TrailerService,
    {
      provide: DynamoDBClient,
      useFactory: () => {
        return new DynamoDBClient({
          region: process.env.AWS_REGION || 'us-east-1',
        });
      },
    },
  ],
  exports: [TruckService, TrailerService],
})
export class VehiclesModule {}