import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  get awsRegion(): string {
    return process.env.AWS_REGION || 'us-east-1';
  }

  get cognitoUserPoolId(): string {
    return process.env.COGNITO_USER_POOL_ID || '';
  }

  get cognitoClientId(): string {
    return process.env.COGNITO_CLIENT_ID || '';
  }

  get tripsTableName(): string {
    return process.env.ETRUCKY_ORDERS_TABLE || process.env.TRIPS_TABLE_NAME || 'eTruckyOrders';
  }

  get brokersTableName(): string {
    return process.env.ETRUCKY_V2_BROKERS_TABLE || process.env.BROKERS_TABLE_NAME || 'eTruckyBrokers';
  }

  get lorriesTableName(): string {
    return process.env.ETRUCKY_V2_TRUCKS_TABLE || process.env.LORRIES_TABLE_NAME || 'eTruckyTrucks';
  }

  get usersTableName(): string {
    return process.env.ETRUCKY_V2_USERS_TABLE || process.env.USERS_TABLE_NAME || 'eTruckyUsers';
  }

  get trailersTableName(): string {
    return process.env.ETRUCKY_V2_TRAILERS_TABLE || process.env.TRAILERS_TABLE_NAME || 'eTruckyTrailers';
  }

  get s3DocumentsBucketName(): string {
    return process.env.S3_DOCUMENTS_BUCKET_NAME || 'haulhub-documents-dev';
  }

  get allowedOrigins(): string {
    return process.env.ALLOWED_ORIGINS || '*';
  }

  get nodeEnv(): string {
    return process.env.NODE_ENV || 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get kmsKeyId(): string {
    return process.env.KMS_KEY_ID || '';
  }

  // v2 tables (admin-centric hierarchy)
  get ordersTableName(): string {
    return process.env.ETRUCKY_ORDERS_TABLE || 'eTruckyOrders';
  }
  get v2UsersTableName(): string {
    return process.env.ETRUCKY_V2_USERS_TABLE || 'eTruckyUsers';
  }
  get v2TrucksTableName(): string {
    return process.env.ETRUCKY_V2_TRUCKS_TABLE || 'eTruckyTrucks';
  }
  get v2TrailersTableName(): string {
    return process.env.ETRUCKY_V2_TRAILERS_TABLE || 'eTruckyTrailers';
  }
  get v2BrokersTableName(): string {
    return process.env.ETRUCKY_V2_BROKERS_TABLE || 'eTruckyBrokers';
  }
}
