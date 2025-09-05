import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MetersStore, StatusFilter, TypeFilter } from '../core/state/meters.store';
import { ThemeService } from '../core/theme/theme.service';
import { Observable } from 'rxjs';
import { Platform } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class HomePage {
  vm$ = this.store.vm$;

  constructor(private store: MetersStore, private theme: ThemeService,private platform: Platform) {}

  async ngOnInit() {
    // 1. Show cached data immediately
    await this.store.loadCached();

    // 2. Refresh in background if online
    this.platform.ready().then(() => {
      if (navigator.onLine) {
        this.store.refreshFromApi();
      }
    });

    // 3. Listen for reconnection to refresh
    window.addEventListener('online', () => {
      this.store.refreshFromApi();
    });
  }

  trackById(index: number, item: { id: string }) { return item.id; }

  onSearchChange(ev: any) {
    const val = ev?.detail?.value ?? '';
    this.store.setSearch(val);
  }

  onStatusChange(ev: any) {
    const val = (ev?.detail?.value ?? '') as StatusFilter;
    this.store.setStatus(val);
  }

  onTypeChange(ev: any) {
    const val = (ev?.detail?.value ?? '') as TypeFilter;
    this.store.setType(val);
  }

  loadMore(ev: any) {
    this.store.loadMore();
    // complete the infinite scroll after a tick
    setTimeout(() => ev?.target?.complete(), 100);
  }

  onScrolledIndex(index: number, vm: any) {
    // Prefetch when the user scrolls near the end of the loaded items
    if (vm?.nextCursor && index > (vm.items.length - 10)) {
      this.store.loadMore();
    }
  }

  doRefresh(ev: any) {
    this.store.refresh();
    setTimeout(() => ev?.target?.complete(), 300);
  }

  toggleTheme() { this.theme.toggle(); }

  iconForType(type: string): string {
    switch (type) {
      case 'water': return 'water-outline';
      case 'electricity': return 'flash-outline';
      case 'gas': return 'flame-outline';
      default: return 'cube-outline';
    }
  }
}
