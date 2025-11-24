import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '@haulhub/shared';
import { filter } from 'rxjs/operators';

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
  currentRoute: string = '';

  constructor(
    private authService: AuthService,
    public router: Router
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

    // Track current route for active navigation highlighting
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.currentRoute = event.url;
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

  navigateToDashboard(): void {
    this.authService.navigateToDashboard();
  }

  isActiveRoute(route: string): boolean {
    return this.currentRoute.includes(route);
  }

  shouldShowNavigation(): boolean {
    // Only show navigation for authenticated users with specific roles
    const user = this.authService.currentUserValue;
    return this.isAuthenticated && user !== null;
  }

  getNavigationItems(): Array<{label: string, route: string, action?: () => void}> {
    const user = this.authService.currentUserValue;
    if (!user) return [];

    const items = [];

    // Add Dashboard for all roles
    switch (user.role) {
      case UserRole.Dispatcher:
        items.push({ label: 'Dashboard', route: '/dispatcher/dashboard' });
        break;
      case UserRole.LorryOwner:
        items.push({ label: 'Dashboard', route: '/lorry-owner/dashboard' });
        break;
      case UserRole.Driver:
        items.push({ label: 'Dashboard', route: '/driver/dashboard' });
        break;
      case UserRole.Admin:
        items.push({ label: 'Dashboard', route: '/admin/dashboard' });
        break;
    }

    return items;
  }
}
