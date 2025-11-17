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
exports.PresignedUrlResponse = exports.UploadDocumentDto = exports.VerifyLorryDto = exports.UpdateLorryDto = exports.RegisterLorryDto = void 0;
const class_validator_1 = require("class-validator");
class RegisterLorryDto {
}
exports.RegisterLorryDto = RegisterLorryDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Lorry ID (license plate) is required' }),
    __metadata("design:type", String)
], RegisterLorryDto.prototype, "lorryId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Make is required' }),
    __metadata("design:type", String)
], RegisterLorryDto.prototype, "make", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Model is required' }),
    __metadata("design:type", String)
], RegisterLorryDto.prototype, "model", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1900, { message: 'Year must be 1900 or later' }),
    (0, class_validator_1.Max)(new Date().getFullYear() + 1, { message: 'Year cannot be in the future' }),
    __metadata("design:type", Number)
], RegisterLorryDto.prototype, "year", void 0);
class UpdateLorryDto {
}
exports.UpdateLorryDto = UpdateLorryDto;
class VerifyLorryDto {
}
exports.VerifyLorryDto = VerifyLorryDto;
class UploadDocumentDto {
}
exports.UploadDocumentDto = UploadDocumentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'File name is required' }),
    __metadata("design:type", String)
], UploadDocumentDto.prototype, "fileName", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1, { message: 'File size must be greater than 0' }),
    (0, class_validator_1.Max)(10 * 1024 * 1024, { message: 'File size must not exceed 10MB' }),
    __metadata("design:type", Number)
], UploadDocumentDto.prototype, "fileSize", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Content type is required' }),
    __metadata("design:type", String)
], UploadDocumentDto.prototype, "contentType", void 0);
class PresignedUrlResponse {
}
exports.PresignedUrlResponse = PresignedUrlResponse;
//# sourceMappingURL=lorry.dto.js.map