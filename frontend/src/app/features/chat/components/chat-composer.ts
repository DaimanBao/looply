import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-chat-composer',
  imports: [ReactiveFormsModule],
  templateUrl: './chat-composer.html',
  styleUrl: './chat-composer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComposer {
  readonly content = input.required<FormControl<string>>();
  readonly busy = input(false);
  readonly preview = input('');
  readonly error = input('');
  readonly sent = output<void>();
  readonly chosen = output<Event>();
  readonly removed = output<void>();
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

  /** Reset từ bên ngoài cũng thu nhỏ textarea, giữ composer trong viewport. */
  constructor() {
    afterRenderEffect(() => {
      this.busy();
      this.preview();
      this.resize();
    });
  }

  /** Validation Unicode khớp server; ảnh có thể gửi không kèm nội dung. */
  valid(): boolean {
    const text = this.content().value.trim();
    return !this.busy() && ([...text].length > 0 || !!this.preview()) && [...text].length <= 5000;
  }

  /** Enter gửi, Shift+Enter xuống dòng; không gửi giữa quá trình IME composition. */
  keydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (this.valid()) this.sent.emit();
  }

  /** Tự tăng chiều cao tới giới hạn CSS, phần dài hơn cuộn bên trong textarea. */
  resize(): void {
    const textarea = this.textarea()?.nativeElement;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const height = textarea.scrollHeight + 2;
    textarea.style.height = `${Math.min(height, 112)}px`;
    textarea.style.overflowY = height > 112 ? 'auto' : 'hidden';
  }

  /** Chỉ phát intent gửi khi dữ liệu hợp lệ, Page tiếp tục quản lý draft/retry. */
  submit(event: Event): void {
    event.preventDefault();
    if (this.valid()) this.sent.emit();
  }
}
