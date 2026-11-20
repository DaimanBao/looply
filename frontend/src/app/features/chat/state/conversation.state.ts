import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SessionService } from '../../../core/auth/session.service';
import { apiError } from '../../../core/http/api-error';
import { UserApi } from '../../user/public-api';
import { ChatApi } from '../data-access/chat.api';
import type {
  ChatConversation,
  ChatMessage,
  ChatMessageInput,
  ChatProposalInput,
} from '../models/chat.models';

@Injectable()
export class ConversationState {
  private readonly api = inject(ChatApi);
  private readonly session = inject(SessionService);
  private readonly users = inject(UserApi);
  private id = '';
  private identity = -1;
  private revision = 0;
  private historyVersion = 0;
  private loaded = false;
  private pending?: { content: string; file: File | null; input: ChatMessageInput };
  private pendingProposal?: {
    kind: ChatProposalInput['kind'];
    price?: string;
    input: ChatProposalInput;
  };
  readonly conversation = signal<ChatConversation | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly userId = signal('');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly loadingOlder = signal(false);
  readonly nextCursor = signal<string | null>(null);
  readonly error = signal('');
  readonly success = signal('');

  /** Nạp metadata và trang mới nhất, giữ các trang cũ và vô hiệu hóa response cũ. */
  async load(id: string): Promise<void> {
    const identity = this.session.identityVersion();
    if (id !== this.id || identity !== this.identity) this.reset(id, identity);
    const revision = ++this.revision;
    this.loading.set(!this.loaded);
    try {
      const [conversation, page, me] = await Promise.all([
        this.api.get(id),
        this.api.history(id),
        this.userId() ? Promise.resolve({ id: this.userId() }) : this.users.me(),
      ]);
      if (!this.current(id, identity) || revision !== this.revision) return;
      this.conversation.set(conversation);
      this.userId.set(me.id);
      const oldLatest = this.messages().at(-1);
      const continuous = !oldLatest || page.data.some((message) => message.id === oldLatest.id);
      if (
        this.loaded &&
        oldLatest &&
        !continuous &&
        page.data[0] &&
        page.data[0].createdAt >= oldLatest.createdAt
      ) {
        // Reconnect có thể bỏ lỡ hơn một trang: bỏ tập cũ và dùng cursor mới để không tạo lỗ lịch sử.
        this.messages.set([]);
        this.historyVersion++;
        this.loadingOlder.set(false);
        this.nextCursor.set(page.pagination.nextCursor);
      }
      this.merge(page.data);
      if (!this.loaded) this.nextCursor.set(page.pagination.nextCursor);
      this.loaded = true;
      this.error.set('');
      const newest = page.data[0];
      if (newest && typeof document !== 'undefined' && document.visibilityState === 'visible')
        await this.api.read(id, newest.id);
    } catch (error) {
      if (this.current(id, identity) && revision === this.revision) this.error.set(apiError(error));
    } finally {
      if (this.current(id, identity) && revision === this.revision) this.loading.set(false);
    }
  }

