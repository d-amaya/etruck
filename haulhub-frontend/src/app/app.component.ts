import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingSpinnerComponent } from './shared/components/loading-spinner/loading-spinner.component';
import { HeaderComponent } from './shared/components/header/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LoadingSpinnerComponent, HeaderComponent],
  template: `
    <app-loading-spinner></app-loading-spinner>
    <app-header></app-header>
    <router-outlet></router-outlet>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }
  `]
})
export class AppComponent {
}
