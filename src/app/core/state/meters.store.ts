import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject, combineLatest, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, scan, shareReplay, switchMap, tap, catchError } from 'rxjs/operators';
import { MetersApiService, MeterDto, MetersResponse, ChangesResponse } from '../api/meters-api.service';
import { environment } from '../../../environments/environment';
import { IndexedDbService } from '../storage/indexeddb.service';

export type StatusFilter = '' | 'online' | 'offline';
export type TypeFilter = '' | 'water' | 'electricity' | 'gas';

export interface QueryState { q: string; status: StatusFilter; type: TypeFilter; }
export interface UiState {
  items: MeterDto[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  query: QueryState;
}

function filtersKey(q: string, status: StatusFilter, type: TypeFilter) {
  return JSON.stringify({ q: (q || '').trim().toLowerCase(), status, type });
}

@Injectable({ providedIn: 'root' })
export class MetersStore {
  private search$ = new BehaviorSubject<string>('');
  private status$ = new BehaviorSubject<StatusFilter>('');
  private type$ = new BehaviorSubject<TypeFilter>('');

  private loadMore$ = new Subject<void>();
  private refresh$ = new Subject<void>();

  private state$ = new BehaviorSubject<UiState>({
    items: [],
    nextCursor: null,
    loading: false,
    error: null,
    query: { q: '', status: '', type: '' },
  });

  readonly vm$ = this.state$.asObservable();

  private readonly ASSETS_PAGE_SIZE = 10;

  private filterAssets(list: MeterDto[], query: QueryState): MeterDto[] {
    return list.filter((u) => this.matches(u, query));
  }

  private paginateAssets(list: MeterDto[], offset: number): { page: MeterDto[]; nextCursor: string | null } {
    const page = list.slice(offset, offset + this.ASSETS_PAGE_SIZE);
    const next = offset + this.ASSETS_PAGE_SIZE < list.length ? `assets:${offset + this.ASSETS_PAGE_SIZE}` : null;
    return { page, nextCursor: next };
  }

  constructor(
    private api: MetersApiService,
    private idb: IndexedDbService,
    private zone: NgZone,
  ) {
    // Cache-first initial load and when filters change
    const query$ = combineLatest([this.search$, this.status$, this.type$]).pipe(
      debounceTime(300),
      map(([q, status, type]) => ({ q: (q || '').trim(), status, type } as QueryState)),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      shareReplay(1),
    );
    

    // On query change: load from cache immediately, then fetch from network (SWR)
    query$.pipe(
      switchMap((query) => {
        const key = `meters:${filtersKey(query.q, query.status, query.type)}`;
        return of(query).pipe(
          switchMap(async () => {
            const cached = await this.idb.get<UiState>(key);
            this.patchState({
              items: cached?.items || [],
              nextCursor: cached?.nextCursor || null,
              loading: true,
              error: null,
              query,
            });
            return query;
          }),
          switchMap((query) => this.api.getMeters({
            q: query.q || undefined,
            status: query.status || undefined,
            type: query.type || undefined,
            limit: environment.pageSize,
          })),
          // Fallback to assets mock if backend fails
          catchError((err: unknown) =>
            this.api.getAssetsMock().pipe(
              map((mock: { items: any[]; total: number }) => {
                const mapped = (mock?.items || []).map((m: any) => ({
                  id: m.id,
                  name: m.name,
                  meteringPoint: m.meteringPointName ?? m.meteringPoint,
                  type: (m.meterType ?? m.type) as any,
                  status: m.status,
                  lastReading: Number(m.lastReading ?? 0),
                  updatedAt: m.updatedAt,
                })) as MeterDto[];
                // persist full mapped list for assets paging
                this.idb.set('assets:full', mapped);
                const filtered = this.filterAssets(mapped, query);
                const { page, nextCursor } = this.paginateAssets(filtered, 0);
                return {
                  items: page,
                  nextCursor,
                  hasMore: !!nextCursor,
                  limit: this.ASSETS_PAGE_SIZE,
                } as MetersResponse;
              }),
              catchError(() => of({ items: [], nextCursor: null, hasMore: false, limit: environment.pageSize } as MetersResponse))
            )
          ),
          tap(async (res: MetersResponse) => {
            const newState: UiState = {
              items: res.items,
              nextCursor: res.nextCursor,
              loading: false,
              error: null,
              query,
            };
            this.patchState(newState);
            const key = `meters:${filtersKey(query.q, query.status, query.type)}`;
            await this.idb.set(key, newState);
          })
        );
      })
    ).subscribe();

    // Load more (infinite scroll)
    this.loadMore$.pipe(
      switchMap(() => {
        const s = this.state$.value;
        if (!s.nextCursor || s.loading) return of(null);
        this.patchState({ loading: true });
        if (s.nextCursor.startsWith('assets:')) {
          const offset = parseInt(s.nextCursor.split(':')[1] || '0', 10) || 0;
          return of(null).pipe(
            switchMap(async () => (await this.idb.get<MeterDto[]>('assets:full')) || []),
            tap(async (full: MeterDto[]) => {
              const filtered = this.filterAssets(full, s.query);
              const { page, nextCursor } = this.paginateAssets(filtered, offset);
              const merged: UiState = {
                ...s,
                items: [...s.items, ...page],
                nextCursor,
                loading: false,
                error: null,
              };
              this.patchState(merged);
              const key = `meters:${filtersKey(s.query.q, s.query.status, s.query.type)}`;
              await this.idb.set(key, merged);
            })
          );
        }
        return this.api.getMeters({
          cursor: s.nextCursor,
          q: s.query.q || undefined,
          status: s.query.status || undefined,
          type: s.query.type || undefined,
          limit: environment.pageSize,
        }).pipe(
          tap(async (res: MetersResponse) => {
            const merged: UiState = {
              ...s,
              items: [...s.items, ...res.items],
              nextCursor: res.nextCursor,
              loading: false,
              error: null,
            };
            this.patchState(merged);
            const key = `meters:${filtersKey(s.query.q, s.query.status, s.query.type)}`;
            await this.idb.set(key, merged);
          })
        );
      })
    ).subscribe();

    // Pull-to-refresh using changes feed
    this.refresh$.pipe(
      switchMap(() => {
        const s = this.state$.value;
        this.patchState({ loading: true });
        const lastSyncKey = `lastSync`;
        return of(null).pipe(
          switchMap(async () => (await this.idb.get<string>(lastSyncKey)) || '1970-01-01T00:00:00.000Z'),
          switchMap((sinceIso) => this.api.getChanges(sinceIso)),
          tap(async (changes: ChangesResponse) => {
            const map = new Map(s.items.map(i => [i.id, i] as const));
            for (const u of changes.updated) {
              if (this.matches(u, s.query)) {
                map.set(u.id, u);
              } else {
                map.delete(u.id);
              }
            }
            for (const d of changes.deleted) {
              map.delete(d.id);
            }

            const nextItems = Array.from(map.values()).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
            const merged: UiState = {
              ...s,
              items: nextItems,
              loading: false,
              error: null,
            };
            this.patchState(merged);
            const key = `meters:${filtersKey(s.query.q, s.query.status, s.query.type)}`;
            await this.idb.set(key, merged);
            await this.idb.set(lastSyncKey, changes.now);
          })
        );
      })
    ).subscribe();
  }