  /** Không ghép trang lịch sử vào hội thoại hoặc tài khoản vừa đổi. */
  async older(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingOlder()) return;
    const id = this.id;
    const identity = this.identity;
    const historyVersion = this.historyVersion;
    this.loadingOlder.set(true);
    try {
      const page = await this.api.history(id, cursor);
      if (!this.current(id, identity) || historyVersion !== this.historyVersion) return;
      this.merge(page.data);
      this.nextCursor.set(page.pagination.nextCursor);
    } catch (error) {
      if (this.current(id, identity) && historyVersion === this.historyVersion)
        this.error.set(apiError(error));
    } finally {
      if (this.current(id, identity) && historyVersion === this.historyVersion)
        this.loadingOlder.set(false);
    }
  }

  /** Retry cùng bản nháp giữ requestId và upload đã thành công để tránh gửi trùng. */
  async send(content: string, file: File | null): Promise<boolean> {
    const trimmed = content.trim();
    if (this.busy() || (!trimmed && !file) || [...trimmed].length > 5000) return false;
    return this.mutate(async (id, identity) => {
      if (!this.pending || this.pending.content !== trimmed || this.pending.file !== file) {
        if (this.pending?.input.imageMediaId) {
          try {
            await this.api.cancel(id, this.pending.input.imageMediaId);
          } catch (error) {
            // Response gửi trước có thể mất sau commit; ảnh ATTACHED phải giữ cho tin cũ.
            if (!(
              error instanceof HttpErrorResponse &&
              error.status === 409 &&
              error.error?.error?.code === 'MEDIA_ATTACHED'
            ))
              throw error;
          }
        }
        if (!this.current(id, identity)) return;
        this.pending = {
          content: trimmed,
          file,
          input: { requestId: crypto.randomUUID(), ...(trimmed ? { content: trimmed } : {}) },
        };
      }
      const pending = this.pending;
      if (file && !pending.input.imageMediaId) {
        const mediaId = await this.api.upload(id, file);
        if (!this.current(id, identity)) return;
        pending.input.imageMediaId = mediaId;
      }
      const message = await this.api.send(id, pending.input);
      if (!this.current(id, identity)) return;
      this.pending = undefined;
      this.merge([message]);
      this.success.set('Đã gửi tin nhắn.');
    });
  }

  /** Gửi ý định đã xác nhận, giữ requestId khi thử lại sau lỗi mạng. */
  propose(kind: ChatProposalInput['kind'], price?: string): Promise<boolean> {
    return this.mutate(async (id, identity) => {
      if (
        !this.pendingProposal ||
        this.pendingProposal.kind !== kind ||
        this.pendingProposal.price !== price
      )
        this.pendingProposal = {
          kind,
          price,
          input: {
            requestId: crypto.randomUUID(),
            kind,
            ...(price ? { proposedPrice: price } : {}),
          },
        };
      const message = await this.api.propose(id, this.pendingProposal.input);
      if (!this.current(id, identity)) return;
      this.pendingProposal = undefined;
      this.merge([message]);
      this.success.set('Đã gửi card giao dịch.');
    });
  }

  /** Reload metadata sau xử lý vì accept có thể ẩn Listing. */
  resolve(proposalId: string, status: 'ACCEPTED' | 'REJECTED'): Promise<boolean> {
    return this.mutate(async (id, identity) => {
      const message = await this.api.resolve(id, proposalId, status);
      if (!this.current(id, identity)) return;
      this.merge([message]);
      const conversation = await this.api.get(id);
      if (this.current(id, identity)) this.conversation.set(conversation);
    });
  }

  /** Mutation độc quyền trong trang; response cũ không đổi busy/error của tài khoản mới. */
  private async mutate(run: (id: string, identity: number) => Promise<void>): Promise<boolean> {
    if (this.busy() || !this.id) return false;
    const id = this.id;
    const identity = this.identity;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    try {
      await run(id, identity);
      return this.current(id, identity);
    } catch (error) {
      if (this.current(id, identity)) this.error.set(apiError(error));
      return false;
    } finally {
      if (this.current(id, identity)) this.busy.set(false);
    }
  }

  /** Chặn callback sau đổi route, đăng xuất hoặc đăng nhập tài khoản khác. */
  private current(id: string, identity: number): boolean {
    return (
      this.id === id && this.identity === identity && this.session.identityVersion() === identity
    );
  }

  /** Merge theo UUID và thứ tự ghép để REST/realtime không thêm trùng tin. */
  private merge(rows: ChatMessage[]): void {
    const byId = new Map(this.messages().map((message) => [message.id, message]));
    const rank = { SENT: 0, DELIVERED: 1, READ: 2 };
    for (const row of rows) {
      const current = byId.get(row.id);
      const proposal =
        current?.proposal &&
        current.proposal.status !== 'PENDING' &&
        row.proposal?.status === 'PENDING'
          ? current.proposal
          : row.proposal;
      byId.set(row.id, {
        ...row,
        proposal,
        state: current && rank[current.state] > rank[row.state] ? current.state : row.state,
      });
    }
    this.messages.set(
      [...byId.values()].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      ),
    );
  }

  /** Xóa dữ liệu private và draft khi quyền thay đổi; TEMP chưa gửi tự hết hạn server. */
  private reset(id: string, identity: number): void {
    this.id = id;
    this.identity = identity;
    this.loaded = false;
    this.historyVersion++;
    this.pending = undefined;
    this.pendingProposal = undefined;
    this.conversation.set(null);
    this.messages.set([]);
    this.userId.set('');
    this.nextCursor.set(null);
    this.error.set('');
    this.success.set('');
    this.busy.set(false);
    this.loadingOlder.set(false);
  }
}
