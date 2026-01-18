# HaulHub Frontend

Angular 17+ frontend application for the HaulHub Transportation Management System.

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Development](#development)
- [Building](#building)
- [Testing](#testing)
- [Configuration](#configuration)

## Overview

HaulHub Frontend is a modern Angular application built with standalone components, lazy-loaded modules, and Angular Material UI. The application provides role-specific dashboards and features for Dispatchers, Lorry Owners, Drivers, and Administrators.

## Technology Stack

- **Angular**: 17+ with standalone components
- **Angular Material**: UI component library
- **RxJS**: Reactive programming
- **TypeScript**: Type-safe development
- **date-fns**: Date manipulation library
- **SCSS**: Styling

## Project Structure

```
haulhub-frontend/
├── src/
│   ├── app/
│   │   ├── core/              # Core services and guards
│   │   │   ├── guards/        # Auth guards
│   │   │   ├── interceptors/  # HTTP interceptors
│   │   │   └── services/      # Core services (API, auth, trip, admin, analytics)
│   │   ├── features/          # Feature modules (lazy-loaded)
│   │   │   ├── auth/          # Authentication (login, register)
│   │   │   ├── dispatcher/    # Dispatcher dashboard and trip management
│   │   │   ├── truck-owner/   # Truck owner features
│   │   │   ├── driver/        # Driver features (dashboard, trips, payment reports)
│   │   │   └── admin/         # Admin features (verification, broker management)
│   │   ├── shared/            # Shared components
│   │   │   └── components/    # Reusable UI components
│   │   ├── app.component.ts   # Root component
│   │   ├── app.config.ts      # Application configuration
│   │   └── app.routes.ts      # Route definitions
│   ├── assets/                # Static assets
│   ├── environments/          # Environment configurations
│   ├── styles/                # Global styles and design system
│   ├── index.html             # Main HTML file
│   ├── main.ts                # Application entry point
│   └── styles.scss            # Global styles
├── angular.json               # Angular CLI configuration
├── package.json               # Dependencies
└── tsconfig.json              # TypeScript configuration
```

## Installation

Install dependencies:

```bash
npm install
```

## Development

Start the development server:

```bash
npm start
```

The application will be available at `http://localhost:4200/`.

The development server will automatically reload when you make changes to the source files.

## Building

Build the project for production:

```bash
npm run build:prod
```

The build artifacts will be stored in the `dist/` directory.

## Testing

Run unit tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Configuration

### Environment Files

The application uses environment-specific configuration files:

- `src/environments/environment.ts` - Development environment
- `src/environments/environment.prod.ts` - Production environment

**Development Configuration:**
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  apiBaseUrl: 'http://localhost:3000'
};
```

**Production Configuration:**
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.haulhub.com/api',
  apiBaseUrl: 'https://api.haulhub.com'
};
```

Update these values based on your backend API endpoints.

### Lazy Loading

The application uses lazy-loaded feature modules for optimal performance:

- **Auth Module**: `/auth` - Login and registration
- **Dispatcher Module**: `/dispatcher` - Dashboard, trip management, analytics
- **Truck Owner Module**: `/truck-owner` - Dashboard, truck/trailer management
- **Driver Module**: `/driver` - Dashboard, trip list, payment reports
- **Admin Module**: `/admin` - Dashboard, user/lorry verification, broker management

### Angular Material Theme

The application uses the pre-built Indigo-Pink theme from Angular Material. To customize the theme, modify `src/styles.scss`.

### Shared Types

The frontend imports shared TypeScript types from the `@haulhub/shared` package. This ensures type consistency between frontend and backend.

## Authentication

### AuthService

The `AuthService` handles user authentication, token management, and automatic token refresh:

```typescript
import { AuthService } from './core/services';

constructor(private authService: AuthService) {}

// Register a new user
this.authService.register(registerDto).subscribe({
  next: (response) => {
    console.log('Registration successful');
    this.authService.navigateToDashboard();
  },
  error: (error) => console.error('Registration failed', error)
});

// Login
this.authService.login(loginDto).subscribe({
  next: (response) => {
    console.log('Login successful');
    this.authService.navigateToDashboard();
  },
  error: (error) => console.error('Login failed', error)
});

// Logout
this.authService.logout().subscribe(() => {
  console.log('Logged out');
});

// Check authentication status
if (this.authService.isAuthenticated) {
  console.log('User is authenticated');
}

// Get current user role
const role = this.authService.userRole;

// Access current user data
this.authService.currentUser$.subscribe(user => {
  if (user) {
    console.log('Current user:', user.email, user.role);
  }
});
```

### Token Management

The authentication system uses JWT tokens stored in **httpOnly cookies** for enhanced security:

- **Access Token**: Valid for 1 hour, stored in httpOnly cookie, used for API authentication
- **Refresh Token**: Valid for 1 year, stored in httpOnly cookie, used to obtain new access tokens
- **HttpOnly Cookies**: Tokens are stored in httpOnly cookies by the backend, making them inaccessible to JavaScript (XSS protection)
- **Automatic Credentials**: Browser automatically sends cookies with each request
- **User Data Storage**: Only non-sensitive user data (userId, role, email, fullName) is stored in localStorage for UI purposes
- **CSRF Protection**: Backend should implement CSRF tokens with SameSite cookie attribute

### Auth Interceptor

The `authInterceptor` automatically:
- Ensures `withCredentials: true` is set on all API requests (allows httpOnly cookies to be sent)
- Handles 401 errors by attempting to refresh the token via the refresh endpoint
- Retries failed requests after successful token refresh
- The backend reads tokens from httpOnly cookies and sets new cookies on refresh
- No manual token attachment needed - browser handles cookie transmission

### Auth Guards

Two guards protect routes based on authentication status:

**authGuard**: Protects routes that require authentication
```typescript
{
  path: 'dispatcher',
  canActivate: [authGuard],
  data: { roles: [UserRole.Dispatcher] },
  loadChildren: () => import('./features/dispatcher/dispatcher.routes')
}
```

**noAuthGuard**: Prevents authenticated users from accessing auth pages
```typescript
{
  path: 'auth',
  canActivate: [noAuthGuard],
  loadChildren: () => import('./features/auth/auth.routes')
}
```

### Role-Based Access Control

Routes can specify required roles using route data:

```typescript
{
  path: 'admin',
  canActivate: [authGuard],
  data: { roles: [UserRole.Admin] },
  loadChildren: () => import('./features/admin/admin.routes')
}
```

If a user doesn't have the required role, they are redirected to their role-specific dashboard.

### Navigation

The `navigateToDashboard()` method automatically routes users to their role-specific dashboard:

- **Dispatcher** → `/dispatcher/dashboard`
- **Lorry Owner** → `/lorry-owner/dashboard`
- **Driver** → `/driver/dashboard`
- **Admin** → `/admin/dashboard`

### Security Benefits of HttpOnly Cookies

The authentication system uses httpOnly cookies instead of localStorage for enhanced security:

**XSS Protection:**
- HttpOnly cookies cannot be accessed by JavaScript, preventing token theft via XSS attacks
- Even if malicious scripts are injected, they cannot read the authentication tokens

**Automatic Handling:**
- Browser automatically sends cookies with requests (no manual token management)
- Reduces risk of accidentally exposing tokens in logs or error messages

**CSRF Protection (Backend Required):**
- Backend should set `SameSite=Strict` or `SameSite=Lax` on cookies
- Backend should implement CSRF tokens for state-changing operations
- Cookies should be marked as `Secure` in production (HTTPS only)

**What's Stored Where:**
- **HttpOnly Cookies** (set by backend): Access token, refresh token
- **LocalStorage** (set by frontend): User data only (userId, role, email, fullName)
- No sensitive tokens are ever accessible to JavaScript

**Backend Requirements:**

The backend must be configured to work with httpOnly cookies:

```typescript
// Example NestJS response configuration
response.cookie('accessToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict', // CSRF protection
  maxAge: 3600000 // 1 hour
});

response.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 31536000000 // 1 year
});
```

The backend must also enable CORS with credentials:

```typescript
// NestJS CORS configuration
app.enableCors({
  origin: 'http://localhost:4200', // Frontend URL
  credentials: true // Allow cookies
});
```

## API Service

The `ApiService` provides a centralized HTTP client for making API requests:

```typescript
import { ApiService } from './core/services';

constructor(private api: ApiService) {}

// GET request
this.api.get<User>('/users/profile').subscribe(user => {
  console.log(user);
});

// POST request
this.api.post<Trip>('/trips', tripData).subscribe(trip => {
  console.log(trip);
});
```

## Driver Features

### Trip Status Updates

Drivers can update the status of trips assigned to them through an intuitive dialog interface.

**Allowed Status Transitions:**
- Scheduled → Picked Up
- Picked Up → In Transit
- In Transit → Delivered

**Implementation:**

The driver trip list component includes a status update button that opens a dialog:

```typescript
import { TripService } from './core/services';
import { StatusUpdateDialogComponent } from './features/driver/trip-list/status-update-dialog.component';

// Open status update dialog
const dialogRef = this.dialog.open(StatusUpdateDialogComponent, {
  width: '500px',
  data: { trip }
});

dialogRef.afterClosed().subscribe((result) => {
  if (result) {
    this.tripService.updateTripStatus(tripId, { status: result.status }).subscribe({
      next: (updatedTrip) => {
        // Trip updated successfully
        this.snackBar.open('Trip status updated successfully', 'Close', { duration: 3000 });
      },
      error: (error) => {
        // Handle error
        this.snackBar.open('Failed to update trip status', 'Close', { duration: 5000 });
      }
    });
  }
});
```

**Features:**
- Only trips assigned to the current driver can be updated
- Status cannot be updated for trips already marked as Delivered or Paid
- Dialog suggests the next logical status based on current status
- Success/error messages displayed via Material snackbar
- Trip list automatically refreshes after successful update

**Authorization:**
- Backend validates that the driver is assigned to the trip
- Backend enforces allowed status transitions
- Drivers cannot update trips assigned to other drivers

**Testing:**

Comprehensive unit tests are included for both the trip list component and status update dialog:

```bash
# Run driver trip list tests
npm test -- --include='**/driver/trip-list/**/*.spec.ts'
```

Test coverage includes:
- Dialog opening and closing behavior
- Status update API calls with proper data
- Success and error message display
- Local trip array updates after successful status change
- Authorization checks (canUpdateStatus)
- Form validation in the dialog
- Default status suggestions based on current trip status

### Admin Lorry Verification

The admin lorry verification component allows administrators to review and approve/reject lorry registrations submitted by lorry owners.

**Route:** `/admin/lorries/verification`

**Usage Example:**

```typescript
import { AdminService } from './core/services';
import { VerificationDialogComponent } from './features/admin/lorry-verification/verification-dialog.component';
import { DocumentViewerDialogComponent } from './features/admin/lorry-verification/document-viewer-dialog.component';

// Load pending lorries
this.adminService.getPendingLorries().subscribe({
  next: (lorries) => {
    this.lorries = lorries;
  }
});

// View documents
const dialogRef = this.dialog.open(DocumentViewerDialogComponent, {
  width: '800px',
  data: { lorry }
});

// Verify lorry
const dialogRef = this.dialog.open(VerificationDialogComponent, {
  width: '500px',
  data: { lorry }
});

dialogRef.afterClosed().subscribe((result) => {
  if (result) {
    this.adminService.verifyLorry(lorryId, result.decision, result.reason).subscribe({
      next: () => {
        this.snackBar.open('Lorry verified successfully', 'Close', { duration: 3000 });
        this.loadPendingLorries(); // Refresh list
      }
    });
  }
});
```

**Features:**
- Display all lorries with Pending or NeedsMoreEvidence status
- View lorry details (license plate, make, model, year, owner info)
- View uploaded verification documents with presigned URLs
- Document viewer supports images and PDFs with inline preview
- Approve, reject, or request more evidence with reason
- Automatic list refresh after verification decision
- Status indicators with color coding

**Document Viewer:**
- Lists all uploaded documents for a lorry
- Inline preview for images and PDFs
- Download option for unsupported file types
- File size and upload date display
- Open in new tab functionality
- Presigned URLs with 15-minute expiration

**Verification Dialog:**
- Three decision options: Approve, Reject, Request More Evidence
- Required reason field for rejection or requesting more evidence
- Form validation ensures reason is provided when required
- Displays current lorry details for context

**Authorization:**
- Only Admin role can access lorry verification
- Backend validates admin role before processing verification
- Presigned URLs are generated with proper authorization checks

**Testing:**

Comprehensive unit tests are included for the lorry verification component:

```bash
# Run lorry verification tests
npm test -- --include='**/lorry-verification/**/*.spec.ts'
```

Test coverage includes:
- Loading pending lorries on component initialization
- Error handling when API calls fail
- Status color mapping for different verification statuses
- Dialog opening for document viewer and verification
- Verification submission with proper decision and reason
- Snackbar notifications for success and error cases

## Error Handling and User Feedback

The application includes a comprehensive error handling system that provides user-friendly feedback for all HTTP operations.

### Error Service

The `ErrorService` handles displaying error messages to users via Material snackbar notifications:

```typescript
import { ErrorService } from './core/services';

constructor(private errorService: ErrorService) {}

// Display error message
this.errorService.showError('Something went wrong');

// Display success message
this.errorService.showSuccess('Operation completed successfully');

// Display info message
this.errorService.showInfo('Please note this information');

// Handle HTTP errors automatically
const errorMessage = this.errorService.handleHttpError(httpError);
this.errorService.showError(errorMessage);
```

### Loading Service

The `LoadingService` manages loading indicators for async operations:

```typescript
import { LoadingService } from './core/services';

constructor(private loadingService: LoadingService) {}

// Show loading indicator
this.loadingService.show();

// Hide loading indicator
this.loadingService.hide();

// Check if loading
if (this.loadingService.isLoading()) {
  console.log('Loading in progress');
}

// Subscribe to loading state
this.loadingService.loading$.subscribe(isLoading => {
  console.log('Loading:', isLoading);
});
```

### HTTP Interceptors

The application uses three HTTP interceptors that work together to provide a seamless user experience:

**1. Loading Interceptor** (First)
- Automatically shows loading indicator when HTTP requests start
- Hides loading indicator when requests complete
- Handles multiple concurrent requests correctly

**2. Auth Interceptor** (Second)
- Ensures credentials (cookies) are sent with requests
- Handles 401 errors by attempting to refresh the token
- Retries failed requests after successful token refresh
- Redirects to login if refresh fails

**3. Error Interceptor** (Third)
- Catches all HTTP errors globally
- Displays user-friendly error messages via snackbar
- Handles different error types appropriately:
  - **400 (Validation)**: Shows field-specific validation messages
  - **401 (Authentication)**: Shows session expired message and redirects to login
  - **403 (Authorization)**: Shows permission denied message
  - **404 (Not Found)**: Shows resource not found message
  - **500+ (Server Error)**: Shows generic server error message
  - **Network Error**: Shows connection error message

### Automatic Error Handling

Most HTTP errors are handled automatically by the error interceptor. You don't need to manually display error messages in most cases:

```typescript
// The error interceptor will automatically show an error message
this.tripService.createTrip(tripData).subscribe({
  next: (trip) => {
    // Show success message
    this.errorService.showSuccess('Trip created successfully');
  }
  // No need for error handler - interceptor handles it
});
```

### Manual Error Handling

For cases where you need custom error handling:

```typescript
this.tripService.createTrip(tripData).subscribe({
  next: (trip) => {
    this.errorService.showSuccess('Trip created successfully');
  },
  error: (error: HttpErrorResponse) => {
    // Custom error handling
    if (error.status === 409) {
      this.errorService.showError('A trip with this ID already exists');
    }
    // For other errors, the interceptor will handle them
  }
});
```

### Skip Loading Indicator

To skip the loading indicator for specific requests (e.g., background polling):

```typescript
const headers = new HttpHeaders().set('X-Skip-Loading', 'true');
this.http.get('/api/status', { headers }).subscribe(...);
```

### Loading Spinner Component

The global loading spinner is automatically displayed when async operations are in progress:

```typescript
// Already included in app.component.ts
<app-loading-spinner></app-loading-spinner>
```

The spinner:
- Displays a centered overlay with Material spinner
- Shows "Loading..." text
- Blocks user interaction during loading
- Automatically shows/hides based on HTTP requests

### Error Message Styling

Error messages are styled using custom CSS classes in `styles.scss`:

- `.error-snackbar` - Red background for errors
- `.success-snackbar` - Green background for success
- `.info-snackbar` - Blue background for info
- `.warning-snackbar` - Orange background for warnings

### Best Practices

**1. Let Interceptors Handle Common Errors**
```typescript
// ✅ Good - Let interceptor handle errors
this.api.get('/trips').subscribe(trips => {
  this.trips = trips;
});

// ❌ Avoid - Unnecessary error handling
this.api.get('/trips').subscribe({
  next: trips => this.trips = trips,
  error: error => this.errorService.showError('Failed to load trips')
});
```

**2. Show Success Messages for User Actions**
```typescript
// ✅ Good - Confirm successful actions
this.api.post('/trips', data).subscribe(trip => {
  this.errorService.showSuccess('Trip created successfully');
  this.router.navigate(['/dispatcher/trips']);
});
```

**3. Use Custom Error Handling for Special Cases**
```typescript
// ✅ Good - Custom handling for specific errors
this.api.delete('/trips/' + id).subscribe({
  next: () => {
    this.errorService.showSuccess('Trip deleted');
  },
  error: (error) => {
    if (error.status === 409) {
      this.errorService.showError('Cannot delete trip with active status');
    }
    // Other errors handled by interceptor
  }
});
```

**4. Don't Manually Show/Hide Loading**
```typescript
// ✅ Good - Let interceptor handle loading
this.api.get('/trips').subscribe(trips => {
  this.trips = trips;
});

// ❌ Avoid - Manual loading management
this.loadingService.show();
this.api.get('/trips').subscribe({
  next: trips => {
    this.trips = trips;
    this.loadingService.hide();
  },
  error: () => this.loadingService.hide()
});
```

### Testing Error Handling

Tests for error handling services and interceptors:

```bash
# Run error service tests
npm test -- --include='**/error.service.spec.ts'

# Run loading service tests
npm test -- --include='**/loading.service.spec.ts'

# Run loading spinner tests
npm test -- --include='**/loading-spinner.component.spec.ts'
```

Test coverage includes:
- Error message display with correct styling
- Success and info message display
- HTTP error handling for different status codes
- Validation error extraction
- Loading state management
- Multiple concurrent request handling
- Loading spinner visibility based on loading state

## Next Steps

The following features will be implemented in subsequent tasks:

- ✅ Task 22: Authentication service and interceptor (COMPLETED)
- ✅ Task 23: Authentication UI components (COMPLETED)
- ✅ Task 24-26: Dispatcher features (COMPLETED)
- ✅ Task 27-30: Lorry owner features (COMPLETED)
- ✅ Task 31: Driver dashboard and trip list (COMPLETED)
- ✅ Task 32: Driver trip status updates (COMPLETED)
- Task 33: Driver payment reports
- Task 34: Admin dashboard (COMPLETED)
- ✅ Task 35: Admin lorry verification UI (COMPLETED)
- Task 36: Admin user verification UI
- Task 37: Admin broker management UI
- ✅ Task 38: Error handling and user feedback (COMPLETED)

## Development Guidelines

- Use standalone components for all new components
- Follow Angular style guide conventions
- Use reactive forms for form handling
- Implement proper error handling
- Write unit tests for components and services
- Use Angular Material components for UI consistency
