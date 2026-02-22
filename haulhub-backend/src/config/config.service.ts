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

  get ordersTableName(): string {
    return process.env.ETRUCKY_ORDERS_TABLE || 'eTruckyOrders';
  }

  get usersTableName(): string {
    return process.env.ETRUCKY_V2_USERS_TABLE || 'eTruckyUsers';
  }

  get v2UsersTableName(): string {
    return this.usersTableName;
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
}
