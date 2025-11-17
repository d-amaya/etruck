import { AwsService } from '../config/aws.service';
import { ConfigService } from '../config/config.service';
import { Lorry, RegisterLorryDto, UploadDocumentDto, PresignedUrlResponse, DocumentMetadata, UserRole } from '@haulhub/shared';
export declare class LorriesService {
    private readonly awsService;
    private readonly configService;
    private readonly tableName;
    constructor(awsService: AwsService, configService: ConfigService);
    registerLorry(ownerId: string, dto: RegisterLorryDto): Promise<Lorry>;
    getLorriesByOwner(ownerId: string): Promise<Lorry[]>;
    getLorryByIdAndOwner(lorryId: string, ownerId: string): Promise<Lorry | null>;
    getLorryById(lorryId: string, ownerId: string): Promise<Lorry>;
    generateUploadUrl(lorryId: string, ownerId: string, dto: UploadDocumentDto, userRole: UserRole): Promise<PresignedUrlResponse>;
    generateViewUrl(lorryId: string, documentId: string, userId: string, userRole: UserRole): Promise<string>;
    getDocuments(lorryId: string, userId: string, userRole: UserRole): Promise<DocumentMetadata[]>;
    private addDocumentToLorry;
    private mapItemToLorry;
}
