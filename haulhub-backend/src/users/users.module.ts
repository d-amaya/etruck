import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { EnhancedDriverController } from './enhanced-driver.controller';
import { EnhancedDriverService } from './enhanced-driver.service';

@Module({
  controllers: [UsersController, EnhancedDriverController],
  providers: [UsersService, EnhancedDriverService],
  exports: [UsersService, EnhancedDriverService],
})
export class UsersModule {}
