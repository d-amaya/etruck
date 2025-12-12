import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FinancialService } from '../../../core/services/financial.service';

interface InvoiceListItem {
  invoiceId: string;
  invoiceNumber: string;
  tripId: string;
  brokerName: string;
  amount: number;
  dueDate: string;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue';
  daysOverdue?: number;
}

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-list.component.html',
  styleUrls: ['./invoice-list.component.scss']
})
export class InvoiceListComponent implements OnInit {
  invoices: InvoiceListItem[] = [];
  filteredInvoices: InvoiceListItem[] = [];
  loading = false;
  error: string | null = null;

  // Filters
  statusFilter: string = 'all';
  searchTerm: string = '';
  sortBy: 'dueDate' | 'amount' | 'status' = 'dueDate';
  sortDirection: 'asc' | 'desc' = 'asc';

  // Summary stats
  totalOutstanding = 0;
  overdueAmount = 0;
  currentAmount = 0;

  constructor(
    private financialService: FinancialService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadInvoices();
  }

  loadInvoices(): void {
    this.loading = true;
    this.error = null;

    this.financialService.getOutstandingPayments().subscribe({
      next: (response) => {
        this.invoices = response.invoices.map(inv => ({
          invoiceId: inv.invoiceId,
          invoiceNumber: inv.invoiceId,
          tripId: inv.tripId,
          brokerName: inv.brokerName,
          amount: inv.amount,
          dueDate: inv.dueDate,
          status: inv.status,
          daysOverdue: inv.daysOverdue
        }));

        this.totalOutstanding = response.totalOutstanding;
        this.overdueAmount = response.overdueAmount;
        this.currentAmount = response.currentAmount;

        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load invoices';
        console.error('Error loading invoices:', err);
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    let filtered = [...this.invoices];

    // Status filter
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(inv => inv.status === this.statusFilter);
    }

    // Search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(inv =>
        inv.invoiceNumber.toLowerCase().includes(term) ||
        inv.tripId.toLowerCase().includes(term) ||
        inv.brokerName.toLowerCase().includes(term)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'dueDate':
          comparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }

      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    this.filteredInvoices = filtered;
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  onSort(field: 'dueDate' | 'amount' | 'status'): void {
    if (this.sortBy === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  viewInvoice(invoice: InvoiceListItem): void {
    this.router.navigate(['/dispatcher/invoices', invoice.invoiceId]);
  }

  createInvoice(): void {
    this.router.navigate(['/dispatcher/invoices/create']);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'paid': return 'status-paid';
      case 'partial': return 'status-partial';
      case 'overdue': return 'status-overdue';
      case 'unpaid': return 'status-unpaid';
      default: return '';
    }
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
      month: 'short',
      day: 'numeric'
    });
  }
}
