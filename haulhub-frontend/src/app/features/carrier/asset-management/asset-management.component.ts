import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { firstValueFrom } from 'rxjs';
import { CarrierService } from '../../../core/services/carrier.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { UserDialogComponent, UserDialogData } from './user-dialog/user-dialog.component';

interface Truck {
  truckId: string;
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
  truckOwnerId: string;
  truckOwnerName?: string;
  isActive: boolean;
}

interface Trailer {
  trailerId: string;
  plate: string;
  brand: string;
  year: number;
  vin: string;
  color: string;
  reefer: string | null;
  isActive: boolean;
}

interface TruckOwner {
  userId: string;
  name: string;
  company: string;
}

@Component({
  selector: 'app-asset-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTabsModule,
    LoadingSpinnerComponent,
    ErrorStateComponent
  ],
  templateUrl: './asset-management.component.html',
  styleUrls: ['./asset-management.component.scss']
})
export class AssetManagementComponent implements OnInit {
  // Tab state
  activeTab: 'dispatchers' | 'drivers' | 'truckOwners' | 'trucks' | 'trailers' = 'dispatchers';

  // Users
  dispatchers: any[] = [];
  drivers: any[] = [];
  truckOwners: any[] = [];

  // Trucks
  trucks: any[] = [];
  filteredTrucks: any[] = [];
  selectedOwnerId: string = '';
  truckSearchTerm: string = '';

  // Trailers
  trailers: Trailer[] = [];
  filteredTrailers: Trailer[] = [];
  trailerSearchTerm: string = '';

  // Loading states
  loading = false;
  error: string | null = null;

  // Dialog states
  showTruckDialog = false;
  showTrailerDialog = false;
  showUserDialog = false;
  editMode = false;
  truckForm!: FormGroup;
  trailerForm!: FormGroup;
  userForm!: FormGroup;
  saving = false;
  currentTruckId: string | null = null;
  currentTrailerId: string | null = null;
  currentUserId: string | null = null;
  currentUserRole: string | null = null;

  // Current year for validation
  currentYear = new Date().getFullYear();

  constructor(
    private carrierService: CarrierService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initializeForms();
    this.loadAllAssets();
  }

