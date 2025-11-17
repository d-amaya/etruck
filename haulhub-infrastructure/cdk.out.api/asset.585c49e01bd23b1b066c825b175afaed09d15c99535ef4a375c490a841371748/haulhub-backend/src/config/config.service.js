"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = void 0;
const common_1 = require("@nestjs/common");
let ConfigService = class ConfigService {
    get awsRegion() {
        return process.env.AWS_REGION || 'us-east-1';
    }
    get cognitoUserPoolId() {
        return process.env.COGNITO_USER_POOL_ID || '';
    }
    get cognitoClientId() {
        return process.env.COGNITO_CLIENT_ID || '';
    }
    get dynamodbTableName() {
        return process.env.DYNAMODB_TABLE_NAME || 'HaulHub';
    }
    get s3DocumentsBucketName() {
        return process.env.S3_DOCUMENTS_BUCKET_NAME || '';
    }
    get allowedOrigins() {
        return process.env.ALLOWED_ORIGINS || '*';
    }
    get nodeEnv() {
        return process.env.NODE_ENV || 'development';
    }
    get isProduction() {
        return this.nodeEnv === 'production';
    }
    get isDevelopment() {
        return this.nodeEnv === 'development';
    }
};
exports.ConfigService = ConfigService;
exports.ConfigService = ConfigService = __decorate([
    (0, common_1.Injectable)()
], ConfigService);
//# sourceMappingURL=config.service.js.map