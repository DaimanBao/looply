import { DOCUMENT } from '@angular/common';
import { Component, HostListener, computed, effect, inject, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SessionService } from '../../../core/auth/session.service';
import { ReactiveFormsModule } from '@angular/forms';
import { MediaDraft } from '../../media/public-api';
import { ListingMedia } from '../components/listing-media';
import { ListingEditor } from '../state/listing-editor';

@Component({
  imports: [ReactiveFormsModule, RouterLink, ListingMedia],
  providers: [MediaDraft, ListingEditor],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.scss',
})
export class EditorPage {
  readonly editor = inject(ListingEditor);
  readonly media = this.editor.media;
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private readonly document = inject(DOCUMENT);
  private done = false;
  private readonly identity = computed(() => {
    this.session.token();
    return this.session.identityVersion();
  });

  /** Nạp editor khi route hoặc danh tính đổi, không giữ dữ liệu của chủ trước. */
  constructor() {
    effect(() => {
      this.identity();
      const id = this.params()?.get('listingId') ?? null;
      untracked(() => {
        if (!this.session.active()) this.editor.clear();
        else void this.editor.load(id);
      });
    });
  }

  /** Chuyển FileList sang bản nháp và cho phép chọn lại cùng tệp sau khi bỏ. */
  files(event: Event): void {
    if (this.editor.busy()) return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    this.media.add(Array.from(input.files ?? []));
    input.value = '';
  }

  /** Chuyển thời lượng browser đọc được cho validator sơ bộ của Media. */
  videoMetadata(key: number, event: Event): void {
    if (event.target instanceof HTMLVideoElement)
      this.media.validateDuration(key, event.target.duration);
  }

  /** Lấy metadata đã lưu để tái sử dụng delivery component có xác thực. */
  attached(id: string | null) {
    return this.editor.listing()?.media.find((asset) => asset.id === id);
  }

  /** Xác nhận tác động Conversation trước khi lưu và rời editor sau thành công. */
  async save(): Promise<void> {
    const confirmed =
      !this.editor.listing()?.hasConversations ||
      this.confirm(
        'Bài đã có hội thoại. Bạn xác nhận lưu thay đổi ảnh hưởng đến các hội thoại liên quan?',
      );
    if (confirmed && (await this.editor.save(confirmed))) await this.finish();
  }

  /** Nêu rõ trạng thái chỉ áp dụng cho dữ liệu đã lưu; yêu cầu xác nhận mở lại giao dịch cũ. */
  async visibility(): Promise<void> {
    const listing = this.editor.listing();
    const question =
      listing?.status === 'HIDDEN'
        ? 'Hiện lại bài? Lịch sử giao dịch được giữ nguyên; đề xuất đang chờ có thể tiếp tục được xử lý.'
        : 'Ẩn bài đăng và tạm dừng chấp nhận đề xuất đang chờ?';
    await this.editor.visibility(this.confirm(question));
  }

  /** Không cho xóa mềm nếu người dùng hủy hộp xác nhận. */
  async remove(): Promise<void> {
    if (
      await this.editor.remove(this.confirm('Xóa bài đăng? Bạn không thể tự khôi phục bài đã xóa.'))
    )
      await this.finish();
  }

  /** Reload có xác nhận bỏ bản nháp, không cập nhật version âm thầm dưới nội dung cũ. */
  reload(): void {
    if (!this.editor.busy() && this.confirm('Tải lại sẽ bỏ thay đổi chưa lưu. Tiếp tục?'))
      void this.editor.load(this.params()?.get('listingId') ?? null);
  }

  /** Guard ngăn rời trang trong commit và xác nhận bỏ bản nháp/upload đang chạy. */
  canLeave(): boolean {
    if (this.done || !this.session.active()) return true;
    if (this.editor.busy()) return false;
    return (
      !(this.editor.form.dirty || this.media.dirty()) ||
      this.confirm('Bỏ các thay đổi và media chưa lưu?')
    );
  }

  /** Cảnh báo native khi đóng tab giữa lúc nhập liệu hoặc đang commit. */
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.done && (this.editor.busy() || this.editor.form.dirty || this.media.dirty()))
      event.preventDefault();
  }

  /** Xác nhận native chỉ khi có browser window. */
  private confirm(message: string): boolean {
    return this.document.defaultView?.confirm(message) ?? false;
  }

  /** Chỉ bỏ guard bản nháp sau khi server xác nhận mutation thành công. */
  private async finish(): Promise<void> {
    this.done = true;
    await this.router.navigate(['/account/listings'], { queryParams: { saved: '1' } });
  }
}
