import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface InvoiceStatus {
  invoiceId: string;
  tripId: string;
  brokerName: string;
  amount: number;
  dueDate: string;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue';
  daysOverdue?: number;
}

export interface OutstandingPaymentsResponse {
  totalOutstanding: number;
  overdueAmount: number;
  currentAmount: number;
  invoices: InvoiceStatus[];
}

@Injectable({
  providedIn: 'root'
})
export class FinancialService {
  constructor(private apiService: ApiService) {}

  getOutstandingPayments(): Observable<OutstandingPaymentsResponse> {
    return this.apiService.get<OutstandingPaymentsResponse>('/financial/outstanding-payments');
  }
}
