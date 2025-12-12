import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { SavedSearchService, SavedSearch, QuickFilterPreset } from '../../services/saved-search.service';
import { FullTextSearchService } from '../../services/full-text-search.service';
import { SaveSearchDialogComponent } from '../save-search-dialog/save-search-dialog.component';

@Component({
  selector: 'app-advanced-filter',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  templateUrl: './advanced-filter.component.html',
  styleUrls: ['./advanced-filter.component.scss']
})
export class AdvancedFilterComponent implements OnInit, OnDestroy {
  @Input() entityType: 'trip' | 'driver' | 'truck' | 'trailer' | 'invoice' = 'trip';
  @Input() currentFilters: any = {};
  @Input() showFullTextSearch = true;
  @Input() showQuickFilters = true;
  @Input() showSavedSearches = true;
  
  @Output() filtersChanged = new EventEmitter<any>();
  @Output() searchQueryChanged = new EventEmitter<string>();
  @Output() quickFilterApplied = new EventEmitter<QuickFilterPreset>();
  @Output() savedSearchApplied = new EventEmitter<SavedSearch>();

  searchForm: FormGroup;
  savedSearches: SavedSearch[] = [];
  quickFilters: QuickFilterPreset[] = [];
  activeQuickFilter: string | null = null;
  activeSavedSearch: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private savedSearchService: SavedSearchService,
    private fullTextSearchService: FullTextSearchService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.searchForm = this.fb.group({
      searchQuery: ['']
    });
  }

  ngOnInit(): void {
    this.loadSavedSearches();
    this.loadQuickFilters();
    this.setupSearchListener();
    this.checkForDefaultSearch();
  }

  private setupSearchListener(): void {
    this.searchForm.get('searchQuery')?.valueChanges
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(query => {
        this.searchQueryChanged.emit(query);
      });
  }

  private loadSavedSearches(): void {
    this.savedSearches = this.savedSearchService.getSavedSearches(this.entityType);
  }

  private loadQuickFilters(): void {
    switch (this.entityType) {
      case 'trip':
        this.quickFilters = this.savedSearchService.getTripQuickFilters();
        break;
      case 'driver':
        this.quickFilters = this.savedSearchService.getDriverQuickFilters();
        break;
      case 'truck':
      case 'trailer':
        this.quickFilters = this.savedSearchService.getVehicleQuickFilters();
        break;
      default:
        this.quickFilters = [];
    }
  }

  private checkForDefaultSearch(): void {
    const defaultSearch = this.savedSearchService.getDefaultSearch(this.entityType);
    if (defaultSearch) {
      this.applySavedSearch(defaultSearch);
    }
  }

  applyQuickFilter(preset: QuickFilterPreset): void {
    this.activeQuickFilter = preset.id;
    this.activeSavedSearch = null;
    this.quickFilterApplied.emit(preset);
    this.filtersChanged.emit(preset.filters);
    
    this.snackBar.open(`Applied filter: ${preset.name}`, 'Dismiss', {
      duration: 2000
    });
  }

  applySavedSearch(search: SavedSearch): void {
    this.activeSavedSearch = search.id;
    this.activeQuickFilter = null;
    this.savedSearchService.markSearchAsUsed(search.id);
    this.savedSearchApplied.emit(search);
    this.filtersChanged.emit(search.filters);
    
    this.snackBar.open(`Applied saved search: ${search.name}`, 'Dismiss', {
      duration: 2000
    });
  }

  openSaveSearchDialog(): void {
    const dialogRef = this.dialog.open(SaveSearchDialogComponent, {
      width: '500px',
      data: {
        entityType: this.entityType,
        filters: this.currentFilters
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const savedSearch = this.savedSearchService.saveSearch({
          name: result.name,
          description: result.description,
          filters: this.currentFilters,
          entityType: this.entityType,
          isDefault: result.isDefault
        });

        this.loadSavedSearches();
        
        this.snackBar.open('Search saved successfully', 'Dismiss', {
          duration: 3000
        });

        if (result.isDefault) {
          this.savedSearchService.setDefaultSearch(savedSearch.id, this.entityType);
        }
      }
    });
  }

  deleteSavedSearch(search: SavedSearch, event: Event): void {
    event.stopPropagation();
    
    if (confirm(`Delete saved search "${search.name}"?`)) {
      this.savedSearchService.deleteSearch(search.id);
      this.loadSavedSearches();
      
      if (this.activeSavedSearch === search.id) {
        this.activeSavedSearch = null;
      }
      
      this.snackBar.open('Search deleted', 'Dismiss', {
        duration: 2000
      });
    }
  }

  setAsDefault(search: SavedSearch, event: Event): void {
    event.stopPropagation();
    this.savedSearchService.setDefaultSearch(search.id, this.entityType);
    this.loadSavedSearches();
    
    this.snackBar.open(`"${search.name}" set as default`, 'Dismiss', {
      duration: 2000
    });
  }

  clearAllFilters(): void {
    this.activeQuickFilter = null;
    this.activeSavedSearch = null;
    this.searchForm.patchValue({ searchQuery: '' });
    this.filtersChanged.emit({});
  }

  isQuickFilterActive(filterId: string): boolean {
    return this.activeQuickFilter === filterId;
  }

  isSavedSearchActive(searchId: string): boolean {
    return this.activeSavedSearch === searchId;
  }

  getSearchPlaceholder(): string {
    switch (this.entityType) {
      case 'trip':
        return 'Search trips by location, driver, truck, broker...';
      case 'driver':
        return 'Search drivers by name, email, phone...';
      case 'truck':
      case 'trailer':
        return 'Search vehicles by name, VIN, license plate...';
      case 'invoice':
        return 'Search invoices by number, company...';
      default:
        return 'Search...';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
