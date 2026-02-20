import { Component, OnInit, NgZone, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
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
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent implements OnInit {
  userName: string = '';
  userRole: string = '';
  isAuthenticated: boolean = false;
  currentRoute: string = '';

  constructor(
    private authService: AuthService,
    public router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
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
      this.cdr.markForCheck();
    });

    // Track current route for active navigation highlighting
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.currentRoute = event.url;
          this.cdr.markForCheck();
        }
      });
    
    // Set initial route
    this.currentRoute = this.router.url;
  }

  private formatRole(role: UserRole): string {
    switch (role) {
      case UserRole.Dispatcher:
        return 'Dispatcher';
      case UserRole.Carrier:
        return 'Carrier';
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
    // Clear session storage and do a hard refresh
    sessionStorage.clear();
    window.location.reload();
  }

  navigateToDashboard(): void {
    this.authService.navigateToDashboard();
  }

  isActiveRoute(route: string): boolean {
    return this.currentRoute?.includes(route) || false;
  }

  shouldShowNavigation(): boolean {
    // Only show navigation for authenticated users with specific roles
    const user = this.authService.currentUserValue;
    return this.isAuthenticated && user !== null;
  }

  getNavigationItems(): Array<{label: string, route: string, action?: () => void}> {
    const user = this.authService.currentUserValue;
    if (!user) return [];

    // Carrier navigation: Manage Trips and Manage Assets
    if (user.role === UserRole.Carrier) {
      return [
        { label: 'Manage Trips', route: '/carrier/dashboard' },
        { label: 'Manage Assets', route: '/carrier/assets' }
      ];
    }

    // No navigation items for other roles
    return [];
  }

  navigateTo(route: string): void {
    this.ngZone.run(() => {
      this.router.navigate([route]).then(
        success => console.log('Navigation success:', success),
        error => console.error('Navigation error:', error)
      );
    });
  }
}
