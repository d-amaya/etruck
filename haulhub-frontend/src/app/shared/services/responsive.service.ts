import { Injectable } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Observable, map, shareReplay } from 'rxjs';

export interface ResponsiveState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isHandset: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ResponsiveService {
  // Observable for mobile state (phones and small tablets)
  public isMobile$: Observable<boolean>;
  
  // Observable for tablet state
  public isTablet$: Observable<boolean>;
  
  // Observable for desktop state
  public isDesktop$: Observable<boolean>;
  
  // Observable for handset state (phones only)
  public isHandset$: Observable<boolean>;
  
  // Observable for complete responsive state
  public state$: Observable<ResponsiveState>;

  constructor(private breakpointObserver: BreakpointObserver) {
    // Mobile: phones and small tablets (< 768px)
    this.isMobile$ = this.breakpointObserver
      .observe([Breakpoints.HandsetPortrait, Breakpoints.HandsetLandscape, Breakpoints.TabletPortrait])
      .pipe(
        map(result => result.matches),
        shareReplay(1)
      );

    // Tablet: medium tablets (768px - 992px)
    this.isTablet$ = this.breakpointObserver
      .observe([Breakpoints.TabletPortrait, Breakpoints.TabletLandscape])
      .pipe(
        map(result => result.matches),
        shareReplay(1)
      );

    // Desktop: large screens (> 992px)
    this.isDesktop$ = this.breakpointObserver
      .observe([Breakpoints.WebPortrait, Breakpoints.WebLandscape])
      .pipe(
        map(result => result.matches),
        shareReplay(1)
      );

    // Handset: phones only
    this.isHandset$ = this.breakpointObserver
      .observe([Breakpoints.HandsetPortrait, Breakpoints.HandsetLandscape])
      .pipe(
        map(result => result.matches),
        shareReplay(1)
      );

    // Complete state
    this.state$ = this.breakpointObserver
      .observe([
        Breakpoints.HandsetPortrait,
        Breakpoints.HandsetLandscape,
        Breakpoints.TabletPortrait,
        Breakpoints.TabletLandscape,
        Breakpoints.WebPortrait,
        Breakpoints.WebLandscape
      ])
      .pipe(
        map(result => {
          const isHandset = this.breakpointObserver.isMatched([
            Breakpoints.HandsetPortrait,
            Breakpoints.HandsetLandscape
          ]);
          
          const isTablet = this.breakpointObserver.isMatched([
            Breakpoints.TabletPortrait,
            Breakpoints.TabletLandscape
          ]);
          
          const isDesktop = this.breakpointObserver.isMatched([
            Breakpoints.WebPortrait,
            Breakpoints.WebLandscape
          ]);
          
          const isPortrait = this.breakpointObserver.isMatched([
            Breakpoints.HandsetPortrait,
            Breakpoints.TabletPortrait,
            Breakpoints.WebPortrait
          ]);
          
          const isLandscape = this.breakpointObserver.isMatched([
            Breakpoints.HandsetLandscape,
            Breakpoints.TabletLandscape,
            Breakpoints.WebLandscape
          ]);

          return {
            isMobile: isHandset || isTablet,
            isTablet,
            isDesktop,
            isHandset,
            isPortrait,
            isLandscape
          };
        }),
        shareReplay(1)
      );
  }

  /**
   * Get current mobile state synchronously
   */
  isMobile(): boolean {
    return this.breakpointObserver.isMatched([
      Breakpoints.HandsetPortrait,
      Breakpoints.HandsetLandscape,
      Breakpoints.TabletPortrait
    ]);
  }

  /**
   * Get current tablet state synchronously
   */
  isTablet(): boolean {
    return this.breakpointObserver.isMatched([
      Breakpoints.TabletPortrait,
      Breakpoints.TabletLandscape
    ]);
  }

  /**
   * Get current desktop state synchronously
   */
  isDesktop(): boolean {
    return this.breakpointObserver.isMatched([
      Breakpoints.WebPortrait,
      Breakpoints.WebLandscape
    ]);
  }

  /**
   * Get current handset state synchronously
   */
  isHandset(): boolean {
    return this.breakpointObserver.isMatched([
      Breakpoints.HandsetPortrait,
      Breakpoints.HandsetLandscape
    ]);
  }

  /**
   * Check if screen width is below a specific breakpoint
   */
  isBelow(breakpoint: number): boolean {
    return window.innerWidth < breakpoint;
  }

  /**
   * Check if screen width is above a specific breakpoint
   */
  isAbove(breakpoint: number): boolean {
    return window.innerWidth >= breakpoint;
  }

  /**
   * Get current screen width
   */
  getScreenWidth(): number {
    return window.innerWidth;
  }

  /**
   * Get current screen height
   */
  getScreenHeight(): number {
    return window.innerHeight;
  }
}
