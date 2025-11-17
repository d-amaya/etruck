import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { LorriesModule } from './lorries/lorries.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TripsModule,
    LorriesModule,
    UsersModule,
    AdminModule,
  ],
})
export class AppModule {}
