import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Lorry, User, Broker, VerifyLorryDto, VerifyUserDto } from '@haulhub/shared';

export interface DashboardSummary {
  pendingUserCount: number;
  pendingLorryCount: number;
  usersByRole: {
    Dispatcher: number;
    LorryOwner: number;
    Driver: number;
    Admin: number;
  };
}

export interface PresignedUrlResponse {
  url: string;
  expiresIn: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  constructor(private apiService: ApiService) {}

  /**
   * Get pending lorry verifications
   */
  getPendingLorries(): Observable<Lorry[]> {
    return this.apiService.get<Lorry[]>('/admin/lorries/pending');
  }

  /**
   * Verify a lorry (approve/reject/request more evidence)
   */
  verifyLorry(lorryId: string, decision: 'Approved' | 'Rejected' | 'NeedsMoreEvidence', reason?: string): Observable<Lorry> {
    const dto: VerifyLorryDto = { decision, reason };
    return this.apiService.patch<Lorry>(`/admin/lorries/${lorryId}/verify`, dto);
  }

  /**
   * Get presigned URL to view a lorry document
   */
  getDocumentViewUrl(lorryId: string, documentId: string): Observable<PresignedUrlResponse> {
    return this.apiService.get<PresignedUrlResponse>(`/lorries/${lorryId}/documents/${documentId}`);
  }

  /**
   * Get pending user verifications
   */
  getPendingUsers(): Observable<User[]> {
    return this.apiService.get<User[]>('/admin/users/pending');
  }

  /**
   * Verify a user (verify/reject)
   */
  verifyUser(userId: string, decision: 'Verified' | 'Rejected', reason?: string): Observable<User> {
    const dto: VerifyUserDto = { decision, reason };
    return this.apiService.patch<User>(`/admin/users/${userId}/verify`, dto);
  }

  /**
   * Get all brokers
   */
  getAllBrokers(activeOnly: boolean = false): Observable<Broker[]> {
    const params = activeOnly ? { activeOnly: 'true' } : {};
    return this.apiService.get<Broker[]>('/brokers', params);
  }

  /**
   * Create a new broker
   */
  createBroker(brokerName: string): Observable<Broker> {
    return this.apiService.post<Broker>('/brokers', { brokerName });
  }

  /**
   * Update a broker
   */
  updateBroker(brokerId: string, brokerName?: string, isActive?: boolean): Observable<Broker> {
    const updateData: any = {};
    if (brokerName !== undefined) updateData.brokerName = brokerName;
    if (isActive !== undefined) updateData.isActive = isActive;
    return this.apiService.patch<Broker>(`/brokers/${brokerId}`, updateData);
  }

  /**
   * Delete a broker (soft delete)
   */
  deleteBroker(brokerId: string): Observable<void> {
    return this.apiService.delete<void>(`/brokers/${brokerId}`);
  }

  /**
   * Get dashboard summary
   * This aggregates data from multiple endpoints
   */
  getDashboardSummary(): Observable<DashboardSummary> {
    // For now, we'll make individual calls and aggregate
    // In a real production app, we might have a dedicated dashboard endpoint
    return new Observable(observer => {
      const summary: DashboardSummary = {
        pendingUserCount: 0,
        pendingLorryCount: 0,
        usersByRole: {
          Dispatcher: 0,
          LorryOwner: 0,
          Driver: 0,
          Admin: 0
        }
      };

      // Get pending users
      this.getPendingUsers().subscribe({
        next: (users) => {
          summary.pendingUserCount = users.length;
          
          // Get pending lorries
          this.getPendingLorries().subscribe({
            next: (lorries) => {
              summary.pendingLorryCount = lorries.length;
              observer.next(summary);
              observer.complete();
            },
            error: (error) => observer.error(error)
          });
        },
        error: (error) => observer.error(error)
      });
    });
  }
}
