import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard.component';

describe('Admin DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent, NoopAnimationsModule, HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have loading state initialized', () => {
    expect(component.loadingState.isLoading).toBeFalse();
  });

  it('should have error state initialized', () => {
    expect(component.errorState.hasError).toBeFalse();
  });

  it('should have filter form with date fields', () => {
    expect(component.filterForm.get('startDate')).toBeTruthy();
    expect(component.filterForm.get('endDate')).toBeTruthy();
  });

  it('should default to currentMonth preset', () => {
    expect(component.activePreset).toBe('currentMonth');
  });
});
