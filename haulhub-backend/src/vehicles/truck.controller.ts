import { 
  Controller, 
  Post, 
  Get, 
  Patch, 
  Param, 
  Body, 
  Query, 
  UseGuards,
  Request
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TruckService } from './truck.service';
import { 
  RegisterTruckDto, 
  UpdateTruckDto, 
  VerifyTruckDto, 
  UpdateTruckStatusDto,
  Truck 
} from '@haulhub/shared';

@Controller('trucks')
@UseGuards(JwtAuthGuard)
export class TruckController {
  constructor(private readonly truckService: TruckService) {}

  @Post()
  async registerTruck(
    @Request() req: any,
    @Body() registerTruckDto: RegisterTruckDto,
  ): Promise<Truck> {
    return this.truckService.registerTruck(req.user.userId, registerTruckDto);
  }

  @Get()
  async getTrucks(
    @Request() req: any,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<Truck[]> {
    const isActiveOnly = activeOnly === 'true';
    return this.truckService.getTrucksByOwner(req.user.userId, isActiveOnly);
  }

  @Get(':id')
  async getTruck(@Param('id') truckId: string): Promise<Truck> {
    return this.truckService.getTruck(truckId);
  }

  @Patch(':id')
  async updateTruck(
    @Param('id') truckId: string,
    @Body() updateTruckDto: UpdateTruckDto,
  ): Promise<Truck> {
    return this.truckService.updateTruck(truckId, updateTruckDto);
  }

  @Patch(':id/status')
  async updateTruckStatus(
    @Param('id') truckId: string,
    @Body() updateStatusDto: UpdateTruckStatusDto,
  ): Promise<Truck> {
    return this.truckService.updateTruckStatus(truckId, updateStatusDto);
  }

  @Patch(':id/verify')
  async verifyTruck(
    @Param('id') truckId: string,
    @Body() verifyTruckDto: VerifyTruckDto,
  ): Promise<Truck> {
    return this.truckService.verifyTruck(truckId, verifyTruckDto);
  }
}