import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Keep arbitrary bootstrap exception payloads out of browser logs.
bootstrapApplication(App, appConfig).catch(() =>
  console.error('Không thể khởi động Looply. Vui lòng tải lại trang.'),
);
