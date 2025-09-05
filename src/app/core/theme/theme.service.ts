import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'prefers-theme';
  private _isDark = new BehaviorSubject<boolean>(false);
  readonly isDark$ = this._isDark.asObservable();

  constructor() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    let isDark: boolean;
    if (saved === 'dark') {
      isDark = true;
    } else if (saved === 'light') {
      isDark = false;
    } else {
      // default to system
      isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this.apply(isDark);
  }

  toggle(): void {
    this.apply(!this._isDark.value);
  }

  setDark(dark: boolean): void {
    this.apply(dark);
  }

  private apply(dark: boolean): void {
    this._isDark.next(dark);
    const body = document.body;
    if (dark) {
      body.classList.add('dark');
      localStorage.setItem(this.STORAGE_KEY, 'dark');
    } else {
      body.classList.remove('dark');
      localStorage.setItem(this.STORAGE_KEY, 'light');
    }
  }
}
