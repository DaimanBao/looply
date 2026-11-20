import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { apiError } from '../../../core/http/api-error';
import { ChatApi } from '../data-access/chat.api';
import { ChatRealtime } from '../state/chat-realtime';
import type { ChatConversation } from '../models/chat.models';

@Component({
  selector: 'app-inbox',
  imports: [RouterLink],
  templateUrl: './inbox.page.html',
  styleUrl: './inbox.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InboxPage {
  private readonly api = inject(ChatApi);
  private readonly session = inject(SessionService);
  readonly realtime = inject(ChatRealtime);
  readonly group = signal<'LISTING' | 'DIRECT'>('LISTING');
  readonly listingId = signal('');
  readonly rows = signal<ChatConversation[]>([]);
  readonly next = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly confirm = signal<string | null>(null);
  readonly busy = signal(false);
  readonly groups = computed(() => {
    const groups = new Map<string, { id: string; title: string; rows: ChatConversation[] }>();
    for (const row of this.rows()) {
      const id = row.listing?.id ?? 'direct';
      const group = groups.get(id) ?? {
        id,
        title: row.listing?.title ?? 'Hội thoại tự do',
        rows: [],
      };
      group.rows.push(row);
      groups.set(id, group);
    }
    return [...groups.values()];
  });
  private revision = 0;
  private identity = -1;

  /** Filter/danh tính/reconnect mới luôn tải cursor mới. */
  constructor() {
    effect(() => {
      this.session.token();
      this.group();
      this.listingId();
      this.realtime.revision();
      untracked(() => void this.load());
    });
  }

  /** Phân trang keyset và loại phản hồi lỗi thời khỏi kết quả hiện tại. */
  async load(more = false): Promise<void> {
    const identity = this.session.identityVersion();
    const after = more ? this.next() : null;
    if (more && !after) return;
    const revision = ++this.revision;
    if (identity !== this.identity || !more) {
      this.rows.set([]);
      this.next.set(null);
      this.confirm.set(null);
      this.identity = identity;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.api.inbox({
        group: this.group(),
        ...(this.listingId() ? { listingId: this.listingId() } : {}),
        ...(after ? { after } : {}),
      });
      if (revision !== this.revision || identity !== this.session.identityVersion()) return;
      const rows = new Map(this.rows().map((row) => [row.id, row]));
      for (const row of page.data) rows.set(row.id, row);
      this.rows.set([...rows.values()]);
      this.next.set(page.pagination.nextCursor);
    } catch (error) {
      if (revision === this.revision && identity === this.session.identityVersion())
        this.error.set(apiError(error));
    } finally {
      if (revision === this.revision && identity === this.session.identityVersion())
        this.loading.set(false);
    }
  }

  /** Xác nhận ẩn Inbox cá nhân, không xóa lịch sử phía đối tác. */
  async hide(id: string): Promise<void> {
    if (this.busy()) return;
    const identity = this.session.identityVersion();
    this.busy.set(true);
    try {
      await this.api.hide(id);
      if (identity === this.session.identityVersion()) {
        this.confirm.set(null);
        await this.load();
      }
    } catch (error) {
      if (identity === this.session.identityVersion()) this.error.set(apiError(error));
    } finally {
      if (identity === this.session.identityVersion()) this.busy.set(false);
    }
  }
}
