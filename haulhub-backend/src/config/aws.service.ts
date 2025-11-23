import { Injectable } from '@nestjs/common';
import {
  CognitoIdentityProviderClient,
  CognitoIdentityProviderClientConfig,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { ConfigService } from './config.service';

@Injectable()
export class AwsService {
  private cognitoClient: CognitoIdentityProviderClient;
  private dynamodbClient: DynamoDBDocumentClient;
  private s3Client: S3Client;

  constructor(private configService: ConfigService) {
    this.initializeClients();
  }

  private initializeClients(): void {
    const region = this.configService.awsRegion;

    // Base configuration for all AWS clients
    // The AWS SDK will automatically use credentials from:
    // 1. AWS_PROFILE environment variable (if set)
    // 2. AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables
    // 3. ~/.aws/credentials file (default profile)
    const baseConfig = {
      region,
    };

    // Initialize Cognito client
    this.cognitoClient = new CognitoIdentityProviderClient(baseConfig);

    // Initialize DynamoDB client
    const ddbClient = new DynamoDBClient(baseConfig);
    this.dynamodbClient = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });

    // Initialize S3 client
    this.s3Client = new S3Client(baseConfig);
  }

  getCognitoClient(): CognitoIdentityProviderClient {
    return this.cognitoClient;
  }

  getDynamoDBClient(): DynamoDBDocumentClient {
    return this.dynamodbClient;
  }

  getS3Client(): S3Client {
    return this.s3Client;
  }
}
