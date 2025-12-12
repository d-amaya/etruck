import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { 
  DocumentService, 
  DocumentMetadata, 
  DocumentFolder,
  DocumentCategory,
  EntityType,
  UploadDocumentRequest,
  DocumentSearchFilters
} from '../../../core/services/document.service';

interface FolderNode {
  folder: DocumentFolder;
  documents: DocumentMetadata[];
  children: FolderNode[];
  expanded: boolean;
}

@Component({
  selector: 'app-document-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-manager.component.html',
  styleUrls: ['./document-manager.component.scss']
})
export class DocumentManagerComponent implements OnInit, OnDestroy {
  @Input() entityType!: EntityType;
  @Input() entityId!: string;
  @Input() allowUpload = true;
  @Input() allowDelete = true;
  @Input() allowFolderManagement = true;

  documents: DocumentMetadata[] = [];
  folders: DocumentFolder[] = [];
  folderTree: FolderNode[] = [];
  selectedFolder: string | null = null;
  filteredDocuments: DocumentMetadata[] = [];
  
  // Search and filter
  searchQuery = '';
  selectedCategory: DocumentCategory | 'all' = 'all';
  
  // Upload state
  isDragging = false;
  isUploading = false;
  uploadProgress = 0;
  
  // View mode
  viewMode: 'grid' | 'list' = 'list';
  
  // Preview
  previewDocument: DocumentMetadata | null = null;
  previewUrl: string | null = null;
  
  // Enums for template
  DocumentCategory = DocumentCategory;
  categories = Object.values(DocumentCategory);
  
  private destroy$ = new Subject<void>();

  constructor(private documentService: DocumentService) {}

  ngOnInit(): void {
    this.loadDocuments();
    this.loadFolders();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load documents for the entity
   */
  loadDocuments(): void {
    this.documentService.getDocumentsByEntity(this.entityType, this.entityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (docs) => {
          this.documents = docs;
          this.applyFilters();
        },
        error: (error) => console.error('Error loading documents:', error)
      });
  }

