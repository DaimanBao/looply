import { DatePipe } from '@angular/common';
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
import type { ChatProposalInput } from '../models/chat.models';

@Component({
  selector: 'app-conversation',
  imports: [DatePipe, RouterLink, ReactiveFormsModule, ChatImage],
  providers: [ConversationState],
  templateUrl: './conversation.page.html',
  styleUrl: './conversation.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:visibilitychange)': 'refreshVisible()' },
})
export class ConversationPage {
  readonly state = inject(ConversationState);
  readonly realtime = inject(ChatRealtime);
  private readonly session = inject(SessionService);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
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
  readonly states = { SENT: 'Đã gửi', DELIVERED: 'Đã nhận', READ: 'Đã xem' };
  private scope = '';

  /** Chỉ route/danh tính mới xóa composer; realtime refresh không làm mất bản nháp đang nhập. */
  constructor() {
    effect(() => {
      this.session.token();
      const id = this.params()?.get('conversationId');
      const identity = this.session.identityVersion();
      this.realtime.revision();
      untracked(() => {
        const scope = `${identity}:${id}`;
        if (scope !== this.scope) {
          this.scope = scope;
          this.form.reset();
          this.clearFile();
          this.confirm.set(null);
          this.resolveConfirm.set(null);
        }
        if (id) void this.state.load(id);
      });
    });
    inject(DestroyRef).onDestroy(() => this.clearFile());
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
    if (input && (await this.state.propose(input.kind, input.price))) this.confirm.set(null);
  }

  /** Resolve không tự nhận quyền từ UI; server kiểm tra lại owner, activeCycle và Listing. */
  async resolve(): Promise<void> {
    const input = this.resolveConfirm();
    if (input && (await this.state.resolve(input.id, input.status))) this.resolveConfirm.set(null);
  }

  /** Cuộn lên tải tiếp trang cũ, có nút dự phòng cho bàn phím hoặc màn hình nhỏ. */
  olderOnScroll(event: Event): void {
    if (event.target instanceof HTMLElement && event.target.scrollTop < 24) void this.state.older();
  }
}
