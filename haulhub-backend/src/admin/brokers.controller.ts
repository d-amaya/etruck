import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { BrokersService } from './brokers.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole, Broker } from '@haulhub/shared';

@Controller('brokers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BrokersController {
  constructor(private readonly brokersService: BrokersService) {}

  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  @Get()
  async getAllBrokers(
    @Query('activeOnly') activeOnly?: string,
  ): Promise<Broker[]> {
    return this.brokersService.getAllBrokers(activeOnly === 'true');
  }

  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Admin)
  @Get(':id')
  async getBrokerById(@Param('id') id: string): Promise<Broker> {
    return this.brokersService.getBrokerById(id);
  }
}
