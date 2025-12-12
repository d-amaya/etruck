import { Injectable, OnModuleInit } from '@nestjs/common';

// Stub implementation for PrismaService
// This project should use DynamoDB instead of Prisma
@Injectable()
export class PrismaService implements OnModuleInit {
  async onModuleInit() {
    // No-op for stub implementation
  }
}