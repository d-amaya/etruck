import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Truck } from '@haulhub/shared';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatGridListModule,
    MatTableModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  stats = {
    totalTrucks: 0,
    activeTrucks: 0,
    totalTrailers: 0,
    activeTrailers: 0
  };

  trucks: Truck[] = [];
  loading = false;
  displayedColumns: string[] = ['plate', 'brand', 'year', 'color'];

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadTrucks();
  }

  loadStats(): void {
    // TODO: Load actual stats from API
  }

  loadTrucks(): void {
    this.loading = true;
    // TODO: Load actual trucks from API
    setTimeout(() => {
      this.trucks = [];
      this.loading = false;
    }, 500);
  }

  navigateToTrucks(): void {
    this.router.navigate(['/truck-owner/trucks']);
  }

  navigateToTrailers(): void {
    this.router.navigate(['/truck-owner/trailers']);
  }

  navigateToTrips(): void {
    this.router.navigate(['/truck-owner/trips']);
  }
}
