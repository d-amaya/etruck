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
exports.LorriesService = void 0;
const common_1 = require("@nestjs/common");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const aws_service_1 = require("../config/aws.service");
const config_service_1 = require("../config/config.service");
const shared_1 = require("@haulhub/shared");
const uuid_1 = require("uuid");
let LorriesService = class LorriesService {
    constructor(awsService, configService) {
        this.awsService = awsService;
        this.configService = configService;
        this.tableName = this.configService.dynamodbTableName;
    }
    async registerLorry(ownerId, dto) {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        const currentYear = new Date().getFullYear();
        if (dto.year < 1900 || dto.year > currentYear + 1) {
            throw new common_1.BadRequestException(`Year must be between 1900 and ${currentYear + 1}`);
        }
        const existingLorry = await this.getLorryByIdAndOwner(dto.lorryId, ownerId);
        if (existingLorry) {
            throw new common_1.ConflictException(`Lorry with ID ${dto.lorryId} is already registered for this owner`);
        }
        const now = new Date().toISOString();
        const lorry = {
            lorryId: dto.lorryId,
            ownerId,
            make: dto.make,
            model: dto.model,
            year: dto.year,
            verificationStatus: shared_1.LorryVerificationStatus.Pending,
            verificationDocuments: [],
            createdAt: now,
            updatedAt: now,
        };
        const putCommand = new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `LORRY_OWNER#${ownerId}`,
                SK: `LORRY#${dto.lorryId}`,
                GSI3PK: `LORRY_STATUS#${shared_1.LorryVerificationStatus.Pending}`,
                GSI3SK: `LORRY#${dto.lorryId}`,
                ...lorry,
            },
        });
        await dynamodbClient.send(putCommand);
        return lorry;
    }
    async getLorriesByOwner(ownerId) {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        const queryCommand = new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `LORRY_OWNER#${ownerId}`,
                ':sk': 'LORRY#',
            },
        });
        const result = await dynamodbClient.send(queryCommand);
        if (!result.Items || result.Items.length === 0) {
            return [];
        }
        return result.Items.map((item) => this.mapItemToLorry(item));
    }
    async getLorryByIdAndOwner(lorryId, ownerId) {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        const getCommand = new lib_dynamodb_1.GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `LORRY_OWNER#${ownerId}`,
                SK: `LORRY#${lorryId}`,
            },
        });
        const result = await dynamodbClient.send(getCommand);
        if (!result.Item) {
            return null;
        }
        return this.mapItemToLorry(result.Item);
    }
    async getLorryById(lorryId, ownerId) {
        const lorry = await this.getLorryByIdAndOwner(lorryId, ownerId);
        if (!lorry) {
            throw new common_1.NotFoundException(`Lorry with ID ${lorryId} not found`);
        }
        return lorry;
    }
    async generateUploadUrl(lorryId, ownerId, dto, userRole) {
        const MAX_FILE_SIZE = 10 * 1024 * 1024;
        if (dto.fileSize > MAX_FILE_SIZE) {
            throw new common_1.BadRequestException(`File size exceeds the maximum limit of 10MB`);
        }
        const lorry = await this.getLorryByIdAndOwner(lorryId, ownerId);
        if (!lorry) {
            throw new common_1.NotFoundException(`Lorry with ID ${lorryId} not found`);
        }
        const documentId = (0, uuid_1.v4)();
        const s3Key = `lorries/${lorryId}/documents/${documentId}`;
        const s3Client = this.awsService.getS3Client();
        const bucketName = this.configService.s3DocumentsBucketName;
        const putObjectCommand = new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            ContentType: dto.contentType,
            Metadata: {
                lorryId,
                ownerId,
                documentId,
                fileName: dto.fileName,
            },
        });
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, putObjectCommand, {
            expiresIn: 900,
        });
        const now = new Date().toISOString();
        const documentMetadata = {
            documentId,
            fileName: dto.fileName,
            fileSize: dto.fileSize,
            contentType: dto.contentType,
            uploadedAt: now,
        };
        const dynamodbClient = this.awsService.getDynamoDBClient();
        const putCommand = new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `LORRY#${lorryId}`,
                SK: `DOCUMENT#${documentId}`,
                lorryId,
                ownerId,
                s3Key,
                ...documentMetadata,
            },
        });
        await dynamodbClient.send(putCommand);
        await this.addDocumentToLorry(lorryId, ownerId, documentMetadata);
        return {
            uploadUrl,
            documentId,
            expiresIn: 900,
        };
    }
    async generateViewUrl(lorryId, documentId, userId, userRole) {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        const getCommand = new lib_dynamodb_1.GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `LORRY#${lorryId}`,
                SK: `DOCUMENT#${documentId}`,
            },
        });
        const result = await dynamodbClient.send(getCommand);
        if (!result.Item) {
            throw new common_1.NotFoundException(`Document with ID ${documentId} not found for lorry ${lorryId}`);
        }
        const ownerId = result.Item.ownerId;
        const s3Key = result.Item.s3Key;
        if (userRole !== shared_1.UserRole.Admin && userId !== ownerId) {
            throw new common_1.ForbiddenException('You do not have permission to access this document');
        }
        const s3Client = this.awsService.getS3Client();
        const bucketName = this.configService.s3DocumentsBucketName;
        const getObjectCommand = new client_s3_1.GetObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
        });
        const viewUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, getObjectCommand, {
            expiresIn: 900,
        });
        return viewUrl;
    }
    async getDocuments(lorryId, userId, userRole) {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        const queryCommand = new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `LORRY#${lorryId}`,
                ':sk': 'DOCUMENT#',
            },
        });
        const result = await dynamodbClient.send(queryCommand);
        if (!result.Items || result.Items.length === 0) {
            return [];
        }
        const ownerId = result.Items[0].ownerId;
        if (userRole !== shared_1.UserRole.Admin && userId !== ownerId) {
            throw new common_1.ForbiddenException('You do not have permission to access these documents');
        }
        return result.Items.map((item) => ({
            documentId: item.documentId,
            fileName: item.fileName,
            fileSize: item.fileSize,
            contentType: item.contentType,
            uploadedAt: item.uploadedAt,
        }));
    }
    async addDocumentToLorry(lorryId, ownerId, documentMetadata) {
        const dynamodbClient = this.awsService.getDynamoDBClient();
        const updateCommand = new lib_dynamodb_1.UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `LORRY_OWNER#${ownerId}`,
                SK: `LORRY#${lorryId}`,
            },
            UpdateExpression: 'SET verificationDocuments = list_append(if_not_exists(verificationDocuments, :empty_list), :doc), updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':doc': [documentMetadata],
                ':empty_list': [],
                ':updatedAt': new Date().toISOString(),
            },
        });
        await dynamodbClient.send(updateCommand);
    }
    mapItemToLorry(item) {
        return {
            lorryId: item.lorryId,
            ownerId: item.ownerId,
            make: item.make,
            model: item.model,
            year: item.year,
            verificationStatus: item.verificationStatus,
            verificationDocuments: item.verificationDocuments || [],
            rejectionReason: item.rejectionReason,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        };
    }
};
exports.LorriesService = LorriesService;
exports.LorriesService = LorriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [aws_service_1.AwsService,
        config_service_1.ConfigService])
], LorriesService);
//# sourceMappingURL=lorries.service.js.map