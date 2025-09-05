import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';
import { Storage } from '@ionic/storage-angular';

export interface MeterDto {
  id: string;
  name: string;
  meteringPoint: string;
  type: 'water' | 'electricity' | 'gas';
  status: 'online' | 'offline';
  lastReading: number;
  updatedAt: string;
}

export interface MetersResponse {
  items: MeterDto[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface ChangesResponse {
  updated: MeterDto[];
  deleted: { id: string; deletedAt: string }[];
  now: string;
}

@Injectable({ providedIn: 'root' })
export class MetersApiService {
  private base = environment.apiBase;
  private storageKey = 'meters-cache';
  private lastSyncKey = 'meters-last-sync';

  constructor(private http: HttpClient, private storage: Storage) {}

  async getCachedMeters(): Promise<MeterDto[]> {
    return (await this.storage.get(this.storageKey)) || [];
  }

  async setCachedMeters(meters: MeterDto[]): Promise<void> {
    await this.storage.set(this.storageKey, meters);
    await this.storage.set(this.lastSyncKey, new Date().toISOString());
  }

  async getLastSync(): Promise<string> {
    return (await this.storage.get(this.lastSyncKey)) || '';
  }

  getMeters(opts: {
    limit?: number;
    cursor?: string | null;
    q?: string | null;
    status?: 'online' | 'offline' | '' | null;
    type?: 'water' | 'electricity' | 'gas' | '' | null;
  }): Observable<MetersResponse> {
    let params = new HttpParams();
    const limit = opts.limit ?? environment.pageSize;
    params = params.set('limit', String(limit));
    if (opts.cursor) params = params.set('cursor', opts.cursor);
    if (opts.q) params = params.set('q', opts.q);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.type) params = params.set('type', opts.type);
    return this.http.get<MetersResponse>(`${this.base}/meters`, { params });
  }

  getChanges(sinceIso: string): Observable<ChangesResponse> {
    const params = new HttpParams().set('since', sinceIso);
    return this.http.get<ChangesResponse>(`${this.base}/meters/changes`, { params });
  }

  getMockAll(): Observable<{ items: MeterDto[]; total: number }> {
    return this.http.get<{ items: MeterDto[]; total: number }>(`${this.base}/mock/meters.json`);
  }
  
  getAssetsMock(): Observable<{ items: any[]; total: number }> {
    return this.http.get<{ items: any[]; total: number }>(`/assets/mocks/meters.json`);
  }
}
