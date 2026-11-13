import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Giữ payload exception bootstrap tùy ý ngoài log trình duyệt.
bootstrapApplication(App, appConfig).catch(() =>
  console.error('Không thể khởi động Looply. Vui lòng tải lại trang.'),
);
