import { InjectionToken } from '@angular/core';

// Same-origin /api is forwarded by the development proxy; production supplies its reverse proxy.
export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => '/api',
});

// Bounds network stalls; deployment providers may override this without changing components.
export const API_TIMEOUT_MS = new InjectionToken<number>('API_TIMEOUT_MS', {
  providedIn: 'root',
  factory: () => 15000,
});
