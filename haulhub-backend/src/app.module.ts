import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { LorriesModule } from './lorries/lorries.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ConfigModule,
    AuthModule,
    TripsModule,
    LorriesModule,
    UsersModule,
    AdminModule,
  ],
})
export class AppModule {}
