"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresignedUrlResponse = exports.UploadDocumentDto = exports.VerifyLorryDto = exports.UpdateLorryDto = exports.RegisterLorryDto = void 0;
const class_validator_1 = require("class-validator");
class RegisterLorryDto {
}
exports.RegisterLorryDto = RegisterLorryDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Lorry ID (license plate) is required' })
], RegisterLorryDto.prototype, "lorryId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Make is required' })
], RegisterLorryDto.prototype, "make", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Model is required' })
], RegisterLorryDto.prototype, "model", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1900, { message: 'Year must be 1900 or later' }),
    (0, class_validator_1.Max)(new Date().getFullYear() + 1, { message: 'Year cannot be in the future' })
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
    (0, class_validator_1.IsNotEmpty)({ message: 'File name is required' })
], UploadDocumentDto.prototype, "fileName", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1, { message: 'File size must be greater than 0' }),
    (0, class_validator_1.Max)(10 * 1024 * 1024, { message: 'File size must not exceed 10MB' })
], UploadDocumentDto.prototype, "fileSize", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Content type is required' })
], UploadDocumentDto.prototype, "contentType", void 0);
class PresignedUrlResponse {
}
exports.PresignedUrlResponse = PresignedUrlResponse;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9ycnkuZHRvLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibG9ycnkuZHRvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLHFEQUEyRTtBQUUzRSxNQUFhLGdCQUFnQjtDQWlCNUI7QUFqQkQsNENBaUJDO0FBZEM7SUFGQyxJQUFBLDBCQUFRLEdBQUU7SUFDVixJQUFBLDRCQUFVLEVBQUMsRUFBRSxPQUFPLEVBQUUsc0NBQXNDLEVBQUUsQ0FBQztpREFDL0M7QUFJakI7SUFGQyxJQUFBLDBCQUFRLEdBQUU7SUFDVixJQUFBLDRCQUFVLEVBQUMsRUFBRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQzs4Q0FDOUI7QUFJZDtJQUZDLElBQUEsMEJBQVEsR0FBRTtJQUNWLElBQUEsNEJBQVUsRUFBQyxFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxDQUFDOytDQUM5QjtBQUtmO0lBSEMsSUFBQSwwQkFBUSxHQUFFO0lBQ1YsSUFBQSxxQkFBRyxFQUFDLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxDQUFDO0lBQ3BELElBQUEscUJBQUcsRUFBQyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxDQUFDOzhDQUNqRTtBQUdoQixNQUFhLGNBQWM7Q0FJMUI7QUFKRCx3Q0FJQztBQUVELE1BQWEsY0FBYztDQUcxQjtBQUhELHdDQUdDO0FBRUQsTUFBYSxpQkFBaUI7Q0FhN0I7QUFiRCw4Q0FhQztBQVZDO0lBRkMsSUFBQSwwQkFBUSxHQUFFO0lBQ1YsSUFBQSw0QkFBVSxFQUFDLEVBQUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLENBQUM7bURBQy9CO0FBS2xCO0lBSEMsSUFBQSwwQkFBUSxHQUFFO0lBQ1YsSUFBQSxxQkFBRyxFQUFDLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxDQUFDO0lBQ3ZELElBQUEscUJBQUcsRUFBQyxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksRUFBRSxFQUFFLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxDQUFDO21EQUNuRDtBQUlsQjtJQUZDLElBQUEsMEJBQVEsR0FBRTtJQUNWLElBQUEsNEJBQVUsRUFBQyxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxDQUFDO3NEQUMvQjtBQUd2QixNQUFhLG9CQUFvQjtDQUloQztBQUpELG9EQUlDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSXNOb3RFbXB0eSwgSXNTdHJpbmcsIElzTnVtYmVyLCBNaW4sIE1heCB9IGZyb20gJ2NsYXNzLXZhbGlkYXRvcic7XG5cbmV4cG9ydCBjbGFzcyBSZWdpc3RlckxvcnJ5RHRvIHtcbiAgQElzU3RyaW5nKClcbiAgQElzTm90RW1wdHkoeyBtZXNzYWdlOiAnTG9ycnkgSUQgKGxpY2Vuc2UgcGxhdGUpIGlzIHJlcXVpcmVkJyB9KVxuICBsb3JyeUlkITogc3RyaW5nOyAvLyBsaWNlbnNlIHBsYXRlXG5cbiAgQElzU3RyaW5nKClcbiAgQElzTm90RW1wdHkoeyBtZXNzYWdlOiAnTWFrZSBpcyByZXF1aXJlZCcgfSlcbiAgbWFrZSE6IHN0cmluZztcblxuICBASXNTdHJpbmcoKVxuICBASXNOb3RFbXB0eSh7IG1lc3NhZ2U6ICdNb2RlbCBpcyByZXF1aXJlZCcgfSlcbiAgbW9kZWwhOiBzdHJpbmc7XG5cbiAgQElzTnVtYmVyKClcbiAgQE1pbigxOTAwLCB7IG1lc3NhZ2U6ICdZZWFyIG11c3QgYmUgMTkwMCBvciBsYXRlcicgfSlcbiAgQE1heChuZXcgRGF0ZSgpLmdldEZ1bGxZZWFyKCkgKyAxLCB7IG1lc3NhZ2U6ICdZZWFyIGNhbm5vdCBiZSBpbiB0aGUgZnV0dXJlJyB9KVxuICB5ZWFyITogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgVXBkYXRlTG9ycnlEdG8ge1xuICBtYWtlPzogc3RyaW5nO1xuICBtb2RlbD86IHN0cmluZztcbiAgeWVhcj86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFZlcmlmeUxvcnJ5RHRvIHtcbiAgZGVjaXNpb24hOiAnQXBwcm92ZWQnIHwgJ1JlamVjdGVkJyB8ICdOZWVkc01vcmVFdmlkZW5jZSc7XG4gIHJlYXNvbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFVwbG9hZERvY3VtZW50RHRvIHtcbiAgQElzU3RyaW5nKClcbiAgQElzTm90RW1wdHkoeyBtZXNzYWdlOiAnRmlsZSBuYW1lIGlzIHJlcXVpcmVkJyB9KVxuICBmaWxlTmFtZSE6IHN0cmluZztcblxuICBASXNOdW1iZXIoKVxuICBATWluKDEsIHsgbWVzc2FnZTogJ0ZpbGUgc2l6ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwJyB9KVxuICBATWF4KDEwICogMTAyNCAqIDEwMjQsIHsgbWVzc2FnZTogJ0ZpbGUgc2l6ZSBtdXN0IG5vdCBleGNlZWQgMTBNQicgfSlcbiAgZmlsZVNpemUhOiBudW1iZXI7XG5cbiAgQElzU3RyaW5nKClcbiAgQElzTm90RW1wdHkoeyBtZXNzYWdlOiAnQ29udGVudCB0eXBlIGlzIHJlcXVpcmVkJyB9KVxuICBjb250ZW50VHlwZSE6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFByZXNpZ25lZFVybFJlc3BvbnNlIHtcbiAgdXBsb2FkVXJsITogc3RyaW5nO1xuICBkb2N1bWVudElkITogc3RyaW5nO1xuICBleHBpcmVzSW4hOiBudW1iZXI7XG59XG4iXX0=