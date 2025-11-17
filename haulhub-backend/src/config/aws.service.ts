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

    // Initialize Cognito client
    const cognitoConfig: CognitoIdentityProviderClientConfig = {
      region,
    };
    this.cognitoClient = new CognitoIdentityProviderClient(cognitoConfig);

    // Initialize DynamoDB client
    const dynamodbConfig: DynamoDBClientConfig = {
      region,
    };
    const ddbClient = new DynamoDBClient(dynamodbConfig);
    this.dynamodbClient = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
      },
    });

    // Initialize S3 client
    const s3Config: S3ClientConfig = {
      region,
    };
    this.s3Client = new S3Client(s3Config);
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
