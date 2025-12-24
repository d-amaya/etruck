import { ApplicationConfig } from '@angular/core';
import { provideRouter, withRouterConfig } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor, loadingInterceptor, errorInterceptor } from './core/interceptors';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withRouterConfig({ onSameUrlNavigation: 'reload' })
    ),
    provideAnimations(),
    provideHttpClient(
      withInterceptors([
        loadingInterceptor,  // First: show loading indicator
        authInterceptor,     // Second: handle authentication
        errorInterceptor     // Third: handle errors and show messages
      ])
    )
  ]
};
