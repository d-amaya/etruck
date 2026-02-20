import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  CurrentUserData,
} from '../auth/decorators/current-user.decorator';
import {
  UserRole,
  CreateOrderDto,
  UpdateOrderDto,
  UpdateOrderStatusDto,
  OrderFilters,
} from '@haulhub/shared';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(UserRole.Dispatcher)
  async createOrder(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(user.userId, dto);
  }

  @Get('reports/payments')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver)
  async getPaymentReport(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: OrderFilters,
  ) {
    return this.ordersService.getPaymentReport(
      user.userId,
      user.role as UserRole,
      filters,
    );
  }

  @Get()
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver)
  async getOrders(
    @CurrentUser() user: CurrentUserData,
    @Query() filters: OrderFilters,
    @Headers('x-pagination-token') paginationToken?: string,
  ) {
    return this.ordersService.getOrders(
      user.userId,
      user.role as UserRole,
      { ...filters, lastEvaluatedKey: paginationToken || filters.lastEvaluatedKey },
    );
  }

  @Get(':id')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver)
  async getOrderById(
    @CurrentUser() user: CurrentUserData,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.getOrderById(
      orderId,
      user.userId,
      user.role as UserRole,
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver)
  async updateOrderStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(
      orderId,
      user.userId,
      user.role as UserRole,
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.Admin, UserRole.Dispatcher, UserRole.Carrier, UserRole.Driver)
  async updateOrder(
    @CurrentUser() user: CurrentUserData,
    @Param('id') orderId: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.updateOrder(
      orderId,
      user.userId,
      user.role as UserRole,
      dto,
    );
  }

  @Delete(':id')
  @Roles(UserRole.Dispatcher)
  async deleteOrder(
    @CurrentUser() user: CurrentUserData,
    @Param('id') orderId: string,
  ) {
    await this.ordersService.deleteOrder(orderId, user.userId);
    return { message: 'Order deleted successfully' };
  }
}
