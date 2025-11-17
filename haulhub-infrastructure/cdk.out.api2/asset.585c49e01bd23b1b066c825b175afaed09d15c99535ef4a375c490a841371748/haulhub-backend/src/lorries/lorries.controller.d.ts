import { LorriesService } from './lorries.service';
import { CurrentUserData } from '../auth/decorators/current-user.decorator';
import { RegisterLorryDto, Lorry, UploadDocumentDto, PresignedUrlResponse, DocumentMetadata } from '@haulhub/shared';
export declare class LorriesController {
    private readonly lorriesService;
    constructor(lorriesService: LorriesService);
    registerLorry(user: CurrentUserData, dto: RegisterLorryDto): Promise<Lorry>;
    getLorries(user: CurrentUserData): Promise<Lorry[]>;
    getLorryById(user: CurrentUserData, lorryId: string): Promise<Lorry>;
    uploadDocument(user: CurrentUserData, lorryId: string, dto: UploadDocumentDto): Promise<PresignedUrlResponse>;
    getDocuments(user: CurrentUserData, lorryId: string): Promise<DocumentMetadata[]>;
    viewDocument(user: CurrentUserData, lorryId: string, documentId: string): Promise<{
        viewUrl: string;
    }>;
}
