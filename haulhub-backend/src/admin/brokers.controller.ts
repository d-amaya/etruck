import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { BrokersService } from './brokers.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole, CreateBrokerDto, UpdateBrokerDto, Broker } from '@haulhub/shared';

@Controller('brokers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BrokersController {
  constructor(private readonly brokersService: BrokersService) {}

  /**
   * GET /brokers
   * Get all active brokers
   * Dispatchers need this when creating trips
   * Admins need this to manage brokers
   */
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  @Get()
  async getAllBrokers(
    @Query('activeOnly') activeOnly?: string,
  ): Promise<Broker[]> {
    const filterActive = activeOnly === 'true';
    return this.brokersService.getAllBrokers(filterActive);
  }

  /**
   * GET /brokers/:id
   * Get broker by ID
   * Dispatchers and Admins only
   */
  @Roles(UserRole.Dispatcher, UserRole.Admin)
  @Get(':id')
  async getBrokerById(@Param('id') id: string): Promise<Broker> {
    return this.brokersService.getBrokerById(id);
  }

  /**
   * POST /brokers
   * Create a new broker
   * Admin only
   */
  @Roles(UserRole.Admin)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createBroker(@Body() createBrokerDto: CreateBrokerDto): Promise<Broker> {
    return this.brokersService.createBroker(createBrokerDto);
  }

  /**
   * PATCH /brokers/:id
   * Update broker
   * Admin only
   */
  @Roles(UserRole.Admin)
  @Patch(':id')
  async updateBroker(
    @Param('id') id: string,
    @Body() updateBrokerDto: UpdateBrokerDto,
  ): Promise<Broker> {
    return this.brokersService.updateBroker(id, updateBrokerDto);
  }

  /**
   * DELETE /brokers/:id
   * Soft delete broker (set isActive to false)
   * Admin only
   */
  @Roles(UserRole.Admin)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBroker(@Param('id') id: string): Promise<void> {
    return this.brokersService.deleteBroker(id);
  }
}
