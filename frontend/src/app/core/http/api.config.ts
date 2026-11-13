import { InjectionToken } from '@angular/core';

// /api cùng origin được chuyển qua proxy development; production cung cấp reverse proxy riêng.
export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => '/api',
});

// Giới hạn mạng bị treo; provider triển khai có thể ghi đè mà không đổi component.
export const API_TIMEOUT_MS = new InjectionToken<number>('API_TIMEOUT_MS', {
  providedIn: 'root',
  factory: () => 15000,
});
