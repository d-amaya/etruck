"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsService = void 0;
const common_1 = require("@nestjs/common");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const config_service_1 = require("./config.service");
let AwsService = class AwsService {
    constructor(configService) {
        this.configService = configService;
        this.initializeClients();
    }
    initializeClients() {
        const region = this.configService.awsRegion;
        const cognitoConfig = {
            region,
        };
        this.cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient(cognitoConfig);
        const dynamodbConfig = {
            region,
        };
        const ddbClient = new client_dynamodb_1.DynamoDBClient(dynamodbConfig);
        this.dynamodbClient = lib_dynamodb_1.DynamoDBDocumentClient.from(ddbClient, {
            marshallOptions: {
                removeUndefinedValues: true,
                convertClassInstanceToMap: true,
            },
        });
        const s3Config = {
            region,
        };
        this.s3Client = new client_s3_1.S3Client(s3Config);
    }
    getCognitoClient() {
        return this.cognitoClient;
    }
    getDynamoDBClient() {
        return this.dynamodbClient;
    }
    getS3Client() {
        return this.s3Client;
    }
};
exports.AwsService = AwsService;
exports.AwsService = AwsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], AwsService);
//# sourceMappingURL=aws.service.js.map