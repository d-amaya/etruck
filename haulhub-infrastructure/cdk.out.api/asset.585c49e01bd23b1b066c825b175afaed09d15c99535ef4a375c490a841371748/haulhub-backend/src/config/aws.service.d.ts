import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from './config.service';
export declare class AwsService {
    private configService;
    private cognitoClient;
    private dynamodbClient;
    private s3Client;
    constructor(configService: ConfigService);
    private initializeClients;
    getCognitoClient(): CognitoIdentityProviderClient;
    getDynamoDBClient(): DynamoDBDocumentClient;
    getS3Client(): S3Client;
}
