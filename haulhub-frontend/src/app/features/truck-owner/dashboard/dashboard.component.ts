import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatGridListModule
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

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    // TODO: Load actual stats from API
  }

  navigateToTrucks(): void {
    this.router.navigate(['/truck-owner/trucks']);
  }

  navigateToTrailers(): void {
    this.router.navigate(['/truck-owner/trailers']);
  }
}
