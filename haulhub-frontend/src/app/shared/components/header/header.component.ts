import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '@haulhub/shared';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  userName: string = '';
  userRole: string = '';
  isAuthenticated: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.isAuthenticated = true;
        this.userName = user.fullName;
        this.userRole = this.formatRole(user.role);
      } else {
        this.isAuthenticated = false;
        this.userName = '';
        this.userRole = '';
      }
    });
  }

  private formatRole(role: UserRole): string {
    switch (role) {
      case UserRole.Dispatcher:
        return 'Dispatcher';
      case UserRole.LorryOwner:
        return 'Lorry Owner';
      case UserRole.Driver:
        return 'Driver';
      case UserRole.Admin:
        return 'Admin';
      default:
        return '';
    }
  }

  onLogout(): void {
    this.authService.logout().subscribe({
      next: () => {
        // Navigation is handled by the auth service
      },
      error: (error) => {
        console.error('Logout failed:', error);
        // Navigation is still handled by the auth service even on error
      }
    });
  }

  navigateHome(): void {
    this.authService.navigateToDashboard();
  }
}
