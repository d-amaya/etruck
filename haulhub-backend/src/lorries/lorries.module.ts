import { Module } from '@nestjs/common';
import { LorriesController } from './lorries.controller';
import { LorriesService } from './lorries.service';

@Module({
  controllers: [LorriesController],
  providers: [LorriesService],
  exports: [LorriesService],
})
export class LorriesModule {}
