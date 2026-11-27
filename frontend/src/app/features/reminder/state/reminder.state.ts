import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { apiError } from '../../../core/http/api-error';
import { ProfileStore } from '../../user/public-api';
import { ReminderApi } from '../data-access/reminder.api';
import type { ReminderField } from '../models/reminder.models';

@Injectable({ providedIn: 'root' })
export class ReminderState {
  private readonly session = inject(SessionService);
  private readonly api = inject(ReminderApi);
  private readonly profiles = inject(ProfileStore);
  private identity = -1;
  private revision = 0;
  private settled = false;
  readonly items = signal<ReminderField[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  /** Khởi đầu theo identity, không theo từng HTTP request, trang hoặc lần luân chuyển token. */
  constructor() {
    effect(() => {
      this.session.token();
      const active = this.session.active();
      const identity = this.session.identityVersion();
      untracked(() => {
        if (identity === this.identity && active) return;
        this.identity = identity;
        this.revision++;
        this.items.set([]);
        this.loading.set(false);
        this.error.set('');
        this.settled = false;
        if (active) void this.present();
      });
    });
    effect(() => {
      const profile = this.profiles.profile();
      if (profile)
        untracked(() => {
          if (this.items().length) void this.recalculate();
        });
    });
  }

  /** Từ chối response của phiên cũ và request đã bị đóng hoặc thay thế. */
  private current(identity: number, revision: number): boolean {
    return (
      this.session.active() &&
      this.session.identityVersion() === identity &&
      revision === this.revision
    );
  }

  /** Cho phép retry khi lỗi, gộp thao tác lặp và không tự thử lại lượt đã được server cấp. */
  async present(): Promise<void> {
    if (!this.session.active() || this.loading() || this.settled) return;
    await this.read('presentation');
  }

  /** Chỉ loại bỏ mục đã hoàn thiện trên card hiện tại; không mở thêm card trong cùng phiên. */
  async recalculate(): Promise<void> {
    if (!this.session.active() || !this.items().length) return;
    await this.read('evaluation');
  }

  /** Mỗi request lấy một revision; lỗi và loading chỉ thuộc kết quả hiện hành. */
  private async read(operation: 'presentation' | 'evaluation'): Promise<void> {
    const identity = this.session.identityVersion();
    const revision = ++this.revision;
    this.loading.set(true);
    this.error.set('');
    try {
      const items = await (operation === 'presentation' ? this.api.present() : this.api.evaluate());
      if (!this.current(identity, revision)) return;
      if (operation === 'evaluation') {
        this.items.update((visible) => visible.filter((item) => items.includes(item)));
        return;
      }
      this.items.set(items);
      this.settled = true;
    } catch (error) {
      if (this.current(identity, revision)) this.error.set(apiError(error));
    } finally {
      if (this.current(identity, revision)) this.loading.set(false);
    }
  }

  /** Đóng card chỉ trong phiên; server đã cấp lượt nên reload hoặc tab khác không mở lại. */
  dismiss(): void {
    this.revision++;
    this.settled = true;
    this.items.set([]);
    this.error.set('');
    this.loading.set(false);
  }
}