  private async loadAllAssets(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const assets = await firstValueFrom(this.carrierService.getAllAssets());
      
      this.dispatchers = assets.dispatchers;
      this.drivers = assets.drivers;
      this.truckOwners = assets.truckOwners;
      this.trucks = assets.trucks.map(truck => ({
        ...truck,
        truckOwnerName: this.getTruckOwnerName(truck.truckOwnerId || "")
      }));
      this.trailers = assets.trailers;
      
      this.applyTruckFilters();
      this.applyTrailerFilters();
    } catch (err: any) {
      console.error('Error loading assets:', err);
      this.error = err.message || 'Failed to load assets';
    } finally {
      this.loading = false;
    }
  }

  private async loadUsers(): Promise<void> {
    try {
      // Load dispatchers
      const dispatchersResponse = await firstValueFrom(
        this.carrierService.getUsers('DISPATCHER')
      );
      this.dispatchers = dispatchersResponse.users;

      // Load drivers
      const driversResponse = await firstValueFrom(
        this.carrierService.getUsers('DRIVER')
      );
      this.drivers = driversResponse.users;

      // Load truck owners
      const ownersResponse = await firstValueFrom(
        this.carrierService.getUsers('TRUCK_OWNER')
      );
      this.truckOwners = ownersResponse.users;
    } catch (err: any) {
      console.error('Error loading users:', err);
    }
  }

  private initializeForms(): void {
    // Truck form
    this.truckForm = this.fb.group({
      truckOwnerId: ['', Validators.required],
      plate: ['', [Validators.required, Validators.minLength(2)]],
      brand: ['', [Validators.required, Validators.minLength(2)]],
      year: ['', [Validators.required, Validators.min(1900), Validators.max(this.currentYear + 1)]],
      vin: ['', [Validators.required, Validators.minLength(17), Validators.maxLength(17)]],
      color: ['', [Validators.required, Validators.minLength(2)]]
    });

    // Trailer form
    this.trailerForm = this.fb.group({
      plate: ['', [Validators.required, Validators.minLength(2)]],
      brand: ['', [Validators.required, Validators.minLength(2)]],
      year: ['', [Validators.required, Validators.min(1900), Validators.max(this.currentYear + 1)]],
      vin: ['', [Validators.required, Validators.minLength(17), Validators.maxLength(17)]],
      color: ['', [Validators.required, Validators.minLength(2)]],
      reefer: ['']
    });
  }

  async loadTruckOwners(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.carrierService.getUsers('TRUCK_OWNER')
      );
      this.truckOwners = response.users.map(user => ({
        userId: user.userId,
        name: user.name,
        company: user.company || ''
      }));
    } catch (err: any) {
      console.error('Error loading truck owners:', err);
    }
  }

  async loadTrucks(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const response = await firstValueFrom(
        this.carrierService.getTrucks(
          this.selectedOwnerId || undefined,
          this.truckSearchTerm || undefined
        )
      );
      
      this.trucks = response.trucks.map(truck => ({
        ...truck,
        truckOwnerName: this.getTruckOwnerName(truck.truckOwnerId || "")
      }));
      this.applyTruckFilters();
    } catch (err: any) {
      console.error('Error loading trucks:', err);
      this.error = err.message || 'Failed to load trucks';
    } finally {
      this.loading = false;
    }
  }

  async loadTrailers(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const response = await firstValueFrom(
        this.carrierService.getTrailers(this.trailerSearchTerm || undefined)
      );
      
      this.trailers = response.trailers;
      this.applyTrailerFilters();
    } catch (err: any) {
      console.error('Error loading trailers:', err);
      this.error = err.message || 'Failed to load trailers';
    } finally {
      this.loading = false;
    }
  }

  applyTruckFilters(): void {
    let filtered = [...this.trucks];

    // Owner filter
    if (this.selectedOwnerId) {
      filtered = filtered.filter(truck => truck.truckOwnerId === this.selectedOwnerId);
    }

    // Search filter (plate)
    if (this.truckSearchTerm) {
      const term = this.truckSearchTerm.toLowerCase();
      filtered = filtered.filter(truck =>
        truck.plate.toLowerCase().includes(term)
      );
    }

    this.filteredTrucks = filtered;
  }

  applyTrailerFilters(): void {
    let filtered = [...this.trailers];

    // Search filter (plate)
    if (this.trailerSearchTerm) {
      const term = this.trailerSearchTerm.toLowerCase();
      filtered = filtered.filter(trailer =>
        trailer.plate.toLowerCase().includes(term)
      );
    }

    this.filteredTrailers = filtered;
  }

  onOwnerFilterChange(): void {
    this.applyTruckFilters();
  }

  onTruckSearchChange(): void {
    this.applyTruckFilters();
  }

  onTrailerSearchChange(): void {
    this.applyTrailerFilters();
  }

  getTruckOwnerName(ownerId: string): string {
    const owner = this.truckOwners.find(o => o.userId === ownerId);
    return owner ? `${owner.name} (${owner.company})` : 'Unknown';
  }

  // Truck Dialog Methods
  openCreateTruckDialog(): void {
    this.editMode = false;
    this.currentTruckId = null;
    this.truckForm.reset();
    this.truckForm.enable();
    this.showTruckDialog = true;
  }

  editTruck(truck: Truck): void {
    this.editMode = true;
    this.currentTruckId = truck.truckId;
    
    this.truckForm.patchValue({
      truckOwnerId: truck.truckOwnerId,
      plate: truck.plate,
      brand: truck.brand,
      year: truck.year,
      vin: truck.vin,
      color: truck.color
    });

    this.showTruckDialog = true;
  }

  closeTruckDialog(): void {
    this.showTruckDialog = false;
    this.truckForm.reset();
    this.currentTruckId = null;
  }

  onTruckOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.closeTruckDialog();
    }
  }

  async saveTruck(): Promise<void> {
    if (this.truckForm.invalid) {
      this.markFormGroupTouched(this.truckForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    this.saving = true;

    try {
      const formValue = this.truckForm.getRawValue();
      const truckData = {
        truckOwnerId: formValue.truckOwnerId,
        plate: formValue.plate,
        brand: formValue.brand,
        year: parseInt(formValue.year, 10),
        vin: formValue.vin,
        color: formValue.color
      };

      if (this.editMode && this.currentTruckId) {
        await firstValueFrom(
          this.carrierService.updateTruck(this.currentTruckId, truckData)
        );
        this.snackBar.open('Truck updated successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      } else {
        await firstValueFrom(
          this.carrierService.createTruck(truckData)
        );
        this.snackBar.open('Truck created successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      }

      this.closeTruckDialog();
      await this.loadTrucks();
    } catch (err: any) {
      console.error('Error saving truck:', err);
      const errorMessage = err.error?.message || 'Failed to save truck. Please try again.';
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.saving = false;
    }
  }

  async toggleTruckStatus(truck: Truck): Promise<void> {
    const action = truck.isActive ? 'deactivate' : 'reactivate';
    const actionPastTense = truck.isActive ? 'deactivated' : 'reactivated';
    
    const dialogData: ConfirmDialogData = {
      title: `${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} Truck`,
      message: `Are you sure you want to ${action} truck ${truck.plate}? ${
        action === 'deactivate' 
          ? 'It will no longer be available for trips.' 
          : 'It will be available for trips again.'
      }`,
      confirmText: action === 'deactivate' ? 'Deactivate' : 'Reactivate',
      cancelText: 'Cancel'
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: dialogData
    });

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    
    if (!confirmed) {
      return;
    }

    try {
      await firstValueFrom(
        this.carrierService.updateTruckStatus(truck.truckId, !truck.isActive)
      );

      this.snackBar.open(
        `Truck ${actionPastTense} successfully!`,
        'Close',
        {
          duration: 3000,
          panelClass: ['success-snackbar']
        }
      );

      await this.loadTrucks();
    } catch (err: any) {
      console.error(`Error ${action}ing truck:`, err);
      const errorMessage = err.error?.message || `Failed to ${action} truck. Please try again.`;
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    }
  }

  // Trailer Dialog Methods
  openCreateTrailerDialog(): void {
    this.editMode = false;
    this.currentTrailerId = null;
    this.trailerForm.reset();
    this.trailerForm.enable();
    this.showTrailerDialog = true;
  }

  editTrailer(trailer: Trailer): void {
    this.editMode = true;
    this.currentTrailerId = trailer.trailerId;
    
    this.trailerForm.patchValue({
      plate: trailer.plate,
      brand: trailer.brand,
      year: trailer.year,
      vin: trailer.vin,
      color: trailer.color,
      reefer: trailer.reefer || ''
    });

    this.showTrailerDialog = true;
  }

  closeTrailerDialog(): void {
    this.showTrailerDialog = false;
    this.trailerForm.reset();
    this.currentTrailerId = null;
  }

  onTrailerOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.closeTrailerDialog();
    }
  }

  async saveTrailer(): Promise<void> {
    if (this.trailerForm.invalid) {
      this.markFormGroupTouched(this.trailerForm);
      this.snackBar.open('Please fill in all required fields correctly.', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    this.saving = true;

    try {
      const formValue = this.trailerForm.getRawValue();
      const trailerData = {
        plate: formValue.plate,
        brand: formValue.brand,
        year: parseInt(formValue.year, 10),
        vin: formValue.vin,
        color: formValue.color,
        reefer: formValue.reefer || null
      };

      if (this.editMode && this.currentTrailerId) {
        await firstValueFrom(
          this.carrierService.updateTrailer(this.currentTrailerId, trailerData)
        );
        this.snackBar.open('Trailer updated successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      } else {
        await firstValueFrom(
          this.carrierService.createTrailer(trailerData)
        );
        this.snackBar.open('Trailer created successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      }

      this.closeTrailerDialog();
      await this.loadTrailers();
    } catch (err: any) {
      console.error('Error saving trailer:', err);
      const errorMessage = err.error?.message || 'Failed to save trailer. Please try again.';
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.saving = false;
    }
  }

  async toggleTrailerStatus(trailer: Trailer): Promise<void> {
    const action = trailer.isActive ? 'deactivate' : 'reactivate';
    const actionPastTense = trailer.isActive ? 'deactivated' : 'reactivated';
    
    const dialogData: ConfirmDialogData = {
      title: `${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} Trailer`,
      message: `Are you sure you want to ${action} trailer ${trailer.plate}? ${
        action === 'deactivate' 
          ? 'It will no longer be available for trips.' 
          : 'It will be available for trips again.'
      }`,
      confirmText: action === 'deactivate' ? 'Deactivate' : 'Reactivate',
      cancelText: 'Cancel'
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: dialogData
    });

    const confirmed = await firstValueFrom(dialogRef.afterClosed());
    
    if (!confirmed) {
      return;
    }

    try {
      await firstValueFrom(
        this.carrierService.updateTrailerStatus(trailer.trailerId, !trailer.isActive)
      );

      this.snackBar.open(
        `Trailer ${actionPastTense} successfully!`,
        'Close',
        {
          duration: 3000,
          panelClass: ['success-snackbar']
        }
      );

      await this.loadTrailers();
    } catch (err: any) {
      console.error(`Error ${action}ing trailer:`, err);
      const errorMessage = err.error?.message || `Failed to ${action} trailer. Please try again.`;
      this.snackBar.open(errorMessage, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    }
  }

  // Utility Methods
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string, form: FormGroup): string {
    const control = form.get(fieldName);
    if (!control || !control.errors || !control.touched) {
      return '';
    }

    if (control.errors['required']) {
      return 'This field is required';
    }
    if (control.errors['minlength']) {
      return `Minimum length is ${control.errors['minlength'].requiredLength} characters`;
    }
    if (control.errors['maxlength']) {
      return `Maximum length is ${control.errors['maxlength'].requiredLength} characters`;
    }
    if (control.errors['min']) {
      return `Value must be at least ${control.errors['min'].min}`;
    }
    if (control.errors['max']) {
      return `Value must be at most ${control.errors['max'].max}`;
    }
    return 'Invalid value';
  }

  onRetry(): void {
    if (this.activeTab === 'trucks') {
      this.loadTrucks();
    } else {
      this.loadTrailers();
    }
  }

  navigateBack(): void {
    this.router.navigate(['/carrier/dashboard']);
  }

  onTabChange(index: number): void {
    const tabs = ['dispatchers', 'drivers', 'truckOwners', 'trucks', 'trailers'];
    this.activeTab = tabs[index] as any;
  }

  getAddButtonLabel(): string {
    switch (this.activeTab) {
      case 'trucks': return 'Truck';
      case 'trailers': return 'Trailer';
      default: return '';
    }
  }

  onAddAsset(): void {
    if (this.activeTab === 'trucks') {
      this.openCreateTruckDialog();
    } else if (this.activeTab === 'trailers') {
      this.openCreateTrailerDialog();
    }
  }

  openCreateUserDialog(role: string): void {
    const dialogData: UserDialogData = {
      role: role as 'DISPATCHER' | 'DRIVER' | 'TRUCK_OWNER',
      mode: 'create'
    };

    const dialogRef = this.dialog.open(UserDialogComponent, {
      width: '600px', maxHeight: '90vh',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result?.success) {
        // Only reload the specific user type that was created
        if (result.role === 'DISPATCHER') {
          const response = await firstValueFrom(this.carrierService.getUsers('DISPATCHER'));
          this.dispatchers = response.users;
        } else if (result.role === 'DRIVER') {
          const response = await firstValueFrom(this.carrierService.getUsers('DRIVER'));
          this.drivers = response.users;
        } else if (result.role === 'TRUCK_OWNER') {
          const response = await firstValueFrom(this.carrierService.getUsers('TRUCK_OWNER'));
          this.truckOwners = response.users;
        }
      }
    });
  }

  editUser(user: any): void {
    // Map role from user object to dialog role type
    let role: 'DISPATCHER' | 'DRIVER' | 'TRUCK_OWNER';
    
    if (user.role === 'Dispatcher' || user.role === 'DISPATCHER') {
      role = 'DISPATCHER';
    } else if (user.role === 'Driver' || user.role === 'DRIVER') {
      role = 'DRIVER';
    } else {
      role = 'TRUCK_OWNER';
    }
    
    const dialogData: UserDialogData = {
      user,
      role,
      mode: 'edit'
    };

    const dialogRef = this.dialog.open(UserDialogComponent, {
      width: '600px', maxHeight: '90vh',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result?.success) {
        // Only reload the specific user type that was edited
        if (result.role === 'DISPATCHER') {
          const response = await firstValueFrom(this.carrierService.getUsers('DISPATCHER'));
          this.dispatchers = response.users;
        } else if (result.role === 'DRIVER') {
          const response = await firstValueFrom(this.carrierService.getUsers('DRIVER'));
          this.drivers = response.users;
        } else if (result.role === 'TRUCK_OWNER') {
          const response = await firstValueFrom(this.carrierService.getUsers('TRUCK_OWNER'));
          this.truckOwners = response.users;
        }
      }
    });
  }

  async toggleUserStatus(user: any): Promise<void> {
    const action = user.isActive ? 'deactivate' : 'activate';
    const dialogData: ConfirmDialogData = {
      title: `${action === 'deactivate' ? 'Deactivate' : 'Activate'} User`,
      message: `Are you sure you want to ${action} ${user.name}?`,
      confirmText: action === 'deactivate' ? 'Deactivate' : 'Activate',
      cancelText: 'Cancel'
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: dialogData
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      if (user.isActive) {
        await firstValueFrom(this.carrierService.deactivateUser(user.userId));
      } else {
        await firstValueFrom(this.carrierService.reactivateUser(user.userId));
      }
      
      this.snackBar.open(`User ${action}d successfully`, 'Close', { duration: 3000 });
      await this.loadUsers();
    } catch (err: any) {
      console.error(`Error ${action}ing user:`, err);
      this.snackBar.open(err.message || `Failed to ${action} user`, 'Close', { duration: 5000 });
    }
  }
}
