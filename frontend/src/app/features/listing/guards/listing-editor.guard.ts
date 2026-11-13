import type { CanDeactivateFn } from '@angular/router';

/** Giao diện guard giữ xác nhận bản nháp tại editor sở hữu UI. */
export const listingEditorGuard: CanDeactivateFn<{ canLeave(): boolean }> = (component) =>
  component.canLeave();
