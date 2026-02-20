import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusUpdateDialogComponent } from './status-update-dialog.component';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormBuilder } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Order, OrderStatus } from '@haulhub/shared';
import { createMockTrip } from '../../../testing/mock-trip.helper';

describe('StatusUpdateDialogComponent', () => {
  let component: StatusUpdateDialogComponent;
  let fixture: ComponentFixture<StatusUpdateDialogComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<StatusUpdateDialogComponent>>;

  const mockTrip: Order = createMockTrip({
    tripId: 'trip-1',
    truckId: 'ABC123',
    orderStatus: OrderStatus.Scheduled
  });

  beforeEach(async () => {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [StatusUpdateDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { trip: mockTrip } },
        FormBuilder
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(StatusUpdateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with trip data', () => {
    expect(component.data.trip).toEqual(mockTrip);
  });

  it('should have only allowed statuses', () => {
    expect(component.allowedStatuses).toEqual([
      OrderStatus.PickingUp,
      OrderStatus.Transit,
      OrderStatus.Delivered
    ]);
  });

  it('should set default status to PickedUp when current status is Scheduled', () => {
    expect(component.statusForm.value.status).toBe(OrderStatus.PickingUp);
  });

  it('should set default status to InTransit when current status is PickedUp', () => {
    const pickedUpTrip = createMockTrip({ orderStatus: OrderStatus.PickingUp });
    const newComponent = new StatusUpdateDialogComponent(
      new FormBuilder(),
      mockDialogRef,
      { trip: pickedUpTrip }
    );
    expect(newComponent.statusForm.value.status).toBe(OrderStatus.Transit);
  });

  it('should set default status to Delivered when current status is InTransit', () => {
    const inTransitTrip = createMockTrip({ orderStatus: OrderStatus.Transit });
    const newComponent = new StatusUpdateDialogComponent(
      new FormBuilder(),
      mockDialogRef,
      { trip: inTransitTrip }
    );
    expect(newComponent.statusForm.value.status).toBe(OrderStatus.Delivered);
  });

  it('should close dialog with result when form is valid and submitted', () => {
    component.statusForm.patchValue({ status: OrderStatus.PickingUp });
    component.onSubmit();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      status: OrderStatus.PickingUp
    });
  });

  it('should not close dialog when form is invalid', () => {
    component.statusForm.patchValue({ status: '' });
    component.onSubmit();

    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should close dialog without result when cancelled', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith();
  });

  it('should return correct status label for Scheduled', () => {
    expect(component.getStatusLabel(OrderStatus.Scheduled)).toBe('Scheduled');
  });

  it('should return correct status label for PickedUp', () => {
    expect(component.getStatusLabel(OrderStatus.PickingUp)).toBe('PickingUp');
  });

  it('should return correct status label for InTransit', () => {
    expect(component.getStatusLabel(OrderStatus.Transit)).toBe('Transit');
  });

  it('should return correct status label for Delivered', () => {
    expect(component.getStatusLabel(OrderStatus.Delivered)).toBe('Delivered');
  });

  it('should return correct status label for Paid', () => {
    expect(component.getStatusLabel(OrderStatus.ReadyToPay)).toBe('ReadyToPay');
  });

  it('should have required validator on status field', () => {
    const statusControl = component.statusForm.get('status');
    statusControl?.setValue('');
    expect(statusControl?.hasError('required')).toBe(true);
  });

  it('should be valid when status is selected', () => {
    component.statusForm.patchValue({ status: OrderStatus.PickingUp });
    expect(component.statusForm.valid).toBe(true);
  });
});
