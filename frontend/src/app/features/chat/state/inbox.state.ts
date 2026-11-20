import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { apiError } from '../../../core/http/api-error';
import { UserApi } from '../../user/public-api';
import { ChatApi } from '../data-access/chat.api';
import { ChatRealtime } from './chat-realtime';
import type { ChatConversation } from '../models/chat.models';

@Injectable()
export class InboxState {
  private readonly api = inject(ChatApi);
  private readonly users = inject(UserApi);
  private readonly session = inject(SessionService);
  private readonly realtime = inject(ChatRealtime);
  readonly group = signal<'LISTING' | 'DIRECT'>('LISTING');
  readonly listingId = signal('');
  readonly search = signal('');
  readonly rows = signal<ChatConversation[]>([]);
  readonly userId = signal('');
  readonly next = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly confirm = signal<string | null>(null);
  readonly busy = signal(false);
  private revision = 0;
  private identity = -1;
  private scope = '';
  readonly groups = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('vi');
    const groups = new Map<string, { id: string; title: string; rows: ChatConversation[] }>();
    for (const row of this.rows()) {
      if (
        query &&
        !`${this.peer(row)?.displayName ?? ''} ${row.listing?.title ?? ''}`
          .toLocaleLowerCase('vi')
          .includes(query)
      )
        continue;
      const id = row.listing?.id ?? 'direct';
      const section = groups.get(id) ?? {
        id,
        title: row.listing?.title ?? 'Hội thoại tự do',
        rows: [],
      };
      section.rows.push(row);
      groups.set(id, section);
    }
    return [...groups.values()];
  });

  /** Sidebar tồn tại xuyên điều hướng; chỉ danh tính/filter/realtime mới tải lại dữ liệu. */
  constructor() {
    effect(() => {
      this.session.token();
      this.session.active();
      this.group();
      this.listingId();
      this.realtime.revision();
      untracked(() => void this.load());
    });
  }

  /** Chỉ hiển thị đối tác, không nhầm tên của caller vào hàng hội thoại. */
  peer(row: ChatConversation) {
    return row.participants.find((participant) => participant.userId !== this.userId());
  }

  /** Deep link DIRECT chọn đúng nhóm mà không giả định mọi route đều là Listing. */
  reveal(row: ChatConversation): void {
    if (this.listingId() && this.listingId() !== row.listing?.id) this.listingId.set('');
    if (this.group() !== row.type) {
      this.listingId.set('');
      this.group.set(row.type);
    }
  }

  /** Keyset scoped theo tài khoản/filter; refresh giữ nội dung hiển thị trong lúc chờ API. */
  async load(more = false): Promise<void> {
    const identity = this.session.identityVersion();
    const scope = `${identity}:${this.group()}:${this.listingId()}`;
    if (more && (this.loading() || !this.next())) return;
    const after = more ? this.next() : null;
    const revision = ++this.revision;
    if (scope !== this.scope || !this.session.active()) {
      this.rows.set([]);
      this.next.set(null);
      this.confirm.set(null);
      if (identity !== this.identity) {
        this.userId.set('');
        this.busy.set(false);
        this.search.set('');
      }
      this.scope = scope;
      this.identity = identity;
    }
    if (!this.session.active()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const [page, me] = await Promise.all([
        this.api.inbox({
          group: this.group(),
          ...(this.listingId() ? { listingId: this.listingId() } : {}),
          ...(after ? { after } : {}),
        }),
        this.userId() ? Promise.resolve({ id: this.userId() }) : this.users.me(),
      ]);
      if (
        revision !== this.revision ||
        identity !== this.session.identityVersion() ||
        !this.session.active()
      )
        return;
      const rows = new Map((more ? this.rows() : []).map((row) => [row.id, row]));
      for (const row of page.data) rows.set(row.id, row);
      this.rows.set([...rows.values()]);
      this.userId.set(me.id);
      this.next.set(page.pagination.nextCursor);
    } catch (error) {
      if (revision === this.revision && identity === this.session.identityVersion())
        this.error.set(apiError(error));
    } finally {
      if (revision === this.revision && identity === this.session.identityVersion())
        this.loading.set(false);
    }
  }

  /** Ẩn riêng Inbox và vô hiệu hóa response phân trang trước khi mutation kết thúc. */
  async hide(id: string): Promise<boolean> {
    if (this.busy()) return false;
    const identity = this.session.identityVersion();
    this.busy.set(true);
    this.revision++;
    this.loading.set(false);
    try {
      await this.api.hide(id);
      if (identity !== this.session.identityVersion()) return false;
      this.confirm.set(null);
      await this.load();
      return identity === this.session.identityVersion();
    } catch (error) {
      if (identity === this.session.identityVersion()) this.error.set(apiError(error));
      return false;
    } finally {
      if (identity === this.session.identityVersion()) this.busy.set(false);
    }
  }
}