  private matches(u: MeterDto, q: QueryState): boolean {
    const qn = (q.q || '').trim().toLowerCase();
    if (q.status && u.status !== q.status) return false;
    if (q.type && u.type !== q.type) return false;
    if (qn) {
      const idL = u.id.toLowerCase();
      const nmL = u.name.toLowerCase();
      const mpL = u.meteringPoint.toLowerCase();
      if (!(idL.includes(qn) || nmL.includes(qn) || mpL.includes(qn))) return false;
    }
    return true;
  }


  setSearch(q: string) { this.search$.next(q); }
  setStatus(status: StatusFilter) { this.status$.next(status); }
  setType(type: TypeFilter) { this.type$.next(type); }
  loadMore() { this.loadMore$.next(); }
  refresh() { this.refresh$.next(); }

   async loadCached() {
    const s = this.state$.value;
    const key = `meters:${filtersKey(s.query.q, s.query.status, s.query.type)}`;
    const cached = await this.idb.get<UiState>(key);
    this.patchState({
      items: cached?.items || [],
      nextCursor: cached?.nextCursor || null,
      loading: false,
      error: null,
    });
  }

  refreshFromApi() {
    const s = this.state$.value;
    this.patchState({ loading: true });
    this.api.getMeters({
      q: s.query.q || undefined,
      status: s.query.status || undefined,
      type: s.query.type || undefined,
      limit: environment.pageSize,
    }).subscribe({
      next: async (res) => {
        const newState: UiState = {
          items: res.items,
          nextCursor: res.nextCursor,
          loading: false,
          error: null,
          query: s.query,
        };
        this.patchState(newState);
        const key = `meters:${filtersKey(s.query.q, s.query.status, s.query.type)}`;
        await this.idb.set(key, newState);
        await this.idb.set('lastSync', new Date().toISOString());
      },
      error: (err) => {
        this.patchState({ loading: false, error: 'Network error' });
      }
    });
  }

  async syncAndRefresh() {
    const s = this.state$.value;
    this.patchState({ loading: true });
    const lastSync = await this.idb.get<string>('lastSync') || '1970-01-01T00:00:00.000Z';
    this.api.getChanges(lastSync).subscribe({
      next: async (changes: ChangesResponse) => {
        const map = new Map(s.items.map(i => [i.id, i] as const));
        for (const u of changes.updated) {
          if (this.matches(u, s.query)) {
            map.set(u.id, u);
          } else {
            map.delete(u.id);
          }
        }
        for (const d of changes.deleted) {
          map.delete(d.id);
        }
        const nextItems = Array.from(map.values()).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
       
        this.api.getMeters({
          q: s.query.q || undefined,
          status: s.query.status || undefined,
          type: s.query.type || undefined,
          limit: environment.pageSize,
        }).subscribe({
          next: async (res) => {
            const newState: UiState = {
              items: res.items,
              nextCursor: res.nextCursor,
              loading: false,
              error: null,
              query: s.query,
            };
            this.patchState(newState);
            const key = `meters:${filtersKey(s.query.q, s.query.status, s.query.type)}`;
            await this.idb.set(key, newState);
            await this.idb.set('lastSync', changes.now);
          },
          error: () => {
            this.patchState({ loading: false, error: 'Network error' });
          }
        });
      },
      error: () => {
        this.patchState({ loading: false, error: 'Sync error' });
      }
    });
  }

  private patchState(patch: Partial<UiState>) {
    const s = this.state$.value;
    this.zone.run(() => this.state$.next({ ...s, ...patch }));
  }
}
