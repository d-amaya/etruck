import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TripService } from '../../../core/services/trip.service';
import { Trip, InvoicePayment } from '@haulhub/shared';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './invoice-detail.component.html',
  styleUrls: ['./invoice-detail.component.scss']
})
export class InvoiceDetailComponent implements OnInit {
  trip: Trip | null = null;
  invoiceForm: FormGroup;
  paymentForm: FormGroup;
  loading = false;
  saving = false;
  error: string | null = null;
  isEditMode = false;
  showPaymentForm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tripService: TripService,
    private fb: FormBuilder
  ) {
    this.invoiceForm = this.fb.group({
      invoiceNumber: ['', Validators.required],
      invoiceDate: ['', Validators.required],
      invoiceTerms: [30, [Validators.required, Validators.min(0)]],
      invoiceSubtotal: [0, [Validators.required, Validators.min(0)]],
      invoiceTax: [0, [Validators.min(0)]],
    });

    this.paymentForm = this.fb.group({
      amount: [0, [Validators.required, Validators.min(0.01)]],
      paymentDate: [new Date().toISOString().split('T')[0], Validators.required],
      paymentMethod: [''],
      notes: ['']
    });
  }

  ngOnInit(): void {
    const invoiceId = this.route.snapshot.paramMap.get('invoiceId');
    if (invoiceId) {
      this.loadInvoice(invoiceId);
    }
  }

  loadInvoice(invoiceId: string): void {
    this.loading = true;
    this.error = null;

    // Extract trip ID from invoice ID (format: INV-{tripId})
    const tripId = invoiceId.replace('INV-', '');
    
    this.tripService.getTripById(tripId).subscribe({
      next: (trip) => {
        this.trip = trip;
        this.populateForm();
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load invoice';
        console.error('Error loading invoice:', err);
        this.loading = false;
      }
    });
  }

  populateForm(): void {
    if (!this.trip) return;

    const invoiceDate = this.trip.invoiceDate || new Date().toISOString().split('T')[0];
    const invoiceNumber = this.trip.invoiceNumber || `INV-${this.trip.tripId}`;
    const invoiceTerms = this.trip.invoiceTerms || 30;
    const invoiceSubtotal = this.trip.invoiceSubtotal || this.trip.brokerPayment;
    const invoiceTax = this.trip.invoiceTax || 0;

    this.invoiceForm.patchValue({
      invoiceNumber,
      invoiceDate,
      invoiceTerms,
      invoiceSubtotal,
      invoiceTax
    });
  }

  get invoiceTotal(): number {
    const subtotal = this.invoiceForm.get('invoiceSubtotal')?.value || 0;
    const tax = this.invoiceForm.get('invoiceTax')?.value || 0;
    return subtotal + tax;
  }

  get invoiceDueDate(): string {
    const invoiceDate = this.invoiceForm.get('invoiceDate')?.value;
    const terms = this.invoiceForm.get('invoiceTerms')?.value || 30;
    
    if (!invoiceDate) return '';
    
    const date = new Date(invoiceDate);
    date.setDate(date.getDate() + terms);
    return date.toISOString().split('T')[0];
  }

  get totalPaid(): number {
    if (!this.trip?.invoicePayments) return 0;
    return this.trip.invoicePayments.reduce((sum, payment) => sum + payment.amount, 0);
  }

  get amountDue(): number {
    return this.invoiceTotal - this.totalPaid;
  }

  get invoiceStatus(): string {
    const total = this.invoiceTotal;
    const paid = this.totalPaid;
    const dueDate = new Date(this.invoiceDueDate);
    const today = new Date();

    if (paid >= total) return 'paid';
    if (paid > 0) return 'partial';
    if (dueDate < today) return 'overdue';
    return 'unpaid';
  }

  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
    if (!this.isEditMode) {
      this.populateForm();
    }
  }

  saveInvoice(): void {
    if (this.invoiceForm.invalid || !this.trip) return;

    this.saving = true;
    this.error = null;

    const formValue = this.invoiceForm.value;
    const updatedTrip: Partial<Trip> = {
      invoiceNumber: formValue.invoiceNumber,
      invoiceDate: formValue.invoiceDate,
      invoiceTerms: formValue.invoiceTerms,
      invoiceSubtotal: formValue.invoiceSubtotal,
      invoiceTax: formValue.invoiceTax,
      invoiceTotal: this.invoiceTotal,
      invoiceDueDate: this.invoiceDueDate,
      invoiceStatus: this.invoiceStatus as any
    };

    this.tripService.updateTrip(this.trip.tripId, updatedTrip).subscribe({
      next: () => {
        this.trip = { ...this.trip!, ...updatedTrip };
        this.isEditMode = false;
        this.saving = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to save invoice';
        console.error('Error saving invoice:', err);
        this.saving = false;
      }
    });
  }

  togglePaymentForm(): void {
    this.showPaymentForm = !this.showPaymentForm;
    if (this.showPaymentForm) {
      this.paymentForm.patchValue({
        amount: this.amountDue,
        paymentDate: new Date().toISOString().split('T')[0]
      });
    }
  }

  addPayment(): void {
    if (this.paymentForm.invalid || !this.trip) return;

    this.saving = true;
    this.error = null;

    const formValue = this.paymentForm.value;
    const newPayment: InvoicePayment = {
      paymentId: `PAY-${Date.now()}`,
      amount: formValue.amount,
      paymentDate: formValue.paymentDate,
      paymentMethod: formValue.paymentMethod,
      notes: formValue.notes
    };

    const payments = [...(this.trip.invoicePayments || []), newPayment];
    const updatedTrip: Partial<Trip> = {
      invoicePayments: payments,
      invoiceStatus: this.calculateStatusAfterPayment(payments) as any
    };

    this.tripService.updateTrip(this.trip.tripId, updatedTrip).subscribe({
      next: () => {
        this.trip = { ...this.trip!, ...updatedTrip };
        this.showPaymentForm = false;
        this.paymentForm.reset({
          paymentDate: new Date().toISOString().split('T')[0]
        });
        this.saving = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to add payment';
        console.error('Error adding payment:', err);
        this.saving = false;
      }
    });
  }

  private calculateStatusAfterPayment(payments: InvoicePayment[]): string {
    const total = this.invoiceTotal;
    const paid = payments.reduce((sum, p) => sum + p.amount, 0);
    const dueDate = new Date(this.invoiceDueDate);
    const today = new Date();

    if (paid >= total) return 'paid';
    if (paid > 0) return 'partial';
    if (dueDate < today) return 'overdue';
    return 'unpaid';
  }

  goBack(): void {
    this.router.navigate(['/dispatcher/invoices']);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
