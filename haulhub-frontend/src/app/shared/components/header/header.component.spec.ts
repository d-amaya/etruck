import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { HeaderComponent } from './header.component';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '@haulhub/shared';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    authServiceSpy = jasmine.createSpyObj('AuthService', [
      'logout',
      'navigateToDashboard',
      'getDashboardRoute'
    ], {
      currentUser$: of({
        userId: 'test-user-id',
        role: UserRole.Dispatcher,
        email: 'test@example.com',
        fullName: 'Test User'
      }),
      currentUserValue: {
        userId: 'test-user-id',
        role: UserRole.Dispatcher,
        email: 'test@example.com',
        fullName: 'Test User'
      }
    });

    routerSpy = jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl'], {
      events: of()
    });

    await TestBed.configureTestingModule({
      imports: [
        HeaderComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display user name and role', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Test User');
    expect(compiled.textContent).toContain('Dispatcher');
  });

  it('should call logout when logout button is clicked', () => {
    authServiceSpy.logout.and.returnValue(of({}));
    
    component.onLogout();
    
    expect(authServiceSpy.logout).toHaveBeenCalled();
  });

  it('should format role names correctly', () => {
    expect(component['formatRole'](UserRole.Dispatcher)).toBe('Dispatcher');
    expect(component['formatRole'](UserRole.LorryOwner)).toBe('Lorry Owner');
    expect(component['formatRole'](UserRole.Driver)).toBe('Driver');
    expect(component['formatRole'](UserRole.Admin)).toBe('Admin');
  });

  it('should hide header when user is not authenticated', () => {
    // Update the spy to return null user
    Object.defineProperty(authServiceSpy, 'currentUser$', {
      get: () => of(null)
    });

    // Recreate component with new auth service state
    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar')).toBeFalsy();
  });
});
