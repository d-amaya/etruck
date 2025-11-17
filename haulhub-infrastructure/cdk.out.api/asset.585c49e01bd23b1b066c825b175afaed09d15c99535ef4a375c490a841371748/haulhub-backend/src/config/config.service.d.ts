export declare class ConfigService {
    get awsRegion(): string;
    get cognitoUserPoolId(): string;
    get cognitoClientId(): string;
    get dynamodbTableName(): string;
    get s3DocumentsBucketName(): string;
    get allowedOrigins(): string;
    get nodeEnv(): string;
    get isProduction(): boolean;
    get isDevelopment(): boolean;
}
