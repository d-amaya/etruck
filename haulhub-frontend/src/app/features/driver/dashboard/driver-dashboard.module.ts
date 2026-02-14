import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';

import { DriverDashboardComponent } from './dashboard.component';
import { DriverFilterCardComponent } from './driver-filter-card/driver-filter-card.component';
import { DriverTripTableComponent } from './driver-trip-table/driver-trip-table.component';
import { DriverChartsWidgetComponent } from './driver-charts-widget/driver-charts-widget.component';
import { DriverTripEditDialogComponent } from './driver-trip-table/driver-trip-edit-dialog/driver-trip-edit-dialog.component';

const routes: Routes = [
  {
    path: '',
    component: DriverDashboardComponent
  }
];

@NgModule({
  declarations: [
    DriverDashboardComponent,
    DriverFilterCardComponent,
    DriverTripTableComponent,
    DriverChartsWidgetComponent,
    DriverTripEditDialogComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes),
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatMenuModule
  ]
})
export class DriverDashboardModule {}
