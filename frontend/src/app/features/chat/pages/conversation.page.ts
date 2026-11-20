import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SessionService } from '../../../core/auth/session.service';
import { ConversationState } from '../state/conversation.state';
import { ChatRealtime } from '../state/chat-realtime';
import { ChatImage } from '../components/chat-image';
import { ChatComposer } from '../components/chat-composer';
import { MessageHistory } from '../components/message-history';
import { InboxState } from '../state/inbox.state';
import type { ChatProposalInput } from '../models/chat.models';

@Component({
  selector: 'app-conversation',
  imports: [RouterLink, ReactiveFormsModule, ChatImage, ChatComposer, MessageHistory],
  providers: [ConversationState],
  templateUrl: './conversation.page.html',
  styleUrl: './conversation.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:visibilitychange)': 'refreshVisible()' },
})
export class ConversationPage {
  readonly state = inject(ConversationState);
  readonly realtime = inject(ChatRealtime);
  readonly inbox = inject(InboxState);
  private readonly session = inject(SessionService);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);
  readonly targetMessage = computed(() => {
    const value = this.query()?.get('messageId');
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : '';
  });
  readonly targetError = signal('');
  private targetGeneration = 0;
  readonly proposalOpen = signal(false);
  readonly peer = computed(() =>
    this.state
      .conversation()
      ?.participants.find((participant) => participant.userId !== this.state.userId()),
  );
  /** Avatar không cắt đôi ký tự Unicode ngoài BMP trong display name. */
  readonly peerInitial = computed(
    () => [...(this.peer()?.displayName ?? '')][0]?.toLocaleUpperCase('vi') || '…',
  );
  readonly types = { SALE: 'Mua bán', RENT: 'Cho thuê', EXCHANGE: 'Trao đổi' };
  readonly listingStates = { ACTIVE: 'Đang hiển thị', HIDDEN: 'Đã ẩn', DELETED: 'Đã xóa' };
  readonly form = new FormGroup({ content: new FormControl('', { nonNullable: true }) });
  readonly proposedPrice = new FormControl('', { nonNullable: true });
  readonly file = signal<File | null>(null);
  readonly preview = signal('');
  readonly fileError = signal('');
  readonly confirm = signal<{ kind: ChatProposalInput['kind']; price?: string } | null>(null);
  readonly resolveConfirm = signal<{ id: string; status: 'ACCEPTED' | 'REJECTED' } | null>(null);
  readonly isOwner = computed(
    () => this.state.conversation()?.listing?.ownerId === this.state.userId(),
  );
  readonly canPropose = computed(
    () =>
      !!this.state.conversation()?.listing &&
      !this.isOwner() &&
      this.state.conversation()?.listing?.status === 'ACTIVE' &&
      !this.state.messages().some((m) => m.proposal?.status === 'PENDING'),
  );
  private scope = '';

  /** Chỉ route/danh tính mới xóa composer; realtime refresh không làm mất bản nháp đang nhập. */
  constructor() {
    effect((onCleanup) => {
      const id = this.params()?.get('conversationId');
      const connected = this.realtime.connected();
      if (id && connected) onCleanup(this.realtime.watchConversation(id));
    });
    effect(() => {
      this.session.token();
      const id = this.params()?.get('conversationId');
      const identity = this.session.identityVersion();
      const target = this.targetMessage();
      this.realtime.revision();
      const changedId = this.realtime.changedId();
      untracked(() => {
        const scope = `${identity}:${id}`;
        if (scope !== this.scope) {
          this.scope = scope;
          this.form.reset();
          this.proposedPrice.reset();
          this.proposalOpen.set(false);
          this.clearFile();
          this.confirm.set(null);
          this.resolveConfirm.set(null);
        }
        if (
          id &&
          (scope !== this.loadedScope ||
            !changedId ||
            changedId === id ||
            target !== this.loadedTarget)
        ) {
          this.loadedScope = scope;
          this.loadedTarget = target;
          void this.loadTarget(id, target);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.clearFile());
    inject(DestroyRef).onDestroy(() => this.targetGeneration++);
  }

  private loadedScope = '';
  private loadedTarget = '';

  /** Card cũ được tìm qua keyset hiện có, dừng ngay khi đổi route/identity hoặc gặp lỗi. */
  private async loadTarget(id: string, target: string): Promise<void> {
    const generation = ++this.targetGeneration;
    const identity = this.session.identityVersion();
    this.targetError.set('');
    await this.state.load(id);
    const row = this.state.conversation();
    if (row && generation === this.targetGeneration && identity === this.session.identityVersion())
      this.inbox.reveal(row);
    while (
      target &&
      generation === this.targetGeneration &&
      identity === this.session.identityVersion() &&
      !this.state.messages().some((message) => message.id === target) &&
      this.state.nextCursor() &&
      !this.state.error()
    ) {
      const before = this.state.nextCursor();
      await this.state.older();
      if (this.state.nextCursor() === before) break;
    }
    if (
      target &&
      generation === this.targetGeneration &&
      identity === this.session.identityVersion() &&
      !this.state.messages().some((message) => message.id === target)
    )
      this.targetError.set(
        'Nội dung được nhắc đến không còn khả dụng. Bạn vẫn có thể xem hội thoại.',
      );
  }

  /** Lấy lại nội dung khi người dùng quay lại tab, cập nhật read cursor sau render. */
  refreshVisible(): void {
    const id = this.params()?.get('conversationId');
    if (id && document.visibilityState === 'visible') void this.state.load(id);
  }

  /** Client kiểm tra dung lượng/định dạng để báo nhanh, server vẫn giải mã bytes thực. */
  chooseFile(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const file = target.files?.[0];
    target.value = '';
    if (!file) return;
    this.clearFile();
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 10 * 1024 * 1024 ||
      file.size === 0
    ) {
      this.fileError.set('Chọn tối đa một ảnh JPG, PNG hoặc WebP, không quá 10 MiB.');
      return;
    }
    this.file.set(file);
    this.preview.set(URL.createObjectURL(file));
  }

  /** Thu hồi object URL ngay khi bỏ/thay ảnh hoặc rời trang. */
  clearFile(): void {
    if (this.preview()) URL.revokeObjectURL(this.preview());
    this.preview.set('');
    this.file.set(null);
    this.fileError.set('');
  }

  /** Chỉ xóa composer khi server đã xác nhận thành công trên đúng route/danh tính. */
  async send(): Promise<void> {
    const content = this.form.controls.content.value;
    if ([...content.trim()].length > 5000) {
      this.fileError.set('Tin nhắn tối đa 5000 ký tự.');
      return;
    }
    if (await this.state.send(content, this.file())) {
      this.form.reset();
      this.clearFile();
    }
  }

  /** Chuyển ý định thành màn xác nhận trước khi gửi card theo giá niêm yết hoặc thương lượng. */
  prepareProposal(negotiated: boolean): void {
    const listing = this.state.conversation()?.listing;
    if (!listing || !this.canPropose()) return;
    const price = this.proposedPrice.value.trim();
    if (negotiated && !/^[1-9][0-9]{0,14}$/.test(price)) {
      this.fileError.set('Giá đề xuất là số nguyên dương, tối đa 15 chữ số.');
      return;
    }
    this.fileError.set('');
    this.confirm.set({
      kind:
        listing.type === 'EXCHANGE'
          ? 'EXCHANGE_CONTACT'
          : negotiated
            ? 'NEGOTIATED_PRICE'
            : 'LISTED_PRICE',
      ...(negotiated ? { price } : {}),
    });
  }

  /** Gửi card đã xác nhận; lỗi mạng giữ ý định để người dùng thử lại cùng requestId. */
  async propose(): Promise<void> {
    const input = this.confirm();
    if (input && (await this.state.propose(input.kind, input.price))) {
      this.confirm.set(null);
      this.proposalOpen.set(false);
    }
  }

  /** Resolve không tự nhận quyền từ UI; server kiểm tra lại owner, activeCycle và Listing. */
  async resolve(): Promise<void> {
    const input = this.resolveConfirm();
    if (input && (await this.state.resolve(input.id, input.status))) this.resolveConfirm.set(null);
  }
}
