import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';
import { AwsService } from './aws.service';

@Global()
@Module({
  providers: [ConfigService, AwsService],
  exports: [ConfigService, AwsService],
})
export class ConfigModule {}
