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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LorriesController = void 0;
const common_1 = require("@nestjs/common");
const lorries_service_1 = require("./lorries.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
const shared_1 = require("@haulhub/shared");
let LorriesController = class LorriesController {
    constructor(lorriesService) {
        this.lorriesService = lorriesService;
    }
    async registerLorry(user, dto) {
        return this.lorriesService.registerLorry(user.userId, dto);
    }
    async getLorries(user) {
        return this.lorriesService.getLorriesByOwner(user.userId);
    }
    async getLorryById(user, lorryId) {
        if (user.role === shared_1.UserRole.LorryOwner) {
            const lorry = await this.lorriesService.getLorryByIdAndOwner(lorryId, user.userId);
            if (!lorry) {
                throw new common_1.ForbiddenException('You do not have permission to access this lorry');
            }
            return lorry;
        }
        throw new common_1.ForbiddenException('Admin access to lorries will be implemented in task 13');
    }
    async uploadDocument(user, lorryId, dto) {
        return this.lorriesService.generateUploadUrl(lorryId, user.userId, dto, user.role);
    }
    async getDocuments(user, lorryId) {
        return this.lorriesService.getDocuments(lorryId, user.userId, user.role);
    }
    async viewDocument(user, lorryId, documentId) {
        const viewUrl = await this.lorriesService.generateViewUrl(lorryId, documentId, user.userId, user.role);
        return { viewUrl };
    }
};
exports.LorriesController = LorriesController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.LorryOwner),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, shared_1.RegisterLorryDto]),
    __metadata("design:returntype", Promise)
], LorriesController.prototype, "registerLorry", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.LorryOwner),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LorriesController.prototype, "getLorries", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.LorryOwner, shared_1.UserRole.Admin),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], LorriesController.prototype, "getLorryById", null);
__decorate([
    (0, common_1.Post)(':id/documents'),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.LorryOwner),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, shared_1.UploadDocumentDto]),
    __metadata("design:returntype", Promise)
], LorriesController.prototype, "uploadDocument", null);
__decorate([
    (0, common_1.Get)(':id/documents'),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.LorryOwner, shared_1.UserRole.Admin),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], LorriesController.prototype, "getDocuments", null);
__decorate([
    (0, common_1.Get)(':id/documents/:docId'),
    (0, roles_decorator_1.Roles)(shared_1.UserRole.LorryOwner, shared_1.UserRole.Admin),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('docId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], LorriesController.prototype, "viewDocument", null);
exports.LorriesController = LorriesController = __decorate([
    (0, common_1.Controller)('lorries'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [lorries_service_1.LorriesService])
], LorriesController);
//# sourceMappingURL=lorries.controller.js.map