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

  get dynamodbTableName(): string {
    return process.env.DYNAMODB_TABLE_NAME || 'HaulHub';
  }

  get tripsTableName(): string {
    return process.env.TRIPS_TABLE_NAME || 'haulhub-trips-table-dev';
  }

  get brokersTableName(): string {
    return process.env.BROKERS_TABLE_NAME || 'haulhub-brokers-table-dev';
  }

  get lorriesTableName(): string {
    return process.env.LORRIES_TABLE_NAME || 'haulhub-lorries-table-dev';
  }

  get usersTableName(): string {
    return process.env.USERS_TABLE_NAME || 'haulhub-users-table-dev';
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
