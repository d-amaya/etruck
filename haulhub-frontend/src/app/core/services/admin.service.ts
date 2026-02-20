import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Broker } from '@haulhub/shared';

export interface PresignedUrlResponse {
  url: string;
  expiresIn: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  constructor(private apiService: ApiService) {}

  getAllBrokers(activeOnly: boolean = false): Observable<Broker[]> {
    const params = activeOnly ? { activeOnly: 'true' } : {};
    return this.apiService.get<Broker[]>('/brokers', params);
  }

  createBroker(brokerName: string): Observable<Broker> {
    return this.apiService.post<Broker>('/brokers', { brokerName });
  }

  updateBroker(brokerId: string, brokerName?: string, isActive?: boolean): Observable<Broker> {
    const updateData: any = {};
    if (brokerName !== undefined) updateData.brokerName = brokerName;
    if (isActive !== undefined) updateData.isActive = isActive;
    return this.apiService.patch<Broker>(`/brokers/${brokerId}`, updateData);
  }

  deleteBroker(brokerId: string): Observable<void> {
    return this.apiService.delete<void>(`/brokers/${brokerId}`);
  }
}