  /**
   * Load folders for the entity
   */
  loadFolders(): void {
    this.documentService.getFoldersByEntity(this.entityType, this.entityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (folders) => {
          this.folders = folders;
          this.buildFolderTree();
        },
        error: (error) => console.error('Error loading folders:', error)
      });
  }

  /**
   * Build hierarchical folder tree
   */
  buildFolderTree(): void {
    const folderMap = new Map<string, FolderNode>();
    
    // Create nodes for all folders
    this.folders.forEach(folder => {
      folderMap.set(folder.folderId, {
        folder,
        documents: this.documents.filter(d => d.folder === folder.name),
        children: [],
        expanded: false
      });
    });
    
    // Build hierarchy
    const rootNodes: FolderNode[] = [];
    folderMap.forEach(node => {
      if (node.folder.parentFolderId) {
        const parent = folderMap.get(node.folder.parentFolderId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    });
    
    this.folderTree = rootNodes;
  }

  /**
   * Handle file selection from input
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.uploadFiles(Array.from(input.files));
    }
  }

  /**
   * Handle drag over event
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  /**
   * Handle drag leave event
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  /**
   * Handle file drop
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.uploadFiles(Array.from(event.dataTransfer.files));
    }
  }

  /**
   * Upload files
   */
  uploadFiles(files: File[]): void {
    if (!this.allowUpload || files.length === 0) return;
    
    this.isUploading = true;
    this.uploadProgress = 0;
    
    const folder = this.selectedFolder || 'root';
    const category = this.selectedCategory === 'all' ? DocumentCategory.Other : this.selectedCategory;
    
    const requests: UploadDocumentRequest[] = files.map(file => ({
      file,
      folder,
      category,
      entityType: this.entityType,
      entityId: this.entityId
    }));
    
    if (requests.length === 1) {
      // Single file upload
      this.documentService.uploadDocument(requests[0])
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (doc) => {
            this.documents.push(doc);
            this.applyFilters();
            this.isUploading = false;
            this.uploadProgress = 100;
          },
          error: (error) => {
            console.error('Error uploading document:', error);
            this.isUploading = false;
          }
        });
    } else {
      // Batch upload
      this.documentService.uploadMultipleDocuments(requests)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (docs) => {
            this.documents.push(...docs);
            this.applyFilters();
            this.isUploading = false;
            this.uploadProgress = 100;
          },
          error: (error) => {
            console.error('Error uploading documents:', error);
            this.isUploading = false;
          }
        });
    }
  }

  /**
   * Delete a document
   */
  deleteDocument(doc: DocumentMetadata): void {
    if (!this.allowDelete) return;
    
    if (confirm(`Are you sure you want to delete ${doc.fileName}?`)) {
      this.documentService.deleteDocument(doc.documentId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.documents = this.documents.filter(d => d.documentId !== doc.documentId);
            this.applyFilters();
          },
          error: (error) => console.error('Error deleting document:', error)
        });
    }
  }

  /**
   * Download a document
   */
  downloadDocument(doc: DocumentMetadata): void {
    this.documentService.getDocumentDownloadUrl(doc.documentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          window.open(response.url, '_blank');
        },
        error: (error) => console.error('Error downloading document:', error)
      });
  }

  /**
   * Preview a document
   */
  previewDocumentAction(doc: DocumentMetadata): void {
    this.previewDocument = doc;
    this.documentService.getDocumentDownloadUrl(doc.documentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.previewUrl = response.url;
        },
        error: (error) => {
          console.error('Error getting preview URL:', error);
          this.closePreview();
        }
      });
  }

  /**
   * Close preview
   */
  closePreview(): void {
    this.previewDocument = null;
    this.previewUrl = null;
  }

  /**
   * Select a folder
   */
  selectFolder(folderName: string | null): void {
    this.selectedFolder = folderName;
    this.applyFilters();
  }

  /**
   * Toggle folder expansion
   */
  toggleFolder(node: FolderNode): void {
    node.expanded = !node.expanded;
  }

  /**
   * Apply search and filter
   */
  applyFilters(): void {
    let filtered = [...this.documents];
    
    // Filter by folder
    if (this.selectedFolder) {
      filtered = filtered.filter(d => d.folder === this.selectedFolder);
    }
    
    // Filter by category
    if (this.selectedCategory !== 'all') {
      filtered = filtered.filter(d => d.category === this.selectedCategory);
    }
    
    // Filter by search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(d => 
        d.fileName.toLowerCase().includes(query) ||
        d.category.toLowerCase().includes(query)
      );
    }
    
    this.filteredDocuments = filtered;
  }

  /**
   * Create a new folder
   */
  createFolder(): void {
    if (!this.allowFolderManagement) return;
    
    const folderName = prompt('Enter folder name:');
    if (folderName && folderName.trim()) {
      this.documentService.createFolder({
        name: folderName.trim(),
        entityType: this.entityType,
        entityId: this.entityId,
        parentFolderId: this.selectedFolder || undefined
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (folder) => {
          this.folders.push(folder);
          this.buildFolderTree();
        },
        error: (error) => console.error('Error creating folder:', error)
      });
    }
  }

  /**
   * Format file size
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file icon based on content type
   */
  getFileIcon(contentType: string): string {
    if (contentType.startsWith('image/')) return '🖼️';
    if (contentType.includes('pdf')) return '📄';
    if (contentType.includes('word') || contentType.includes('document')) return '📝';
    if (contentType.includes('excel') || contentType.includes('spreadsheet')) return '📊';
    if (contentType.includes('zip') || contentType.includes('compressed')) return '📦';
    return '📎';
  }

  /**
   * Check if file can be previewed
   */
  canPreview(contentType: string): boolean {
    return contentType.startsWith('image/') || contentType.includes('pdf');
  }
}
